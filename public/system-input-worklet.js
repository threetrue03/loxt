class SystemInput extends AudioWorkletProcessor {
  constructor() {
    super(); this.queue=[];this.offset=0;this.frames=0;
    this.port.onmessage=({data})=>{if(data.type!=='pcm')return;const samples=new Int16Array(data.bytes.buffer,data.bytes.byteOffset,data.bytes.byteLength/2);this.queue.push(samples);this.frames+=samples.length;while(this.frames>32000&&this.queue.length>1){this.frames-=this.queue[0].length-this.offset;this.queue.shift();this.offset=0;}};
  }
  process(_inputs,outputs) {
    const output=outputs[0][0];output.fill(0);
    for(let i=0;i<output.length&&this.queue.length;i++){output[i]=this.queue[0][this.offset++]/32768;this.frames--;if(this.offset===this.queue[0].length){this.queue.shift();this.offset=0;}}
    return true;
  }
}
registerProcessor('loxt-system-input',SystemInput);
