const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const rand = (min, max) => min + Math.random() * (max - min);
const FAIR = ['clear', 'mostly-clear', 'partly-cloudy', 'intro'];

function makeNoise(ctx, seconds, type) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    let last = 0;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (type === 'brown') {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else if (type === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        data[i] = white;
      }
    }
    const blend = Math.min(4096, Math.floor(length / 8));
    for (let i = 0; i < blend; i += 1) {
      const t = i / blend;
      const end = length - blend + i;
      data[end] = data[end] * (1 - t) + data[i] * t;
    }
  }
  return buffer;
}

function filter(ctx, type, frequency, q = 0.7) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

function panner(ctx, value) {
  if (!ctx.createStereoPanner) return ctx.createGain();
  const node = ctx.createStereoPanner();
  node.pan.value = value;
  return node;
}

function loopBed(ctx, out, buffer, chain) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  let node = source;
  chain.forEach((next) => {
    node.connect(next);
    node = next;
  });
  const gain = ctx.createGain();
  gain.gain.value = 0;
  node.connect(gain);
  gain.connect(out);
  source.start(0, Math.random() * buffer.duration);
  return { source, gain, chain };
}

export function createSoundscape() {
  const AudioCtx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  let ctx = null;
  let master = null;
  let beds = null;
  let buffers = null;
  let enabled = false;
  let cfg = null;
  let volume = 0.7;
  let timer = 0;
  let nextCricket = [0, 0];
  let nextBird = 0;
  let nextRumble = 0;
  let mix = { rain: 0, wind: 0, crickets: false, birds: false, rumbles: false, storm: false };

  function build() {
    ctx = new AudioCtx();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.4;
    compressor.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(compressor);

    buffers = {
      pink: makeNoise(ctx, 4, 'pink'),
      white: makeNoise(ctx, 3, 'white'),
      brown: makeNoise(ctx, 6, 'brown'),
    };

    const rainTone = filter(ctx, 'lowpass', 3200);
    const windBand = filter(ctx, 'bandpass', 420, 0.6);
    beds = {
      rain: loopBed(ctx, master, buffers.pink, [filter(ctx, 'highpass', 420), rainTone]),
      rainTone,
      patter: loopBed(ctx, master, buffers.white, [filter(ctx, 'bandpass', 4600, 0.9)]),
      roar: loopBed(ctx, master, buffers.brown, [filter(ctx, 'lowpass', 700)]),
      wind: loopBed(ctx, master, buffers.brown, [windBand]),
      windBand,
    };

    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 0.07;
    depth.gain.value = 160;
    lfo.connect(depth);
    depth.connect(windBand.frequency);
    lfo.start();

    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend();
      else if (enabled) ctx.resume();
    });
  }

  function computeMix(scene) {
    if (!scene) return mix;
    const precip = scene.precip || 0;
    const liquid = scene.precipType === 'rain' || scene.precipType === 'hail';
    const drizzle = scene.kind === 'drizzle';
    const windSpeed = scene.windSpeed || 0;
    const calm = precip === 0 && windSpeed < 28;
    let wind = clamp(windSpeed / 60);
    if (scene.kind === 'storm') wind = Math.max(wind, 0.45);
    if (scene.kind === 'snow') wind = Math.max(wind, 0.18);
    return {
      rain: liquid ? precip * (drizzle ? 0.55 : 1) : 0,
      heavy: liquid ? clamp((precip - 0.55) / 0.45) : 0,
      wind,
      gustiness: clamp(((scene.gusts || windSpeed) - windSpeed) / 30),
      crickets: !scene.isDay && calm && typeof scene.temp === 'number' && scene.temp >= 12 && FAIR.concat('overcast').includes(scene.kind),
      birds: scene.isDay && calm && FAIR.includes(scene.kind) && scene.kind !== 'intro',
      rumbles: scene.kind === 'rain' && precip >= 0.75,
      storm: scene.kind === 'storm',
    };
  }

  function apply() {
    if (!ctx || !beds) return;
    mix = computeMix(cfg);
    const now = ctx.currentTime;
    beds.rain.gain.gain.setTargetAtTime(mix.rain * 0.34, now, 1.1);
    beds.rainTone.frequency.setTargetAtTime(1800 + mix.rain * 4800, now, 1.1);
    beds.patter.gain.gain.setTargetAtTime(mix.rain > 0 ? 0.025 + mix.rain * 0.06 : 0, now, 1.1);
    beds.roar.gain.gain.setTargetAtTime((mix.heavy || 0) * 0.32 + (mix.storm ? 0.08 : 0), now, 1.4);
    beds.wind.gain.gain.setTargetAtTime(0.012 + mix.wind * 0.24, now, 1.4);
    beds.windBand.frequency.setTargetAtTime(280 + mix.wind * 720, now, 1.4);
    nextRumble = now + rand(6, 14);
  }

  function thunder({ power = 0.8, close = false, delay = null } = {}) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const start = ctx.currentTime + (delay ?? (close ? rand(0.15, 0.6) : rand(0.9, 2.6)));
    const length = 3.5 + power * 4.5;
    const source = ctx.createBufferSource();
    source.buffer = buffers.brown;
    const low = filter(ctx, 'lowpass', close ? 1600 : 650, 0.5);
    low.frequency.setValueAtTime(close ? 1600 : 650, start);
    low.frequency.exponentialRampToValueAtTime(110, start + length);
    const gain = ctx.createGain();
    const curve = new Float32Array(256);
    const rolls = 3 + Math.floor(Math.random() * 4);
    const phase = Math.random() * Math.PI;
    for (let i = 0; i < curve.length; i += 1) {
      const t = i / (curve.length - 1);
      const body = Math.exp(-3 * t) * (1 - Math.exp(-t * 40));
      const roll = 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * rolls + phase));
      curve[i] = Math.max(0.0001, body * roll * power * 1.1);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.setValueCurveAtTime(curve, start + 0.001, length);
    source.connect(low);
    low.connect(gain);
    gain.connect(master);
    source.start(start, rand(0, 2));
    source.stop(start + length + 0.2);

    if (close) {
      const crack = ctx.createBufferSource();
      crack.buffer = buffers.white;
      const bright = filter(ctx, 'highpass', 1400);
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0.0001, start - 0.05);
      crackGain.gain.exponentialRampToValueAtTime(0.5 * power, start - 0.03);
      crackGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      crack.connect(bright);
      bright.connect(crackGain);
      crackGain.connect(master);
      crack.start(start - 0.05, rand(0, 2));
      crack.stop(start + 0.4);
    }
  }

  function chirp(time, frequency, pan) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const env = ctx.createGain();
    env.gain.value = 0;
    for (let k = 0; k < 3; k += 1) {
      const t = time + k * 0.045;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.022, t + 0.006);
      env.gain.linearRampToValueAtTime(0, t + 0.028);
    }
    const place = panner(ctx, pan);
    osc.connect(env);
    env.connect(place);
    place.connect(master);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  function birdCall(time) {
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = rand(2300, 3600);
    const place = panner(ctx, rand(-0.8, 0.8));
    place.connect(master);
    let t = time;
    for (let i = 0; i < notes; i += 1) {
      const length = rand(0.06, 0.13);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * rand(0.9, 1.1), t);
      osc.frequency.exponentialRampToValueAtTime(base * rand(1.25, 1.65), t + length * 0.6);
      osc.frequency.exponentialRampToValueAtTime(base * rand(0.85, 1), t + length);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.03, t + 0.012);
      env.gain.linearRampToValueAtTime(0, t + length);
      osc.connect(env);
      env.connect(place);
      osc.start(t);
      osc.stop(t + length + 0.02);
      t += length + rand(0.04, 0.12);
    }
  }

  function gust() {
    const now = ctx.currentTime;
    const base = 0.012 + mix.wind * 0.24;
    const peak = base * (1.5 + mix.gustiness);
    const param = beds.wind.gain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(peak, now + 1.2);
    param.linearRampToValueAtTime(base, now + 3.8);
  }

  function tick() {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (mix.crickets) {
      [4300, 4720].forEach((frequency, i) => {
        if (now >= nextCricket[i]) {
          chirp(now + 0.05, frequency, i ? 0.55 : -0.5);
          nextCricket[i] = now + rand(0.7, 1.1) + (Math.random() < 0.12 ? rand(1, 3) : 0);
        }
      });
    }
    if (mix.birds && now >= nextBird) {
      birdCall(now + 0.05);
      nextBird = now + rand(2.5, 7);
    }
    if (mix.rumbles && now >= nextRumble) {
      thunder({ power: rand(0.22, 0.42), close: false, delay: rand(0.2, 1) });
      nextRumble = now + rand(16, 34);
    }
    if (mix.wind > 0.25 && Math.random() < 0.012 + mix.gustiness * 0.03) gust();
  }

  return {
    get supported() {
      return Boolean(AudioCtx);
    },
    get active() {
      return enabled && Boolean(ctx) && ctx.state === 'running';
    },
    async enable() {
      if (!AudioCtx) return false;
      if (!ctx) build();
      enabled = true;
      try {
        await ctx.resume();
      } catch {
        return false;
      }
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(volume, ctx.currentTime, 0.8);
      apply();
      clearInterval(timer);
      timer = setInterval(tick, 200);
      return ctx.state === 'running';
    },
    disable() {
      enabled = false;
      clearInterval(timer);
      if (!ctx) return;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      setTimeout(() => {
        if (!enabled && ctx) ctx.suspend();
      }, 1200);
    },
    setScene(next) {
      cfg = next;
      if (enabled) apply();
    },
    setVolume(value) {
      volume = clamp(value);
      if (enabled && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.15);
    },
    strike({ close = false, power = 0.9 } = {}) {
      thunder({ close, power });
    },
  };
}
