/* KAGE: REBIRTH — cœur du jeu : contrôles, caméra, déplacements, combat, ennemis, habitants */
import * as THREE from 'three';
import { W, groundAt, terrainH, inWater, waterInfo, roadDist, MAP } from './world.js';
import { Actor, MOVES, Cat, OUTFITS } from './actor.js';
import { CHARS, GEAR, regionOf } from './regions.js';
import { S } from './audio.js';
import { clamp, lerp, damp, dampAngle, angDiff, rr, R, T } from './util.js';

export const G = {
  mode: 'boot', ts: 1, hitstop: 0, slow: { t: 0, scale: 1 }, keys: {}, mouse: { l: false, r: false }, taps: {}, locked: false,
  settings: { sens: 1, invertY: false, quality: 'moyenne', res: 1, fpsCap: 0, sub: true, hud: true, contrast: 'normal', sharpness: 0.35 },
  enemies: [], npcs: [], cats: [], fx: [], listeners: {}, combatT: 0, dummiesHit: 0, msg: [], cam: null, camOverride: null, training: false,
  on(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); }, emit(n, d) { for (const f of this.listeners[n] || []) f(d); },
  secretBuf: '', konami: [], lastSecret: '', zone: null,
};
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V(), _ray = new THREE.Ray(), _box = new THREE.Box3();

/* ============================ ENTRÉES ============================ */
export function initInput(canvas) {
  const k = G.keys;
  addEventListener('keydown', (e) => {
    /* le champ de discussion libre ne doit jamais déclencher les contrôles du jeu */
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (e.repeat) { if (['Tab', 'Space'].includes(e.code)) e.preventDefault(); return; }
    k[e.code] = true; G.taps[e.code] = true;
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    /* commandes secrètes : lettres tapées hors dialogue, plus le code Konami */
    if (G.mode === 'play' && !G.locked) {
      if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) {
        G.secretBuf = (G.secretBuf + e.key.toLowerCase()).slice(-14);
        G.emit('keys', G.secretBuf);
      }
      const KSEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
      G.konami.push(e.code); if (G.konami.length > KSEQ.length) G.konami.shift();
      if (G.konami.join(',') === KSEQ.join(',')) { G.konami = []; G.emit('konami'); }
    }
  });
  addEventListener('keyup', (e) => { k[e.code] = false; });
  addEventListener('blur', () => { for (const c in k) k[c] = false; G.mouse.l = G.mouse.r = false; });
  canvas.addEventListener('mousedown', (e) => {
    if (G.mode === 'play' && !G.locked) { canvas.requestPointerLock?.(); }
    if (e.button === 0) { G.mouse.l = true; G.taps.LMB = true; } if (e.button === 2) { G.mouse.r = true; G.taps.RMB = true; } if (e.button === 1) { G.taps.MMB = true; e.preventDefault(); }
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) G.mouse.l = false; if (e.button === 2) G.mouse.r = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (!G.cam) return;
    const drag = !G.locked && (e.buttons & 4);
    if (G.locked || drag) { G.cam.yaw -= e.movementX * 0.0024 * G.settings.sens; G.cam.pitch = clamp(G.cam.pitch + e.movementY * 0.0021 * G.settings.sens * (G.settings.invertY ? -1 : 1), -0.55, 1.1); }
  });
  canvas.addEventListener('wheel', (e) => { if (G.cam) G.cam.want = clamp(G.cam.want + Math.sign(e.deltaY) * 0.4, 2.2, 7); }, { passive: true });
  /* la souris n'est jamais retenue : ÉCHAP la libère toujours et met le jeu en pause */
  document.addEventListener('pointerlockchange', () => { G.locked = document.pointerLockElement === canvas; if (!G.locked && G.mode === 'play') G.emit('pause'); });
}
export const tap = (c) => { if (G.taps[c]) { G.taps[c] = false; return true; } return false; };
export function clearTaps() { G.taps = {}; }

/* ============================ COLLISIONS ============================ */
export function collide(p, r, feet, h = 1.7) {
  /* deux passes : un coin de mur ne doit jamais recracher le joueur de l'autre côté */
  for (let pass = 0; pass < 2; pass++) {
    /* troncs, rochers et poteaux : indexés par cellules pour rester fluides */
    if (W.circleGrid && W.circleGrid.size) {
      const gx = Math.floor(p.x / 16), gz = Math.floor(p.z / 16);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const arr = W.circleGrid.get((gx + i) + ',' + (gz + j)); if (!arr) continue;
        for (const c of arr) {
          if (feet >= c.y1 - 0.05 || feet + h <= c.y0) continue;
          const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), rad = r + c.r;
          if (d < rad && d > 1e-4) { p.x += dx / d * (rad - d); p.z += dz / d * (rad - d); }
        }
      }
    }
    for (const c of W.colliders) {
      if (feet >= c.y1 - 0.05 || feet + h <= c.y0) continue;
      if (p.x < c.x0 - r || p.x > c.x1 + r || p.z < c.z0 - r || p.z > c.z1 + r) continue;
      const nx = clamp(p.x, c.x0, c.x1), nz = clamp(p.z, c.z0, c.z1), dx = p.x - nx, dz = p.z - nz, d = Math.hypot(dx, dz);
      if (d > 1e-5) { if (d < r) { p.x += dx / d * (r - d); p.z += dz / d * (r - d); } }
      else { const l = p.x - c.x0, rr2 = c.x1 - p.x, f = p.z - c.z0, b = c.z1 - p.z, m = Math.min(l, rr2, f, b);
        if (m === l) p.x = c.x0 - r; else if (m === rr2) p.x = c.x1 + r; else if (m === f) p.z = c.z0 - r; else p.z = c.z1 + r; }
    }
  }
}
/* déplacement balayé : aucun mur mince ne peut être traversé même à 11 m/s */
function moveBody(f, dx, dz) {
  const dist = Math.hypot(dx, dz); if (dist < 1e-6) return;
  const steps = Math.min(32, Math.max(1, Math.ceil(dist / 0.16)));
  for (let i = 0; i < steps; i++) {
    f.pos.x += dx / steps; f.pos.z += dz / steps;
    collide(f.pos, f.radius, f.pos.y);
  }
}
function camBlock(from, to) {
  _ray.origin.copy(from); _a.subVectors(to, from); const len = _a.length(); _ray.direction.copy(_a.normalize()); let best = len;
  for (const c of W.colliders) {
    if (c.rail) continue;
    if (Math.max(c.x0 - from.x, from.x - c.x1) > len + 1 || Math.max(c.z0 - from.z, from.z - c.z1) > len + 1) continue;
    _box.min.set(c.x0 - 0.15, c.y0, c.z0 - 0.15); _box.max.set(c.x1 + 0.15, c.y1, c.z1 + 0.15);
    if (_box.containsPoint(from)) continue;
    const hit = _ray.intersectBox(_box, _b); if (hit) { const d = hit.distanceTo(from); if (d < best) best = d; }
  }
  return best;
}

