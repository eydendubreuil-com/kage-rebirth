/* KAGE: REBIRTH — Sakura Valley : relief, eau, village, dojo, végétation, ciel, météo */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, rr, mulberry32, clamp, lerp, smooth, fbm, N1, N2, N3, polyDist, T, normalTex, Batcher, boxUV } from './util.js';

export const W = {
  colliders: [], walkables: [], ladders: [], interact: [], pois: [], doors: [], lights: [], nav: {},
  lanternMats: [], shojiMats: [], rays: [], fire: [], spawn: new THREE.Vector3(0, 0, 102), time: 6.4, wind: 1,
  weather: { kind: 'clair', target: 'clair', rain: 0, fog: 0, cloud: 0.25, t: 0, next: 180 }, uTime: { value: 0 }, uWind: { value: 1 },
};
/* ---------- tracés ---------- */
export const RIVER = [[-112, -106], [-96, -78], [-74, -34], [-46, 12], [-14, 40], [16, 50], [52, 62], [92, 86], [140, 120], [200, 168], [270, 220]];
const ROADS = [
  { w: 3.4, pts: [[0, 140], [0, 112], [0, 60], [0, 30], [0, -57]] },
  { w: 2.6, pts: [[-62, 0], [-30, 0], [0, 2], [34, 0], [62, -6]] },
  { w: 2.0, pts: [[-30, 0], [-46, -6], [-58, -14], [-76, -30]] },
  { w: 2.0, pts: [[34, 0], [56, -20], [74, -44], [80, -50]] },
  { w: 1.8, pts: [[0, 60], [26, 74], [50, 92], [72, 104]] },
  { w: 1.6, pts: [[0, 80], [-24, 74], [-50, 70]] },
  { w: 1.6, pts: [[-30, 0], [-26, 10], [-23, 21.5]] },
];
const TERR = { x0: -24, x1: 24, z0: -122, z1: -66, y: 3.2 };   /* terrasse du dojo */
export const WATER_Y = (s) => s < 60 ? lerp(5.2, 0.9, s / 60) : Math.max(-0.7, lerp(0.9, -0.7, (s - 60) / 140));

/* ---------- relief ---------- */
function baseH(x, z) {
  const r = Math.hypot(x * 0.95, z);
  let h = fbm(N1, x * 0.011, z * 0.011, 4) * 2.4;
  const m = smooth(132, 250, r);
  h += m * m * (70 + fbm(N2, x * 0.005, z * 0.005, 5) * 55) + m * fbm(N3, x * 0.028, z * 0.028, 4) * 9;
  h += 10 * Math.exp(-((x - 82) ** 2 + (z + 58) ** 2) / 520);          /* colline de la pagode */
  h += 26 * Math.exp(-((x + 122) ** 2 + (z + 118) ** 2) / 300) * smooth(80, 140, r); /* falaise de la cascade */
  return h;
}
export function terrainH(x, z) {
  let h = baseH(x, z);
  /* le village est un replat */
  const fv = 1 - smooth(62, 96, Math.hypot(x * 0.85, (z + 4) * 0.8));
  h = lerp(h, 0.25 + h * 0.18, fv);
  /* terrasse du dojo, avec escalier central */
  const inT = x > TERR.x0 && x < TERR.x1 && z > TERR.z0 && z < TERR.z1;
  if (inT) h = TERR.y;
  else {
    const dx = Math.max(TERR.x0 - x, 0, x - TERR.x1), dz = Math.max(TERR.z0 - z, 0, z - TERR.z1), d = Math.hypot(dx, dz);
    if (d < 3) h = lerp(TERR.y - 0.1, h, smooth(0.2, 3, d));
    if (Math.abs(x) < 4.6 && z >= TERR.z1 && z < TERR.z1 + 9) h = lerp(TERR.y, 0.3, (z - TERR.z1) / 9);
  }
  /* routes : on adoucit */
  for (const rd of ROADS) { const p = polyDist(rd.pts, x, z); if (p.d < rd.w + 2) h = lerp(h, h * 0.4 + 0.25 * (1 - fv), (1 - smooth(rd.w, rd.w + 2, p.d)) * 0.6); }
  /* rizières en terrasses */
  if (x > -98 && x < -34 && z > 46 && z < 108) { const t = Math.floor((x + 98) / 16); h = lerp(h, 0.5 + t * 0.35, 0.85); }
  /* lit de la rivière */
  const rv = polyDist(RIVER, x, z), wy = WATER_Y(rv.s), wdt = rv.s < 40 ? 5 : 6.5;
  if (rv.d < wdt + 10) {
    const bank = wy + 0.45 + Math.max(0, rv.d - wdt) * 0.4;
    if (h > bank) h = lerp(h, bank, 1 - smooth(wdt, wdt + 10, rv.d));
    if (rv.d < wdt) h = Math.min(h, wy - 1.5 * (1 - (rv.d / wdt) ** 2) - 0.15);
  }
  /* bassin de la cascade */
  const pd = Math.hypot(x + 108, z + 100); if (pd < 9) h = Math.min(h, WATER_Y(0) - 1.6 * (1 - (pd / 9) ** 2));
  return h;
}
export function roadDist(x, z) { let b = 99; for (const rd of ROADS) b = Math.min(b, polyDist(rd.pts, x, z).d - rd.w); return b; }
export function inWater(x, z) { const rv = polyDist(RIVER, x, z); const w = rv.s < 40 ? 5 : 6.5; return rv.d < w - 0.6 ? WATER_Y(rv.s) : null; }

/* hauteur du sol réel : terrain ou surfaces construites (ponts, planchers, plateformes) */
export function groundAt(x, z, fromY = 1e9) {
  let h = terrainH(x, z), surf = 'herbe';
  if (roadDist(x, z) < 0) surf = 'pierre';
  for (const wk of W.walkables) {
    if (x < wk.x0 || x > wk.x1 || z < wk.z0 || z > wk.z1) continue;
    const y = wk.f ? wk.f(x, z) : wk.y;
    if (y > h && y <= fromY + 0.65) { h = y; surf = wk.surf || 'bois'; }
  }
  return { h, surf };
}

/* ---------- matières ---------- */
let M;
function mats() {
  const wood = T.wood(), dwood = T.darkwood();
  M = {
    terrain: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.ground(), roughness: 0.94, metalness: 0 }),
    plaster: new THREE.MeshStandardMaterial({ map: T.plaster(), roughness: 0.92 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.78 }),
    dwood: new THREE.MeshStandardMaterial({ map: dwood, roughness: 0.7 }),
    roof: new THREE.MeshStandardMaterial({ map: T.roof(), normalMap: normalTex('roofN', T.roofH(), 2.5), roughness: 0.55, metalness: 0.15 }),
    stone: new THREE.MeshStandardMaterial({ map: T.stone(), roughness: 0.9 }),
    paving: new THREE.MeshStandardMaterial({ map: T.paving(), roughness: 0.88 }),
    floor: new THREE.MeshStandardMaterial({ map: T.floor(), roughness: 0.5, metalness: 0.0, envMapIntensity: 0.45 }),
    tatami: new THREE.MeshStandardMaterial({ map: T.tatami(), roughness: 0.85 }),
    shoji: new THREE.MeshStandardMaterial({ map: T.shoji(), roughness: 0.9, emissive: new THREE.Color('#fff2d8'), emissiveMap: T.shoji(), emissiveIntensity: 0.15, side: THREE.DoubleSide }),
    vermil: new THREE.MeshStandardMaterial({ color: '#b8361f', roughness: 0.55 }),
    black: new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: '#b08a3e', roughness: 0.35, metalness: 0.8 }),
    bark: new THREE.MeshStandardMaterial({ map: T.bark(), roughness: 0.95 }),
    blossom: new THREE.MeshStandardMaterial({ map: T.blossom(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, transparent: false }),
    maple: new THREE.MeshStandardMaterial({ map: T.maple(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }),
    pine: new THREE.MeshStandardMaterial({ color: '#33452c', roughness: 0.92, flatShading: true }),
    bamboo: new THREE.MeshStandardMaterial({ color: '#7c8d4c', roughness: 0.6 }),
    bambooLeaf: new THREE.MeshStandardMaterial({ map: T.bambooLeaf(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }),
    water: new THREE.MeshStandardMaterial({ color: '#2a4f58', roughness: 0.06, metalness: 0.2, normalMap: T.waterN(), normalScale: new THREE.Vector2(0.55, 0.55), transparent: true, opacity: 0.86, envMapIntensity: 1.4 }),
    paddy: null, lantern: new THREE.MeshStandardMaterial({ map: T.lantern(), emissive: new THREE.Color('#ff8a3a'), emissiveMap: T.lantern(), emissiveIntensity: 0, roughness: 0.7 }),
    toro: new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: new THREE.Color('#ffb24a'), emissiveIntensity: 0, roughness: 0.6 }),
    rope: new THREE.MeshStandardMaterial({ color: '#d9c79a', roughness: 0.9 }),
    cloth: new THREE.MeshStandardMaterial({ color: '#e6dcc4', roughness: 0.95, side: THREE.DoubleSide }),
    rock: new THREE.MeshStandardMaterial({ map: T.stone(), color: '#a8a39a', roughness: 0.95, flatShading: true }),
  };
  M.water.normalMap.wrapS = M.water.normalMap.wrapT = THREE.RepeatWrapping;
  M.paddy = M.water.clone(); M.paddy.color = new THREE.Color('#5a6b55'); M.paddy.opacity = 0.75; M.paddy.normalMap = M.water.normalMap;
  W.lanternMats.push(M.lantern, M.toro); W.shojiMats.push(M.shoji);
  const sc = (k, t, s) => new THREE.MeshStandardMaterial({ map: T.scroll(k, t, s), roughness: 0.9 });
  M.scrollKage = sc('kage', '影', true); M.scrollShin = sc('shin', '心'); M.scrollGi = sc('gi', '技'); M.scrollTai = sc('tai', '体');
  return M;
}
export function getMats() { return M; }

/* ---------- kit de construction : repère local tourné par quarts ---------- */
class Kit {
  constructor(b) { this.b = b; this.set(0, 0, 0, 0); }
  set(x, y, z, rot) { this.x = x; this.y = y; this.z = z; this.rot = rot; this.c = Math.cos(rot); this.s = Math.sin(rot); return this; }
  aabb(w, d, lx, lz) { const [x, z] = this.tp(lx, lz), ex = Math.abs(this.c) * w / 2 + Math.abs(this.s) * d / 2, ez = Math.abs(this.s) * w / 2 + Math.abs(this.c) * d / 2; return { x0: x - ex, x1: x + ex, z0: z - ez, z1: z + ez }; }
  tp(lx, lz) { return [this.x + lx * this.c + lz * this.s, this.z - lx * this.s + lz * this.c]; }
  box(w, h, d, mat, lx, ly, lz, uv = 1.6, rx = 0, rz = 0, ry = 0) {
    const [x, z] = this.tp(lx, lz); this.b.box(w, h, d, mat, x, this.y + ly, z, this.rot + ry, rx, rz, uv);
  }
  geo(geo, mat, lx, ly, lz, ry = 0, sc = 1) {
    const [x, z] = this.tp(lx, lz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, this.y + ly, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.rot + ry, 0)), new THREE.Vector3(sc, sc, sc));
    this.b.add(geo, mat, m);
  }
  col(w, d, lx, lz, y0, y1) { W.colliders.push(Object.assign(this.aabb(w, d, lx, lz), { y0: this.y + y0, y1: this.y + y1 })); }
  walk(w, d, lx, lz, y, surf = 'bois') { W.walkables.push(Object.assign(this.aabb(w, d, lx, lz), { y: this.y + y, surf })); }
}

