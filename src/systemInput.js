export async function openSystemInput(onStatus) {
  const context=new AudioContext({sampleRate:16000});let capture, off, node, closed=false;
  async function close() {if(closed)return;closed=true;off?.();node?.disconnect();await context.close().catch(()=>{});if(capture)await window.desktop.systemAudio.stop(capture.id).catch(()=>{});}
  try {
    await context.audioWorklet.addModule(new URL('system-input-worklet.js',document.baseURI).href);
    node=new AudioWorkletNode(context,'loxt-system-input',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});
    const output=context.createMediaStreamDestination();node.connect(output);await context.resume();
    const pending=[];
    off=window.desktop.systemAudio.onState(event=>{
      if(event.type==='preparing'&&!capture){onStatus?.(event);return;}
      if(!capture){if(pending.length<20)pending.push(event);return;}
      if(event.id!==capture.id)return;
      if(event.type==='pcm')node.port.postMessage(event);
      else {onStatus?.(event);if(event.type==='error') output.stream.getAudioTracks().forEach(track=>track.dispatchEvent(new Event('ended')));}
    });
    capture=await window.desktop.systemAudio.start();
    for(const event of pending)if(event.id===capture.id&&event.type==='pcm')node.port.postMessage(event);
    onStatus?.({type:'device',device:capture.device});
    for(const track of output.stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{stop();close();};}
    return output.stream;
  }catch(error){await close();throw error;}
}
