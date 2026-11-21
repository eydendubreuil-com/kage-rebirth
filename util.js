/* KAGE: REBIRTH — outils communs : hasard déterministe, bruit, maths, textures peintes par code */
import * as THREE from 'three';

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export const R = mulberry32(20261117);
export const rr = (a, b) => a + R() * (b - a);
export const pick = (arr) => arr[Math.floor(R() * arr.length)];
export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
export const dampAngle = (a, b, k, dt) => a + angDiff(a, b) * (1 - Math.exp(-k * dt));
export const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* bruit de gradient 2D */
export function makeNoise(seed) {
  const rnd = mulberry32(seed), p = new Uint8Array(512), g = [];
  const base = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  for (let i = 0; i < 256; i++) { const a = rnd() * Math.PI * 2; g.push([Math.cos(a), Math.sin(a)]); }
  const f = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return function (x, y) {
    const X = Math.floor(x), Y = Math.floor(y), xf = x - X, yf = y - Y;
    const xi = X & 255, yi = Y & 255;
    const d = (ix, iy, dx, dy) => { const gg = g[p[p[ix] + iy]]; return gg[0] * dx + gg[1] * dy; };
    const u = f(xf), v = f(yf);
    const a = d(xi, yi, xf, yf), b = d(xi + 1, yi, xf - 1, yf), c = d(xi, yi + 1, xf, yf - 1), e = d(xi + 1, yi + 1, xf - 1, yf - 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v) * 1.4;
  };
}
export const N1 = makeNoise(7), N2 = makeNoise(99), N3 = makeNoise(4242);
export function fbm(n, x, y, oct = 5, lac = 2, gain = 0.5) {
  let s = 0, a = 1, f = 1, t = 0;
  for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; t += a; a *= gain; f *= lac; }
  return s / t;
}

/* distance d'un point à une polyligne, avec abscisse */
export function polyDist(pts, x, z) {
  let best = 1e9, bt = 0, acc = 0, bi = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
    let t = ((x - ax) * dx + (z - az) * dz) / L2; t = clamp(t, 0, 1);
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bt = acc + t * L; bi = i; }
    acc += L;
  }
  return { d: best, s: bt, i: bi };
}

