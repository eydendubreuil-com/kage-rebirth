/* KAGE: REBIRTH — personnages : modèle procédural, animation, tissus simulés, personnalisation */
import * as THREE from 'three';
import { T, clamp, lerp, damp, R, rr } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SKINS = ['#e8c4a4', '#d0a07a', '#9c6a48'];
export const OUTFITS = {
  encre:  { name: 'Encre', top: '#1d1c1f', inner: '#e9e2d2', hakama: '#141317', obi: '#9e2c22', accent: '#b83324', pattern: 'asanoha', pat: 'rgba(255,255,255,0.08)' },
  indigo: { name: 'Indigo', top: '#22324e', inner: '#e8e2d4', hakama: '#1a2236', obi: '#e8e2d4', accent: '#d8cfb8', pattern: 'seigaiha', pat: 'rgba(255,255,255,0.1)' },
  sakura: { name: 'Sakura', top: '#e9dfd0', inner: '#c75b78', hakama: '#3c2b33', obi: '#c75b78', accent: '#c75b78', pattern: 'dots', pat: 'rgba(199,91,120,0.25)' },
  foret:  { name: 'Forêt', top: '#3c4a32', inner: '#d9d2bd', hakama: '#2a2e22', obi: '#8a6a34', accent: '#8a6a34', pattern: 'stripe', pat: 'rgba(0,0,0,0.18)' },
  cendre: { name: 'Cendre', top: '#5a5652', inner: '#1c1b1a', hakama: '#2e2c2a', obi: '#b08a3e', accent: '#b08a3e', pattern: 'asanoha', pat: 'rgba(0,0,0,0.15)' },
  kage:   { name: 'Kage (débloquée au chapitre 1)', top: '#0c0c0e', inner: '#5a5f68', hakama: '#09090b', obi: '#c8ccd2', accent: '#c8ccd2', pattern: 'seigaiha', pat: 'rgba(200,204,210,0.07)', locked: 'kage' },
  hana:   { name: 'Disciple de Hana (débloquée en mission)', top: '#f1e9dc', inner: '#9e2c22', hakama: '#9e2c22', obi: '#1c1b1a', accent: '#9e2c22', pattern: 'dots', pat: 'rgba(158,44,34,0.18)', locked: 'hana' },
};
export const HAIRS = { chignon: 'Chignon', queue: 'Queue de cheval', court: 'Court', capuche: 'Capuche de ninja' };

const J = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'hnL', 'shR', 'elR', 'hnR', 'thL', 'knL', 'ftL', 'thR', 'knR', 'ftR'];
const NJ = J.length;
export function pose(o = {}) { const p = new Float32Array(NJ * 3 + 3); for (const k in o) { if (k === 'y') p[NJ * 3] = o.y; else if (k === 'rx') p[NJ * 3 + 1] = o.rx; else if (k === 'rz') p[NJ * 3 + 2] = o.rz; else { const i = J.indexOf(k); if (i >= 0) { p[i * 3] = o[k][0] || 0; p[i * 3 + 1] = o[k][1] || 0; p[i * 3 + 2] = o[k][2] || 0; } } } return p; }
export function mix(out, a, b, t) { for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * t; return out; }
function addTo(out, a, w) { for (let i = 0; i < out.length; i++) out[i] += a[i] * w; }

