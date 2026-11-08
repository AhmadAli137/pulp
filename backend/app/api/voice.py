"""Native Gemini audio relay. PCM never persists; tools are bound to the selected account."""
import asyncio
import base64
import json
import logging
import anyio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .decision import ScenarioProposal, profile
from ..config import GEMINI_API_KEY, GEMINI_LIVE_MODEL, GEMINI_LIVE_API_VERSION, GEMINI_LIVE_VOICE
from ..schemas import ShockRequest
from ..services.tangerine_metrics import full_shock_report

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
        declarations=[
            dict(name='get_financial_profile',description='Read observed financial metrics for the selected account.',parameters={'type':'OBJECT','properties':{}}),
            dict(name='calculate_shock',description='Compute authoritative financial outcomes for an explicitly stated hypothetical scenario.',parameters={
                'type':'OBJECT','properties':{
                    'income_fraction':{'type':'NUMBER'},'bills_increase':{'type':'NUMBER'},
                    'one_off_cost':{'type':'NUMBER'},'horizon_months':{'type':'INTEGER'}},
                'required':['income_fraction','bills_increase','one_off_cost','horizon_months']}),
            dict(name='propose_scenario',description='Stage ONLY explicitly stated values for user review. This never applies or confirms changes.',parameters={
                'type':'OBJECT','properties':{
                    'income_fraction':{'type':'NUMBER'},'bills_increase':{'type':'NUMBER'},
                    'one_off_cost':{'type':'NUMBER'},'horizon_months':{'type':'INTEGER'},
                    'goal':{'type':'STRING'},'explanation':{'type':'STRING'}}})]
        config=types.LiveConnectConfig(response_modalities=['AUDIO'],input_audio_transcription={},output_audio_transcription={},
            speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=GEMINI_LIVE_VOICE))),
            system_instruction=('You are PULP: Planning Under Life’s Pressures. Be concise, calm and practical. '
                'Ask one relevant question at a time. Learn goals, deadlines, concerns and explicit financial assumptions. '
                'All banking data belongs to an anonymized demonstration account, not a verified identity. '
                'Use get_financial_profile and calculate_shock for financial numbers. Do not calculate or invent results. '
                'Use propose_scenario to stage explicit values. The user must click Apply to confirm; spoken approval cannot change controls. '
                'Missing amounts and durations require questions. Do not assume EI eligibility, salary, available spending cuts or employment. '
                'Rates are fractions, .55 income retained and .15 bill increase. Never claim a proposal has been applied.'),
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
                                    if call.name=='get_financial_profile':
                                        result=dict(account_id=account_id,typical_inflow=m.typical_inflow,typical_spending=m.typical_spending,
                                            buffer=m.buffer,household_bills=m.household_bills,baseline_runway=m.baseline_runway_label)
                                    elif call.name=='calculate_shock':
                                        args.pop('account_id',None)
                                        req=ShockRequest(account_id=account_id,**args)
                                        result=full_shock_report(m,r=req.income_fraction,h=req.bills_increase,one_off=req.one_off_cost,horizon_months=req.horizon_months)
                                    elif call.name=='propose_scenario':
                                        result=ScenarioProposal.model_validate(args).model_dump()
                                        await ws.send_json(dict(type='proposal',proposal=result))
                                        result={'status':'pending_user_confirmation','proposal':result}
                                    else: result={'error':'Unknown tool'}
                                except (ValueError,TypeError):
                                    result={'error':'Invalid tool arguments. Ask the user to clarify.'}
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