/* ============================ EFFETS ============================ */
let sparkPts, sparkData = [], trail, ringPool = [];
export function initFx(scene) {
  const n = 400; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  sparkPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.14, map: T.soft(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sparkPts.frustumCulled = false; scene.add(sparkPts);
  for (let i = 0; i < n; i++) sparkData.push({ life: 0, p: V(), v: V(), c: new THREE.Color() });
  const tg = new THREE.BufferGeometry(); const N = 14; tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3)); tg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(N * 2), 1));
  const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } tg.setIndex(idx);
  const tm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { col: { value: new THREE.Color('#f4f1ea') } },
    vertexShader: 'attribute float alpha; varying float va; void main(){ va = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 col; varying float va; void main(){ gl_FragColor = vec4(col * va, va); }' });
  trail = { mesh: new THREE.Mesh(tg, tm), pts: [], N }; trail.mesh.frustumCulled = false; scene.add(trail.mesh);
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); scene.add(m); ringPool.push({ m, t: 1 }); }
}
export function sparks(p, n, col = '#ffd9a0', spd = 6) {
  for (let i = 0, k = 0; i < sparkData.length && k < n; i++) { const s = sparkData[i]; if (s.life > 0) continue; k++;
    s.life = rr(0.25, 0.6); s.p.copy(p); s.v.set(rr(-1, 1), rr(-0.2, 1.2), rr(-1, 1)).normalize().multiplyScalar(rr(spd * 0.4, spd)); s.c.set(col); }
}
export function ring(p, col = '#ffffff', big = 1) { const r = ringPool.find(q => q.t >= 1) || ringPool[0]; r.t = 0; r.big = big; r.m.position.copy(p); r.m.material.color.set(col); r.m.lookAt(G.camera.position); }
function updateFx(dt) {
  const pa = sparkPts.geometry.attributes.position.array, ca = sparkPts.geometry.attributes.color.array;
  sparkData.forEach((s, i) => { if (s.life > 0) { s.life -= dt; s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt); } const a = Math.max(0, s.life) * 2; pa.set([s.p.x, s.p.y, s.p.z], i * 3); ca.set([s.c.r * a, s.c.g * a, s.c.b * a], i * 3); });
  sparkPts.geometry.attributes.position.needsUpdate = true; sparkPts.geometry.attributes.color.needsUpdate = true;
  for (const r of ringPool) { if (r.t >= 1) { r.m.material.opacity = 0; continue; } r.t = Math.min(1, r.t + dt * 3); r.m.scale.setScalar((1 + r.t * 5) * r.big); r.m.material.opacity = (1 - r.t) * 0.7; }
  /* traînée de la lame du joueur */
  const pl = G.pl; const ta = trail.mesh.geometry.attributes.position.array, al = trail.mesh.geometry.attributes.alpha.array;
  const active = pl && pl.action && pl.actor.swordDrawn && pl.action.t > MOVES[pl.action.move].dur * 0.15 && pl.action.t < MOVES[pl.action.move].dur * 0.8;
  if (active) { trail.pts.unshift([pl.actor.baseWorld(V()), pl.actor.tipWorld(V())]); } else if (trail.pts.length) trail.pts.pop();
  if (trail.pts.length > trail.N) trail.pts.length = trail.N;
  for (let i = 0; i < trail.N; i++) { const q = trail.pts[Math.min(i, trail.pts.length - 1)]; if (!q) { al[i * 2] = al[i * 2 + 1] = 0; continue; }
    ta.set([q[0].x, q[0].y, q[0].z, q[1].x, q[1].y, q[1].z], i * 6); const a = trail.pts.length > 1 ? (1 - i / trail.N) * 0.75 : 0; al[i * 2] = a * 0.1; al[i * 2 + 1] = a; }
  trail.mesh.geometry.attributes.position.needsUpdate = true; trail.mesh.geometry.attributes.alpha.needsUpdate = true;
}
export function slowmo(scale, dur) { G.slow.scale = scale; G.slow.t = dur; }
export function shake(a) { G.cam.shake = Math.max(G.cam.shake, a); }
export function notify(text, kind = '') { G.emit('toast', { text, kind }); }