/* ---------- poses de référence ---------- */
export const P = {
  idle: pose({ spine: [0.04, 0, 0], neck: [-0.02, 0, 0], shL: [0.05, 0, 0.12], shR: [0.05, 0, -0.12], elL: [-0.18, 0, 0], elR: [-0.18, 0, 0], thL: [0, 0, 0.03], thR: [0, 0, -0.03], hnL: [0, 0, 0], hnR: [0, 0, 0] }),
  guard: pose({ y: -0.07, hips: [0, 0.45, 0], spine: [0.08, -0.25, 0], chest: [0, -0.15, 0], head: [0, -0.2, 0], shR: [-0.75, -0.25, -0.35], elR: [-1.05, 0, 0], hnR: [0.2, 0, 0.4], shL: [-0.9, 0.5, 0.35], elL: [-1.15, 0, 0], thL: [-0.5, 0.35, 0.12], knL: [0.55, 0, 0], ftL: [-0.05, 0, 0], thR: [0.35, 0.3, -0.12], knR: [0.4, 0, 0], ftR: [-0.25, 0, 0] }),
  block: pose({ y: -0.1, hips: [0, 0.4, 0], spine: [0.0, -0.2, 0], shR: [-1.9, -0.4, -0.6], elR: [-0.6, 0, 0], hnR: [0.1, 0, 1.5], shL: [-1.8, 0.6, 0.5], elL: [-0.9, 0, 0], thL: [-0.45, 0.3, 0.15], knL: [0.6, 0, 0], thR: [0.4, 0.3, -0.15], knR: [0.5, 0, 0] }),
  jump: pose({ spine: [0.2, 0, 0], shL: [-0.6, 0, 0.5], shR: [-0.6, 0, -0.5], elL: [-1, 0, 0], elR: [-1, 0, 0], thL: [-1.2, 0, 0], knL: [1.5, 0, 0], thR: [-0.4, 0, 0], knR: [1.1, 0, 0] }),
  land: pose({ y: -0.25, spine: [0.35, 0, 0], shL: [-0.3, 0, 0.4], shR: [-0.3, 0, -0.4], elL: [-0.6, 0, 0], elR: [-0.6, 0, 0], thL: [-0.9, 0, 0.1], knL: [1.5, 0, 0], ftL: [-0.5, 0, 0], thR: [-0.7, 0, -0.1], knR: [1.4, 0, 0], ftR: [-0.6, 0, 0] }),
  dash: pose({ y: -0.28, rx: 0.15, spine: [0.45, 0, 0], chest: [0.2, 0, 0], shL: [0.9, 0, 0.3], shR: [0.6, 0, -0.4], elL: [-0.3, 0, 0], elR: [-0.4, 0, 0], thL: [-1.1, 0, 0], knL: [1.3, 0, 0], thR: [0.7, 0, 0], knR: [0.9, 0, 0], ftR: [0.4, 0, 0] }),
  hurt: pose({ y: -0.05, rx: -0.12, spine: [-0.35, 0.2, 0], chest: [-0.2, 0, 0], head: [-0.3, 0, 0], shL: [-0.4, 0, 0.6], shR: [0.3, 0, -0.7], elL: [-0.9, 0, 0], elR: [-0.5, 0, 0], thL: [-0.3, 0, 0], knL: [0.4, 0, 0], thR: [0.3, 0, 0], knR: [0.3, 0, 0] }),
  down: pose({ y: -0.78, rx: -1.45, spine: [-0.1, 0, 0], head: [0.2, 0.4, 0], shL: [-2.6, 0, 0.6], shR: [-2.4, 0, -0.8], elL: [-0.4, 0, 0], elR: [-0.6, 0, 0], thL: [-0.3, 0, 0.2], knL: [0.6, 0, 0], thR: [-0.1, 0, -0.2], knR: [0.2, 0, 0] }),
  seiza: pose({ y: -0.62, spine: [0.02, 0, 0], shL: [-0.5, 0, 0.1], shR: [-0.5, 0, -0.1], elL: [-0.9, 0, 0], elR: [-0.9, 0, 0], thL: [-1.5, 0, 0.08], knL: [3.0, 0, 0], ftL: [0.6, 0, 0], thR: [-1.5, 0, -0.08], knR: [3.0, 0, 0], ftR: [0.6, 0, 0] }),
  sit: pose({ y: -0.48, spine: [0.05, 0, 0], shL: [-0.4, 0, 0.1], shR: [-0.4, 0, -0.1], elL: [-0.7, 0, 0], elR: [-0.7, 0, 0], thL: [-1.5, 0, 0.1], knL: [1.5, 0, 0], thR: [-1.5, 0, -0.1], knR: [1.5, 0, 0] }),
  bow: pose({ spine: [0.55, 0, 0], chest: [0.15, 0, 0], neck: [0.2, 0, 0], shL: [0.15, 0, 0.05], shR: [0.15, 0, -0.05], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0] }),
  climb: pose({ spine: [0.1, 0, 0], shL: [-2.6, 0, 0.3], shR: [-1.6, 0, -0.3], elL: [-0.6, 0, 0], elR: [-1.2, 0, 0], thL: [-1.1, 0, 0], knL: [1.4, 0, 0], thR: [-0.2, 0, 0], knR: [0.5, 0, 0] }),
  talk: pose({ spine: [0.04, 0, 0], shR: [-0.5, 0.3, -0.2], elR: [-1.3, 0, 0], hnR: [0, 0, 0.4], shL: [0.05, 0, 0.12], elL: [-0.2, 0, 0] }),
  sweep: pose({ spine: [0.35, 0, 0], shL: [-0.7, 0.3, 0.2], shR: [-0.5, -0.2, -0.1], elL: [-0.5, 0, 0], elR: [-0.9, 0, 0], thL: [-0.2, 0, 0.05], knL: [0.25, 0, 0], thR: [0.1, 0, -0.05], knR: [0.2, 0, 0] }),
  ko: pose({ y: -0.6, rx: 0.05, spine: [0.6, 0, 0], head: [0.4, 0, 0], shL: [-0.1, 0, 0.2], shR: [-0.2, 0, -0.2], thL: [-1.6, 0, 0.1], knL: [2.4, 0, 0], thR: [-1.0, 0, -0.1], knR: [1.8, 0, 0] }),
};
/* attaques : images clés (t en fraction), fenêtre active, portée, dégâts */
const K = (t, o) => ({ t, p: pose(o) });
export const MOVES = {
  l1: { dur: 0.42, act: [0.32, 0.55], dmg: 9, range: 2.5, arc: 1.4, push: 1.4, lunge: 2.2, next: 'l2', keys: [
    K(0, { y: -0.08, hips: [0, 0.6, 0], spine: [0.1, 0.6, 0], shR: [-1.3, 0.9, -1.1], elR: [-0.9, 0, 0], hnR: [0, 0, 1.2], shL: [-0.4, 0, 0.3], elL: [-1.2, 0, 0], thL: [-0.5, 0.4, 0.1], knL: [0.6, 0, 0], thR: [0.35, 0.3, -0.1], knR: [0.4, 0, 0] }),
    K(0.5, { y: -0.12, hips: [0, -0.3, 0], spine: [0.15, -0.7, 0], shR: [-1.4, -1.0, -0.4], elR: [-0.2, 0, 0], hnR: [0, 0, 1.4], shL: [-0.2, 0, 0.6], elL: [-0.6, 0, 0], thL: [-0.7, 0.2, 0.1], knL: [0.7, 0, 0], thR: [0.5, 0.2, -0.1], knR: [0.3, 0, 0] }),
    K(1, null)] },
  l2: { dur: 0.44, act: [0.3, 0.55], dmg: 10, range: 2.6, arc: 1.3, push: 1.6, lunge: 2.4, next: 'l3', keys: [
    K(0, { y: -0.1, hips: [0, -0.4, 0], spine: [0.15, -0.6, 0], shR: [0.2, -0.5, -0.5], elR: [-0.5, 0, 0], hnR: [0, 0, 0.3], shL: [-0.3, 0, 0.4], elL: [-1, 0, 0], thL: [-0.6, 0, 0.1], knL: [0.6, 0, 0], thR: [0.4, 0, -0.1], knR: [0.4, 0, 0] }),
    K(0.5, { y: -0.04, hips: [0, 0.5, 0], spine: [-0.05, 0.7, 0], shR: [-2.4, 0.6, -0.6], elR: [-0.3, 0, 0], hnR: [0, 0, 0.6], shL: [-0.5, 0, 0.5], elL: [-0.8, 0, 0], thL: [-0.4, 0.3, 0.1], knL: [0.4, 0, 0], thR: [0.3, 0.3, -0.1], knR: [0.3, 0, 0] }),
    K(1, null)] },
  l3: { dur: 0.58, act: [0.36, 0.56], dmg: 15, range: 2.7, arc: 1.1, push: 3.2, lunge: 3.0, next: 'l4', keys: [
    K(0, { y: -0.02, hips: [0, 0.2, 0], spine: [-0.25, 0.1, 0], shR: [-3.0, 0.2, -0.2], elR: [-0.6, 0, 0], hnR: [0.3, 0, 0], shL: [-2.9, 0.3, 0.3], elL: [-0.7, 0, 0], thL: [-0.3, 0.2, 0.1], knL: [0.3, 0, 0], thR: [0.2, 0.2, -0.1], knR: [0.3, 0, 0] }),
    K(0.5, { y: -0.3, hips: [0, 0.2, 0], spine: [0.55, 0.05, 0], shR: [-0.9, 0.1, -0.2], elR: [-0.1, 0, 0], hnR: [0.3, 0, 0], shL: [-0.9, 0.3, 0.3], elL: [-0.2, 0, 0], thL: [-1.0, 0.2, 0.1], knL: [1.1, 0, 0], thR: [0.6, 0.2, -0.1], knR: [0.5, 0, 0] }),
    K(1, null)] },
  l4: { dur: 0.62, act: [0.3, 0.62], dmg: 18, range: 3.0, arc: 3.1, push: 3.8, lunge: 1.5, skill: 'quatrieme', keys: [
    K(0, { y: -0.2, hips: [0, 1.2, 0], spine: [0.2, 0.8, 0], shR: [-1.5, 1.2, -1.2], elR: [-0.4, 0, 0], hnR: [0, 0, 1.3], shL: [-0.3, 0, 0.6], elL: [-0.9, 0, 0], thL: [-0.9, 0.5, 0.2], knL: [1.0, 0, 0], thR: [0.6, 0.5, -0.2], knR: [0.7, 0, 0] }),
    K(0.55, { y: -0.25, hips: [0, -2.4, 0], spine: [0.2, -0.9, 0], shR: [-1.5, -1.2, -0.2], elR: [-0.1, 0, 0], hnR: [0, 0, 1.4], shL: [-0.3, 0, 0.8], elL: [-0.6, 0, 0], thL: [-0.9, 0.5, 0.2], knL: [1.0, 0, 0], thR: [0.6, 0.5, -0.2], knR: [0.7, 0, 0] }),
    K(1, null)] },
  heavy: { dur: 0.95, act: [0.52, 0.7], dmg: 26, range: 3.0, arc: 1.6, push: 5, lunge: 3.6, heavy: true, keys: [
    K(0, { y: -0.12, hips: [0, 0.9, 0], spine: [0.0, 0.9, 0], chest: [0, 0.3, 0], shR: [-2.2, 1.4, -0.9], elR: [-1.0, 0, 0], hnR: [0, 0, 1.0], shL: [-2.0, 1.1, 0.3], elL: [-1.0, 0, 0], thL: [-0.6, 0.5, 0.15], knL: [0.8, 0, 0], thR: [0.5, 0.5, -0.15], knR: [0.6, 0, 0] }),
    K(0.42, { y: -0.16, hips: [0, 1.1, 0], spine: [-0.1, 1.1, 0], chest: [0, 0.4, 0], shR: [-2.6, 1.6, -1.0], elR: [-1.1, 0, 0], hnR: [0, 0, 1.0], shL: [-2.3, 1.2, 0.3], elL: [-1.1, 0, 0], thL: [-0.7, 0.6, 0.15], knL: [0.9, 0, 0], thR: [0.6, 0.6, -0.15], knR: [0.7, 0, 0] }),
    K(0.62, { y: -0.34, hips: [0, -0.7, 0], spine: [0.5, -0.9, 0], chest: [0, -0.3, 0], shR: [-1.0, -1.2, -0.3], elR: [-0.1, 0, 0], hnR: [0, 0, 1.4], shL: [-0.9, -0.6, 0.5], elL: [-0.3, 0, 0], thL: [-1.1, 0.3, 0.15], knL: [1.2, 0, 0], thR: [0.8, 0.3, -0.15], knR: [0.5, 0, 0] }),
    K(1, null)] },
  special: { dur: 0.9, act: [0.3, 0.75], dmg: 34, range: 3.2, arc: 1.2, push: 4, lunge: 13, multi: 3, cost: 50, keys: [
    K(0, { y: -0.3, rx: 0.2, spine: [0.5, 0.4, 0], shR: [0.5, 0.6, -0.7], elR: [-0.6, 0, 0], hnR: [0, 0, 0.9], shL: [-0.6, 0, 0.6], elL: [-1.2, 0, 0], thL: [-1.1, 0, 0.1], knL: [1.3, 0, 0], thR: [0.6, 0, -0.1], knR: [0.9, 0, 0] }),
    K(0.45, { y: -0.36, rx: 0.25, spine: [0.5, -0.9, 0], shR: [-1.5, -1.3, -0.3], elR: [-0.1, 0, 0], hnR: [0, 0, 1.5], shL: [0.4, 0, 0.9], elL: [-0.3, 0, 0], thL: [-1.2, 0, 0.1], knL: [1.3, 0, 0], thR: [0.8, 0, -0.1], knR: [0.6, 0, 0] }),
    K(1, null)] },
  parry: { dur: 0.32, act: [0, 0], keys: [K(0, null), K(0.35, { y: -0.08, spine: [0, 0.5, 0], shR: [-1.6, 0.8, -0.9], elR: [-0.7, 0, 0], hnR: [0, 0, 1.6], shL: [-0.3, 0, 0.5], elL: [-1, 0, 0], thL: [-0.4, 0.3, 0.1], knL: [0.5, 0, 0], thR: [0.3, 0.3, -0.1], knR: [0.4, 0, 0] }), K(1, null)] },
  e1: { dur: 0.75, act: [0.55, 0.72], dmg: 11, range: 2.4, arc: 1.2, push: 2, lunge: 2.5, keys: null },
  e2: { dur: 1.05, act: [0.66, 0.82], dmg: 20, range: 2.8, arc: 1.4, push: 4.5, lunge: 4, heavy: true, unblockable: true, keys: null },
};
MOVES.e1.keys = MOVES.l1.keys; MOVES.e2.keys = MOVES.heavy.keys;

