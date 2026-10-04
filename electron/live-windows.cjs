const RATE = 16000;
class LiveWindows {
  constructor() { this.buffer = Buffer.alloc(0); this.total = 0; this.boundary = 0; this.previewAt = 0; this.voiced = 0; this.silent = 0; }
  append(bytes) {
    this.buffer = Buffer.concat([this.buffer, bytes]); this.total += bytes.length / 2;
    const keep = 7 * RATE * 2; if (this.buffer.length > keep) this.buffer = this.buffer.subarray(this.buffer.length - keep);
    let energy = 0;
    for (let i = 0; i < bytes.length; i += 2) energy += (bytes.readInt16LE(i) / 32768) ** 2;
    const rms = Math.sqrt(energy / (bytes.length / 2)); this.level = Math.min(1, rms * 8);
    const voice = rms >= 0.008;
    this.voiced += voice ? bytes.length / 2 : 0;
    this.silent = voice ? 0 : this.silent + bytes.length / 2;
    const speech = this.voiced >= RATE * 0.3;
    if (speech && (this.silent >= RATE * 0.5 || this.total - this.boundary >= RATE * 6)) return this.final(this.silent >= RATE * 0.5);
    if (!speech && this.total - this.boundary >= RATE * 6) { this.boundary = this.total; this.voiced = 0; }
    if (speech && this.total - this.previewAt >= RATE * 2) { this.previewAt = this.total; return this.window(false, this.total); }
    return null;
  }
  window(final, cutoff) {
    const start = Math.max(0, this.boundary - RATE * 0.6, this.total - this.buffer.length / 2);
    const pcm = Buffer.from(this.buffer.subarray(Math.round((start - (this.total - this.buffer.length / 2)) * 2)));
    return { pcm, start: start / RATE, end: this.total / RATE, cutoff: cutoff / RATE, final };
  }
  final(natural = true) {
    if (!this.buffer.length || this.total <= this.boundary) return null;
    const cutoff = natural ? this.total : this.total - RATE * 0.6;
    const result = this.window(true, cutoff); this.boundary = cutoff; this.previewAt = this.total; this.voiced = 0; this.silent = 0;
    return result;
  }
}
module.exports = { LiveWindows };
