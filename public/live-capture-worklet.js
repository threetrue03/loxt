class LiveCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.enabled = true; this.ratio = sampleRate / 16000; this.weight = 0; this.sum = 0;
    this.samples = new Int16Array(1600); this.count = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'pause' || data.type === 'flush') {
        this.enabled = false; this.send(); this.weight = 0; this.sum = 0;
        this.port.postMessage({ type: 'flushed', token: data.token });
      } else if (data.type === 'resume') this.enabled = true;
    };
  }
  send() { if (this.count) { const samples = this.samples.slice(0, this.count); this.port.postMessage({ type: 'pcm', samples }, [samples.buffer]); this.count = 0; } }
  process(inputs) {
    if (!this.enabled || !inputs[0]?.length) return true;
    const channels = inputs[0];
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0; for (const channel of channels) value += channel[i]; value /= channels.length;
      let remaining = 1;
      while (remaining > 1e-8) {
        const take = Math.min(remaining, this.ratio - this.weight);
        this.sum += value * take; this.weight += take; remaining -= take;
        if (this.weight >= this.ratio - 1e-8) {
          const sample = Math.max(-1, Math.min(1, this.sum / this.ratio));
          this.samples[this.count++] = Math.round(sample * (sample < 0 ? 32768 : 32767)); this.weight = 0; this.sum = 0;
          if (this.count === this.samples.length) this.send();
        }
      }
    }
    return true;
  }
}
registerProcessor('loxt-live-capture', LiveCapture);