/* ---------- chaîne verlet (foulard, cheveux, rubans) rendue en ruban ---------- */
class Chain {
  constructor(scene, n, seg, width, mat) {
    this.p = []; for (let i = 0; i < n; i++) this.p.push({ x: 0, y: -i * seg, z: 0, px: 0, py: -i * seg, pz: 0 });
    this.seg = seg; this.w = width; this.init = false;
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(n * 2 * 3); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    const uv = []; for (let i = 0; i < n; i++) uv.push(0, i / (n - 1), 1, i / (n - 1)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.castShadow = true; scene.add(this.mesh);
  }
  step(anchor, side, dt, wind, gravity = 9.8) {
    const p = this.p; const d = Math.min(dt, 1 / 30);
    if (this.init && Math.hypot(p[0].x - anchor.x, p[0].y - anchor.y, p[0].z - anchor.z) > 1.5) this.init = false;
    if (!this.init) { for (let i = 0; i < p.length; i++) { p[i].x = p[i].px = anchor.x; p[i].y = p[i].py = anchor.y - i * this.seg; p[i].z = p[i].pz = anchor.z; } this.init = true; }
    p[0].x = anchor.x; p[0].y = anchor.y; p[0].z = anchor.z;
    for (let i = 1; i < p.length; i++) { const q = p[i]; const vx = (q.x - q.px) * 0.94, vy = (q.y - q.py) * 0.94, vz = (q.z - q.pz) * 0.94; q.px = q.x; q.py = q.y; q.pz = q.z;
      q.x += vx + wind.x * d * d; q.y += vy - gravity * d * d; q.z += vz + wind.z * d * d; }
    for (let k = 0; k < 4; k++) for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz) || 1e-4, f = (l - this.seg) / l;
      if (i === 0) { b.x -= dx * f; b.y -= dy * f; b.z -= dz * f; } else { a.x += dx * f * 0.5; a.y += dy * f * 0.5; a.z += dz * f * 0.5; b.x -= dx * f * 0.5; b.y -= dy * f * 0.5; b.z -= dz * f * 0.5; } }
    for (let i = 0; i < p.length; i++) { const w = this.w * (1 - i / p.length * 0.5); this.pos.set([p[i].x - side.x * w, p[i].y - side.y * w, p[i].z - side.z * w, p[i].x + side.x * w, p[i].y + side.y * w, p[i].z + side.z * w], i * 6); }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.computeVertexNormals();
  }
  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const MAT_CACHE = new Map();