/* ---------- textures peintes ---------- */
const TEX = {};
export function canvasTex(key, w, h, draw, rep = [1, 1], color = true) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; t.userData.canvas = c;
  TEX[key] = t; return t;
}
/* carte de relief → carte de normales */
export function normalTex(key, src, strength = 2, rep = [1, 1]) {
  if (TEX[key]) return TEX[key];
  const c0 = src.image || src.userData.canvas, w = c0.width, h = c0.height;
  const d = c0.getContext('2d').getImageData(0, 0, w, h).data;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), out = g.createImageData(w, h), o = out.data;
  const L = (x, y) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y) - L(x - 1, y)) * strength, dy = (L(x, y + 1) - L(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (-dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8;
  TEX[key] = t; return t;
}
function grain(g, w, h, amt, seed = 1) {
  const r = mulberry32(seed), im = g.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(im, 0, 0);
}
export const T = {
  wood: () => canvasTex('wood', 256, 256, (g, w, h) => {
    const r = mulberry32(3); g.fillStyle = '#6b4a30'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const s = r() * 30 - 15; g.fillStyle = `rgb(${108 + s},${74 + s * 0.8},${48 + s * 0.6})`; g.fillRect(x, 0, 31, h);
      for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(40,25,15,${0.08 + r() * 0.15})`; g.lineWidth = 0.6 + r(); g.beginPath();
        const xx = x + r() * 31; g.moveTo(xx, 0); g.bezierCurveTo(xx + r() * 4 - 2, h * 0.3, xx + r() * 4 - 2, h * 0.7, xx + r() * 3 - 1.5, h); g.stroke(); }
      g.fillStyle = 'rgba(20,12,6,0.6)'; g.fillRect(x + 31, 0, 1, h);
    }
    grain(g, w, h, 14, 3);
  }),
  darkwood: () => canvasTex('darkwood', 256, 256, (g, w, h) => {
    const r = mulberry32(5); g.fillStyle = '#2e2119'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 160; k++) { g.strokeStyle = `rgba(${r() < 0.5 ? '90,64,44' : '14,9,6'},${0.12 + r() * 0.2})`; g.lineWidth = 0.5 + r() * 1.5;
      const y = r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + r() * 6 - 3, w * 0.6, y + r() * 6 - 3, w, y + r() * 4 - 2); g.stroke(); }
    grain(g, w, h, 10, 5);
  }),
  floor: () => canvasTex('floor', 512, 512, (g, w, h) => {
    const r = mulberry32(8); g.fillStyle = '#7a5434'; g.fillRect(0, 0, w, h);
    const pw = 64;
    for (let x = 0; x < w; x += pw) for (let y = -r() * 200; y < h; y += 220 + r() * 120) {
      const s = r() * 26 - 13; g.fillStyle = `rgb(${128 + s},${88 + s * 0.8},${54 + s * 0.6})`; g.fillRect(x + 1, y, pw - 2, 300);
      for (let k = 0; k < 18; k++) { g.strokeStyle = `rgba(60,36,18,${0.06 + r() * 0.12})`; g.lineWidth = 0.8; g.beginPath(); const xx = x + 2 + r() * (pw - 4);
        g.moveTo(xx, y); g.lineTo(xx + r() * 3 - 1.5, y + 300); g.stroke(); }
      g.fillStyle = 'rgba(25,14,6,0.7)'; g.fillRect(x, y, pw, 2);
    }
    for (let x = 0; x < w; x += pw) { g.fillStyle = 'rgba(25,14,6,0.8)'; g.fillRect(x, 0, 2, h); }
    grain(g, w, h, 10, 8);
  }),
  plaster: () => canvasTex('plaster', 256, 256, (g, w, h) => {
    g.fillStyle = '#d9d0bd'; g.fillRect(0, 0, w, h);
    const r = mulberry32(11);
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,105,80' : '255,250,235'},${r() * 0.07})`; const s = r() * 18; g.fillRect(r() * w, r() * h, s, s * 0.6); }
    grain(g, w, h, 16, 11);
  }),
  roof: () => canvasTex('roof', 256, 256, (g, w, h) => {
    g.fillStyle = '#3a3f46'; g.fillRect(0, 0, w, h);
    const r = mulberry32(13), cw = 32, rh = 28;
    for (let y = 0; y < h; y += rh) for (let x = 0; x < w; x += cw) {
      const s = r() * 24 - 12;
      const gr = g.createLinearGradient(x, 0, x + cw, 0);
      gr.addColorStop(0, `rgb(${40 + s},${44 + s},${50 + s})`); gr.addColorStop(0.5, `rgb(${92 + s},${98 + s},${106 + s})`); gr.addColorStop(1, `rgb(${34 + s},${38 + s},${44 + s})`);
      g.fillStyle = gr; g.beginPath(); g.ellipse(x + cw / 2, y + rh / 2, cw / 2, rh * 0.62, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + rh - 3, cw, 3);
    }
    grain(g, w, h, 12, 13);
  }),
  roofH: () => canvasTex('roofH', 256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const cw = 32, rh = 28;
    for (let y = 0; y < h; y += rh) for (let x = 0; x < w; x += cw) {
      const gr = g.createLinearGradient(x, 0, x + cw, 0); gr.addColorStop(0, '#222'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(1, '#222');
      g.fillStyle = gr; g.fillRect(x, y, cw, rh - 3); }
  }, [1, 1], false),
  stone: () => canvasTex('stone', 256, 256, (g, w, h) => {
    const r = mulberry32(17); g.fillStyle = '#5d5b55'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 42) { const off = (y / 42) % 2 ? 30 : 0;
      for (let x = -off; x < w; x += 60 + r() * 10) { const s = r() * 30 - 15; g.fillStyle = `rgb(${118 + s},${114 + s},${104 + s})`;
        g.beginPath(); g.roundRect(x + 2, y + 2, 56 + r() * 8, 38, 6); g.fill(); } }
    grain(g, w, h, 30, 17);
  }),
  paving: () => canvasTex('paving', 256, 256, (g, w, h) => {
    const r = mulberry32(19); g.fillStyle = '#4b4842'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 70; k++) { const s = r() * 30 - 15; g.fillStyle = `rgb(${120 + s},${116 + s},${106 + s})`;
      const x = r() * w, y = r() * h, rx = 14 + r() * 18, ry = 12 + r() * 14; g.beginPath(); g.ellipse(x, y, rx, ry, r() * 3, 0, Math.PI * 2); g.fill(); }
    grain(g, w, h, 26, 19);
  }),
  tatami: () => canvasTex('tatami', 256, 512, (g, w, h) => {
    g.fillStyle = '#b8b07a'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(${x % 6 ? '90,85,40' : '230,225,170'},0.22)`; g.fillRect(x, 0, 1.5, h); }
    g.fillStyle = '#2a3a2a'; g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    grain(g, w, h, 18, 23);
  }),
  shoji: () => canvasTex('shoji', 256, 256, (g, w, h) => {
    g.fillStyle = '#f1ead8'; g.fillRect(0, 0, w, h); grain(g, w, h, 8, 29);
    g.fillStyle = '#4a3423'; for (let x = 0; x <= w; x += 64) g.fillRect(x - 3, 0, 6, h); for (let y = 0; y <= h; y += 52) g.fillRect(0, y - 3, w, 6);
  }),
  bark: () => canvasTex('bark', 128, 256, (g, w, h) => {
    const r = mulberry32(31); g.fillStyle = '#3b2c25'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,70,60' : '18,12,10'},${0.2 + r() * 0.3})`; g.fillRect(0, r() * h, w, 1 + r() * 3); }
    grain(g, w, h, 20, 31);
  }, [2, 3]),
  ground: () => canvasTex('ground', 256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    const r = mulberry32(37);
    for (let k = 0; k < 2600; k++) { const v = 90 + r() * 90; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    grain(g, w, h, 30, 37);
  }, [1, 1], false),
  cloth: (key, base, pattern, accent) => canvasTex('cloth_' + key, 256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(x, 0, 1, h); }
    g.strokeStyle = accent; g.fillStyle = accent; g.lineWidth = 2;
    if (pattern === 'seigaiha') for (let y = 0; y < h + 32; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < w + 32; x += 32) for (let k = 3; k > 0; k--) { g.beginPath(); g.arc(x, y, k * 5, Math.PI, 0); g.stroke(); }
    if (pattern === 'asanoha') for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { g.globalAlpha = 0.5; g.beginPath(); for (let a = 0; a < 6; a++) { g.moveTo(x + 16, y + 16); g.lineTo(x + 16 + Math.cos(a * Math.PI / 3) * 16, y + 16 + Math.sin(a * Math.PI / 3) * 16); } g.stroke(); g.globalAlpha = 1; }
    if (pattern === 'stripe') for (let x = 0; x < w; x += 22) { g.globalAlpha = 0.35; g.fillRect(x, 0, 5, h); g.globalAlpha = 1; }
    if (pattern === 'dots') for (let y = 8; y < h; y += 24) for (let x = (y / 24) % 2 ? 20 : 8; x < w; x += 24) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
    grain(g, w, h, 12, 41);
  }, [2, 2]),
  blossom: () => canvasTex('blossom', 256, 256, (g, w, h) => {
    const r = mulberry32(43); g.clearRect(0, 0, w, h);
    for (let k = 0; k < 140; k++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 110, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
      const s = 7 + r() * 9, l = 78 + r() * 16;
      g.fillStyle = `hsl(${338 + r() * 18},${55 + r() * 25}%,${l}%)`;
      for (let p = 0; p < 5; p++) { const pa = p * 1.2566 + r(); g.beginPath(); g.ellipse(x + Math.cos(pa) * s * 0.5, y + Math.sin(pa) * s * 0.5, s * 0.5, s * 0.32, pa, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#c2557a'; g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
    }
  }),
  needles: () => canvasTex('needles', 128, 128, (g, w, h) => {
    const r = mulberry32(47); g.clearRect(0, 0, w, h);
    for (let k = 0; k < 500; k++) { const x = r() * w, y = r() * h * 0.9; g.strokeStyle = `hsl(${100 + r() * 30},${35 + r() * 20}%,${16 + r() * 18}%)`; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + r() * 10 - 5, y + 6 + r() * 10); g.stroke(); }
  }),
  maple: () => canvasTex('maple', 256, 256, (g, w, h) => {
    const r = mulberry32(53); g.clearRect(0, 0, w, h);
    for (let k = 0; k < 160; k++) { const a = r() * 6.28, d = Math.pow(r(), 0.7) * 110, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, s = 6 + r() * 7;
      g.fillStyle = `hsl(${2 + r() * 26},${70 + r() * 20}%,${36 + r() * 18}%)`; g.beginPath();
      for (let p = 0; p < 5; p++) { const pa = -1.57 + (p - 2) * 0.6; g.lineTo(x + Math.cos(pa) * s, y + Math.sin(pa) * s); g.lineTo(x + Math.cos(pa + 0.3) * s * 0.4, y + Math.sin(pa + 0.3) * s * 0.4); }
      g.fill(); }
  }),
  bambooLeaf: () => canvasTex('bambooLeaf', 128, 128, (g, w, h) => {
    const r = mulberry32(59); g.clearRect(0, 0, w, h);
    for (let k = 0; k < 70; k++) { const x = r() * w, y = r() * h, a = r() * 6.28; g.fillStyle = `hsl(${85 + r() * 25},${40 + r() * 25}%,${28 + r() * 18}%)`;
      g.beginPath(); g.ellipse(x, y, 14, 2.6, a, 0, Math.PI * 2); g.fill(); }
  }),
  waterN: () => {
    const h = canvasTex('waterH', 256, 256, (g, w, hh) => {
      const n = makeNoise(61), im = g.createImageData(w, hh), d = im.data;
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        // bruit périodique
        const fx = x / w * Math.PI * 2, fy = y / hh * Math.PI * 2;
        let v = 0; for (let o = 1; o <= 4; o++) v += n(Math.cos(fx) * o * 1.3 + 10, Math.sin(fx) * o * 1.3 + Math.cos(fy) * o * 1.7) * (1 / o) + n(Math.sin(fy) * o * 1.6, Math.cos(fy) * o * 1.2 + 5) * (0.5 / o);
        const c = clamp(128 + v * 70, 0, 255), i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = c; d[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    }, [1, 1], false);
    return normalTex('waterN', h, 3);
  },
  scroll: (key, text, sub) => canvasTex('scroll_' + key, 128, 384, (g, w, h) => {
    g.fillStyle = '#efe6cf'; g.fillRect(0, 0, w, h); grain(g, w, h, 10, 67);
    g.fillStyle = '#5b3d2a'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#141210'; g.font = '700 74px "Shippori Mincho B1", serif'; g.textAlign = 'center';
    [...text].forEach((ch, i) => g.fillText(ch, w / 2, 100 + i * 92));
    if (sub) { g.fillStyle = '#9c2a20'; g.fillRect(w - 34, h - 60, 20, 20); }
  }, [1, 1]),
  noren: (key, color, kanji) => canvasTex('noren_' + key, 256, 160, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h); grain(g, w, h, 12, 71);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = w / 3; x < w; x += w / 3) g.fillRect(x - 1, 0, 2, h);
    g.fillStyle = '#f4ecdc'; g.font = '700 64px "Shippori Mincho B1", serif'; g.textAlign = 'center'; g.fillText(kanji, w / 2, h * 0.62);
  }),
  lantern: () => canvasTex('lantern', 128, 128, (g, w, h) => {
    g.fillStyle = '#c23b26'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, w, 2); }
    g.fillStyle = '#1a0d08'; g.font = '700 54px "Shippori Mincho B1", serif'; g.textAlign = 'center'; g.fillText('祭', w / 2, h * 0.68);
  }),
  sign: (key, text) => canvasTex('sign_' + key, 256, 96, (g, w, h) => {
    g.fillStyle = '#3a2618'; g.fillRect(0, 0, w, h); grain(g, w, h, 16, 73);
    g.fillStyle = '#e9dcc0'; g.font = '700 60px "Shippori Mincho B1", serif'; g.textAlign = 'center'; g.fillText(text, w / 2, h * 0.7);
  }),
  streak: () => canvasTex('streak', 64, 256, (g, w, h) => {
    const r = mulberry32(79); g.clearRect(0, 0, w, h);
    for (let k = 0; k < 90; k++) { const x = r() * w; g.fillStyle = `rgba(235,245,250,${0.2 + r() * 0.5})`; g.fillRect(x, r() * h, 1 + r() * 2.5, 20 + r() * 90); }
  }),
  soft: () => canvasTex('soft', 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }),
  petal: () => canvasTex('petal', 32, 32, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#f6c6d3'; g.beginPath(); g.ellipse(16, 16, 13, 8, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e897ad'; g.beginPath(); g.ellipse(12, 16, 4, 3, 0.3, 0, Math.PI * 2); g.fill();
  }),
  ray: () => canvasTex('ray', 64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,240,210,0)'); gr.addColorStop(0.5, 'rgba(255,240,210,1)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const g2 = g.createLinearGradient(0, 0, 0, h); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.15, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = g2; g.fillRect(0, 0, w, h);
  }),
};

/* regroupe les géométries par matière pour limiter les appels de dessin */
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export class Batcher {
  constructor() { this.groups = new Map(); }
  add(geo, mat, matrix) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (matrix) g.applyMatrix4(matrix);
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat).push(g);
  }
  box(w, h, d, mat, x, y, z, ry = 0, rx = 0, rz = 0, uvScale) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (uvScale) boxUV(geo, w, h, d, uvScale);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    this.add(geo, mat, m);
  }
  build(parent, { cast = true, receive = true, list } = {}) {
    for (const [mat, arr] of this.groups) {
      const merged = mergeGeometries(arr, false); if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = cast && !mat.transparent; mesh.receiveShadow = receive;
      parent.add(mesh); if (list) list.push(mesh);
    }
    this.groups.clear();
  }
}
/* coordonnées de texture proportionnelles à la taille réelle */
export function boxUV(geo, w, h, d, s) {
  const uv = geo.attributes.uv, n = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const u = uv.getX(i), v = uv.getY(i);
    if (nx > 0.5) uv.setXY(i, u * d / s, v * h / s); else if (ny > 0.5) uv.setXY(i, u * w / s, v * d / s); else uv.setXY(i, u * w / s, v * h / s);
  }
}
