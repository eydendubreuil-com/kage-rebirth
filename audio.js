/* KAGE: REBIRTH — son : musiques d'Eyden, bruitages et ambiances synthétisés */
export const A = { ctx: null, on: false, vol: { master: 0.9, music: 0.6, sfx: 0.85, amb: 0.7 }, track: null, els: [], cur: 0, amb: {} };
const TRACKS = {
  menu: 'kage-theme.mp3', aube: 'dojo-09.mp3', jour: 'dojo-07.mp3', crepuscule: 'dojo-01.mp3',
  nuit: 'dojo-08.mp3', dojo: 'dojo-05.mp3', combat: 'dojo-06.mp3', duel: 'dojo-10.mp3', sanctuaire: 'dojo-02.mp3',
};
export const TRACK_NAMES = { menu: 'Wrath of the Jade Dragon', aube: 'Le temple de l\'aube', jour: 'Le jardin des âmes', crepuscule: 'Le sanctuaire du crépuscule', nuit: 'Le monde sans lune', dojo: 'Le temple des marées', combat: 'La citadelle du tonnerre', duel: 'Le sanctuaire du dragon', sanctuaire: 'La forêt des ombres' };

export function audioInit() {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  const C = A.ctx = new (window.AudioContext || window.webkitAudioContext)();
  A.master = C.createGain(); A.master.connect(C.destination);
  A.sfx = C.createGain(); A.sfx.connect(A.master); A.ambG = C.createGain(); A.ambG.connect(A.master);
  /* réverbération : longue dans le dojo, courte dehors */
  A.verb = C.createConvolver(); const len = C.sampleRate * 2.2, ir = C.createBuffer(2, len, C.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  A.verb.buffer = ir; A.wet = C.createGain(); A.wet.gain.value = 0.12; A.sfx.connect(A.verb); A.verb.connect(A.wet); A.wet.connect(A.master);
  A.noise = C.createBuffer(1, C.sampleRate * 2, C.sampleRate); const nd = A.noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  /* ambiances en boucle : vent, eau, pluie, rumeur du village */
  const loop = (type, f, q) => { const s = C.createBufferSource(); s.buffer = A.noise; s.loop = true; const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = C.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(A.ambG); s.start(); return { g, fl }; };
  A.amb.wind = loop('lowpass', 420, 0.7); A.amb.water = loop('bandpass', 900, 0.6); A.amb.rain = loop('highpass', 1400, 0.4); A.amb.town = loop('bandpass', 380, 1.2); A.amb.fall = loop('lowpass', 1600, 0.5);
  A.on = true; applyVolumes();
}
export function applyVolumes() {
  if (!A.ctx) return; A.master.gain.value = A.vol.master; A.sfx.gain.value = A.vol.sfx; A.ambG.gain.value = A.vol.amb;
  for (const e of A.els) if (e) e.volume = Math.min(1, (e._v || 0) * A.vol.music * A.vol.master);
}
/* musique : fondu enchaîné entre deux pistes */
export function music(key) {
  if (A.track === key) return; A.track = key; const src = TRACKS[key]; if (!src) return;
  const old = A.els[A.cur]; A.cur = 1 - A.cur;
  const el = new Audio(src); el.loop = true; el.preload = 'auto'; el._v = 0; el.volume = 0; A.els[A.cur] = el;
  el.play().catch(() => {});
  const t0 = performance.now();
  const step = () => { const u = Math.min(1, (performance.now() - t0) / 2200); el._v = u; if (old) old._v = 1 - u; applyVolumes(); if (u < 1) requestAnimationFrame(step); else if (old) { old.pause(); old.src = ''; } };
  step();
}
export function musicStop() { for (const e of A.els) if (e) { e.pause(); } A.track = null; }

function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function noiseBurst(f, q, type, peak, a, d, rate = 1, dest) {
  const C = A.ctx, t = C.currentTime, s = C.createBufferSource(); s.buffer = A.noise; s.playbackRate.value = rate;
  const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = C.createGain(); env(g, t, a, peak, d);
  s.connect(fl); fl.connect(g); g.connect(dest || A.sfx); s.start(t, Math.random()); s.stop(t + a + d + 0.05); return fl;
}
function tone(f, type, peak, a, d, f2) {
  const C = A.ctx, t = C.currentTime, o = C.createOscillator(), g = C.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  env(g, t, a, peak, d); o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + a + d + 0.05);
}
export const S = {
  ok: () => !!(A.ctx && A.on),
  ui() { if (!S.ok()) return; tone(1320, 'sine', 0.05, 0.002, 0.08); },
  uiOk() { if (!S.ok()) return; tone(660, 'sine', 0.08, 0.004, 0.18); tone(990, 'sine', 0.05, 0.02, 0.22); },
  swish(p = 1) { if (!S.ok()) return; const f = noiseBurst(1800 * p, 2, 'bandpass', 0.35, 0.01, 0.18); f.frequency.exponentialRampToValueAtTime(500, A.ctx.currentTime + 0.2); },
  hit(p = 1) { if (!S.ok()) return; noiseBurst(500, 1, 'lowpass', 0.6 * p, 0.003, 0.14); tone(120 * p, 'sine', 0.5, 0.003, 0.16, 50); noiseBurst(3000, 1, 'highpass', 0.2, 0.002, 0.05); },
  clang(big) { if (!S.ok()) return; for (const f of [1840, 2420, 3310, 4870]) tone(f * (big ? 0.85 : 1), 'triangle', 0.09, 0.001, big ? 0.9 : 0.45); noiseBurst(5000, 1, 'highpass', 0.25, 0.001, 0.06); },
  parry() { if (!S.ok()) return; S.clang(true); tone(880, 'sine', 0.18, 0.005, 1.2); tone(1318, 'sine', 0.1, 0.01, 1.4); },
  draw() { if (!S.ok()) return; const f = noiseBurst(4000, 3, 'bandpass', 0.18, 0.02, 0.35); f.frequency.linearRampToValueAtTime(7000, A.ctx.currentTime + 0.35); },
  sheathe() { if (!S.ok()) return; noiseBurst(3000, 3, 'bandpass', 0.12, 0.01, 0.25); tone(2200, 'triangle', 0.05, 0.001, 0.12); },
  step(surf, run) { if (!S.ok()) return; const v = run ? 0.16 : 0.09;
    if (surf === 'bois') { tone(180 + Math.random() * 40, 'triangle', v * 1.3, 0.002, 0.07); noiseBurst(1200, 2, 'bandpass', v * 0.6, 0.002, 0.04); }
    else if (surf === 'pierre') noiseBurst(2400, 1.5, 'bandpass', v, 0.002, 0.05);
    else if (surf === 'eau') noiseBurst(900, 0.8, 'bandpass', v * 2, 0.01, 0.22);
    else noiseBurst(700, 0.7, 'lowpass', v * 1.2, 0.006, 0.09, 0.7); },
  jump() { if (!S.ok()) return; noiseBurst(800, 0.8, 'lowpass', 0.12, 0.01, 0.12); },
  dash() { if (!S.ok()) return; const f = noiseBurst(900, 1, 'bandpass', 0.3, 0.02, 0.3); f.frequency.exponentialRampToValueAtTime(3000, A.ctx.currentTime + 0.3); },
  bell() { if (!S.ok()) return; for (const [f, d] of [[220, 4], [440.5, 3], [661, 2.4], [1102, 1.4]]) tone(f, 'sine', 0.2, 0.004, d); },
  fire() { if (!S.ok()) return; noiseBurst(600, 0.6, 'lowpass', 0.3, 0.05, 0.6); tone(300, 'sine', 0.08, 0.05, 0.5, 600); },
  gong() { if (!S.ok()) return; for (const [f, d] of [[98, 5], [147, 4], [233, 3], [311, 2]]) tone(f, 'sine', 0.22, 0.01, d); noiseBurst(300, 0.5, 'lowpass', 0.3, 0.005, 1.2); },
  special() { if (!S.ok()) return; tone(220, 'sawtooth', 0.06, 0.2, 0.8, 880); noiseBurst(2000, 1, 'bandpass', 0.3, 0.3, 0.6); },
  ult() { if (!S.ok()) return; tone(55, 'sine', 0.4, 0.3, 3, 40); tone(110, 'triangle', 0.12, 0.3, 2.5); S.gong(); },
  coin() { if (!S.ok()) return; tone(1600, 'square', 0.04, 0.002, 0.08); setTimeout(() => S.ok() && tone(2400, 'square', 0.04, 0.002, 0.12), 70); },
  level() { if (!S.ok()) return; [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => S.ok() && tone(f, 'triangle', 0.12, 0.01, 0.5), i * 110)); },
  quest() { if (!S.ok()) return; [392, 523, 659].forEach((f, i) => setTimeout(() => S.ok() && tone(f, 'sine', 0.14, 0.01, 0.9), i * 160)); },
  voice(pitch = 1) { if (!S.ok()) return; tone(180 * pitch + Math.random() * 40, 'triangle', 0.035, 0.005, 0.05); },
  bird() { if (!S.ok()) return; const C = A.ctx, t = C.currentTime, o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; const f = 2400 + Math.random() * 1600; o.frequency.setValueAtTime(f, t);
    for (let k = 0; k < 3; k++) { o.frequency.exponentialRampToValueAtTime(f * (1.3 + Math.random() * 0.4), t + 0.05 + k * 0.12); o.frequency.exponentialRampToValueAtTime(f, t + 0.1 + k * 0.12); }
    env(g, t, 0.01, 0.025, 0.4); o.connect(g); g.connect(A.ambG); o.start(t); o.stop(t + 0.5); },
  cricket() { if (!S.ok()) return; const C = A.ctx, t = C.currentTime; for (let k = 0; k < 4; k++) { const o = C.createOscillator(), g = C.createGain(); o.frequency.value = 4400; env(g, t + k * 0.06, 0.005, 0.012, 0.03); o.connect(g); g.connect(A.ambG); o.start(t + k * 0.06); o.stop(t + k * 0.06 + 0.05); } },
  meow() { if (!S.ok()) return; tone(700, 'sawtooth', 0.04, 0.05, 0.3, 450); },
};
/* ambiance continue, réglée à chaque image */
let birdT = 0, crT = 0;
export function ambience(dt, o) {
  if (!S.ok()) return; const t = A.ctx.currentTime;
  const set = (n, v) => A.amb[n].g.gain.setTargetAtTime(v, t, 0.4);
  set('wind', 0.05 + o.wind * 0.06 + o.alt * 0.002); set('water', Math.max(0, 1 - o.waterD / 30) * 0.18); set('rain', o.rain * 0.22);
  set('town', Math.max(0, 1 - o.townD / 60) * 0.035 * o.day); set('fall', Math.max(0, 1 - o.fallD / 60) * 0.3);
  A.wet.gain.setTargetAtTime(o.indoor ? 0.45 : 0.1, t, 0.3);
  birdT -= dt; if (birdT < 0) { birdT = 0.8 + Math.random() * 4; if (o.day > 0.5 && o.rain < 0.3 && !o.indoor) S.bird(); }
  crT -= dt; if (crT < 0) { crT = 0.4 + Math.random() * 1.5; if (o.day < 0.3 && o.rain < 0.3) S.cricket(); }
}
