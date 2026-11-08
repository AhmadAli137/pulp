"""Native Gemini audio relay. PCM never persists; tools are bound to the selected account."""
import asyncio
import base64
import json
import logging
import anyio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .decision import profile
from ..config import GEMINI_API_KEY, GEMINI_LIVE_MODEL, GEMINI_LIVE_API_VERSION, GEMINI_LIVE_VOICE

router = APIRouter()


@router.websocket('/api/agent/voice/{account_id}')
async def voice(ws: WebSocket, account_id: int):
    origin = ws.headers.get('origin', '')
    if origin and origin not in {'http://localhost:8000','http://127.0.0.1:8000','http://localhost:5173','http://127.0.0.1:5173','http://localhost:8001','http://127.0.0.1:8001','http://localhost:5174','http://127.0.0.1:5174'} | ({f'https://{_d}', f'https://www.{_d}'} if (_d := __import__('os').environ.get('DOMAIN','').strip()) else set()):
        await ws.close(code=1008)
        return
    await ws.accept()
    if not GEMINI_API_KEY:
        await ws.send_json(dict(type='error',message='Gemini is not configured. Text and manual planning remain available.'))
        await ws.close(code=1000)
        return
    tasks=[]
    client=None
    try:
        m=profile(account_id)
        from google import genai
        from google.genai import types
        client=genai.Client(api_key=GEMINI_API_KEY,http_options={'api_version':GEMINI_LIVE_API_VERSION})
        from ..services import context_manager as cm
        from ..services.narrator import narrative_for
        from ..services.director import stage_stream
        ctx = cm.load_context(account_id)
        insights = await asyncio.to_thread(narrative_for, account_id, False)
        declarations = [dict(name='conversation_turn',
            description='Process every user request through the shared intake, confirmation and planning workflow. Pass their complete words unchanged. This retrieves context, proposes changes, confirms explicit approval, calculates and reviews plans, and selects optional visuals.',
            parameters={'type': 'OBJECT', 'properties': {'message': {'type': 'STRING'}}, 'required': ['message']})]
        config=types.LiveConnectConfig(response_modalities=['AUDIO'],input_audio_transcription={},output_audio_transcription={},
            speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=GEMINI_LIVE_VOICE))),
            system_instruction=("You are Pulp, one calm financial companion. Speech and typed messages are the same conversation. "
                "For EVERY substantive user turn, call conversation_turn with their exact complete words before answering. "
                "That tool owns all memory, confirmation, financial calculations and council decisions. Never invent numbers, "
                "claim a save, or confirm changes yourself. Read its reply naturally and briefly. Do not repeat a prior answer. "
                "Use one or two sentences for ordinary conversation. Ask only the tool's necessary question. "
                "Visuals arrive alongside you automatically; never narrate a slideshow. Speak longer only for a requested comparison. "
                "If a tool fails, say so and invite a retry. The account is anonymized demonstration data. "
                "Current context and recent conversation: " + json.dumps({'context': cm.summarize(ctx),
                    'recent': ctx.get('conversation', [])[-12:], 'insights': insights.get('narrative', {})}, default=str)),
            tools=[types.Tool(function_declarations=declarations)])
        async with client.aio.live.connect(model=GEMINI_LIVE_MODEL, config=config) as session:
            await ws.send_json(dict(type='ready',model=GEMINI_LIVE_MODEL,voice=GEMINI_LIVE_VOICE))
            async def receive_browser():
                while True:
                    message=await ws.receive_json()
                    if message.get('type')=='audio':
                        data=base64.b64decode(message['data'],validate=True)
                        if len(data)>65536: raise ValueError('Audio chunk too large')
                        await session.send_realtime_input(audio=types.Blob(data=data,mime_type='audio/pcm;rate=16000'))
                    elif message.get('type')=='end':
                        await session.send_realtime_input(audio_stream_end=True)
                    elif message.get('type')=='text':
                        await session.send_realtime_input(text=str(message.get('text',''))[:4000])
            async def receive_gemini():
                while True:
                    async for response in session.receive():
                        if response.data:
                            await ws.send_json(dict(type='audio',data=base64.b64encode(response.data).decode()))
                        content=response.server_content
                        if content:
                            for field,role in [('input_transcription','user'),('output_transcription','assistant')]:
                                transcript=getattr(content,field,None)
                                if transcript and transcript.text:
                                    await ws.send_json(dict(type='transcript',role=role,text=transcript.text))
                            if content.interrupted: await ws.send_json(dict(type='interrupted'))
                            if content.turn_complete: await ws.send_json(dict(type='turn_complete'))
                        if response.tool_call:
                            results=[]
                            for call in response.tool_call.function_calls:
                                try:
                                    args=dict(call.args or {})
                                    if call.name == 'conversation_turn':
                                        reply = []
                                        await ws.send_json(dict(type='status', message='Thinking it through...'))
                                        async for event, data in stage_stream(account_id, str(args.get('message', ''))[:2000]):
                                            if event == 'storyboard':
                                                reply.extend(b['caption'] for b in data.get('beats', []))
                                                visuals = [b for b in data.get('beats', []) if b['visual'] != 'none']
                                                if len(visuals) > 1:
                                                    await ws.send_json(dict(type='walkthrough', beats=visuals))
                                                elif visuals:
                                                    await ws.send_json(dict(type='visual', beat=visuals[0]))
                                            elif event == 'memory' and data.get('proposal'):
                                                await ws.send_json(dict(type='context_proposal', proposal=data['proposal']))
                                            elif event in ('agent', 'handoff'):
                                                await ws.send_json(dict(type='pipeline_event', event=event, data=data))
                                            elif event == 'error':
                                                reply.append(data.get('message', 'Planning is unavailable. Please try again.'))
                                        await ws.send_json(dict(type='state_changed'))
                                        await ws.send_json(dict(type='status', message=''))
                                        result = {'reply': ' '.join(reply), 'instruction': 'Say this naturally. Do not add facts or questions.'}
                                    else:
                                        result = {'error': 'Unknown tool'}
                                except Exception:
                                    logging.getLogger('pulp.voice').exception('Shared conversation turn failed')
                                    await ws.send_json(dict(type='status', message=''))
                                    result={'error':'This turn could not be completed. Explain that and ask the user to retry; do not claim any changes were saved.'}
                                await ws.send_json(dict(type='tool',name=call.name,result=result))
                                results.append(types.FunctionResponse(id=call.id,name=call.name,response=result))
                            await session.send_tool_response(function_responses=results)
            tasks=[asyncio.create_task(receive_browser()),asyncio.create_task(receive_gemini())]
            done,_=await asyncio.wait(tasks,return_when=asyncio.FIRST_COMPLETED)
            for task in done: task.result()
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception:
        logging.getLogger('pulp.voice').exception('Voice session ended')
        try: await ws.send_json(dict(type='error',message='Gemini voice is unavailable or disconnected. Check your key/model and continue with text or manual controls.'))
        except Exception: pass
    finally:
        # Starlette cancels the request scope on disconnect. Finish provider/audio
        # cleanup inside a shield so no receive task or provider socket leaks.
        with anyio.CancelScope(shield=True):
            for task in tasks: task.cancel()
            if tasks: await asyncio.gather(*tasks,return_exceptions=True)
            if client: await client.aio.aclose()
            try: await ws.close()
            except Exception: pass