function mat(key, f) { if (!MAT_CACHE.has(key)) MAT_CACHE.set(key, f()); return MAT_CACHE.get(key); }

export class Actor {
  constructor(scene, o = {}) {
    this.scene = scene; this.o = Object.assign({ outfit: 'encre', hair: 'chignon', skin: 0, scarf: true, band: false, kasa: false, mask: false, scale: 1, sword: true, chains: true, hairColor: '#141210', name: '' }, o);
    this.root = new THREE.Group(); scene.add(this.root);
    this.cur = pose(); this.tmp = pose(); this.base = pose(); mix(this.cur, P.idle, P.idle, 0);
    this.phase = R() * 6; this.blinkT = rr(1, 4); this.emotion = 'neutre'; this.talking = 0; this.lookAt = null; this.headYaw = 0;
    this.chains = []; this.swordDrawn = false; this.build();
  }
  build() {
    const o = this.o, OF = OUTFITS[o.outfit] || OUTFITS.encre, s = o.scale;
    for (const c of this.chains) c.dispose(this.scene); this.chains = [];
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    const skin = mat('skin' + o.skin, () => new THREE.MeshStandardMaterial({ color: SKINS[o.skin] || o.skin, roughness: 0.62 }));
    const topM = mat('top' + o.outfit, () => new THREE.MeshStandardMaterial({ map: T.cloth(o.outfit + 't', OF.top, OF.pattern, OF.pat), roughness: 0.92 }));
    const hakM = mat('hak' + o.outfit, () => new THREE.MeshStandardMaterial({ map: T.cloth(o.outfit + 'h', OF.hakama, 'stripe', 'rgba(0,0,0,0.12)'), roughness: 0.95, side: THREE.DoubleSide }));
    const inM = mat('in' + OF.inner, () => new THREE.MeshStandardMaterial({ color: OF.inner, roughness: 0.9 }));
    const obiM = mat('obi' + OF.obi, () => new THREE.MeshStandardMaterial({ color: OF.obi, roughness: 0.8 }));
    const accM = mat('acc' + OF.accent, () => new THREE.MeshStandardMaterial({ color: OF.accent, roughness: 0.85, side: THREE.DoubleSide }));
    const hairM = mat('hair' + o.hairColor, () => new THREE.MeshStandardMaterial({ color: o.hairColor, roughness: 0.5, metalness: 0.05 }));
    const dark = mat('eye', () => new THREE.MeshStandardMaterial({ color: '#16110e', roughness: 0.3 }));
    const white = mat('white', () => new THREE.MeshStandardMaterial({ color: '#f2eee6', roughness: 0.4 }));
    const tabi = mat('tabi', () => new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.9 }));
    const steel = mat('steel', () => new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.18, metalness: 1 }));
    const wrap = mat('wrap', () => new THREE.MeshStandardMaterial({ color: '#1a1714', roughness: 0.8 }));
    const lac = mat('lac', () => new THREE.MeshStandardMaterial({ color: '#2a1410', roughness: 0.3, metalness: 0.2 }));
    const goldM = mat('gold', () => new THREE.MeshStandardMaterial({ color: '#b08a3e', roughness: 0.35, metalness: 0.9 }));
    const kasaM = mat('kasa', () => new THREE.MeshStandardMaterial({ map: T.tatami(), color: '#c9b98a', roughness: 0.9, side: THREE.DoubleSide }));
    const add = (parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
    const G = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
    const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);

    const j = this.j = {};
    const body = this.body = G(this.root, 0, 0, 0); body.scale.setScalar(s);
    j.hips = G(body, 0, 0.95, 0);
    j.spine = G(j.hips, 0, 0.06, 0); j.chest = G(j.spine, 0, 0.2, 0); j.neck = G(j.chest, 0, 0.27, 0); j.head = G(j.neck, 0, 0.08, 0);
    j.shL = G(j.chest, 0.19, 0.22, 0); j.elL = G(j.shL, 0, -0.29, 0); j.hnL = G(j.elL, 0, -0.26, 0);
    j.shR = G(j.chest, -0.19, 0.22, 0); j.elR = G(j.shR, 0, -0.29, 0); j.hnR = G(j.elR, 0, -0.26, 0);
    j.thL = G(j.hips, 0.1, -0.04, 0); j.knL = G(j.thL, 0, -0.44, 0); j.ftL = G(j.knL, 0, -0.43, 0);
    j.thR = G(j.hips, -0.1, -0.04, 0); j.knR = G(j.thR, 0, -0.44, 0); j.ftR = G(j.knR, 0, -0.43, 0);
    /* torse : kimono croisé */
    add(j.spine, lathe([[0, -0.02], [0.17, -0.02], [0.175, 0.08], [0.17, 0.2]]), topM);
    add(j.chest, lathe([[0, 0], [0.17, 0], [0.19, 0.1], [0.2, 0.18], [0.17, 0.25], [0.08, 0.29], [0, 0.29]]), topM).scale.set(1, 1, 0.78);
    add(j.chest, new THREE.BoxGeometry(0.05, 0.27, 0.02), inM, 0.03, 0.13, 0.152, 0, 0, 0.42);
    add(j.chest, new THREE.BoxGeometry(0.05, 0.27, 0.02), inM, -0.03, 0.13, 0.155, 0, 0, -0.42);
    add(j.chest, new THREE.BoxGeometry(0.035, 0.26, 0.022), topM, -0.065, 0.12, 0.158, 0, 0, -0.42);
    add(j.hips, new THREE.CylinderGeometry(0.185, 0.18, 0.13, 18), obiM, 0, 0.06, 0).scale.z = 0.8;
    add(j.hips, new THREE.BoxGeometry(0.16, 0.09, 0.07), obiM, 0, 0.07, -0.16);
    /* hakama : jambes larges + pans avant / arrière */
    for (const t of [j.thL, j.thR]) { add(t, new THREE.CylinderGeometry(0.12, 0.2, 0.86, 14, 1, true), hakM, 0, -0.4, 0); add(t, new THREE.CylinderGeometry(0.2, 0.2, 0.01, 14), hakM, 0, -0.83, 0); }
    j.hakF = G(j.hips, 0, 0.02, 0.12); add(j.hakF, new THREE.BoxGeometry(0.36, 0.72, 0.02), hakM, 0, -0.36, 0);
    j.hakB = G(j.hips, 0, 0.04, -0.13); add(j.hakB, new THREE.BoxGeometry(0.38, 0.74, 0.02), hakM, 0, -0.37, 0);
    add(j.hips, lathe([[0.17, 0.04], [0.2, -0.04], [0.24, -0.14]], 14), hakM).scale.z = 0.82;
    /* bras : manches larges, avant-bras, mains */
    for (const [sh, el, hn, side] of [[j.shL, j.elL, j.hnL, 1], [j.shR, j.elR, j.hnR, -1]]) {
      add(sh, cap(0.055, 0.2), topM, 0, -0.14, 0);
      add(sh, new THREE.CylinderGeometry(0.075, 0.13, 0.3, 12, 1, true), topM, 0, -0.17, 0);
      const flap = G(sh, 0, -0.06, 0); add(flap, new THREE.BoxGeometry(0.02, 0.24, 0.2), topM, side * 0.03, -0.16, 0); j[side > 0 ? 'flapL' : 'flapR'] = flap;
      add(el, cap(0.042, 0.17), skin, 0, -0.12, 0);
      add(el, new THREE.CylinderGeometry(0.048, 0.052, 0.12, 10), wrap, 0, -0.2, 0);
      add(hn, new THREE.BoxGeometry(0.06, 0.09, 0.085), skin, 0, -0.04, 0.01);
    }
    for (const [ft] of [[j.ftL], [j.ftR]]) { add(ft, new THREE.BoxGeometry(0.09, 0.07, 0.24), tabi, 0, -0.03, 0.05); add(ft, new THREE.BoxGeometry(0.1, 0.02, 0.26), lac, 0, -0.07, 0.05); }
    /* tête */
    const H = j.head;
    const headM = add(H, new THREE.SphereGeometry(0.1, 24, 18), skin, 0, 0.1, 0.005); headM.scale.set(0.95, 1.12, 1.02);
    add(H, new THREE.SphereGeometry(0.07, 16, 12), skin, 0, 0.055, 0.03).scale.set(1, 0.9, 1.05);
    add(H, new THREE.CylinderGeometry(0.04, 0.045, 0.08, 10), skin, 0, 0.0, 0);
    add(H, new THREE.ConeGeometry(0.014, 0.04, 6), skin, 0, 0.09, 0.106, 1.35);
    for (const sx of [-1, 1]) add(H, new THREE.SphereGeometry(0.022, 8, 6), skin, sx * 0.095, 0.095, 0).scale.set(0.6, 1, 0.9);
    this.eyes = []; this.brows = [];
    for (const sx of [-1, 1]) {
      const w = add(H, new THREE.SphereGeometry(0.019, 12, 8), white, sx * 0.037, 0.115, 0.088); w.scale.set(1.25, 0.75, 0.6);
      const e = add(H, new THREE.SphereGeometry(0.012, 10, 8), dark, sx * 0.037, 0.115, 0.098); e.scale.set(1, 1.1, 0.5); this.eyes.push(w, e);
      this.brows.push(add(H, new THREE.BoxGeometry(0.036, 0.007, 0.01), hairM, sx * 0.038, 0.142, 0.096));
    }
    this.mouth = add(H, new THREE.BoxGeometry(0.03, 0.006, 0.01), mat('lip', () => new THREE.MeshStandardMaterial({ color: '#7a3e34', roughness: 0.6 })), 0, 0.048, 0.1);
    /* cheveux */
    const hairCap = add(H, new THREE.SphereGeometry(0.108, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.115, -0.006); hairCap.scale.set(1, 1.12, 1.06); hairCap.rotation.x = -0.25;
    add(H, new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.4), hairM, 0, 0.1, -0.02).scale.set(1.03, 1.1, 1.06);
    if (o.hair === 'chignon') { add(H, new THREE.CylinderGeometry(0.022, 0.03, 0.09, 10), hairM, 0, 0.215, -0.04, -0.6); add(H, new THREE.SphereGeometry(0.035, 10, 8), hairM, 0, 0.23, -0.07); }
    if (o.hair === 'court') for (let k = 0; k < 7; k++) add(H, new THREE.ConeGeometry(0.03, 0.08, 5), hairM, (k - 3) * 0.025, 0.17, 0.08, 1.9, 0, (k - 3) * 0.12);
    if (o.hair === 'queue') { add(H, new THREE.SphereGeometry(0.03, 10, 8), hairM, 0, 0.17, -0.1); if (o.chains) { const c = new Chain(this.scene, 7, 0.07, 0.035, hairM); c.attach = () => this.wpos(H, 0, 0.16, -0.12); c.side = 'x'; this.chains.push(c); } }
    if (o.hair === 'capuche' || o.mask) {
      const hood = add(H, new THREE.SphereGeometry(0.118, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), accM.color.getHex() === 0 ? topM : topM, 0, 0.105, -0.01); hood.scale.set(1.02, 1.12, 1.1); hood.rotation.x = -0.15;
      if (o.hair === 'capuche') hairCap.visible = false;
    }
    if (o.mask) add(H, new THREE.CylinderGeometry(0.098, 0.09, 0.075, 18, 1, true, -1.3, 2.6), topM, 0, 0.05, 0.012);
    if (o.band) { add(H, new THREE.TorusGeometry(0.104, 0.012, 6, 24), accM, 0, 0.15, 0, Math.PI / 2 - 0.25); if (o.chains) for (const sx of [-1, 1]) { const c = new Chain(this.scene, 5, 0.06, 0.016, accM); c.attach = () => this.wpos(H, sx * 0.015, 0.15, -0.11); c.side = 'y'; this.chains.push(c); } }
    if (o.kasa) { const k = add(H, new THREE.ConeGeometry(0.34, 0.16, 24, 1, true), kasaM, 0, 0.24, 0); k.rotation.x = 0.05; add(H, new THREE.ConeGeometry(0.34, 0.16, 24), kasaM, 0, 0.238, 0).scale.set(0.98, 0.95, 0.98); }
    if (o.scarf) { add(j.neck, new THREE.TorusGeometry(0.075, 0.03, 8, 18), accM, 0, 0.01, 0, Math.PI / 2); if (o.chains) for (const sx of [-1, 1]) { const c = new Chain(this.scene, 8, 0.1, 0.045, accM); c.attach = () => this.wpos(j.neck, sx * 0.03, 0.0, -0.08); c.side = 'y'; this.chains.push(c); } }
    if (o.beard) add(H, new THREE.ConeGeometry(0.05, 0.12, 8), mat('beard', () => new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.9 })), 0, 0.0, 0.07, Math.PI);
    /* sabre et fourreau */
    if (o.sword) {
      j.saya = G(j.hips, 0.17, 0.05, 0.08); j.saya.rotation.set(1.95, 0.25, 0.15);
      add(j.saya, new THREE.BoxGeometry(0.04, 0.78, 0.025), lac, 0, 0.42, 0);
      const sw = this.sword = new THREE.Group();
      add(sw, new THREE.CylinderGeometry(0.016, 0.017, 0.26, 8), wrap, 0, 0.0, 0);
      for (let k = 0; k < 6; k++) add(sw, new THREE.BoxGeometry(0.036, 0.008, 0.036), white, 0, -0.11 + k * 0.042, 0, 0, 0.78);
      add(sw, new THREE.CylinderGeometry(0.045, 0.045, 0.01, 16), goldM, 0, 0.14, 0);
      const bl = new THREE.BoxGeometry(0.03, 0.74, 0.006); bl.translate(0, 0.52, 0); const bp = bl.attributes.position; for (let i = 0; i < bp.count; i++) { const y = bp.getY(i); if (y > 0.86) bp.setX(i, bp.getX(i) * 0.3 - 0.008); bp.setX(i, bp.getX(i) + Math.pow(Math.max(0, y - 0.15) / 0.75, 2) * 0.03); }
      bl.computeVertexNormals(); add(sw, bl, steel);
      this.tipLocal = new THREE.Vector3(0.03, 0.88, 0); this.baseLocal = new THREE.Vector3(0, 0.2, 0);
      this.sheathe(true);
    }
    this.mergeStatic();
  }
  /* fusionne les pièces fixes de chaque articulation, matière par matière : beaucoup moins d'appels de dessin */
  mergeStatic() {
    const keep = new Set([...this.eyes, ...this.brows, this.mouth]); this.face = [...this.eyes, ...this.brows, this.mouth];
    const groups = new Set(); this.root.traverse(o => { if (o.isGroup || o === this.root) groups.add(o); });
    for (const g of groups) {
      const byMat = new Map();
      for (const m of g.children) if (m.isMesh && !keep.has(m)) { if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(m); }
      for (const [mat, list] of byMat) {
        if (list.length < 2) continue;
        const geos = list.map(m => { m.updateMatrix(); let ge = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); for (const k of Object.keys(ge.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ge.deleteAttribute(k); if (!ge.attributes.uv) ge.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ge.attributes.position.count * 2), 2)); return ge.applyMatrix4(m.matrix); });
        const merged = mergeGeometries(geos); if (!merged) continue;
        for (const m of list) g.remove(m);
        const mm = new THREE.Mesh(merged, mat); mm.castShadow = true; mm.receiveShadow = true; g.add(mm);
      }
    }
    this.meshes = []; this.root.traverse(o => { if (o.isMesh) this.meshes.push(o); });
  }
  /* niveau de détail : visage et ombres seulement de près */
  lod(dist, force) {
    const face = dist < 16, sh = dist < 30;
    if (this._face !== face) { this._face = face; for (const f of this.face) f.visible = face; }
    if (this._sh !== sh) { this._sh = sh; for (const m of this.meshes) m.castShadow = sh; }
  }
  wpos(obj, x, y, z) { return obj.localToWorld(_v.set(x, y, z)).clone(); }
  sheathe(sheathed) {
    if (!this.sword) return; this.swordDrawn = !sheathed;
    if (sheathed) { this.j.saya.add(this.sword); this.sword.position.set(0, -0.04, 0); this.sword.rotation.set(0, 0, 0); }
    else { this.j.hnR.add(this.sword); this.sword.position.set(0, -0.07, 0.02); this.sword.rotation.set(Math.PI / 2, 0, 0); }
  }
  tipWorld(out) { return this.sword.localToWorld(out.copy(this.tipLocal)); }
  baseWorld(out) { return this.sword.localToWorld(out.copy(this.baseLocal)); }
  setOutfit(o) { Object.assign(this.o, o); this.build(); }
  dispose() { for (const c of this.chains) c.dispose(this.scene); this.scene.remove(this.root); }

  /* ---------- animation ---------- */
  /* st : { speed, moving, air, vy, action:{move,t}, stance:'guard'|'free', special:'seiza'|..., hurtT, downT, climb } */
  animate(dt, st) {
    const cur = this.cur, base = this.base, tmp = this.tmp;
    this.phase += dt * (st.speed > 0.1 ? 3.2 + st.speed * 1.35 : 0);
    const sp = clamp(st.speed / 5, 0, 1.6), ph = this.phase, br = Math.sin(performance.now() * 0.0012 + this.phase) ;
    /* base : repos ou garde */
    mix(base, P.idle, P.guard, st.stance === 'guard' ? 1 : 0);
    base[NJ * 3] += br * 0.006; base[3] += br * 0.02;
    if (st.special && P[st.special]) mix(base, base, P[st.special], 1);
    if (st.special === 'sweep') { base[J.indexOf('shL') * 3 + 1] += Math.sin(ph * 0 + performance.now() * 0.004) * 0.5; base[J.indexOf('shR') * 3 + 1] += Math.sin(performance.now() * 0.004) * 0.5; }
    if (st.special === 'talk') { base[J.indexOf('shR') * 3] += Math.sin(performance.now() * 0.003) * 0.25; base[J.indexOf('elR') * 3] += Math.sin(performance.now() * 0.005) * 0.2; }
    /* marche et course */
    if (sp > 0.02 && !st.air && !st.special) {
      const A = 0.42 + sp * 0.32, s1 = Math.sin(ph), c1 = Math.cos(ph);
      const g = st.stance === 'guard' ? 0.5 : 1;
      const add = (name, ax, v) => { base[J.indexOf(name) * 3 + ax] += v; };
      add('thL', 0, -s1 * A * g); add('thR', 0, s1 * A * g);
      add('knL', 0, Math.max(0, c1) * (0.5 + sp * 0.7) * g + 0.1 * sp); add('knR', 0, Math.max(0, -c1) * (0.5 + sp * 0.7) * g + 0.1 * sp);
      add('ftL', 0, -Math.max(0, -s1) * 0.3); add('ftR', 0, -Math.max(0, s1) * 0.3);
      if (st.stance !== 'guard') { add('shL', 0, s1 * (0.35 + sp * 0.4)); add('shR', 0, -s1 * (0.35 + sp * 0.4)); add('elL', 0, -0.2 - sp * 0.6); add('elR', 0, -0.2 - sp * 0.6); }
      add('spine', 0, 0.06 + sp * 0.2); add('hips', 1, s1 * 0.12); add('chest', 1, -s1 * 0.16);
      base[NJ * 3] += -Math.abs(Math.sin(ph)) * 0.035 * (0.5 + sp) - sp * 0.03;
    }
    if (st.air) mix(base, base, P.jump, clamp(0.6 + st.vy * -0.05, 0.3, 1));
    if (st.landT > 0) mix(base, base, P.land, clamp(st.landT / 0.25, 0, 1) * 0.8);
    if (st.climb) { mix(base, base, P.climb, 1); const s1 = Math.sin(st.climbPh || 0); base[J.indexOf('shL') * 3] += s1 * 0.5; base[J.indexOf('shR') * 3] -= s1 * 0.5; base[J.indexOf('thL') * 3] += s1 * 0.5; base[J.indexOf('thR') * 3] -= s1 * 0.5; }
    if (st.block) mix(base, base, P.block, st.block);
    /* action par-dessus */
    let target = base;
    if (st.action && MOVES[st.action.move]) {
      const mv = MOVES[st.action.move], u = clamp(st.action.t / mv.dur, 0, 1), keys = mv.keys;
      let a = keys[0], b = keys[keys.length - 1];
      for (let i = 0; i < keys.length - 1; i++) if (u >= keys[i].t && u <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
      const k = (u - a.t) / Math.max(1e-4, b.t - a.t), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      mix(tmp, a.p || base, b.p || base, e); target = tmp;
    }
    if (st.dashT > 0) { mix(tmp, target, P.dash, clamp(Math.sin(clamp(st.dashT / 0.42, 0, 1) * Math.PI) * 1.2, 0, 1)); target = tmp; }
    if (st.hurtT > 0) { mix(tmp, target, P.hurt, clamp(st.hurtT / 0.3, 0, 1)); target = tmp; }
    if (st.downT > 0) { mix(tmp, target, st.dead ? P.down : P.down, clamp(st.downT * 3, 0, 1)); target = tmp; }
    if (st.ko) { mix(tmp, target, P.ko, 1); target = tmp; }
    const k = st.snap ? 1 : 1 - Math.exp(-(st.action ? 26 : 12) * dt);
    mix(cur, cur, target, k);
    /* application */
    for (let i = 0; i < NJ; i++) { const g = this.j[J[i]]; g.rotation.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]); }
    this.j.hips.position.y = 0.95 + cur[NJ * 3]; this.body.rotation.x = cur[NJ * 3 + 1]; this.body.rotation.z = cur[NJ * 3 + 2];
    /* regard */
    if (this.lookAt) { const hp = this.j.neck.getWorldPosition(_v2); const yaw = Math.atan2(this.lookAt.x - hp.x, this.lookAt.z - hp.z) - this.root.rotation.y; let d = yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; this.headYaw = damp(this.headYaw, clamp(d, -1.1, 1.1), 6, dt); }
    else this.headYaw = damp(this.headYaw, 0, 4, dt);
    this.j.neck.rotation.y += this.headYaw * 0.4; this.j.head.rotation.y += this.headYaw * 0.6;
    /* pans du hakama : suivent les cuisses */
    const tl = cur[J.indexOf('thL') * 3], tr = cur[J.indexOf('thR') * 3];
    this.j.hakF.rotation.x = Math.min(tl, tr) * 0.75 - (st.air ? 0.3 : 0); this.j.hakB.rotation.x = Math.max(tl, tr) * 0.75 + 0.05 + st.speed * 0.02;
    /* manches : retard */
    for (const [f, sh, sgn] of [[this.j.flapL, 'shL', 1], [this.j.flapR, 'shR', -1]]) { if (!f) continue; const a = cur[J.indexOf(sh) * 3]; f.rotation.x = damp(f.rotation.x, -a * 0.7 + st.speed * 0.05, 8, dt); }
    /* visage : clignement, sourcils, bouche */
    this.blinkT -= dt; const bl = this.blinkT < 0.12 ? 0.1 : 1; if (this.blinkT < 0) this.blinkT = rr(2, 5);
    for (let i = 0; i < this.eyes.length; i++) this.eyes[i].scale.y = (i % 2 ? 1.1 : 0.75) * bl;
    const em = this.emotion, bAng = em === 'colere' ? 0.35 : (em === 'surprise' ? -0.15 : (em === 'joie' ? -0.08 : 0)), bY = em === 'surprise' ? 0.008 : (em === 'colere' ? -0.005 : 0);
    this.brows.forEach((b, i) => { b.rotation.z = (i === 0 ? -bAng : bAng); b.position.y = 0.142 + bY; });
    this.talking = Math.max(0, this.talking - dt);
    this.mouth.scale.set(em === 'joie' ? 1.25 : 1, this.talking > 0 ? 1 + Math.abs(Math.sin(performance.now() * 0.02)) * 3 : (em === 'surprise' ? 2.5 : 1), 1);
  }
  /* tissus simulés, après la mise à jour des matrices */
  cloth(dt, wind) {
    if (!this.chains.length) return;
    this.root.updateMatrixWorld(true);
    const sideX = _v2.set(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_q)).normalize().clone();
    const up = new THREE.Vector3(0, 1, 0);
    for (const c of this.chains) c.step(c.attach(), c.side === 'y' ? sideX : up.clone().multiplyScalar(0.0).add(sideX), dt, wind);
  }
}

