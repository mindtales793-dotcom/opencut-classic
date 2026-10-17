self.onmessage = async ({data}) => {
  try {
    const response = await fetch('/darkcut/audio.wasm');
    if (!response.ok) throw new Error('Motor de áudio indisponível.');
    const {instance} = await WebAssembly.instantiate(await response.arrayBuffer());
    const w = instance.exports;
    const {channels, rate, db, minimum, padding} = data;
    const frames = channels[0].length;
    const len = frames * channels.length;
    const capacity = 2 * (Math.ceil(frames / Math.max(1, Math.floor(rate / 100))) + 1);
    const input = w.alloc(len), output = w.alloc(capacity);
    channels.forEach((channel, index) => new Float32Array(w.memory.buffer, input + index * frames * 4, frames).set(channel));
    const count = w.silence(input, frames, channels.length, rate, db, minimum, padding, output);
    if (count < 0) throw new Error('Nenhuma fala acima do limiar. Reduza o limiar (dB) e analise novamente.');
    const values = new Float32Array(w.memory.buffer, output, count * 2);
    const cuts = Array.from({length:count}, (_, i) => [values[i*2], values[i*2+1]]);
    w.release(input,len); w.release(output,capacity);
    self.postMessage({cuts});
  } catch (error) { self.postMessage({error:String(error.message || error)}); }
};
