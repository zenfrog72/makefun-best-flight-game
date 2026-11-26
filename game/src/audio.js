// ISLAND COURIER — hand-written WebAudio synth.
// Engine hum (sawtooth + lowpass, pitch follows throttle), wind noise,
// ring chime, landing thud, storm rain. Starts only after a user gesture.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windSrc = null;
  let windGain = null;
  let windFilter = null;
  let rainSrc = null;
  let rainGain = null;
  let master = null;
  let muted = false;
  let started = false;

  function noiseBuffer(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function ensure() {
    if (started) return;
    started = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // Engine: two detuned saws through a lowpass.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55.7;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped noise through a bandpass.
    windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuffer(2);
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0.0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start();

    // Rain: looped noise through a highpass, quiet until the storm.
    rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noiseBuffer(2);
    rainSrc.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1800;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0.0;
    rainSrc.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(master);
    rainSrc.start();
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    ensure,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() { return muted; },
    update(throttle, speedKt, airborne, raining) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const rpm = 48 + throttle * 95 + speedKt * 0.12;
      engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(rpm * 1.012 + 0.8, t, 0.08);
      engineFilter.frequency.setTargetAtTime(280 + throttle * 900, t, 0.1);
      engineGain.gain.setTargetAtTime(airborne || throttle > 0.05 ? 0.05 + throttle * 0.075 : 0.0, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.16, speedKt / 1200), t, 0.2);
      windFilter.frequency.setTargetAtTime(380 + speedKt * 3.2, t, 0.2);
      rainGain.gain.setTargetAtTime(raining ? 0.09 : 0.0, t, 0.3);
    },
    ring() { blip(880, 0.18, 'sine', 0.3); setTimeout(() => blip(1318, 0.28, 'sine', 0.28), 90); },
    delivered() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.28), i * 110)); },
    thud(hard) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hard ? 90 : 70, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.22);
      g.gain.setValueAtTime(hard ? 0.6 : 0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + 0.3);
    },
    splash() { blip(300, 0.5, 'sine', 0.3, 60); },
    warn() { blip(440, 0.12, 'square', 0.12); blip(440, 0.12, 'square', 0.12); },
    thunder() { blip(70, 1.4, 'sine', 0.4, 28); },
  };
}