/* ============================ ENTITÉ COMBATTANTE ============================ */
class Fighter {
  constructor(actor, x, z) {
    this.actor = actor; this.pos = V(x, groundAt(x, z).h, z); this.vel = V(); this.yaw = 0; this.vy = 0; this.onGround = true;
    this.hpMax = 100; this.hp = 100; this.action = null; this.hurtT = 0; this.downT = 0; this.dashT = 0; this.landT = 0; this.block = 0; this.blockHeld = false; this.parryT = 9; this.stagger = 0;
    this.speed = 0; this.surf = 'herbe'; this.stepPh = 0; this.dead = false; this.radius = 0.38; this.inv = 0;
  }
  facing() { return V(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  busy() { return this.action || this.hurtT > 0 || this.downT > 0 || this.dashT > 0 || this.dead; }
  start(move) {
    const mv = MOVES[move]; if (!mv) return false;
    this.action = { move, t: 0, hit: new Set(), queued: null, multiT: 0 };
    if (!this.actor.swordDrawn) { this.actor.sheathe(false); S.draw(); }
    if (mv.heavy) setTimeout(() => S.swish(0.7), mv.dur * 450); else setTimeout(() => S.swish(1), mv.dur * 280);
    return true;
  }
  ground(dt) {
    const g = groundAt(this.pos.x, this.pos.z, this.pos.y);
    this.surf = g.surf; const wy = inWater(this.pos.x, this.pos.z); if (wy !== null && wy > g.h) this.surf = 'eau';
    this.vy -= 22 * dt; this.pos.y += this.vy * dt;
    if (this.pos.y <= g.h) { if (!this.onGround && this.vy < -6) { this.landT = 0.25; S.step(this.surf, true); } this.pos.y = g.h; this.vy = 0; this.onGround = true; }
    else if (this.pos.y > g.h + 0.25) this.onGround = false; else if (this.vy <= 0) { this.pos.y = g.h; this.vy = 0; this.onGround = true; }
    this.waterY = wy;
  }
}

/* ============================ JOUEUR ============================ */
export function createPlayer(scene, look) {
  const C = CHARS.sora;
  const actor = new Actor(scene, Object.assign({ outfit: 'encre', hair: 'chignon', skin: 0, scarf: true, band: true }, C.look, look || {}));
  const pl = new Fighter(actor, W.spawn.x, W.spawn.z);
  Object.assign(pl, { en: 30, level: 1, xp: 0, sp: 0, skills: {}, ryo: 40, inv: { onigiri: 2, the: 1 }, lock: null, drawnT: 0, climb: null, climbPh: 0, combo: 0, comboT: 0, special: false, ult: false, dashCD: 0, isPlayer: true, look: actor.o,
    char: 'sora', gear: { lame: 0, armure: 0, bottes: 0 }, blessings: 0, buffs: {}, oxygen: 100, inWater: false, submerged: false, swim: 0, unlockChars: { sora: true } });
  pl.yaw = Math.PI;
  G.pl = pl; return pl;
}
export const charOf = (pl) => CHARS[pl.char] || CHARS.sora;
export const gearOf = (pl, k) => GEAR[k].tiers[Math.min(GEAR[k].tiers.length - 1, (pl.gear && pl.gear[k]) || 0)];
export function dmgMul(pl) { return 1 + (pl.level - 1) * 0.06 + (gearOf(pl, 'lame').dmg - 1) + (charOf(pl).dmg - 1) + (pl.buffs?.might ? 0.5 : 0); }
export function speedMul(pl) { return charOf(pl).speed * gearOf(pl, 'bottes').speed * (pl.buffs?.speed ? 2 : 1); }
export function enMul(pl) { return charOf(pl).en; }
export function hpMaxOf(pl) { return Math.round((100 + (pl.level - 1) * 10 + (pl.skills?.vitalite ? 25 : 0) + gearOf(pl, 'armure').hp + (pl.blessings || 0) * 5) * charOf(pl).hp); }
export function setLook(look) { const pl = G.pl; pl.actor.setOutfit(look); pl.look = pl.actor.o; if (pl.actor.swordDrawn) pl.actor.sheathe(false); }
export function setCharacter(id) {
  const C = CHARS[id]; if (!C || !G.pl) return false;
  const pl = G.pl; pl.char = id; pl.actor.setOutfit(Object.assign({}, C.look)); pl.look = pl.actor.o;
  pl.hpMax = hpMaxOf(pl); pl.hp = Math.min(pl.hp, pl.hpMax); pl.en = Math.min(pl.en, 100 * enMul(pl));
  if (pl.actor.swordDrawn) pl.actor.sheathe(false);
  return true;
}

function inCombat() { return G.enemies.some(e => !e.dead && e.aggro && e.pos.distanceTo(G.pl.pos) < 22); }

function playerUpdate(dt, rdt) {
  const pl = G.pl, k = G.keys, cam = G.cam;
  const canMove = G.mode === 'play';
  let ix = 0, iz = 0;
  if (canMove) { if (k.KeyW || k.ArrowUp) iz += 1; if (k.KeyS || k.ArrowDown) iz -= 1; if (k.KeyA || k.ArrowLeft) ix -= 1; if (k.KeyD || k.ArrowRight) ix += 1; }
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const fwd = V(Math.sin(cam.yaw), 0, Math.cos(cam.yaw)), right = V(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
  const want = V().addScaledVector(fwd, iz).addScaledVector(right, ix);
  const fighting = inCombat(); if (fighting) G.combatT = 4; else G.combatT -= dt;
  /* eau : nage, apnée, noyade */
  const wi = waterInfo(pl.pos.x, pl.pos.z);
  const wy = wi ? wi.y : null;
  const wasWet = pl.inWater;
  pl.inWater = wy !== null && pl.pos.y < wy - 0.22;
  pl.waterY = wy;
  if (pl.inWater && !wasWet) { S.splash(); ring(V(pl.pos.x, wy + 0.04, pl.pos.z), '#cfe4ea', 1.4); notify('Tu nages. Espace pour remonter, Ctrl ou C pour plonger.', 'place'); sparks(V(pl.pos.x, wy + 0.05, pl.pos.z), 18, '#d8eef4', 3); }
  else if (!pl.inWater && wasWet) { S.splash(0.4); }
  pl.timers = pl.timers || 0;
  for (const t of ['hurtT', 'downT', 'dashT', 'landT', 'inv', 'comboT', 'dashCD', 'stagger']) pl[t] = Math.max(0, pl[t] - dt);
  if (pl.buffs) for (const b in pl.buffs) pl.buffs[b] = Math.max(0, pl.buffs[b] - dt);
  pl.parryT += dt;

  /* verrouillage d'une cible */
  if (canMove && (tap('Tab') || tap('MMB'))) {
    if (pl.lock) pl.lock = null; else { let best = null, bd = 18; for (const e of G.enemies) { if (e.dead) continue; const d = e.pos.distanceTo(pl.pos); if (d < bd) { bd = d; best = e; } } pl.lock = best; if (best) S.ui(); }
  }
  if (pl.lock && (pl.lock.dead || pl.lock.pos.distanceTo(pl.pos) > 24)) pl.lock = null;

  /* échelle */
  if (pl.climb) {
    const L = pl.climb; pl.pos.x = L.x; pl.pos.z = L.z; pl.yaw = L.face; pl.vy = 0;
    pl.pos.y += iz * 2.1 * dt; pl.climbPh += Math.abs(iz) * dt * 7;
    if (pl.pos.y >= L.y1 - 0.05) { pl.climb = null; pl.pos.set(L.topX, L.y1, L.topZ); notify('Tu es en haut de la tour.'); G.emit('climbTop', L); }
    else if (pl.pos.y <= L.y0) { pl.climb = null; pl.pos.y = L.y0; }
    if (tap('Space')) { pl.climb = null; pl.vy = 2; pl.pos.addScaledVector(V(Math.sin(L.face), 0, Math.cos(L.face)), -0.6); }
    pl.speed = 0; return;
  }
  for (const L of W.ladders) { if (Math.hypot(pl.pos.x - L.x, pl.pos.z - L.z) < 0.8 && pl.pos.y < L.y0 + 1 && iz > 0.5 && Math.abs(angDiff(cam.yaw, L.face + Math.PI)) < 1.2) { pl.climb = L; pl.pos.y += 0.05; if (pl.actor.swordDrawn) { pl.actor.sheathe(true); } } }

  /* défense : garde et parade (touche F) */
  const blockKey = canMove && (k.KeyF);
  if (blockKey && !pl.blockHeld) pl.parryT = 0;
  pl.blockHeld = blockKey && !pl.action && pl.downT <= 0 && pl.hurtT <= 0;
  pl.block = damp(pl.block, pl.blockHeld ? 1 : 0, 18, dt);
  if (pl.blockHeld && !pl.actor.swordDrawn) { pl.actor.sheathe(false); S.draw(); }

  /* attaques */
  if (canMove && pl.downT <= 0 && pl.hurtT <= 0 && !pl.inWater) {
    const atk = tap('LMB'), hv = tap('RMB');
    if (atk || hv) G.combatT = Math.max(G.combatT, 3);
    if (pl.action) {
      const mv = MOVES[pl.action.move];
      /* un clic trop tôt est gardé en mémoire : l'enchaînement part dès que la fenêtre s'ouvre */
      if (atk && mv.next) pl.atkBuf = Math.min(3, (pl.atkBuf || 0) + 1);
      if (pl.atkBuf > 0 && pl.action.t > mv.dur * 0.35 && mv.next && !pl.action.queued) { let nx = mv.next; if (nx === 'l4' && !pl.skills.quatrieme) nx = null; if (nx) pl.action.queued = nx; pl.atkBuf--; }
    } else if (pl.dashT <= 0 && !pl.blockHeld) {
      if (atk) { pl.atkBuf = 0; pl.start('l1'); faceTarget(pl); }
      else if (hv) { pl.start('heavy'); faceTarget(pl); }
    }
    if (tap('KeyQ')) {
      if (!pl.special) notify('Technique pas encore apprise : Maître Hana te l\'enseignera.');
      else if (pl.en < 50) notify('Il faut 50 d\'énergie pour la technique.');
      else if (!pl.action) { pl.en -= 50; pl.start('special'); faceTarget(pl); S.special(); G.emit('technique', 'special'); }
    }
    if (tap('KeyR')) {
      if (!pl.ult) notify('Technique ultime verrouillée : elle s\'obtient à l\'épreuve du dojo.');
      else if (pl.en < 100) notify('L\'ultime demande 100 d\'énergie.');
      else if (!pl.action) ultimate();
    }
  } else { tap('LMB'); tap('RMB'); }

  /* esquive (ESPACE en combat) ou saut */
  const space = canMove && tap('Space');
  if (space && !pl.inWater) {
    if ((G.combatT > 0 || pl.lock) && pl.dashCD <= 0 && !pl.action && pl.downT <= 0) {
      pl.dashT = 0.42; pl.inv = pl.skills.vent ? 0.42 : 0.32; pl.dashCD = pl.skills.vent ? 0.45 : 0.7;
      pl.dashDir = il > 0.1 ? want.clone().normalize() : pl.facing().multiplyScalar(-1); S.dash();
      for (const e of G.enemies) if (e.action && !e.dead && e.pos.distanceTo(pl.pos) < 3.2) { const mv = MOVES[e.action.move], u = e.action.t / mv.dur; if (u > mv.act[0] - 0.25 && u < mv.act[1]) { slowmo(0.3, 0.5); notify('Esquive parfaite', 'gold'); pl.en = Math.min(100, pl.en + 12); } }
    } else if (pl.onGround && !pl.action && pl.downT <= 0) { pl.vy = 7.2; pl.onGround = false; S.jump(); }
  }

  /* déplacement */
  const stance = (G.combatT > 0 || pl.lock || pl.blockHeld) && pl.actor.swordDrawn;
  let spd = (stance ? 3.3 : (k.ShiftLeft || k.ShiftRight ? 7.6 : 4.7)) * speedMul(pl);
  if (pl.inWater) spd = (k.ShiftLeft || k.ShiftRight ? 3.9 : 2.7) * speedMul(pl);
  else if (k.AltLeft) spd = 1.8;
  if (pl.blockHeld) spd *= 0.45;
  const tv = want.clone().multiplyScalar(spd * (canMove ? 1 : 0));
  if (pl.action) { const mv = MOVES[pl.action.move], u = pl.action.t / mv.dur; tv.set(0, 0, 0);
    if (u < 0.55) { let lg = mv.lunge * (1 - u / 0.55) * 1.6; const tg = pl.lock || nearestEnemy(pl, 2.2) || dummies().find(d => d.pos.distanceTo(pl.pos) < 1.6); if (tg && tg.pos.distanceTo(pl.pos) < 1.6) lg *= 0.1; tv.addScaledVector(pl.facing(), lg); } }
  if (pl.dashT > 0) tv.copy(pl.dashDir).multiplyScalar(11 * (pl.dashT / 0.42) + 2);
  if (pl.hurtT > 0 || pl.downT > 0) tv.copy(pl.vel).multiplyScalar(0.9);
  const acc = pl.inWater ? 5 : (pl.onGround ? (pl.action || pl.dashT > 0 ? 30 : 11) : 3);
  pl.vel.x = damp(pl.vel.x, tv.x, acc, dt); pl.vel.z = damp(pl.vel.z, tv.z, acc, dt);
  moveBody(pl, pl.vel.x * dt, pl.vel.z * dt);
  for (const e of G.enemies) if (!e.dead) sep(pl, e, 0.8); for (const n of G.npcs) if (n.actor.root.visible) sep(pl, n, 0.7, true);
  collide(pl.pos, pl.radius, pl.pos.y);
  const r = Math.hypot(pl.pos.x, pl.pos.z); if (r > 880) { pl.pos.x *= 880 / r; pl.pos.z *= 880 / r; if (!pl.edgeT || performance.now() - pl.edgeT > 8000) { pl.edgeT = performance.now(); notify('Les remparts du monde se perdent dans la brume. Les dix vallées sont devant toi.', 'place'); } }
  if (pl.inWater) {
    const g = groundAt(pl.pos.x, pl.pos.z, pl.pos.y + 3);
    const dive = k.ControlLeft || k.ControlRight || k.KeyC;
    if (dive) pl.vy = damp(pl.vy, -3.6, 7, dt);
    else if (k.Space) pl.vy = damp(pl.vy, 3.4, 9, dt);
    else pl.vy = damp(pl.vy, (wy - 1.25 - pl.pos.y) * 4.5, 6, dt);
    pl.pos.y += pl.vy * dt;
    if (pl.pos.y < g.h + 0.05) { pl.pos.y = g.h + 0.05; pl.vy = 0; }
    if (pl.pos.y > wy - 0.5) { pl.pos.y = wy - 0.5; if (pl.vy > 0) pl.vy = 0; }
    pl.surf = 'eau'; pl.onGround = false; pl.landT = 0;
  } else pl.ground(dt);
  /* apnée */
  const headY = pl.pos.y + 1.5;
  pl.submerged = wy !== null && headY < wy - 0.02 && pl.inWater;
  if (pl.submerged) {
    pl.oxygen = Math.max(0, pl.oxygen - dt * (k.ShiftLeft ? 5.0 : 3.0));
    if (pl.oxygen <= 0) { pl.hp -= dt * 15; if (pl.hp <= 0 && !pl.dead) { pl.hp = 0; G.emit('playerDown'); }
      if (!pl.drownT || performance.now() - pl.drownT > 4500) { pl.drownT = performance.now(); notify('Tu n\'as plus d\'air ! Remonte à la surface !', 'warn'); S.bubble(); } }
  } else pl.oxygen = Math.min(100, pl.oxygen + dt * 22);
  W.underwater = !!pl.submerged;
  pl.speed = Math.hypot(pl.vel.x, pl.vel.z);
  /* orientation */
  if (pl.lock && !pl.dashT) pl.yaw = dampAngle(pl.yaw, Math.atan2(pl.lock.pos.x - pl.pos.x, pl.lock.pos.z - pl.pos.z), 14, dt);
  else if (!pl.action && il > 0.1 && pl.downT <= 0) pl.yaw = dampAngle(pl.yaw, Math.atan2(want.x, want.z), stance ? 10 : 12, dt);
  /* pas */
  if (pl.onGround && pl.speed > 0.6) { pl.stepPh += pl.speed * dt * 0.62; if (pl.stepPh > 1) { pl.stepPh = 0; S.step(pl.surf, pl.speed > 5); if (pl.surf === 'eau') sparks(pl.pos.clone().setY(pl.waterY + 0.05), 4, '#cfe4ea', 2); } }
  /* rengainer au calme */
  if (pl.actor.swordDrawn && !stance && !pl.action && G.combatT < -3 && !pl.blockHeld) { pl.actor.sheathe(true); S.sheathe(); }
  /* énergie */
  pl.en = Math.min(100 * enMul(pl), pl.en + dt * 0.8 * enMul(pl));
  stepAction(pl, dt);
}
function faceTarget(f) { const t = f.isPlayer ? (f.lock || nearestEnemy(f, 4)) : null; if (t) f.yaw = Math.atan2(t.pos.x - f.pos.x, t.pos.z - f.pos.z); else if (f.isPlayer) { const cy = G.cam.yaw; const k = G.keys; if (k.KeyW || k.KeyS || k.KeyA || k.KeyD || k.ArrowUp) { /* garde l'orientation de marche */ } } }
function nearestEnemy(f, max) { let b = null, bd = max; for (const e of G.enemies) { if (e.dead) continue; const d = e.pos.distanceTo(f.pos); if (d < bd) { bd = d; b = e; } } return b; }
function sep(a, b, d, soft) { const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, l = Math.hypot(dx, dz); if (l < d && l > 1e-4) { const p = (d - l) / (soft ? 1 : 2); a.pos.x += dx / l * p; a.pos.z += dz / l * p; if (!soft) { b.pos.x -= dx / l * p; b.pos.z -= dz / l * p; } } }

/* avance d'une attaque, fenêtre de coup, enchaînement */
function stepAction(f, dt) {
  if (!f.action) return;
  const a = f.action, mv = MOVES[a.move]; a.t += dt;
  const u = a.t / mv.dur;
  if (u >= mv.act[0] && u <= mv.act[1]) {
    if (mv.multi) { a.multiT -= dt; if (a.multiT <= 0) { a.multiT = (mv.act[1] - mv.act[0]) * mv.dur / mv.multi; a.hit.clear(); sparks(f.actor.tipWorld(V()), 6, '#f6c6d3', 3); } }
    const targets = f.isPlayer ? G.enemies.concat((G.training || G.inDojo) ? dummies() : []) : [G.pl];
    for (const t of targets) {
      if (a.hit.has(t) || t.dead) continue;
      const dx = t.pos.x - f.pos.x, dz = t.pos.z - f.pos.z, d = Math.hypot(dx, dz);
      if (d > mv.range + (t.radius || 0.4)) continue;
      const ang = Math.abs(angDiff(f.yaw, Math.atan2(dx, dz))); if (ang > mv.arc / 2 + 0.25) continue;
      if (Math.abs(t.pos.y - f.pos.y) > 1.6) continue;
      a.hit.add(t); applyHit(f, t, mv, a.move);
    }
  }
  if (a.t >= mv.dur * (a.queued ? 0.78 : 1)) {
    const q = a.queued; f.action = null;
    if (q) { f.start(q); if (f.isPlayer) faceTarget(f); }
  }
}
export function dummies() { return W.dummyFighters || []; }

export function applyHit(att, tgt, mv, moveName) {
  if (tgt.isDummy) { tgt.shake = 0.35; tgt.hits++; S.hit(0.7); sparks(V(tgt.pos.x, tgt.pos.y + 1.6, tgt.pos.z), 10, '#e8d2a8', 4); G.emit('dummyHit', { d: tgt, move: moveName }); hitstop(0.05); return; }
  if (tgt.inv > 0) return;
  const facingAtt = Math.abs(angDiff(tgt.yaw, Math.atan2(att.pos.x - tgt.pos.x, att.pos.z - tgt.pos.z))) < 1.3;
  const hp = tgt.isPlayer ? null : tgt;
  if (tgt.block > 0.5 && facingAtt && !mv.unblockable && !tgt.busyAttack) {
    const pw = tgt.isPlayer ? (G.pl.skills.garde ? 0.24 : 0.19) : 0.2;
    if (tgt.parryT < pw) {
      /* parade : l'attaquant est ouvert, le temps ralentit */
      att.action = null; att.stagger = 1.1; att.hurtT = 0.9; att.vel.copy(att.facing()).multiplyScalar(-4);
      S.parry(); sparks(att.actor.tipWorld(V()), 34, '#fff1c8', 9); ring(att.actor.tipWorld(V()), '#fff3d6', 1.2); hitstop(0.12); slowmo(0.25, 0.55); shake(0.25);
      if (tgt.isPlayer) { G.pl.en = Math.min(100, G.pl.en + 20); G.pl.counter = 1.2; notify('PARADE', 'gold'); G.emit('parry', att); }
      return;
    }
    const chip = mv.dmg * (tgt.isPlayer && G.pl.skills.garde ? 0.08 : 0.15);
    tgt.hp = Math.max(1, tgt.hp - chip); tgt.vel.copy(att.facing()).multiplyScalar(mv.push * 0.5); S.clang(); sparks(tgt.actor.tipWorld(V()), 14, '#ffe2b0', 6); hitstop(0.05); shake(0.08);
    if (tgt.isPlayer) G.pl.en = Math.min(100, G.pl.en + 4);
    return;
  }
  let dmg = mv.dmg;
  if (att.isPlayer) { dmg *= dmgMul(att); if (att.counter > 0) { dmg *= 2; att.counter = 0; notify('CONTRE-ATTAQUE', 'gold'); } att.combo = att.comboT > 0 ? att.combo + 1 : 1; att.comboT = 2; att.en = Math.min(100, att.en + (att.skills.souffle ? 9 : 7)); }
  if (tgt.isPlayer && tgt.buffs && tgt.buffs.god > 0) { notify('Bénédiction des kamis', 'gold'); return; }
  if (tgt.isPlayer && G.training) dmg *= 0.5;
  tgt.hp -= dmg; tgt.action = null; tgt.blockHeld = false;
  const kb = att.facing();
  tgt.vel.copy(kb).multiplyScalar(mv.push * 1.5);
  if (mv.heavy || moveName === 'l3' || moveName === 'l4' || moveName === 'special' || tgt.hp <= 0) { tgt.downT = tgt.hp <= 0 ? 99 : (mv.heavy || moveName === 'special' ? 1.4 : 0); tgt.hurtT = 0.45; }
  else tgt.hurtT = 0.32;
  const hp2 = V(tgt.pos.x, tgt.pos.y + 1.2, tgt.pos.z);
  S.hit(mv.heavy ? 1.3 : 1); sparks(hp2, mv.heavy ? 26 : 14, '#ffffff', mv.heavy ? 8 : 6); ring(hp2, '#ffffff', mv.heavy ? 1.4 : 0.8);
  hitstop(mv.heavy ? 0.12 : 0.07); shake(mv.heavy ? 0.35 : 0.14);
  if (tgt.isPlayer) { G.emit('playerHit', dmg); if (tgt.hp <= 0) G.emit('playerDown'); }
  else { tgt.aggro = true; if (tgt.hp <= 0) killEnemy(tgt, att); }
}
function hitstop(t) { G.hitstop = Math.max(G.hitstop, t); }

/* technique ultime : temps suspendu, la caméra tourne, l'ombre frappe tout autour */
function ultimate() {
  const pl = G.pl; pl.en = 0; S.ult(); G.emit('ultimate');
  const targets = G.enemies.filter(e => !e.dead && e.pos.distanceTo(pl.pos) < 10);
  G.ult = { t: 0, dur: 2.6, targets, done: false };
  slowmo(0.08, 1.6); pl.inv = 3; pl.start('l4');
}
function ultUpdate(rdt) {
  const u = G.ult; if (!u) return; u.t += rdt;
  if (!u.done && u.t > 1.3) { u.done = true; slowmo(1, 0); for (const e of u.targets) { if (e.dead) continue; applyHit(G.pl, e, { dmg: 70, push: 6, heavy: true }, 'ult'); sparks(V(e.pos.x, e.pos.y + 1.2, e.pos.z), 40, '#ffffff', 10); } shake(0.6); S.gong(); }
  if (u.t > u.dur) G.ult = null;
}

/* ============================ ENNEMIS ============================ */
const TYPES = {
  ronin: { name: 'Rônin', hp: 70, speed: 3.6, block: 0.3, moves: ['e1', 'e1', 'l2'], look: { outfit: 'cendre', hair: 'chignon', kasa: true, mask: true, scarf: false, chains: false, hairColor: '#1a1612' }, xp: 30, ryo: [8, 16] },
  brute: { name: 'Rônin colosse', hp: 140, speed: 2.7, block: 0.15, moves: ['e2', 'e1'], scale: 1.16, look: { outfit: 'foret', hair: 'court', kasa: true, mask: false, scarf: false, chains: false, beard: true }, xp: 55, ryo: [18, 30] },
  scout: { name: 'Éclaireur', hp: 50, speed: 4.6, block: 0.2, dodge: 0.35, moves: ['e1', 'l1'], look: { outfit: 'encre', hair: 'capuche', mask: true, scarf: true, chains: false }, xp: 25, ryo: [6, 12] },
  akira: { name: 'Akira', hp: 190, speed: 4.0, block: 0.45, dodge: 0.2, moves: ['l1', 'l2', 'l3', 'heavy'], combo: true, look: { outfit: 'indigo', hair: 'queue', band: true, scarf: false, chains: true, hairColor: '#1b1a1e' }, xp: 120, ryo: [0, 0], nonLethal: true },
  sparring: { name: 'Partenaire d\'entraînement', hp: 120, speed: 3.4, block: 0.35, moves: ['e1', 'l2'], look: { outfit: 'sakura', hair: 'court', band: true, scarf: false, chains: false }, xp: 0, ryo: [0, 0], nonLethal: true },
  oni: { name: 'Oni', hp: 320, speed: 3.2, block: 0.22, moves: ['e2', 'heavy'], scale: 1.45, look: { outfit: 'kuro', hair: 'court', horns: true, beard: true, mask: false, chains: false }, xp: 130, ryo: [45, 80] },
};
export function spawnEnemy(type, x, z, opts = {}) {
  const T0 = TYPES[type]; const actor = new Actor(G.scene, Object.assign({ scale: T0.scale || 1 }, T0.look, opts.look || {}));
  const e = new Fighter(actor, x, z); Object.assign(e, { type, T: T0, hpMax: T0.hp, hp: T0.hp, aggro: !!opts.aggro, token: false, ai: { t: rr(0.5, 1.5), orbit: R() < 0.5 ? 1 : -1, tele: 0, next: null, blockT: 0 }, name: opts.name || T0.name, tag: opts.tag, nonLethal: T0.nonLethal || opts.nonLethal, yaw: R() * 6 });
  if (opts.hp) { e.hpMax = opts.hp; e.hp = opts.hp; }
  if (opts.aggro) actor.sheathe(false);
  G.enemies.push(e); return e;
}
/* champion d'un dojo : un maître, non létal, qui cède quand sa vie tombe à zéro */
export function spawnBoss(reg, tag = 'boss', x, z) {
  const b = reg.boss, pos = reg.place(x ?? 0, z ?? 0), gy = groundAt(pos.x, pos.z).h;
  const actor = new Actor(G.scene, Object.assign({ scale: 1 }, reg.bossLook));
  const e = new Fighter(actor, pos.x, pos.z); e.pos.y = gy;
  Object.assign(e, { type: 'boss', T: { name: reg.master, hp: b.hp, xp: b.xp, ryo: b.ryo, block: b.block, dodge: b.dodge, speed: b.speed, moves: b.moves, scale: b.scale, combo: true, nonLethal: true },
    hpMax: b.hp, hp: b.hp, aggro: true, token: true, name: reg.master, tag, nonLethal: true, boss: reg.id, yaw: reg.rot + Math.PI,
    ai: { t: 1.2, orbit: 1, tele: 0, next: null, blockT: 0 } });
  actor.sheathe(false); G.enemies.push(e); return e;
}
/* hommes de main d'une vallée : même école, même couleur */
export function spawnRegionFoe(reg, x, z, tag = 'trial') {
  const type = ['ronin', 'scout', 'brute'][Math.floor(R() * 3)];
  const look = { outfit: reg.masterLook.outfit, hair: R() < 0.5 ? 'court' : 'chignon', band: false, mask: true, scarf: false, chains: false, sword: true };
  return spawnEnemy(type, x, z, { tag, aggro: true, look });
}
export function clearEnemies(tag) { for (const e of G.enemies.slice()) if (!tag || e.tag === tag) { e.actor.dispose(); G.enemies.splice(G.enemies.indexOf(e), 1); } }
export function clearAllFoes() { clearEnemies(); }
function killEnemy(e, by) {
  if (e.nonLethal) { e.hp = 1; e.dead = true; e.yielded = true; e.downT = 0; e.action = null; e.ko = true; G.emit('yield', e); return; }
  e.dead = true; e.deadT = 0; if (G.pl.lock === e) G.pl.lock = null;
  G.emit('enemyDown', e);
}
function enemyUpdate(e, dt) {
  const pl = G.pl, a = e.ai;
  for (const t of ['hurtT', 'dashT', 'landT', 'inv', 'stagger']) e[t] = Math.max(0, e[t] - dt);
  if (e.downT > 0 && e.downT < 50) e.downT = Math.max(0, e.downT - dt);
  e.parryT += dt;
  if (e.dead) { e.deadT = (e.deadT || 0) + dt; e.vel.multiplyScalar(0.9); e.pos.addScaledVector(e.vel, dt); e.ground(dt); return; }
  const dx = pl.pos.x - e.pos.x, dz = pl.pos.z - e.pos.z, d = Math.hypot(dx, dz), toP = Math.atan2(dx, dz);
  if (e.type === 'boss' && !e.phase2 && e.hp < e.hpMax * 0.45) { e.phase2 = true; e.T.speed *= 1.18; e.stagger = 0; e.emotion = 'colere'; ring(V(e.pos.x, e.pos.y + 1.2, e.pos.z), '#ffffff', 2.2); sparks(V(e.pos.x, e.pos.y + 1.2, e.pos.z), 40, '#e8e4da', 8); S.gong(); notify(e.name + ' change de stance !', 'gold'); }
  if (!e.aggro && d < (e.type === 'akira' || e.type === 'sparring' || e.type === 'boss' ? 30 : 15) && G.mode === 'play') { e.aggro = true; e.actor.sheathe(false); S.draw(); G.emit('aggro', e); }
  const tv = V();
  if (e.aggro && !e.busy() && e.stagger <= 0 && G.mode === 'play' && !pl.dead) {
    /* au plus deux assaillants à la fois */
    const holders = G.enemies.filter(o => o.token && !o.dead);
    if (!e.token && holders.length < 2 && a.t <= 0) e.token = true;
    a.t -= dt; e.yaw = dampAngle(e.yaw, toP, 8, dt);
    /* réaction aux attaques du joueur : garde ou esquive */
    if (pl.action && d < 3.4 && a.blockT <= 0 && !a.tele) {
      const mvp = MOVES[pl.action.move], u = pl.action.t / mvp.dur;
      if (u < mvp.act[0] && !a.reacted) { a.reacted = true; const r = R();
        if (r < e.T.block) { a.blockT = 0.7; e.parryT = r < e.T.block * 0.35 ? 0 : 9; }
        else if (e.T.dodge && r < e.T.block + e.T.dodge) { e.dashT = 0.4; e.inv = 0.3; e.dashDir = V(-Math.sin(toP), 0, -Math.cos(toP)).applyAxisAngle(V(0, 1, 0), rr(-0.8, 0.8)); S.dash(); } }
    }
    if (!pl.action) a.reacted = false;
    if (a.blockT > 0) { a.blockT -= dt; e.blockHeld = true; e.block = damp(e.block, 1, 20, dt); }
    else { e.blockHeld = false; e.block = damp(e.block, 0, 12, dt); }
    if (a.tele > 0) {
      a.tele -= dt; if (a.tele <= 0) { e.start(a.next); e.busyAttack = true; a.next = null; }
    } else if (e.token) {
      const reach = 2.0;
      if (d > reach) tv.set(Math.sin(toP), 0, Math.cos(toP)).multiplyScalar(e.T.speed);
      else if (a.blockT <= 0) { a.next = e.T.moves[Math.floor(R() * e.T.moves.length)]; a.tele = MOVES[a.next].unblockable ? 0.55 : rr(0.25, 0.45); e.glint = 0.5; }
    } else {
      /* tourne autour à distance, cherche une ouverture */
      const ring = e.type === 'akira' || e.type === 'sparring' ? 3.2 : 4.8, side = V(Math.cos(toP), 0, -Math.sin(toP)).multiplyScalar(a.orbit * 1.6);
      tv.copy(side); if (d > ring + 0.5) tv.addScaledVector(V(Math.sin(toP), 0, Math.cos(toP)), e.T.speed * 0.7); else if (d < ring - 0.7) tv.addScaledVector(V(Math.sin(toP), 0, Math.cos(toP)), -2);
      if (R() < dt * 0.4) a.orbit *= -1;
    }
  }
  if (e.action && !MOVES[e.action.move]) e.action = null;
  if (e.action) { const mv = MOVES[e.action.move], u = e.action.t / mv.dur; if (u < 0.55) tv.addScaledVector(e.facing(), mv.lunge * (1 - u / 0.55) * 1.4 * (d < 1.4 ? 0.1 : 1)); }
  else if (e.busyAttack) { e.busyAttack = false; e.token = e.T.combo ? R() < 0.6 : false; a.t = rr(0.6, 1.6); }
  if (e.T.combo && e.action && !e.action.queued) { const mv = MOVES[e.action.move]; if (mv.next && e.action.t > mv.dur * 0.4 && R() < 0.55 && MOVES[mv.next] && mv.next !== 'l4') e.action.queued = mv.next; }
  if (e.dashT > 0) tv.copy(e.dashDir).multiplyScalar(9);
  if (e.hurtT > 0 || e.downT > 0) tv.copy(e.vel).multiplyScalar(0.88);
  e.vel.x = damp(e.vel.x, tv.x, e.action ? 30 : 9, dt); e.vel.z = damp(e.vel.z, tv.z, e.action ? 30 : 9, dt);
  moveBody(e, e.vel.x * dt, e.vel.z * dt);
  for (const o of G.enemies) if (o !== e && !o.dead) sep(e, o, 1.0);
  collide(e.pos, e.radius, e.pos.y);
  e.ground(dt); e.speed = Math.hypot(e.vel.x, e.vel.z);
  if (e.glint > 0) e.glint -= dt;
  stepAction(e, dt);
}

/* ============================ HABITANTS ============================ */
export function spawnNPC(def) {
  const actor = new Actor(G.scene, Object.assign({ chains: false, sword: false, scarf: false }, def.look));
  const n = { uid: (def.id || 'npc') + '#' + G.npcs.length, def, actor, pos: V(def.x, groundAt(def.x, def.z).h, def.z), yaw: def.yaw || 0, path: def.path || null, pi: 0, wait: rr(0, 3), speed: 0, bubbleT: 0, home: def.home || null, visible: true, name: def.name, talkable: def.talkable !== false };
  actor.root.position.copy(n.pos); G.npcs.push(n); return n;
}
function npcUpdate(n, dt, hour) {
  const def = n.def, pl = G.pl;
  const away = !n.script && (def.night && (hour > 21.5 || hour < 5.5) || (def.rain && W.weather.rain > 0.6));
  n.away = away;
  if (n.script) { n.script(n, dt); }
  else {
    if (!away && n.path && !n.hold) {
      const tgt = n.path[n.pi], dx = tgt[0] - n.pos.x, dz = tgt[1] - n.pos.z, d = Math.hypot(dx, dz);
      if (n.wait > 0) { n.wait -= dt; n.speed = damp(n.speed, 0, 6, dt); }
      else if (d < 0.4) { n.pi = (n.pi + 1) % n.path.length; n.wait = tgt[2] ?? rr(1, 5); }
      else { n.speed = damp(n.speed, def.speed || 1.3, 4, dt); n.yaw = dampAngle(n.yaw, Math.atan2(dx, dz), 5, dt); n.pos.x += Math.sin(n.yaw) * n.speed * dt; n.pos.z += Math.cos(n.yaw) * n.speed * dt; collide(n.pos, 0.3, n.pos.y); }
    } else n.speed = damp(n.speed, 0, 6, dt);
  }
  if (!n.noGround) n.pos.y = groundAt(n.pos.x, n.pos.z, n.pos.y + 0.5).h;
  const dp = n.pos.distanceTo(pl.pos);
  n.actor.root.visible = !n.hidden && !away && (dp < 95 || G.mode === 'cutscene' || G.mode === 'title');
  if (G.mode === 'play' && dp > 95 && !n.script) { n.bubbleT -= dt; n.actor.root.position.copy(n.pos); return; }
  n.actor.lookAt = dp < 4.5 && n.actor.root.visible ? V(pl.pos.x, pl.pos.y + 1.5, pl.pos.z) : (n.lookTarget || null);
  if (dp < 3.2 && n.bubbleT <= 0 && def.barks && G.mode === 'play' && n.actor.root.visible) { n.bubbleT = rr(18, 30); G.emit('bubble', { n, text: def.barks[Math.floor(R() * def.barks.length)] }); }
  n.bubbleT -= dt;
  n.actor.root.position.copy(n.pos); n.actor.root.rotation.y = n.yaw;
  n.actor.lod(G.camera.position.distanceTo(n.pos));
  if (dp < 60) n.actor.animate(dt, { speed: n.speed, stance: n.stance || 'free', special: n.speed < 0.1 ? (n.activity || def.activity) : null, action: n.action || null, ko: n.ko });
}

/* ============================ CAMÉRA ============================ */
export function initCamera(camera) {
  G.camera = camera; G.cam = { yaw: Math.PI, pitch: 0.22, dist: 4.4, want: 4.4, tgt: V(), shake: 0, fov: 60, pos: V() };
}
function cameraUpdate(dt) {
  const c = G.cam, pl = G.pl, cam = G.camera;
  if (G.camOverride) {
    const o = G.camOverride; cam.position.copy(o.pos); cam.lookAt(o.look); cam.fov = damp(cam.fov, o.fov || 50, 6, dt); cam.updateProjectionMatrix(); return;
  }
  if (pl.lock) { const ty = Math.atan2(pl.lock.pos.x - pl.pos.x, pl.lock.pos.z - pl.pos.z) - 0.25; c.yaw = dampAngle(c.yaw, ty, 4, dt); c.pitch = damp(c.pitch, 0.2, 3, dt); }
  else if (G.combatT > 0 && !G.locked) { /* rien : la souris garde la main */ }
  const inDojo = G.inDojo;
  const want = G.ult ? 5.6 : (pl.lock ? Math.max(4.6, Math.min(7, 3.6 + pl.lock.pos.distanceTo(pl.pos) * 0.5)) : (G.combatT > 0 ? 5.0 : c.want)) * (inDojo ? 0.85 : 1);
  c.dist = damp(c.dist, want, 4, dt);
  c.tgt.x = damp(c.tgt.x, pl.pos.x, 14, dt); c.tgt.z = damp(c.tgt.z, pl.pos.z, 14, dt); c.tgt.y = damp(c.tgt.y, pl.pos.y + 1.55 + (pl.climb ? 0.3 : 0), 9, dt);
  let yaw = c.yaw, pitch = c.pitch;
  if (G.ult) { yaw += G.ult.t * 1.9; pitch = 0.12; }
  const dir = V(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const side = V(-Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(-0.45);
  const head = c.tgt.clone().add(side);
  const blocked = camBlock(head, head.clone().addScaledVector(dir, c.dist));
  const dd = Math.max(0.6, Math.min(c.dist, blocked - 0.3));
  c.pos.copy(head).addScaledVector(dir, dd);
  const gy = terrainH(c.pos.x, c.pos.z) + 0.4; if (c.pos.y < gy) c.pos.y = gy;
  if (c.shake > 0) { c.shake = Math.max(0, c.shake - dt * 1.6); const s = c.shake * c.shake * 0.4; c.pos.x += (R() - 0.5) * s; c.pos.y += (R() - 0.5) * s; c.pos.z += (R() - 0.5) * s; }
  cam.position.copy(c.pos); cam.lookAt(head.x, head.y - 0.1, head.z);
  cam.fov = damp(cam.fov, G.ult ? 42 : (G.slow.t > 0 ? 54 : (pl.speed > 6.5 ? 66 : 60)), 5, dt); cam.updateProjectionMatrix();
}

/* ============================ BOUCLE DU JEU ============================ */
export function gameUpdate(rdt) {
  let dt = rdt;
  if (G.slow.t > 0) { G.slow.t -= rdt; dt *= G.slow.scale; } else G.slow.scale = 1;
  const frozen = G.hitstop > 0; if (frozen) G.hitstop -= rdt;
  ultUpdate(rdt);
  const pl = G.pl;
  const D = W.dojo; G.inDojo = pl.pos.x > D.x0 && pl.pos.x < D.x1 && pl.pos.z > D.z0 && pl.pos.z < D.z1 && pl.pos.y > D.y - 0.5;
  let inRegion = null;
  for (const id in W.regionDojos) { const dj = W.regionDojos[id]; if (Math.hypot(pl.pos.x - dj.x, pl.pos.z - dj.z) < dj.r && Math.abs(pl.pos.y - dj.y) < 8) { G.inDojo = true; } if (Math.hypot(pl.pos.x - dj.reg.x, pl.pos.z - dj.reg.z) < dj.reg.r) inRegion = dj.reg; }
  G.region = inRegion;
  if (inRegion && G.zone !== inRegion.id) { G.zone = inRegion.id; G.emit('region', inRegion); }
  const fdt = frozen ? 0 : dt;
  if (G.mode === 'play' || G.mode === 'cutscene' || G.mode === 'dialog') {
    if (G.mode === 'play') playerUpdate(fdt, rdt); else { pl.vel.multiplyScalar(0.8); pl.speed = pl.autoWalk ? pl.autoWalk : 0; if (pl.autoWalk) { pl.pos.addScaledVector(pl.facing(), pl.autoWalk * rdt); pl.ground(rdt); } else pl.ground(rdt); stepAction(pl, fdt); }
    for (const e of G.enemies) enemyUpdate(e, fdt);
    for (let i = G.enemies.length - 1; i >= 0; i--) { const e = G.enemies[i]; if (e.dead && !e.nonLethal && e.deadT > 4) { e.actor.dispose(); G.enemies.splice(i, 1); } }
  }
  /* actualisation des modèles */
  const act = (f, extra = {}) => {
    f.actor.root.position.copy(f.pos); f.actor.root.rotation.y = f.yaw;
    f.actor.emotion = f.action || f.blockHeld ? 'colere' : (f.hurtT > 0 ? 'surprise' : (f.emotion || 'neutre'));
          f.actor.animate(fdt, Object.assign({ speed: f.speed, stance: f.actor.swordDrawn && (f.isPlayer ? (G.combatT > 0 || f.lock || f.blockHeld) : f.aggro) ? 'guard' : 'free', air: !f.onGround, vy: f.vy, landT: f.landT, action: f.action, dashT: f.dashT, hurtT: f.hurtT, downT: f.downT > 0 && f.downT < 99 ? Math.min(f.downT, 1) : (f.dead && !f.nonLethal ? 1 : 0), block: f.block, ko: f.ko, climb: !!f.climb, climbPh: f.climbPh, swim: f.inWater ? clamp((f.waterY - f.pos.y) / 0.9, 0.25, 1) : 0, special: f.special2 || null }, extra));
  };
  act(pl, { special: pl.pose || null });
  for (const e of G.enemies) { const de = e.pos.distanceTo(pl.pos); e.actor.lod(G.camera.position.distanceTo(e.pos)); if (de < 70) act(e); }
  pl.actor.lod(0);
  const hour = W.time;
  for (const n of G.npcs) npcUpdate(n, fdt, hour);
  for (const c of G.cats) c.update(fdt, (x, z) => groundAt(x, z).h, c.home);
  /* makiwara qui tremblent */
  for (const d of dummies()) { d.shake = Math.max(0, d.shake - rdt); if (d.mesh) d.mesh.rotation.z = Math.sin(d.shake * 40) * d.shake * 0.5; }
  cameraUpdate(rdt);
  const wind = V(W.wind * 3, 0, W.wind * 1.5);
  pl.actor.cloth(rdt, wind); for (const e of G.enemies) if (e.actor.chains.length && e.pos.distanceTo(pl.pos) < 40) e.actor.cloth(rdt, wind);
  for (const n of G.npcs) if (n.actor.chains.length && n.actor.root.visible) n.actor.cloth(rdt, wind);
  updateFx(rdt);
  /* portes du dojo */
  for (const d of W.doors) {
    const near = Math.hypot(pl.pos.x - d.x, pl.pos.z - d.z) < 7; d.open = damp(d.open, near ? 1 : 0, 4, rdt);
    if (d.panels) d.panels.forEach((p) => { const u = p.userData; if (u.ax !== undefined) { p.position.x = u.ax + u.dx * d.open; p.position.z = u.az + u.dz * d.open; } else { p.position.x = u.x0 + u.dx * d.open; } });
    if (d.col) d.col.y1 = d.open > 0.6 ? d.col.y0 - 1 : d.col.y0 + 6;
  }
  return dt;
}