/* toit à deux pans, faîte selon x local, avec bords relevés */
function gableGeo(len, dep, rise, ov = 0.9, curl = 0.35, seg = 10) {
  const L = len + ov * 2, D = dep + ov * 2, pos = [], uv = [], idx = [];
  const yAt = (t) => rise * (1 - t) + curl * Math.pow(t, 3);
  for (const side of [-1, 1]) for (const layer of [0, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, z = side * t * D / 2, y = yAt(t) - layer * 0.16;
      for (const x of [-L / 2, L / 2]) { pos.push(x, y, z); uv.push(x / 2, t * D / 3.2); }
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      const flip = (side > 0) !== (layer === 1);
      if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/* toit en croupe (quatre pans), pour les étages bas, la pagode et le dojo */
function hipGeo(w, d, rise, inset, curl = 0.45) {
  const pos = [], uv = [], hw = w / 2, hd = d / 2, iw = Math.max(0.05, hw - inset), id = Math.max(0.05, hd - inset);
  const O = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], I = [[-iw, -id], [iw, -id], [iw, id], [-iw, id]];
  for (let k = 0; k < 4; k++) {
    const a = O[k], b = O[(k + 1) % 4], c = I[(k + 1) % 4], e = I[k];
    const quad = [[a[0], curl, a[1]], [b[0], curl, b[1]], [c[0], rise, c[1]], [e[0], rise, e[1]]];
    for (const tri of [[0, 2, 1], [0, 3, 2]]) for (const q of tri) { pos.push(...quad[q]); uv.push((quad[q][0] + quad[q][2]) * 0.3, (quad[q][1]) * 0.6 + (q === 0 || q === 1 ? 0 : 1)); }
    for (const tri of [[0, 1, 2], [0, 2, 3]]) for (const q of tri) { pos.push(quad[q][0], quad[q][1] - 0.14, quad[q][2]); uv.push(0, 0); }
  }
  /* relevé des angles */
  for (let i = 0; i < pos.length; i += 3) { const ax = Math.abs(pos[i]) / hw, az = Math.abs(pos[i + 2]) / hd; if (ax > 0.97 && az > 0.97) pos[i + 1] += curl * 0.9; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}
function lanternGeo() {
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.06 + Math.sin(t * Math.PI) * 0.24, t * 0.62)); }
  return new THREE.LatheGeometry(pts, 12);
}

/* ---------- maisons ---------- */
function house(kit, x, z, rot, o = {}) {
  const w = o.w || rr(6, 8.5), d = o.d || rr(6, 7.5), h1 = 3, gy = terrainH(x, z);
  kit.set(x, gy, z, rot);
  kit.box(w + 0.4, 0.5, d + 0.4, M.stone, 0, 0.1, 0, 1.2);
  kit.box(w, h1, d, M.plaster, 0, 0.35 + h1 / 2, 0, 2.2);
  kit.box(w + 0.02, 1.1, d + 0.02, M.dwood, 0, 0.35 + 0.55, 0, 1.6);
  /* poteaux et poutres */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(0.26, h1, 0.26, M.dwood, sx * w / 2, 0.35 + h1 / 2, sz * d / 2);
  for (let px = -w / 2 + 1.8; px < w / 2 - 0.5; px += 1.8) { kit.box(0.16, h1, 0.16, M.dwood, px, 0.35 + h1 / 2, d / 2 + 0.02); kit.box(0.16, h1, 0.16, M.dwood, px, 0.35 + h1 / 2, -d / 2 - 0.02); }
  kit.box(w + 0.1, 0.22, d + 0.1, M.dwood, 0, 0.35 + h1, 0);
  /* façade : lattes, porte, enseigne */
  for (let lx = -w / 2 + 0.4; lx < -0.9; lx += 0.14) kit.box(0.05, 1.5, 0.06, M.wood, lx, 1.9, d / 2 + 0.05);
  kit.box(1.6, 2.2, 0.08, M.darkdoor || M.dwood, 0.6, 1.45, d / 2 + 0.04);
  if (o.shop) {
    const nm = new THREE.MeshStandardMaterial({ map: T.noren(o.shop.k, o.shop.c, o.shop.t), side: THREE.DoubleSide, roughness: 0.95 });
    kit.box(1.9, 0.9, 0.03, nm, 0.6, 2.2, d / 2 + 0.35);
    const sm = new THREE.MeshStandardMaterial({ map: T.sign(o.shop.k, o.shop.sign || o.shop.t), roughness: 0.8 });
    kit.box(2.2, 0.8, 0.1, sm, -1.6, 3.2, d / 2 + 0.6);
    for (let i = 0; i < 3; i++) kit.box(0.6, 0.7, 0.6, M.wood, -w / 2 + 0.8 + i * 0.75, 0.7, d / 2 + 1.2);
  }
  /* auvent devant */
  kit.geo(gableGeo(w, 1.2, 0.35, 0.15, 0.05, 2), M.roof, 0, 2.6, d / 2 + 0.6, 0);
  /* étage */
  let top = 0.35 + h1 + 0.1;
  if (o.two) {
    const w2 = w * 0.92, d2 = d * 0.75, h2 = 2.4;
    kit.geo(hipGeo(w + 1.6, d + 1.6, 0.9, 1.2, 0.3), M.roof, 0, top - 0.1, 0);
    kit.box(w2, h2, d2, M.plaster, 0, top + h2 / 2 + 0.3, 0, 2.2);
    for (const sx of [-1, 1]) kit.box(0.22, h2, 0.22, M.dwood, sx * w2 / 2, top + h2 / 2 + 0.3, d2 / 2);
    for (let lx = -w2 / 2 + 0.6; lx < w2 / 2 - 0.4; lx += 0.16) kit.box(0.05, 1.0, 0.06, M.wood, lx, top + 1.4, d2 / 2 + 0.04);
    top += h2 + 0.3; kit.geo(gableGeo(w2, d2, 1.7, 0.9, 0.35), M.roof, 0, top, 0);
  } else kit.geo(gableGeo(w, d, 2.0, 0.9, 0.38), M.roof, 0, top, 0);
  kit.box(w + 1.9, 0.26, 0.34, M.roof, 0, top + (o.two ? 1.72 : 2.03), 0);
  kit.col(w + 0.4, d + 0.4, 0, 0, -1, 8);
  if (o.lantern) W.hang.push(kit.tp(-w / 2 + 0.6, d / 2 + 1.0).concat([gy + 2.7]));
}