/* ---------- animaux : chat ---------- */
export class Cat {
  constructor(scene, color = '#2a2420') {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }); this.root = new THREE.Group(); scene.add(this.root);
    const add = (g, x, y, z, p = this.root) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; p.add(me); return me; };
    this.body = add(new THREE.CapsuleGeometry(0.09, 0.26, 4, 8), 0, 0.2, 0); this.body.rotation.x = Math.PI / 2;
    this.head = add(new THREE.SphereGeometry(0.08, 12, 10), 0, 0.27, 0.2);
    add(new THREE.ConeGeometry(0.03, 0.06, 4), 0.045, 0.06, -0.005, this.head).rotation.z = -0.3; add(new THREE.ConeGeometry(0.03, 0.06, 4), -0.045, 0.06, -0.005, this.head).rotation.z = 0.3;
    this.legs = []; for (const [x, z] of [[0.06, 0.12], [-0.06, 0.12], [0.06, -0.12], [-0.06, -0.12]]) { const g = new THREE.Group(); g.position.set(x, 0.17, z); this.root.add(g); add(new THREE.CapsuleGeometry(0.022, 0.12, 2, 6), 0, -0.08, 0, g); this.legs.push(g); }
    this.tail = new THREE.Group(); this.tail.position.set(0, 0.24, -0.2); this.root.add(this.tail); add(new THREE.CapsuleGeometry(0.02, 0.28, 2, 6), 0, 0.14, -0.04, this.tail).rotation.x = -0.4;
    this.ph = R() * 6; this.state = 'marche'; this.t = rr(2, 6); this.dir = R() * 6;
  }
  update(dt, ground, home) {
    this.t -= dt; this.ph += dt * 9;
    if (this.t < 0) { this.state = R() < 0.45 ? 'assis' : 'marche'; this.t = rr(2, 7); this.dir += rr(-1.5, 1.5); }
    const p = this.root.position;
    if (Math.hypot(p.x - home.x, p.z - home.z) > 9) this.dir = Math.atan2(home.x - p.x, home.z - p.z);
    if (this.state === 'marche') { p.x += Math.sin(this.dir) * dt * 0.7; p.z += Math.cos(this.dir) * dt * 0.7; this.legs.forEach((l, i) => l.rotation.x = Math.sin(this.ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5); this.body.position.y = 0.2; }
    else { this.legs.forEach((l, i) => l.rotation.x = i > 1 ? -1.2 : 0); this.body.position.y = 0.14; }
    this.root.rotation.y = this.dir; p.y = ground(p.x, p.z); this.tail.rotation.z = Math.sin(this.ph * 0.3) * 0.5;
  }
}
