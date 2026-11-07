class PCMProcessor extends AudioWorkletProcessor {
  constructor(){super();this.samples=[];this.position=0;}
  process(inputs){
    const channel=inputs[0]?.[0];if(!channel)return true;
    // Browser input rate may be 44.1/48 kHz. Accumulate and average into 16 kHz PCM.
    this.samples.push(...channel);
    const step=sampleRate/16000,output=[];
    while(this.position+step<=this.samples.length){
      let sum=0,count=0;for(let i=Math.floor(this.position);i<Math.floor(this.position+step);i++){sum+=this.samples[i];count++;}
      output.push(Math.max(-32768,Math.min(32767,Math.round((sum/Math.max(1,count))*32767))));this.position+=step;
    }
    const used=Math.floor(this.position);this.samples.splice(0,used);this.position-=used;
    if(output.length)this.port.postMessage(new Int16Array(output).buffer);
    return true;
  }
}
registerProcessor('pcm-input',PCMProcessor);