/* ---------- vegetation ---------- */
function treeTemplate(seed, kind) {
  const rnd = mulberry32(seed), trunk = [], leaf = [];
  const up = new THREE.Vector3(0, 1, 0);
  const cards = (p, s, n) => { for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(s, s); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x + (rnd() - 0.5) * s * 0.7, p.y + (rnd() - 0.5) * s * 0.5, p.z + (rnd() - 0.5) * s * 0.7), q, new THREE.Vector3(1, 1, 1))); leaf.push(g); } };
  function br(p, dir, len, rad, depth) {
    const e = p.clone().addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(rad * 0.68, rad, len, depth > 2 ? 7 : 5, 1, true);
    g.translate(0, len / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir)); g.translate(p.x, p.y, p.z); trunk.push(g);
    if (depth === 0) { cards(e, kind === 'sakura' ? 2.6 : 2.2, kind === 'sakura' ? 6 : 5); return; }
    const n = depth > 2 ? 2 : (rnd() < 0.5 ? 2 : 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, tilt = kind === 'sakura' ? 0.55 + rnd() * 0.45 : 0.4 + rnd() * 0.4;
      const nd = dir.clone().applyAxisAngle(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), tilt).normalize();
      if (kind === 'sakura') nd.y = Math.max(nd.y, 0.15);
      br(e, nd.normalize(), len * (0.68 + rnd() * 0.12), rad * 0.62, depth - 1);
    }
    if (depth <= 2) cards(e, 2.0, 2);
  }
  br(new THREE.Vector3(0, 0, 0), new THREE.Vector3(rnd() * 0.2 - 0.1, 1, rnd() * 0.2 - 0.1).normalize(), kind === 'sakura' ? 2.4 : 2.8, 0.34, 4);
  return { trunk: mergeGeometries(trunk.map(g => g.toNonIndexed())), leaf: mergeGeometries(leaf.map(g => g.toNonIndexed())) };
}
function windify(mat, amp = 0.08, from = 1.5) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = W.uTime; sh.uniforms.uWind = W.uWind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
      #else
        float ph = 0.0;
      #endif
      float hk = max(transformed.y - ${from.toFixed(2)}, 0.0);
      transformed.x += sin(uTime * 1.6 + ph + transformed.y * 0.6) * ${amp.toFixed(3)} * hk * uWind;
      transformed.z += cos(uTime * 1.3 + ph * 1.3 + transformed.x * 0.4) * ${(amp * 0.6).toFixed(3)} * hk * uWind;`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp + from;
}
/* instances découpées en parcelles : la caméra ne dessine que ce qu'elle voit, et rien au-delà de maxDist */
W.chunks = [];
function scatterInstanced(scene, geo, mat, list, { cast = true, color, chunk = 70, maxDist = 0 } = {}) {
  const cells = new Map();
  for (const p of list) { const k = Math.floor(p.x / chunk) + ',' + Math.floor(p.z / chunk); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(p); }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), out = [];
  for (const arr of cells.values()) {
    const im = new THREE.InstancedMesh(geo, mat, arr.length); let cx = 0, cz = 0;
    arr.forEach((p, i) => { q.setFromEuler(new THREE.Euler(p.tx || 0, p.ry || 0, p.tz || 0)); m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.sy || p.s, p.s)); im.setMatrixAt(i, m); cx += p.x; cz += p.z;
      if (color) { c.set(p.c || color); im.setColorAt(i, c); } });
    im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); out.push(im);
    if (maxDist) W.chunks.push({ im, x: cx / arr.length, z: cz / arr.length, d: maxDist });
  }
  return out;
}
function freeSpot(x, z, pad = 2) {
  if (roadDist(x, z) < pad) return false;
  const rv = polyDist(RIVER, x, z); if (rv.d < 7 + pad) return false;
  for (const c of W.colliders) if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return false;
  if (x > TERR.x0 - 2 && x < TERR.x1 + 2 && z > TERR.z0 - 2 && z < TERR.z1 + 10) return false;
  if (x > -98 && x < -34 && z > 46 && z < 108) return false;
  return true;
}

/* ============================ CONSTRUCTION ============================ */
export async function buildWorld(scene, renderer, Q, progress) {
  mats(); W.hang = [];
  const step = async (label, p) => { progress(label, p); await new Promise(r => setTimeout(r, 0)); };

  /* --- terrain proche --- */
  await step('Relief de la vallée', 0.08);
  const S = 560, SEG = Q.terrainSeg;
  const tg = new THREE.PlaneGeometry(S, S, SEG, SEG); tg.rotateX(-Math.PI / 2);
  const P = tg.attributes.position, col = new Float32Array(P.count * 3), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setY(i, terrainH(x, z)); }
  tg.computeVertexNormals();
  const Nn = tg.attributes.normal;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), y = P.getY(i), ny = Nn.getY(i);
    const v = fbm(N2, x * 0.05, z * 0.05, 3), v2 = fbm(N3, x * 0.2, z * 0.2, 2);
    c.setRGB(0.33 + v * 0.07, 0.45 + v * 0.08 + v2 * 0.03, 0.17 + v * 0.03);                       /* herbe */
    const meadow = smooth(0.1, 0.45, fbm(N1, x * 0.018 + 40, z * 0.018, 3)); c.lerp(new THREE.Color(0.5, 0.56, 0.22), meadow * 0.45);
    if (x > 30 && x < 125 && z > -20 && z < 90) c.lerp(new THREE.Color(0.62, 0.48, 0.47), smooth(0.2, 0.6, fbm(N3, x * 0.06, z * 0.06, 2) + 0.3) * 0.35); /* tapis de pétales */
    const forest = smooth(120, 150, Math.hypot(x, z)); c.lerp(new THREE.Color(0.14, 0.2, 0.1), forest * 0.7);
    const rock = smooth(0.86, 0.66, ny); c.lerp(new THREE.Color(0.36 + v * 0.08, 0.34 + v * 0.07, 0.31 + v * 0.06), rock);
    const snow = smooth(78, 96, y + v * 8) * smooth(0.6, 0.8, ny); c.lerp(new THREE.Color(0.9, 0.92, 0.95), snow);
    const rd = roadDist(x, z); if (rd < 1.4) c.lerp(new THREE.Color(0.56 + v2 * 0.05, 0.49, 0.38), smooth(1.4, -0.5, rd));
    const rv = polyDist(RIVER, x, z); if (rv.d < 9) c.lerp(new THREE.Color(0.36, 0.33, 0.27), smooth(9, 6, rv.d));
    if (x > -98 && x < -34 && z > 46 && z < 108) c.lerp(new THREE.Color(0.32, 0.3, 0.2), 0.7);
    if (x > TERR.x0 && x < TERR.x1 && z > TERR.z0 && z < TERR.z1) c.setRGB(0.42, 0.4, 0.36);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  M.terrain.map.repeat.set(S / 3, S / 3);
  const terrain = new THREE.Mesh(tg, M.terrain); terrain.receiveShadow = true; scene.add(terrain); W.terrain = terrain;

  /* --- montagnes lointaines --- */
  const fg = new THREE.PlaneGeometry(3600, 3600, 140, 140); fg.rotateX(-Math.PI / 2);
  const FP = fg.attributes.position, fc = new Float32Array(FP.count * 3);
  for (let i = 0; i < FP.count; i++) {
    const x = FP.getX(i), z = FP.getZ(i), r = Math.hypot(x, z);
    let y = r < 250 ? -60 : 40 + smooth(250, 700, r) * 260 * (0.55 + fbm(N1, x * 0.0016, z * 0.0016, 5)) + fbm(N2, x * 0.006, z * 0.006, 3) * 40;
    if (r > 250 && r < 300) y = lerp(terrainH(x * 278 / r, z * 278 / r) - 8, y, smooth(250, 300, r));
    FP.setY(i, y);
    const sn = smooth(230, 320, y); fc[i * 3] = lerp(0.2, 0.86, sn); fc[i * 3 + 1] = lerp(0.25, 0.88, sn); fc[i * 3 + 2] = lerp(0.2, 0.92, sn);
  }
  fg.computeVertexNormals(); fg.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  const far = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); scene.add(far);

  /* --- eau --- */
  await step('Rivière et cascade', 0.18);
  {
    const pts = []; const L = []; let acc = 0;
    for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 3);
      for (let k = 0; k < n; k++) { const t = k / n; pts.push([ax + (bx - ax) * t, az + (bz - az) * t, acc + len * t]); } acc += len; }
    pts.push([...RIVER[RIVER.length - 1], acc]);
    const pos = [], uv = [], idx = [];
    pts.forEach((p, i) => {
      const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      let dx = q[0] - o[0], dz = q[1] - o[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const w = (p[2] < 40 ? 5 : 6.5) + 0.8, y = WATER_Y(p[2]);
      pos.push(p[0] - dz * w, y, p[1] + dx * w, p[0] + dz * w, y, p[1] - dx * w); uv.push(0, p[2] / 8, 1.6, p[2] / 8);
      if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const river = new THREE.Mesh(g, M.water); river.receiveShadow = true; scene.add(river); W.river = river;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(9.5, 32).rotateX(-Math.PI / 2), M.water); pool.position.set(-108, WATER_Y(0) + 0.02, -100); scene.add(pool);
    /* cascade : depuis le haut de la falaise jusqu'au bassin */
    const topY = terrainH(-121, -114) - 1, botY = WATER_Y(0);
    const fm = new THREE.MeshBasicMaterial({ map: T.streak(), transparent: true, depthWrite: false, side: THREE.DoubleSide, color: '#e8f2f4' });
    fm.map.repeat.set(2, 1.5); W.fall = fm;
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(5.5, topY - botY, 1, 8), fm); fall.position.set(-115, (topY + botY) / 2, -108); fall.rotation.y = Math.atan2(7, 8) + 0.4; scene.add(fall);
    const fall2 = fall.clone(); fall2.scale.set(0.7, 1, 1); fall2.position.x += 0.4; fall2.position.z += 0.3; scene.add(fall2);
    const mist = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 180 }, (_, i) => i % 3 === 0 ? -110 + rr(-5, 5) : (i % 3 === 1 ? botY + rr(0, 4) : -103 + rr(-5, 5))), 3)),
      new THREE.PointsMaterial({ map: T.soft(), size: 4, transparent: true, opacity: 0.22, depthWrite: false, color: '#ffffff' }));
    scene.add(mist); W.mist = mist;
    W.pois.push({ id: 'cascade', name: 'Cascade du Dragon blanc', x: -112, z: -104, r: 22 });
    /* rizières */
    for (let t = 0; t < 4; t++) for (let k = 0; k < 3; k++) {
      const x0 = -98 + t * 16, z0 = 48 + k * 20, y = 0.5 + t * 0.35 + 0.18;
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(14.6, 18.4).rotateX(-Math.PI / 2), M.paddy); pm.position.set(x0 + 8, y, z0 + 10); scene.add(pm);
    }
    W.pois.push({ id: 'rizieres', name: 'Rizières de Hoshi', x: -66, z: 76, r: 26 });
  }

  /* --- architecture --- */
  await step('Village et maisons', 0.3);
  const B = new Batcher(), kit = new Kit(B);
  /* maisons le long de la grand-rue (x = 0) et de la rue transversale (z = 0) */
  const shops = [{ k: 'soba', c: '#1f3550', t: '蕎', sign: '蕎麦' }, { k: 'sake', c: '#5a1e18', t: '酒', sign: '酒屋' }, { k: 'kusuri', c: '#2c4a2c', t: '薬', sign: '薬屋' }, { k: 'kami', c: '#4b3a22', t: '紙', sign: '紙屋' }, { k: 'kaji', c: '#2a2a2a', t: '鍛', sign: '鍛冶' }];
  let si = 0;
  const lots = [];
  for (let zz = -44; zz <= 26; zz += 10) { lots.push([-13, zz, Math.PI / 2]); lots.push([13, zz, -Math.PI / 2]); }
  for (let xx = -56; xx <= -22; xx += 10) { lots.push([xx, -11, 0]); lots.push([xx, 11, Math.PI]); }
  for (let xx = 24; xx <= 56; xx += 10) { lots.push([xx, -12, 0]); lots.push([xx, 10, Math.PI]); }
  const houseOk = (x, z) => [[0, 0], [-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2], [4.2, 4.2], [0, 4], [0, -4]].every(([dx, dz]) => { const rv = polyDist(RIVER, x + dx, z + dz); return rv.d >= (rv.s < 40 ? 5 : 6.5) + 2.5; });
  const skip = (x, z) => !houseOk(x, z) || (x === 13 && z === -14) || (x === -13 && z === -24) || (x === -13 && z === 16) || (x === 13 && z === 6);
  for (const [x, z, rot] of lots) {
    if (skip(x, z)) continue;
    const o = { two: R() < 0.4, lantern: R() < 0.5 };
    if ((Math.abs(x) === 13 && z > -40 && z < 20 && R() < 0.6) && si < shops.length) o.shop = shops[si++];
    house(kit, x, z, rot, o);
  }
  /* salon de thé : ouvert, on y entre */
  {
    const x = 14.5, z = -14, gy = terrainH(x, z); kit.set(x, gy, z, -Math.PI / 2);
    const w = 9, d = 8, fy = 0.55;
    kit.box(w + 0.4, fy, d + 0.4, M.stone, 0, fy / 2, 0);
    kit.box(w, 0.1, d, M.floor, 0, fy + 0.05, 0, 2); kit.walk(w, d, 0, 0, fy + 0.1);
    kit.box(w, 3, 0.2, M.plaster, 0, fy + 1.6, -d / 2); kit.col(w, 0.4, 0, -d / 2, 0, 5);
    for (const sx of [-1, 1]) { kit.box(0.2, 3, d, M.plaster, sx * w / 2, fy + 1.6, 0); kit.col(0.4, d, sx * w / 2, 0, 0, 5); }
    for (const sx of [-1, -0.33, 0.33, 1]) kit.box(0.24, 3.2, 0.24, M.dwood, sx * w / 2, fy + 1.6, d / 2);
    kit.box(4, 1.0, 0.8, M.dwood, 1.5, fy + 0.6, -2); kit.col(4, 0.8, 1.5, -2, 0, 1.2);
    for (let i = 0; i < 3; i++) { kit.box(1.2, 0.5, 1.2, M.dwood, -2.6 + i * 0 , fy + 0.35, 1.8 - i * 1.6); kit.box(0.8, 0.08, 0.8, M.tatami, -1.2, fy + 0.15, 1.8 - i * 1.6); }
    kit.geo(gableGeo(w, d, 1.9, 1.1, 0.4), M.roof, 0, fy + 3.1, 0);
    const nm = new THREE.MeshStandardMaterial({ map: T.noren('cha', '#2d4a3a', '茶'), side: THREE.DoubleSide });
    for (const sx of [-2.6, 0, 2.6]) kit.box(2.4, 0.9, 0.03, nm, sx, fy + 2.6, d / 2 + 0.1);
    W.teaHouse = { x, z, y: gy + fy };
    W.hang.push(kit.tp(-w / 2 + 0.5, d / 2 + 0.6).concat([gy + 3.1]), kit.tp(w / 2 - 0.5, d / 2 + 0.6).concat([gy + 3.1]));
    W.pois.push({ id: 'the', name: 'Salon de thé Tsubaki', x, z, r: 10 });
  }
  /* maison de l'Ancienne */
  house(kit, -14, -24, Math.PI / 2, { w: 8.5, d: 7.5, two: true, lantern: true });
  W.elderHouse = { x: -8.6, z: -24 };
  /* étals du marché */
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
    const x = sx * 5.6, z = -6 + i * 6, gy = terrainH(x, z); kit.set(x, gy, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    kit.box(2.6, 0.9, 1.4, M.wood, 0, 0.45, 0); kit.col(2.6, 1.4, 0, 0, 0, 1);
    for (const px of [-1.2, 1.2]) for (const pz of [-0.6, 0.6]) kit.box(0.08, 2.2, 0.08, M.dwood, px, 1.1, pz);
    const cm = new THREE.MeshStandardMaterial({ color: ['#a14530', '#d8cdb3', '#2f4a63', '#5e7a3c'][(i + (sx > 0 ? 1 : 0)) % 4], roughness: 0.95, side: THREE.DoubleSide });
    kit.box(3.0, 0.04, 2.0, cm, 0, 2.25, 0, 1.6, 0.18);
    for (let k = 0; k < 5; k++) kit.box(0.3, 0.2, 0.3, [M.vermil, M.gold, M.cloth, M.tatami][k % 4], -1 + k * 0.5, 1.0, rr(-0.3, 0.3));
  }
  W.pois.push({ id: 'marche', name: 'Place du marché', x: 0, z: 2, r: 16 });
  /* lanternes suspendues au-dessus de la grand-rue */
  for (let z = -42; z <= 26; z += 8) { W.hang.push([-3.6, z, 3.4], [3.6, z, 3.4]); }

  /* tour de guet, on y grimpe par l'échelle */
  {
    const x = -24, z = 19, gy = terrainH(x, z), Hh = 8.5; kit.set(x, gy, z, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { kit.box(0.3, Hh, 0.3, M.dwood, sx * 1.6, Hh / 2, sz * 1.6); kit.col(0.4, 0.4, sx * 1.6, sz * 1.6, 0, Hh); }
    for (let y = 2; y < Hh; y += 2.6) { kit.box(3.4, 0.14, 0.14, M.dwood, 0, y, 1.6, 1.6, 0, 0.5); kit.box(3.4, 0.14, 0.14, M.dwood, 0, y, -1.6, 1.6, 0, -0.5); }
    kit.box(4.2, 0.2, 4.2, M.wood, 0, Hh, 0); kit.walk(4.2, 4.2, 0, 0, Hh + 0.1);
    for (const s of [-1, 1]) { kit.box(4.2, 1, 0.1, M.wood, 0, Hh + 0.6, s * 2.05); if (s < 0) kit.box(0.1, 1, 4.2, M.wood, s * 2.05, Hh + 0.6, 0); }
    kit.box(0.1, 1, 2.6, M.wood, 2.05, Hh + 0.6, -0.8);
    W.colliders.push({ x0: x - 2.2, x1: x + 2.2, z0: z - 2.15, z1: z - 1.95, y0: gy + Hh, y1: gy + Hh + 1.1 }, { x0: x - 2.2, x1: x - 1.95, z0: z - 2.2, z1: z + 2.2, y0: gy + Hh, y1: gy + Hh + 1.1 });
    kit.geo(hipGeo(5.6, 5.6, 1.8, 2.7, 0.3), M.roof, 0, Hh + 2.6, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(0.14, 2.6, 0.14, M.dwood, sx * 1.9, Hh + 1.3, sz * 1.9);
    /* échelle côté sud */
    for (const sx of [-0.35, 0.35]) kit.box(0.08, Hh + 1, 0.08, M.wood, 1.0 + sx, (Hh + 1) / 2, 2.25);
    for (let y = 0.4; y < Hh + 0.6; y += 0.4) kit.box(0.7, 0.05, 0.05, M.wood, 1.0, y, 2.25);
    W.ladders.push({ x: x + 1.0, z: z + 2.55, y0: gy, y1: gy + Hh + 0.1, face: Math.PI, topX: x + 1.0, topZ: z + 0.6 });
    W.pois.push({ id: 'tour', name: 'Tour de guet', x, z, r: 8 });
  }

  /* --- le dojo --- */
  await step('Le grand dojo', 0.42);
  buildDojo(kit, B);

  /* --- sanctuaire, torii, pagode, ponts --- */
  await step('Sanctuaire et pagode', 0.52);
  const torii = (x, z, rot, s = 1, mat = M.vermil) => {
    const gy = terrainH(x, z); kit.set(x, gy, z, rot);
    const pil = new THREE.CylinderGeometry(0.22 * s, 0.26 * s, 4.6 * s, 12);
    kit.geo(pil, mat, -1.9 * s, 2.3 * s, 0); kit.geo(pil, mat, 1.9 * s, 2.3 * s, 0);
    kit.col(0.6 * s, 0.6 * s, -1.9 * s, 0, 0, 5 * s); kit.col(0.6 * s, 0.6 * s, 1.9 * s, 0, 0, 5 * s);
    kit.box(4.6 * s, 0.26 * s, 0.32 * s, mat, 0, 3.8 * s, 0); kit.box(0.24 * s, 0.6 * s, 0.24 * s, mat, 0, 4.15 * s, 0);
    const top = gableGeo(5.6 * s, 0.4 * s, 0.05, 0.4 * s, 0.5 * s, 2); kit.geo(top, M.black, 0, 4.55 * s, 0);
    kit.box(6.2 * s, 0.22 * s, 0.5 * s, M.black, 0, 4.5 * s, 0);
    for (const sx of [-1, 1]) kit.box(0.7 * s, 0.4 * s, 0.7 * s, M.black, sx * 1.9 * s, 0.2 * s, 0);
  };
  torii(0, 114, 0, 1.6);
  W.pois.push({ id: 'entree', name: 'Grand torii de la vallée', x: 0, z: 114, r: 12 });
  /* allée des mille torii vers le sanctuaire */
  const alley = [[-50, -8], [-76, -30]];
  for (let i = 0; i < 9; i++) { const t = i / 8, x = lerp(alley[0][0], alley[1][0], t), z = lerp(alley[0][1], alley[1][1], t); torii(x, z, Math.atan2(alley[1][0] - alley[0][0], alley[1][1] - alley[0][1]) + Math.PI / 2 + Math.PI / 2, 0.8); }
  /* sanctuaire */
  {
    const x = -84, z = -38, gy = terrainH(x, z); kit.set(x, gy, z, Math.PI / 2);
    kit.box(10, 0.9, 8, M.stone, 0, 0.45, 0); kit.walk(10, 8, 0, 0, 0.9, 'pierre');
    kit.box(7, 0.2, 5.5, M.wood, 0, 1.0, -0.5); kit.walk(7, 5.5, 0, -0.5, 1.1);
    for (const sx of [-3.3, -1.1, 1.1, 3.3]) { kit.box(0.26, 3, 0.26, M.vermil, sx, 2.5, 2.1); kit.box(0.26, 3, 0.26, M.vermil, sx, 2.5, -3.1); }
    kit.box(7, 2.8, 0.15, M.plaster, 0, 2.4, -3.1); kit.col(7, 0.5, 0, -3.1, 0, 5);
    for (const sx of [-1, 1]) { kit.box(0.15, 2.8, 5.2, M.plaster, sx * 3.4, 2.4, -0.5); kit.col(0.5, 5.2, sx * 3.4, -0.5, 0, 5); }
    kit.geo(gableGeo(7, 6, 2.2, 1.3, 0.55), M.roof, 0, 4.05, -0.5); kit.box(9.6, 0.3, 0.4, M.black, 0, 6.3, -0.5);
    kit.box(1.4, 0.8, 0.8, M.dwood, 0, 1.5, 1.4); kit.col(1.4, 0.8, 0, 1.4, 0, 2);
    kit.geo(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), M.rope, 0, 2.9, 1.9); kit.geo(new THREE.SphereGeometry(0.22, 12, 10), M.gold, 0, 4.05, 1.9);
    const [bx, bz] = kit.tp(0, 2.4);
    W.interact.push({ id: 'cloche', kind: 'cloche', x: bx, z: bz, y: gy + 1, label: 'Sonner la cloche du sanctuaire' });
    W.shrine = { x: bx, z: bz, y: gy + 1 };
    /* quatre lanternes de pierre à allumer */
    const toroPos = [[-6, 4], [6, 4], [-6, 8.5], [6, 8.5]];
    toroPos.forEach(([lx, lz], i) => {
      const [tx, tz] = kit.tp(lx, lz), ty = terrainH(tx, tz); const k2 = new Kit(B).set(tx, ty, tz, 0);
      k2.box(0.9, 0.3, 0.9, M.stone, 0, 0.15, 0); k2.geo(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 8), M.stone, 0, 0.85, 0);
      k2.box(0.7, 0.16, 0.7, M.stone, 0, 1.45, 0); k2.box(0.46, 0.46, 0.46, M.toro, 0, 1.76, 0);
      k2.geo(new THREE.ConeGeometry(0.62, 0.42, 6), M.stone, 0, 2.2, 0); k2.geo(new THREE.SphereGeometry(0.1, 8, 6), M.stone, 0, 2.45, 0);
      W.colliders.push({ x0: tx - 0.45, x1: tx + 0.45, z0: tz - 0.45, z1: tz + 0.45, y0: ty, y1: ty + 2.4 });
      const flame = new THREE.PointLight('#ffb35a', 0, 9, 2); flame.position.set(tx, ty + 1.8, tz); scene.add(flame);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial({ color: '#ffcf86', transparent: true, opacity: 0 })); glow.position.set(tx, ty + 1.76, tz); scene.add(glow);
      W.interact.push({ id: 'toro' + i, kind: 'toro', x: tx, z: tz, y: ty + 1.2, label: 'Allumer la lanterne de pierre', lit: false, light: flame, glow });
    });
    W.pois.push({ id: 'sanctuaire', name: 'Sanctuaire Inari', x, z, r: 16 });
  }
  /* pagode à cinq étages */
  {
    const x = 82, z = -58, gy = terrainH(x, z); kit.set(x, gy, z, 0);
    kit.box(9, 1.2, 9, M.stone, 0, 0.6, 0); kit.walk(9, 9, 0, 0, 1.2, 'pierre');
    let y = 1.2;
    for (let i = 0; i < 5; i++) {
      const s = 5.6 - i * 0.7, h = i === 0 ? 3.2 : 2.3;
      kit.box(s, h, s, M.plaster, 0, y + h / 2, 0, 2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(0.24, h, 0.24, M.vermil, sx * s / 2, y + h / 2, sz * s / 2);
      kit.box(s + 0.1, 0.3, s + 0.1, M.vermil, 0, y + h - 0.15, 0);
      if (i === 0) kit.box(1.6, 2.2, 0.1, M.dwood, 0, y + 1.1, s / 2 + 0.03);
      y += h; kit.geo(hipGeo(s + 3.2, s + 3.2, 0.9, 1.9, 0.55), M.roof, 0, y - 0.15, 0); y += 0.6;
    }
    kit.geo(new THREE.CylinderGeometry(0.1, 0.16, 6, 8), M.gold, 0, y + 3, 0);
    for (let k = 0; k < 9; k++) kit.geo(new THREE.TorusGeometry(0.3 - k * 0.012, 0.05, 6, 14).rotateX(Math.PI / 2), M.gold, 0, y + 0.6 + k * 0.45, 0);
    kit.col(6.2, 6.2, 0, 0, 0, 30);
    W.pois.push({ id: 'pagode', name: 'Pagode des Cinq Vents', x, z, r: 16 });
  }
  /* ponts */
  const bridge = (cx, cz, rot, len, wid = 3.2) => {
    const ex0 = cx + Math.sin(rot) * len / 2, ez0 = cz + Math.cos(rot) * len / 2, ex1 = cx - Math.sin(rot) * len / 2, ez1 = cz - Math.cos(rot) * len / 2;
    const gy = Math.max(WATER_Y(polyDist(RIVER, cx, cz).s) - 1.0, Math.max(terrainH(ex0, ez0), terrainH(ex1, ez1)) - 0.1);
    const k3 = new Kit(B).set(cx, 0, cz, rot), seg = 14;
    const yAt = (t) => gy + 0.2 + Math.sin(t * Math.PI) * 1.5;
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg, z0 = -len / 2 + len * t0, z1 = -len / 2 + len * t1, y0 = yAt(t0), y1 = yAt(t1);
      const zm = (z0 + z1) / 2, ym = (y0 + y1) / 2, ang = Math.atan2(y1 - y0, z1 - z0);
      k3.box(wid, 0.18, (z1 - z0) + 0.05, M.wood, 0, ym, zm, 1.2, -ang);
      for (const sx of [-1, 1]) { k3.box(0.14, 0.14, (z1 - z0) + 0.05, M.vermil, sx * wid / 2, ym + 1.0, zm, 1.2, -ang); if (i % 2 === 0) k3.box(0.16, 1.0, 0.16, M.vermil, sx * wid / 2, ym + 0.5, z0); }
    }
    for (const sx of [-1, 1]) for (const t of [0.2, 0.5, 0.8]) k3.box(0.3, 3, 0.3, M.dwood, sx * (wid / 2 - 0.3), yAt(t) - 1.6, -len / 2 + len * t);
    const c = Math.cos(rot), s = Math.sin(rot);
    const f = (x, z) => { const lx = (x - cx) * c - (z - cz) * s, lz = (x - cx) * s + (z - cz) * c; if (Math.abs(lx) > wid / 2 || Math.abs(lz) > len / 2) return -1e9; return yAt((lz + len / 2) / len) + 0.09; };
    const ex = Math.abs(c) * wid / 2 + Math.abs(s) * len / 2, ez = Math.abs(s) * wid / 2 + Math.abs(c) * len / 2;
    W.walkables.push({ x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez, f, surf: 'bois' });
    /* garde-corps : on ne tombe pas du pont */
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) { const lz = -len / 2 + len * (i + 0.5) / 6, px = cx + sx * (wid / 2 + 0.1) * c + lz * s, pz = cz - sx * (wid / 2 + 0.1) * s + lz * c; W.colliders.push({ x0: px - 0.35, x1: px + 0.35, z0: pz - 0.35, z1: pz + 0.35, y0: yAt((i + 0.5) / 6) - 0.2, y1: yAt((i + 0.5) / 6) + 1.1, rail: true }); }
  };
  bridge(0, 44, 0, 22);
  bridge(30, 72, Math.atan2(26, 14) * 0 + 1.05, 20, 2.4);
  bridge(-54, -1, Math.PI / 2, 20, 2.4);
  W.pois.push({ id: 'pont', name: 'Pont des Murmures', x: 0, z: 44, r: 10 });

  /* camp des bandits, au sud-est */
  {
    const cx = 74, cz = 104; W.camp = { x: cx, z: cz };
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.3, x = cx + Math.cos(a) * 7, z = cz + Math.sin(a) * 7, gy = terrainH(x, z);
      const tent = new THREE.ConeGeometry(2.4, 2.8, 4, 1, true); kit.set(x, gy, z, a);
      kit.geo(tent, new THREE.MeshStandardMaterial({ color: '#4a4236', roughness: 1, side: THREE.DoubleSide }), 0, 1.4, 0, Math.PI / 4);
      kit.col(3, 3, 0, 0, 0, 2.8);
    }
    const gy = terrainH(cx, cz);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; B.box(0.9, 0.18, 0.18, M.dwood, cx + Math.cos(a) * 0.4, gy + 0.1, cz + Math.sin(a) * 0.4, a, 0, 0.4); }
    const fire = new THREE.PointLight('#ff7a2a', 3, 14, 2); fire.position.set(cx, gy + 1, cz); scene.add(fire);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), new THREE.MeshBasicMaterial({ color: '#ffb04a', transparent: true, opacity: 0.85 })); fl.position.set(cx, gy + 0.6, cz); scene.add(fl);
    W.fire.push({ light: fire, mesh: fl });
    W.pois.push({ id: 'camp', name: 'Camp des rônin', x: cx, z: cz, r: 18, hidden: true });
  }
  /* murs et escalier de la terrasse du dojo */
  {
    const y = TERR.y;
    const wall = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
      B.box(0.8, y + 1.2, L, M.stone, (x0 + x1) / 2, (y + 1.2) / 2 - 0.9, (z0 + z1) / 2, a, 0, 0, 1.4);
      W.colliders.push({ x0: Math.min(x0, x1) - 0.45, x1: Math.max(x0, x1) + 0.45, z0: Math.min(z0, z1) - 0.45, z1: Math.max(z0, z1) + 0.45, y0: -5, y1: y - 0.25 }); };
    wall(TERR.x0, TERR.z1, -4.8, TERR.z1); wall(4.8, TERR.z1, TERR.x1, TERR.z1);
    wall(TERR.x0, TERR.z0, TERR.x0, TERR.z1); wall(TERR.x1, TERR.z0, TERR.x1, TERR.z1); wall(TERR.x0, TERR.z0, TERR.x1, TERR.z0);
    for (let i = 0; i < 12; i++) { const z = TERR.z1 + (i + 0.5) * 0.75, yy = lerp(TERR.y, 0.3, (i + 0.5) / 12); B.box(9, 0.3, 0.8, M.stone, 0, yy - 0.12, z, 0, 0, 0, 1.2); }
    for (const sx of [-1, 1]) { B.box(0.7, 1.6, 9, M.stone, sx * 4.9, 1.4, TERR.z1 + 4.5, 0, 0.32 * 0 , 0); }
    /* parapet bas en bord de terrasse */
    for (const [x0, x1] of [[TERR.x0, -4.8], [4.8, TERR.x1]]) B.box(x1 - x0, 0.5, 0.5, M.stone, (x0 + x1) / 2, y + 0.25, TERR.z1 - 0.3);
    W.colliders.push({ x0: TERR.x0, x1: -4.6, z0: TERR.z1 - 0.6, z1: TERR.z1, y0: y - 1, y1: y + 0.55 }, { x0: 4.6, x1: TERR.x1, z0: TERR.z1 - 0.6, z1: TERR.z1, y0: y - 1, y1: y + 0.55 });
  }
  /* bassin aux carpes sur la terrasse */
  {
    const px = -15, pz = -73;
    const pond = new THREE.Mesh(new THREE.CircleGeometry(4, 28).rotateX(-Math.PI / 2), M.water); pond.position.set(px, TERR.y + 0.12, pz); scene.add(pond);
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28; B.add(new THREE.DodecahedronGeometry(0.5 + R() * 0.3, 0), M.rock, new THREE.Matrix4().makeTranslation(px + Math.cos(a) * 4.2, TERR.y + 0.15, pz + Math.sin(a) * 4.2)); }
    W.colliders.push({ x0: px - 4.3, x1: px + 4.3, z0: pz - 4.3, z1: pz + 4.3, y0: TERR.y - 1, y1: TERR.y + 0.6 });
    W.pond = { x: px, z: pz, y: TERR.y + 0.05, r: 3.6 };
  }
  B.build(scene);

  /* lanternes rouges suspendues */
  {
    const lg = lanternGeo(), list = W.hang;
    const im = new THREE.InstancedMesh(lg, M.lantern, list.length), m = new THREE.Matrix4();
    list.forEach((p, i) => { m.makeTranslation(p[0], p[2] - 0.62, p[1]); im.setMatrixAt(i, m); });
    scene.add(im);
    const strings = []; for (let i = 0; i < list.length - 1; i++) { const a = list[i], b = list[i + 1]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 9) strings.push(a[0], a[2], a[1], b[0], b[2] - 0.3, b[1]); }
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(strings, 3)), new THREE.LineBasicMaterial({ color: '#2a2016' })));
    /* quelques vraies lumières, le reste brille par la matière */
    for (const p of [[0, 2, 3.6], [0, -22, 3.6], [0, 18, 3.6], [14.5, -9, 3.2]]) { const L = new THREE.PointLight('#ff9a4a', 0, 16, 2); L.position.set(p[0], terrainH(p[0], p[1]) + p[2], p[1]); scene.add(L); W.lights.push(L); }
  }

  /* --- végétation --- */
  await step('Cerisiers, pins et bambous', 0.64);
  windify(M.blossom, 0.05, 1.8); windify(M.maple, 0.05, 1.8); windify(M.bambooLeaf, 0.04, 4);
  const sak = [1, 2, 3].map(s => treeTemplate(s * 17, 'sakura'));
  const sakSpots = [[], [], []];
  const addSak = (x, z, s) => { if (!freeSpot(x, z, 2.5)) return; sakSpots[Math.floor(R() * 3)].push({ x, y: terrainH(x, z) - 0.2, z, s: s || rr(0.85, 1.3), ry: R() * 6.28 }); };
  for (let i = 0; i < 260; i++) { const x = rr(36, 120), z = rr(-14, 84); if (Math.hypot(x, z) < 128) addSak(x, z); }
  for (let i = 0; i < 70; i++) { const p = polyDist(RIVER, 0, 0); const s = rr(10, 190), t = R(); const k = Math.min(RIVER.length - 2, Math.floor(R() * (RIVER.length - 1))); const [ax, az] = RIVER[k], [bx, bz] = RIVER[k + 1]; const side = R() < 0.5 ? -1 : 1; const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); addSak(ax + dx * t - dz / l * side * rr(9, 13), az + dz * t + dx / l * side * rr(9, 13)); }
  for (let i = 0; i < 40; i++) { const x = rr(-60, 60), z = rr(-60, 40); if (Math.hypot(x, z) < 70) addSak(x, z, rr(0.7, 1)); }
  for (const [x, z] of [[-20, -70], [20, -70], [-21, -112], [21, -112], [-8, 64], [8, 64], [-6, 96], [6, 96]]) addSak(x, z, 1.25);
  sakSpots.forEach((l, i) => { scatterInstanced(scene, sak[i].trunk, M.bark, l); scatterInstanced(scene, sak[i].leaf, M.blossom, l); });
  /* érables autour du sanctuaire */
  const mp = treeTemplate(91, 'maple'), mlist = [];
  for (let i = 0; i < 60; i++) { const x = rr(-110, -62), z = rr(-62, -4); if (freeSpot(x, z, 2)) mlist.push({ x, y: terrainH(x, z) - 0.2, z, s: rr(0.8, 1.15), ry: R() * 6 }); }
  scatterInstanced(scene, mp.trunk, M.bark, mlist); scatterInstanced(scene, mp.leaf, M.maple, mlist);
  /* bambouseraie */
  {
    const stalk = new THREE.CylinderGeometry(0.07, 0.09, 10, 6, 10); stalk.translate(0, 5, 0);
    const P2 = stalk.attributes.position; for (let i = 0; i < P2.count; i++) { const y = P2.getY(i); if (Math.abs((y % 1.1) - 0.05) < 0.08) { P2.setX(i, P2.getX(i) * 1.35); P2.setZ(i, P2.getZ(i) * 1.35); } }
    stalk.computeVertexNormals();
    const lv = []; for (let k = 0; k < 7; k++) { const g = new THREE.PlaneGeometry(1.8, 1.2); g.rotateY(k * 0.9); g.rotateX(rr(-0.4, 0.4)); g.translate(rr(-0.5, 0.5), 7.5 + k * 0.45, rr(-0.5, 0.5)); lv.push(g.toNonIndexed()); }
    const leaves = mergeGeometries(lv); const bl = [];
    for (let i = 0; i < 520; i++) { const x = rr(-125, -58), z = rr(-78, -48); if (freeSpot(x, z, 1) && Math.hypot(x, z) < 150) bl.push({ x, y: terrainH(x, z), z, s: rr(0.8, 1.2), sy: rr(0.8, 1.25), ry: R() * 6, tx: rr(-0.06, 0.06), tz: rr(-0.06, 0.06) }); }
    scatterInstanced(scene, stalk, M.bamboo, bl); scatterInstanced(scene, leaves, M.bambooLeaf, bl);
    W.pois.push({ id: 'bambous', name: 'Bambouseraie du Silence', x: -92, z: -62, r: 18 });
  }
  /* cèdres sur les pentes */
  {
    const parts = [new THREE.CylinderGeometry(0.18, 0.3, 4, 6).translate(0, 2, 0)];
    for (let k = 0; k < 4; k++) { const g = new THREE.ConeGeometry(2.3 - k * 0.45, 3.4, 7, 1); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const n = 1 + (Math.sin(i * 12.9898) * 0.5) * 0.18; p.setX(i, p.getX(i) * n); p.setZ(i, p.getZ(i) * n); }
      g.translate(0, 3 + k * 2.2, 0); parts.push(g); }
    const trunkG = parts[0], crown = mergeGeometries(parts.slice(1).map(g => { const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng; }));
    const pl = [];
    const want = Q.trees;
    for (let i = 0; i < want * 6 && pl.length < want; i++) {
      const x = rr(-280, 280), z = rr(-280, 280), r = Math.hypot(x, z); if (r < 118 || r > 270) continue;
      const y = terrainH(x, z); if (y > 88 || y < 2) continue;
      const sl = Math.abs(terrainH(x + 2, z) - y) + Math.abs(terrainH(x, z + 2) - y); if (sl > 2.6) continue;
      if (!freeSpot(x, z, 1)) continue;
      pl.push({ x, y: y - 0.3, z, s: rr(0.8, 1.5), sy: rr(0.9, 1.6), ry: R() * 6, c: `hsl(${95 + R() * 30},${22 + R() * 15}%,${18 + R() * 10}%)` });
    }
    scatterInstanced(scene, trunkG, M.bark, pl, { cast: false, chunk: 140 });
    const ci = scatterInstanced(scene, crown, M.pine, pl, { color: '#33452c', chunk: 140 });
    M.pine.color.set('#ffffff');
  }
  /* rochers */
  {
    const rg = new THREE.DodecahedronGeometry(1, 0); const p = rg.attributes.position;
    for (let i = 0; i < p.count; i++) { const n = 0.75 + Math.abs(N1(p.getX(i) * 2, p.getZ(i) * 2 + p.getY(i))) * 0.6; p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * 0.7, p.getZ(i) * n); }
    rg.computeVertexNormals(); const rl = [];
    for (let i = 0; i < 400; i++) { const x = rr(-200, 200), z = rr(-200, 200); if (!freeSpot(x, z, 1.5)) continue; rl.push({ x, y: terrainH(x, z) - 0.3, z, s: rr(0.4, 1.8), sy: rr(0.4, 1.4), ry: R() * 6 }); }
    for (let i = 0; i < 60; i++) { const s = rr(0, 190), rv = RIVER[Math.floor(R() * (RIVER.length - 1))]; const x = rv[0] + rr(-9, 9), z = rv[1] + rr(-9, 9); rl.push({ x, y: terrainH(x, z) - 0.2, z, s: rr(0.5, 1.4), ry: R() * 6 }); }
    scatterInstanced(scene, rg, M.rock, rl);
  }
  /* herbe au vent */
  await step('Herbe et fleurs', 0.76);
  {
    const blades = [];
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + R(), hgt = rr(0.22, 0.48), bend = rr(0.1, 0.3), pos = [], cols = [];
      const ox = Math.cos(a) * 0.12, oz = Math.sin(a) * 0.12;
      for (let s = 0; s < 2; s++) {
        const t0 = s / 2, t1 = (s + 1) / 2, w0 = 0.032 * (1 - t0 * 0.9), w1 = 0.032 * (1 - t1 * 0.9);
        const p0 = [ox + Math.cos(a) * bend * t0 * t0, hgt * t0, oz + Math.sin(a) * bend * t0 * t0], p1 = [ox + Math.cos(a) * bend * t1 * t1, hgt * t1, oz + Math.sin(a) * bend * t1 * t1];
        const px = -Math.sin(a), pz = Math.cos(a);
        const v = [[p0[0] - px * w0, p0[1], p0[2] - pz * w0], [p0[0] + px * w0, p0[1], p0[2] + pz * w0], [p1[0] - px * w1, p1[1], p1[2] - pz * w1], [p1[0] + px * w1, p1[1], p1[2] + pz * w1]];
        for (const q of [0, 1, 2, 1, 3, 2]) { pos.push(...v[q]); const tt = q < 2 ? t0 : t1; cols.push(0.55 + tt * 0.45, 0.62 + tt * 0.4, 0.45 + tt * 0.3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
      const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
      blades.push(g);
    }
    const gg = mergeGeometries(blades);
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
    windify(gm, 0.35, 0);
    const gl = [];
    for (let i = 0; i < Q.grass * 3 && gl.length < Q.grass; i++) {
      const x = rr(-118, 118), z = rr(-112, 125), r = Math.hypot(x, z); if (r > 128) continue;
      if (roadDist(x, z) < 0.6) continue; if (polyDist(RIVER, x, z).d < 6.5) continue;
      let bad = false; for (const c of W.colliders) if (x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3) { bad = true; break; } if (bad) continue;
      if (x > TERR.x0 && x < TERR.x1 && z > TERR.z0 && z < TERR.z1 + 9) continue;
      if (x > -98 && x < -34 && z > 46 && z < 108) continue;
      const n = fbm(N3, x * 0.04, z * 0.04, 2);
      gl.push({ x, y: terrainH(x, z), z, s: rr(0.7, 1.15) * (1 + n * 0.3), ry: R() * 6, c: `hsl(${72 + n * 26 + R() * 14},${42 + R() * 18}%,${34 + n * 8 + R() * 10}%)` });
    }
    const gi = scatterInstanced(scene, gg, gm, gl, { cast: false, color: '#4a6a2a', chunk: 30, maxDist: 75 });
    /* fleurs sauvages */
    const fl = new THREE.OctahedronGeometry(0.06, 0), fll = [];
    for (let i = 0; i < Q.grass / 6; i++) { const p = gl[Math.floor(R() * gl.length)]; if (!p) break; fll.push({ x: p.x + rr(-0.3, 0.3), y: p.y + rr(0.3, 0.55), z: p.z + rr(-0.3, 0.3), s: rr(0.8, 1.3), c: ['#f2eee6', '#e9c64a', '#b48ad8', '#f0a0b8'][Math.floor(R() * 4)] }); }
    scatterInstanced(scene, fl, new THREE.MeshStandardMaterial({ roughness: 0.7 }), fll, { cast: false, color: '#ffffff', chunk: 30, maxDist: 60 });
  }

  /* --- ciel, lumière, nuages, brume --- */
  await step('Ciel, lumière et brume', 0.86);
  buildSky(scene, renderer, Q);
  await step('Carte de la vallée', 0.94);
  W.mapCanvas = buildMap();
  return W;
}

/* ============================ DOJO ============================ */
function buildDojo(kit, B) {
  const cx = 0, cz = -96, y0 = TERR.y, fy = y0 + 0.9, w = 22, d = 30, wallH = 4.2;
  kit.set(cx, y0, cz, 0);
  /* socle et plancher */
  kit.box(w + 3, 0.9, d + 3, M.stone, 0, 0.45, 0, 1.4);
  kit.box(w, 0.12, d, M.floor, 0, 0.95, 0, 3.2); kit.walk(w + 3, d + 3, 0, 0, 1.0);
  /* engawa et marches */
  for (let i = 0; i < 3; i++) kit.box(8, 0.3, 0.6, M.stone, 0, 0.15 + i * 0.3 - 0.0, d / 2 + 3.2 - i * 0.55);
  W.walkables.push({ x0: -4, x1: 4, z0: cz + d / 2 + 1.4, z1: cz + d / 2 + 3.6, f: (x, z) => lerp(y0 + 1.0, y0, clamp((z - (cz + d / 2 + 1.5)) / 2, 0, 1)), surf: 'pierre' });
  /* tatami au centre : 8 x 12 tapis */
  for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) {
    const rotT = (i + j) % 2 === 0; const tx = -5.4 + i * 1.8 + 0.9, tz = -7.2 + j * 1.8 + 0.9;
    kit.box(rotT ? 1.78 : 1.78, 0.06, 1.78, M.tatami, tx, 1.04, tz, 1.8, 0, 0, rotT ? Math.PI / 2 : 0);
  }
  /* poteaux, sablières, murs shoji, ouvertures hautes */
  for (const sx of [-1, 1]) for (let k = 0; k <= 6; k++) {
    const z = -d / 2 + k * d / 6; kit.box(0.42, wallH + 1.6, 0.42, M.dwood, sx * w / 2, 1.0 + (wallH + 1.6) / 2, z);
  }
  for (const sz of [-1, 1]) for (let k = 0; k <= 4; k++) { const x = -w / 2 + k * w / 4; kit.box(0.42, wallH + 1.6, 0.42, M.dwood, x, 1.0 + (wallH + 1.6) / 2, sz * d / 2); }
  for (const sx of [-1, 1]) {
    kit.box(0.08, wallH, d, M.shoji, sx * (w / 2 - 0.05), 1.0 + wallH / 2, 0, 1.4);
    kit.col(0.6, d, sx * w / 2, 0, 0, 7);
    kit.box(0.3, 0.3, d + 0.4, M.dwood, sx * w / 2, 1.0 + wallH, 0); kit.box(0.3, 0.3, d + 0.4, M.dwood, sx * w / 2, 1.0 + wallH + 1.6, 0);
    for (let z = -d / 2 + 0.6; z < d / 2; z += 0.9) kit.box(0.08, 1.3, 0.08, M.wood, sx * w / 2, 1.0 + wallH + 0.8, z);
  }
  /* mur du fond avec rouleaux */
  kit.box(w, wallH, 0.12, M.plaster, 0, 1.0 + wallH / 2, -d / 2 + 0.05, 2); kit.col(w, 0.6, 0, -d / 2, 0, 7);
  kit.box(w + 0.4, 0.3, 0.3, M.dwood, 0, 1.0 + wallH, -d / 2); kit.box(w + 0.4, 0.3, 0.3, M.dwood, 0, 1.0 + wallH + 1.6, -d / 2);
  for (let x = -w / 2 + 0.6; x < w / 2; x += 0.9) kit.box(0.08, 1.3, 0.08, M.wood, x, 1.0 + wallH + 0.8, -d / 2);
  kit.box(1.5, 3.6, 0.04, M.scrollKage, 0, 3.4, -d / 2 + 0.16);
  kit.box(0.9, 2.6, 0.04, M.scrollShin, -4, 3.2, -d / 2 + 0.16); kit.box(0.9, 2.6, 0.04, M.scrollGi, 4, 3.2, -d / 2 + 0.16);
  kit.box(5, 0.12, 0.7, M.dwood, 0, 4.9, -d / 2 + 0.4); kit.box(1.4, 0.8, 0.5, M.wood, 0, 5.35, -d / 2 + 0.4);
  kit.box(6, 0.4, 1.2, M.dwood, 0, 1.2, -d / 2 + 1.2); kit.col(6, 1.2, 0, -d / 2 + 1.2, 0, 1.6);
  /* façade : piliers, portes coulissantes au centre */
  kit.box(7, wallH, 0.12, M.shoji, -7.5, 1.0 + wallH / 2, d / 2 - 0.05); kit.box(7, wallH, 0.12, M.shoji, 7.5, 1.0 + wallH / 2, d / 2 - 0.05);
  kit.col(7, 0.6, -7.5, d / 2, 0, 7); kit.col(7, 0.6, 7.5, d / 2, 0, 7);
  kit.box(w + 0.4, 0.3, 0.3, M.dwood, 0, 1.0 + wallH, d / 2); kit.box(w + 0.4, 0.3, 0.3, M.dwood, 0, 1.0 + wallH + 1.6, d / 2);
  for (let x = -w / 2 + 0.6; x < w / 2; x += 0.9) kit.box(0.08, 1.3, 0.08, M.wood, x, 1.0 + wallH + 0.8, d / 2);
  const sign = new THREE.MeshStandardMaterial({ map: T.sign('dojo', '影道場'), roughness: 0.7 });
  kit.box(3.6, 1.1, 0.14, sign, 0, 1.0 + wallH + 0.8, d / 2 + 0.3);
  /* râteliers, tambour, rangée de makiwara */
  for (const sx of [-1, 1]) {
    kit.box(0.2, 1.6, 4, M.dwood, sx * (w / 2 - 0.4), 1.9, -8);
    for (let k = 0; k < 7; k++) kit.box(0.06, 0.06, 1.1, M.wood, sx * (w / 2 - 0.55), 2.2 + (k % 2) * 0.4, -9.6 + k * 0.5, 1, 0.9);
    kit.col(0.6, 4, sx * (w / 2 - 0.4), -8, 0, 2.8);
  }
  kit.geo(new THREE.CylinderGeometry(0.7, 0.7, 0.9, 20).rotateZ(Math.PI / 2), M.vermil, 8.4, 2.4, -12.6);
  kit.box(1.4, 1.2, 0.8, M.dwood, 8.4, 1.6, -12.6); kit.col(1.6, 1.2, 8.4, -12.6, 0, 3);
  W.dummies = [];
  for (let k = 0; k < 4; k++) { const lx = -7.6, lz = -6 + k * 3.2; kit.box(0.3, 2.4, 0.3, M.wood, lx, 2.2, lz); kit.box(0.5, 0.7, 0.4, M.rope, lx, 2.8, lz); kit.col(0.5, 0.5, lx, lz, 0, 3.2);
    W.dummies.push({ x: cx + lx, z: cz + lz, y: fy, hp: 1, hits: 0, shake: 0, id: k }); }
  /* charpente et toit irimoya */
  const top = 1.0 + wallH + 1.6;
  for (let k = 0; k <= 6; k++) kit.box(w + 0.6, 0.45, 0.4, M.dwood, 0, top + 0.1, -d / 2 + k * d / 6);
  for (let k = 0; k <= 6; k++) { kit.box(0.3, 2.4, 0.3, M.dwood, 0, top + 1.3, -d / 2 + k * d / 6); }
  kit.box(0.4, 0.4, d + 0.8, M.dwood, 0, top + 2.5, 0);
  kit.geo(hipGeo(w + 6, d + 6, 2.2, 3.6, 0.8), M.roof, 0, top - 0.2, 0);
  kit.geo(gableGeo(d - 2, w - 6.4, 4.2, 0.6, 0.6), M.roof, 0, top + 2.0, 0, Math.PI / 2);
  kit.box(1.0, 0.5, d + 2, M.roof, 0, top + 6.25, 0);
  for (const sz of [-1, 1]) { kit.box(w - 7, 3.6, 0.2, M.dwood, 0, top + 3.4, sz * (d / 2 - 1.6)); kit.geo(new THREE.TorusGeometry(0.6, 0.12, 8, 18), M.gold, 0, top + 3.6, sz * (d / 2 - 1.45)); }
  /* intérieur : lumière chaude, rais de soleil par les ouvertures hautes */
  const L = new THREE.PointLight('#ffd9a0', 6, 26, 1.6); L.position.set(cx, fy + 4.6, cz); W.dojoLight = L; kit.b.extra = (kit.b.extra || []); kit.b.extra.push(L);
  W.dojo = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y: fy, cx, cz, door: cz + d / 2 };
  W.doors.push({ x: cx, z: cz + d / 2, y: fy, open: 0, panels: [] });
  /* les panneaux des portes, animés */
  W.dojoDoorPanels = [];
  W.pois.push({ id: 'dojo', name: 'Dojo Sakura no Kage', x: cx, z: cz, r: 22 });
  W.nav.dojoIn = { x: cx, z: cz + 8, y: fy };
}

/* ============================ CIEL ============================ */
function buildSky(scene, renderer, Q) {
  const sky = new Sky(); sky.scale.setScalar(4000); scene.add(sky); W.sky = sky;
  const u = sky.material.uniforms; u.turbidity.value = 4.5; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
  const sun = new THREE.DirectionalLight('#fff3e0', 3); sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow); const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.05; scene.add(sun); scene.add(sun.target); W.sun = sun;
  const hemi = new THREE.HemisphereLight('#bcd2e8', '#4a4030', 0.7); scene.add(hemi); W.hemi = hemi;
  scene.fog = new THREE.FogExp2('#c9cfd6', 0.0026);
  /* étoiles et lune */
  const sp = []; for (let i = 0; i < 1600; i++) { const a = R() * 6.28, b = Math.acos(rr(0.05, 1)); sp.push(Math.cos(a) * Math.sin(b) * 1800, Math.cos(b) * 1800, Math.sin(a) * Math.sin(b) * 1800); }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)), new THREE.PointsMaterial({ color: '#dfe6ff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars); W.stars = stars;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), new THREE.MeshBasicMaterial({ color: '#f2efe6', fog: false, transparent: true, opacity: 0 })); scene.add(moon); W.moon = moon;
  /* couche de nuages */
  const ct = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), im = g.createImageData(512, 512), d = im.data;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) { const fx = x / 512 * 6.28, fy = y / 512 * 6.28;
      let v = 0, a = 1, f = 1; for (let o = 0; o < 6; o++) { v += N1(Math.cos(fx) * f * 1.2 + 9, Math.sin(fx) * f * 1.2 + Math.cos(fy) * f * 1.5) * a + N2(Math.sin(fy) * f * 1.3, Math.cos(fy) * f + 4) * a * 0.6; a *= 0.5; f *= 2; }
      const al = clamp((v * 0.9 + 0.05) * 2.2, 0, 1); const i = (y * 512 + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = al * 255; }
    g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t; })();
  const cg = new THREE.SphereGeometry(1500, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const cm = new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.5, side: THREE.BackSide, depthWrite: false, fog: false, color: '#ffffff' });
  const clouds = new THREE.Mesh(cg, cm); clouds.position.y = -120; scene.add(clouds); W.clouds = clouds;
  /* nappes de brume dans la vallée */
  W.mists = [];
  const mt = T.soft();
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * 6.28 + R(), r = rr(110, 200), x = Math.cos(a) * r, z = Math.sin(a) * r;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rr(90, 150), rr(14, 22)), new THREE.MeshBasicMaterial({ map: mt, transparent: true, opacity: 0.25, depthWrite: false, color: '#ffffff' }));
    m.position.set(x, terrainH(x, z) + rr(8, 18), z); m.lookAt(0, m.position.y, 0); scene.add(m); W.mists.push(m);
  }
  /* pluie */
  const rp = new Float32Array(3000 * 6);
  const rain = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(rp, 3)), new THREE.LineBasicMaterial({ color: '#c4ced8', transparent: true, opacity: 0 }));
  rain.frustumCulled = false; scene.add(rain); W.rain = rain;
  for (let i = 0; i < 3000; i++) { const x = rr(-30, 30), y = rr(0, 30), z = rr(-30, 30); rp.set([x, y, z, x - 0.05, y - 0.7, z], i * 6); }
  /* pétales qui tombent */
  const pg = new THREE.PlaneGeometry(0.09, 0.07);
  const pm = new THREE.MeshStandardMaterial({ map: T.petal(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.8 });
  const petals = new THREE.InstancedMesh(pg, pm, Q.petals); petals.frustumCulled = false; scene.add(petals); W.petals = petals;
  W.petalData = Array.from({ length: Q.petals }, () => ({ x: rr(-25, 25), y: rr(0, 14), z: rr(-25, 25), s: rr(0.6, 1.4), r: R() * 6, w: rr(0.6, 1.4) }));
  /* lucioles près de l'eau, la nuit */
  const ff = []; for (let i = 0; i < 160; i++) { const k = Math.floor(R() * (RIVER.length - 2)); const [ax, az] = RIVER[k]; ff.push(ax + rr(-12, 12), WATER_Y(30) + rr(0.6, 2.4), az + rr(-12, 12)); }
  const fireflies = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ff, 3)), new THREE.PointsMaterial({ map: T.soft(), size: 0.5, color: '#d8ff8a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(fireflies); W.fireflies = fireflies;
  W.pmrem = new THREE.PMREMGenerator(renderer);
  W.skyScene = new THREE.Scene(); W.skyCopy = new Sky(); W.skyCopy.scale.setScalar(1000); W.skyScene.add(W.skyCopy);
}

/* ---------- carte vue de dessus ---------- */
function buildMap() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const im = g.createImageData(S, S), d = im.data, k = 560 / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wx = x * k - 280, wz = y * k - 280, h = terrainH(wx, wz), hh = terrainH(wx + 1.5, wz - 1.5);
    let r = 196, gg = 186, b = 160; const sh = clamp((hh - h) * 0.9, -1, 1);
    const m = smooth(4, 90, h); r = lerp(206, 150, m); gg = lerp(196, 146, m); b = lerp(166, 128, m);
    if (h > 80) { r = gg = b = 225; }
    const rv = polyDist(RIVER, wx, wz); if (rv.d < (rv.s < 40 ? 5 : 6.5)) { r = 112; gg = 140; b = 150; }
    if (roadDist(wx, wz) < 0) { r = 236; gg = 226; b = 200; }
    if (wx > -98 && wx < -34 && wz > 46 && wz < 108) { r = 160; gg = 176; b = 150; }
    const i = (y * S + x) * 4; d[i] = r + sh * 28; d[i + 1] = gg + sh * 28; d[i + 2] = b + sh * 28; d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  g.fillStyle = 'rgba(40,30,22,0.75)';
  for (const cl of W.colliders) { if (cl.rail || cl.x1 - cl.x0 > 40 || cl.z1 - cl.z0 > 40) continue; g.fillRect((cl.x0 + 280) / k, (cl.z0 + 280) / k, Math.max(1, (cl.x1 - cl.x0) / k), Math.max(1, (cl.z1 - cl.z0) / k)); }
  g.strokeStyle = 'rgba(30,22,16,0.25)'; g.lineWidth = 1;
  for (let lv = 10; lv < 120; lv += 12) { /* lignes de niveau légères */ }
  return c;
}

/* ============================ TEMPS QUI PASSE ============================ */
const _v = new THREE.Vector3(), _c1 = new THREE.Color(), _c2 = new THREE.Color();
const FOGK = [[0, '#0b1020'], [4.8, '#1a1d2c'], [5.8, '#b08a8a'], [6.8, '#e2c2a6'], [9, '#c9d3dc'], [16, '#cfd6dc'], [18, '#e0a77a'], [19.2, '#6e4e5e'], [20.4, '#161a2a'], [24, '#0b1020']];
function fogAt(t) { for (let i = 0; i < FOGK.length - 1; i++) if (t >= FOGK[i][0] && t <= FOGK[i + 1][0]) { const u = (t - FOGK[i][0]) / (FOGK[i + 1][0] - FOGK[i][0]); return _c1.set(FOGK[i][1]).lerp(_c2.set(FOGK[i + 1][1]), u); } return _c1.set('#0b1020'); }
export function sunDir(t) {
  const a = (t - 6) / 12 * Math.PI;      /* 6 h lever, 18 h coucher */
  return _v.set(Math.cos(a) * 0.82, Math.sin(a), -0.42 + Math.cos(a) * 0.1).normalize();
}
let envT = -99;
export function updateWorld(dt, camPos, scene, renderer, target, Q, inDojo) {
  W.uTime.value += dt;
  for (const c of W.chunks) c.im.visible = Math.hypot(c.x - camPos.x, c.z - camPos.z) < c.d;
  const wt = W.weather;
  /* météo : changements lents */
  wt.t += dt; if (wt.t > wt.next) { wt.t = 0; wt.next = rr(150, 320); const r = R(); wt.target = r < 0.5 ? 'clair' : (r < 0.72 ? 'nuageux' : (r < 0.88 ? 'pluie' : 'brume')); }
  const tgRain = wt.target === 'pluie' ? 1 : 0, tgFog = wt.target === 'brume' ? 1 : (wt.target === 'pluie' ? 0.5 : 0), tgCloud = wt.target === 'clair' ? 0.25 : (wt.target === 'nuageux' ? 0.7 : 0.95);
  wt.rain += (tgRain - wt.rain) * Math.min(1, dt * 0.08); wt.fog += (tgFog - wt.fog) * Math.min(1, dt * 0.08); wt.cloud += (tgCloud - wt.cloud) * Math.min(1, dt * 0.06);
  wt.kind = wt.rain > 0.5 ? 'pluie' : (wt.fog > 0.5 ? 'brume' : (wt.cloud > 0.55 ? 'nuageux' : 'clair'));
  W.wind = 0.7 + wt.cloud * 0.6 + wt.rain * 0.8 + Math.sin(W.uTime.value * 0.07) * 0.25; W.uWind.value = W.wind;

  const t = W.time, sd = sunDir(t), day = smooth(-0.12, 0.25, sd.y), night = 1 - day;
  const isSun = sd.y > -0.05;
  const L = isSun ? sd : _v.set(-sd.x, -sd.y, -sd.z);
  W.sun.position.copy(target).addScaledVector(L, 120); W.sun.target.position.copy(target);
  const warm = smooth(0.45, 0.02, sd.y) * day;
  W.sun.color.setRGB(1, lerp(0.95, 0.62, warm), lerp(0.88, 0.42, warm));
  if (!isSun) W.sun.color.setRGB(0.55, 0.65, 0.95);
  const dim = 1 - wt.cloud * 0.55 - wt.rain * 0.25;
  W.sun.intensity = isSun ? lerp(0.4, 3.2, smooth(0, 0.35, sd.y)) * dim : 0.35 * (1 - wt.cloud * 0.6);
  W.hemi.intensity = lerp(0.16, 0.55, day) * (1 - wt.rain * 0.2) + wt.cloud * 0.18 * day;
  W.hemi.color.copy(fogAt(t)).lerp(_c2.set('#9fb8d4'), 0.4 * day);
  const u = W.sky.material.uniforms; u.sunPosition.value.copy(sd).multiplyScalar(1000);
  u.turbidity.value = 4 + wt.cloud * 6 + wt.rain * 6; u.rayleigh.value = lerp(0.6, 1.8, day) * (1 - wt.rain * 0.5);
  const fc = fogAt(t).clone(); const grey = _c2.setRGB(0.55, 0.58, 0.62).multiplyScalar(lerp(0.15, 1, day));
  fc.lerp(grey, wt.rain * 0.7 + wt.fog * 0.4);
  scene.fog.color.copy(fc); scene.fog.density = (0.0015 + wt.fog * 0.011 + wt.rain * 0.005) * Q.fogMul * (inDojo ? 0.15 : 1);
  W.stars.material.opacity = night * (1 - wt.cloud) ; W.moon.material.opacity = night;
  W.moon.position.copy(camPos).addScaledVector(_v.set(-sd.x, Math.max(0.25, -sd.y), -sd.z).normalize(), 1500);
  W.clouds.material.opacity = 0.18 + wt.cloud * 0.6; W.clouds.material.color.copy(fc).lerp(_c2.set('#ffffff'), 0.45 * day);
  W.clouds.rotation.y += dt * 0.002 * W.wind; W.clouds.position.x = camPos.x; W.clouds.position.z = camPos.z;
  for (const m of W.mists) { m.material.opacity = (0.12 + smooth(9, 5.5, t) * smooth(4, 5.5, t) * 0.5 + wt.fog * 0.4) * (0.35 + day * 0.65); m.material.color.copy(fc).lerp(_c2.set('#ffffff'), 0.3); }
  renderer.toneMappingExposure = lerp(0.46, 0.66, day) * (1 - wt.rain * 0.12) * (inDojo ? 0.86 : 1);
  /* lumières de la nuit */
  const glow = smooth(0.25, -0.05, sd.y);
  for (const m of W.lanternMats) m.emissiveIntensity = glow * 2.4;
  for (const Lp of W.lights) Lp.intensity = glow * 14;
  for (const s of W.shojiMats) s.emissiveIntensity = 0.04 + day * (inDojo ? 0.12 : 0.25);
  W.fireflies.material.opacity = glow * (1 - wt.rain) * (0.6 + 0.4 * Math.sin(W.uTime.value * 3));
  for (const f of W.fire) { f.light.intensity = 3.5 + Math.sin(W.uTime.value * 17) * 0.8 + Math.sin(W.uTime.value * 7.3) * 0.6; f.mesh.scale.y = 1 + Math.sin(W.uTime.value * 13) * 0.15; }
  if (W.dojoLight) W.dojoLight.intensity = lerp(14, 2.5, day);
  /* eau */
  M.water.normalMap.offset.set(W.uTime.value * 0.01, -W.uTime.value * 0.06);
  W.fall.map.offset.y = W.uTime.value * 1.6;
  const mp = W.mist.geometry.attributes.position; for (let i = 0; i < mp.count; i++) { let y = mp.getY(i) + dt * 1.2; if (y > WATER_Y(0) + 5) y = WATER_Y(0); mp.setY(i, y); } mp.needsUpdate = true;
  M.terrain.roughness = 0.94 - wt.rain * 0.4;
  /* pluie autour de la caméra */
  W.rain.material.opacity = wt.rain * 0.55;
  if (wt.rain > 0.02) { const rp = W.rain.geometry.attributes.position.array; for (let i = 0; i < rp.length; i += 6) { rp[i + 1] -= dt * 26; rp[i + 4] -= dt * 26; if (rp[i + 1] < -2) { const x = rr(-30, 30), z = rr(-30, 30), y = rr(18, 30); rp.set([x, y, z, x - 0.05 * W.wind, y - 0.75, z], i); } }
    W.rain.position.set(camPos.x, camPos.y - 12, camPos.z); W.rain.geometry.attributes.position.needsUpdate = true; }
  /* pétales autour du joueur */
  const pd = W.petalData, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  const nearSakura = 1;
  for (let i = 0; i < pd.length; i++) {
    const p = pd[i]; p.y -= dt * (0.55 + p.w * 0.25); p.x += dt * (0.6 + Math.sin(W.uTime.value * 0.7 + i) * 0.4) * W.wind; p.z += Math.cos(W.uTime.value * 0.9 + i) * dt * 0.3; p.r += dt * p.w * 2.2;
    if (p.y < -1 || Math.abs(p.x) > 26 || Math.abs(p.z) > 26) { p.x = rr(-25, 25); p.z = rr(-25, 25); p.y = rr(8, 14); if (p.x > 24) p.x = -24; }
    e.set(p.r, p.r * 0.7, p.r * 0.4); q.setFromEuler(e); s.setScalar(p.s * (inDojo ? 0 : nearSakura));
    m4.compose(_v.set(target.x + p.x, target.y + p.y - 3, target.z + p.z), q, s); W.petals.setMatrixAt(i, m4);
  }
  W.petals.instanceMatrix.needsUpdate = true;
  /* reflets du ciel : recalculés de temps en temps */
  if (Math.abs(t - envT) > 0.6 || envT < 0) {
    envT = t; const su = W.skyCopy.material.uniforms;
    su.sunPosition.value.copy(u.sunPosition.value); su.turbidity.value = u.turbidity.value; su.rayleigh.value = u.rayleigh.value; su.mieCoefficient.value = u.mieCoefficient.value; su.mieDirectionalG.value = u.mieDirectionalG.value;
    if (W.envRT) W.envRT.dispose(); W.envRT = W.pmrem.fromScene(W.skyScene, 0, 0.1, 2000); scene.environment = W.envRT.texture;
  }
  return { day, night, glow, sd };
}
