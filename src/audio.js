// Tiny WebAudio synth – no asset files needed.
let ctx = null;
let master = null;
let muted = false;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, type = 'sine', dur = 0.12, vol = 0.5, slide = 0, delay = 0 }) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.08, vol = 0.3, freq = 2000, delay = 0 }) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  unlock: () => ac(),
  toggleMute() {
    muted = !muted;
    return muted;
  },
  get muted() {
    return muted;
  },
  hover: () => tone({ freq: 900, type: 'triangle', dur: 0.04, vol: 0.08 }),
  select: () => tone({ freq: 620, type: 'square', dur: 0.06, vol: 0.12, slide: 1.4 }),
  deselect: () => tone({ freq: 520, type: 'square', dur: 0.06, vol: 0.1, slide: 0.7 }),
  deal: (i = 0) => noise({ dur: 0.06, vol: 0.4, freq: 3000 + i * 150 }),
  chips: (step = 0) => tone({ freq: 330 * Math.pow(1.06, step), type: 'triangle', dur: 0.12, vol: 0.35 }),
  mult: (step = 0) => {
    tone({ freq: 220 * Math.pow(1.06, step), type: 'sawtooth', dur: 0.14, vol: 0.2 });
    tone({ freq: 440 * Math.pow(1.06, step), type: 'square', dur: 0.1, vol: 0.08 });
  },
  xmult: () => {
    tone({ freq: 160, type: 'sawtooth', dur: 0.35, vol: 0.3, slide: 3 });
    noise({ dur: 0.2, vol: 0.3, freq: 800 });
  },
  debuff: () => tone({ freq: 140, type: 'square', dur: 0.2, vol: 0.2, slide: 0.6 }),
  score: () => {
    [0, 4, 7, 12].forEach((s, i) => tone({ freq: 392 * Math.pow(2, s / 12), type: 'triangle', dur: 0.25, vol: 0.25, delay: i * 0.05 }));
    noise({ dur: 0.3, vol: 0.25, freq: 600 });
  },
  money: () => {
    tone({ freq: 1320, type: 'square', dur: 0.08, vol: 0.12 });
    tone({ freq: 1760, type: 'square', dur: 0.12, vol: 0.12, delay: 0.07 });
  },
  win: () => [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone({ freq: 262 * Math.pow(2, s / 12), type: 'triangle', dur: 0.3, vol: 0.25, delay: i * 0.08 })),
  lose: () => [0, -3, -6, -12].forEach((s, i) => tone({ freq: 330 * Math.pow(2, s / 12), type: 'sawtooth', dur: 0.4, vol: 0.18, delay: i * 0.18 })),
  click: () => tone({ freq: 440, type: 'square', dur: 0.05, vol: 0.12 }),
  whoosh: () => noise({ dur: 0.25, vol: 0.25, freq: 900 }),
};
