export async function startVoice(accountId,onMessage){
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  const input=new AudioContext();const output=new AudioContext({sampleRate:24000});
  let nextTime=0,closed=false,sources=[];
  const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/agent/voice/${accountId}`);
  const stop=()=>{if(closed)return;closed=true;stream.getTracks().forEach(t=>t.stop());if(socket.readyState===1)socket.send(JSON.stringify({type:'end'}));socket.close();input.close();output.close();};
  try {
    await input.audioWorklet.addModule('/pcm-worklet.js');
    const node=new AudioWorkletNode(input,'pcm-input');
    const silence=input.createGain();silence.gain.value=0;
    input.createMediaStreamSource(stream).connect(node);node.connect(silence);silence.connect(input.destination);
    node.port.onmessage=e=>{if(socket.readyState!==1||!socket.pulpReady)return;const bytes=new Uint8Array(e.data);let s='';for(const byte of bytes)s+=String.fromCharCode(byte);socket.send(JSON.stringify({type:'audio',data:btoa(s)}));};
    socket.onmessage=e=>{
      const m=JSON.parse(e.data);
      if(m.type==='ready')socket.pulpReady=true;
      if(m.type==='audio'){
        const bytes=Uint8Array.from(atob(m.data),c=>c.charCodeAt(0));const pcm=new Int16Array(bytes.buffer);
        const buffer=output.createBuffer(1,pcm.length,24000);buffer.getChannelData(0).set(Float32Array.from(pcm,x=>x/32768));
        const source=output.createBufferSource();source.buffer=buffer;source.connect(output.destination);nextTime=Math.max(nextTime,output.currentTime);source.start(nextTime);nextTime+=buffer.duration;sources.push(source);source.onended=()=>{sources=sources.filter(x=>x!==source);};
      }else if(m.type==='interrupted'){sources.forEach(x=>{try{x.stop();}catch{}});sources=[];nextTime=0;}
      else onMessage(m);
      if(m.type==='error')stop();
    };
    socket.onerror=()=>{onMessage({type:'error',message:'Voice connection failed. You can still type or use the scenario controls.'});stop();};
    socket.onclose=()=>{stop();onMessage({type:'closed'});};
    return stop;
  } catch(error){stop();throw error;}
}
