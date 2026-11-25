/* KAGE: REBIRTH — histoire complète : dix dojos, quêtes, duels, boutiques, cinématiques, sauvegarde */
import * as THREE from 'three';
import { W, groundAt, terrainH, MAP } from './world.js';
import { G, spawnNPC, spawnEnemy, spawnBoss, spawnRegionFoe, clearEnemies, notify, slowmo, setLook, hpMaxOf, setCharacter, tap, clearTaps, sparks, ring } from './game.js';
import { Actor, MOVES, Cat, OUTFITS } from './actor.js';
import { S, music } from './audio.js';
import { REGIONS, regionOf, CHARS, GEAR, sealsCount, MAP_SIZE } from './regions.js';
import { clamp, lerp, easeInOut, rr, R, T } from './util.js';

const FOGN = 64;
export const ST = {
  quests: {}, main: 'main1', disc: {}, scrolls: {}, flags: {}, fog: new Uint8Array(FOGN * FOGN), dialog: null, cut: null, unlocks: {},
  rest: { x: 0, z: -72 }, counts: { maki: new Set(), parry: 0, kills: {} }, track: 'main1', seals: {}, chars: { sora: true }, relics: {}, braziers: {}, bowed: {}, altars: {}, ended: false,
};
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const NPC = {};
const npcPos = (id) => () => NPC[id] ? { x: NPC[id].pos.x, z: NPC[id].pos.z } : null;

/* ============================ QUÊTES ============================ */
export const QUESTS = {
  main1: { title: "Chapitre 1 — L'appel du dojo", kind: 'Principale', steps: [
    { text: 'Franchis le grand torii et entre dans le village.', target: () => ({ x: 0, z: 30 }), check: () => G.pl.pos.z < 62 },
    { text: "Parle à l'Ancienne Yuki, devant sa maison, côté ouest de la grand-rue.", target: npcPos('yuki'), talk: 'yuki' },
    { text: 'Monte au dojo Sakura no Kage, tout au nord du village.', target: () => ({ x: 0, z: -80 }), check: () => G.inDojo },
    { text: 'Présente-toi à Maître Hana, au fond du dojo.', target: npcPos('hana'), talk: 'hana' },
    { text: 'Frappe chacun des 4 makiwara trois fois : clic gauche, clic gauche, clic gauche, pour enchaîner.', target: () => ({ x: -7.6, z: -97 }), progress: () => `${ST.counts.maki.size} / 4`, check: () => ST.counts.maki.size >= 4 },
    { text: "Pare 3 attaques d'Akira : appuie sur F juste avant l'impact.", target: npcPos('akira'), start: () => parryDrill(true), progress: () => `${ST.counts.parry} / 3`, check: () => ST.counts.parry >= 3, end: () => parryDrill(false) },
    { text: 'Retourne voir Maître Hana.', target: npcPos('hana'), talk: 'hana' },
    { text: 'Des rônin rançonnent la route du sud-est. Trouve leur camp et chasse-les.', target: () => W.camp, start: () => { ST.flags.campArmed = true; const p = W.pois.find(p => p.id === 'camp'); if (p) p.hidden = false; }, check: () => ST.flags.campCleared },
    { text: 'Rapporte la nouvelle à Maître Hana.', target: npcPos('hana'), talk: 'hana' },
    { text: "L'épreuve du dojo : bats Akira en duel. Il ne retient pas ses coups.", target: () => ({ x: 0, z: -96 }), start: () => { ST.flags.duelReady = true; }, check: () => ST.flags.duelWon },
    { text: "Une silhouette t'observe depuis la pagode, à l'est. Va la trouver.", target: () => ({ x: 80, z: -52 }), check: () => Math.hypot(G.pl.pos.x - 80, G.pl.pos.z + 52) < 9, end: () => cutRei() },
  ], reward: { xp: 250, ryo: 120, unlock: 'kage' } },
  lanternes: { title: "Les lanternes d'Inari", kind: 'Secondaire', steps: [
    { text: 'Allume les 4 lanternes de pierre devant le sanctuaire.', target: () => ({ x: W.shrine.x, z: W.shrine.z }), progress: () => `${W.interact.filter(i => i.kind === 'toro' && i.lit).length} / 4`, check: () => W.interact.filter(i => i.kind === 'toro' && i.lit).length >= 4 },
    { text: 'Retourne voir le moine Ryu.', target: npcPos('ryu'), talk: 'ryu' },
  ], reward: { xp: 90, ryo: 30, sp: 1 } },
  the: { title: 'Un thé pour le sanctuaire', kind: 'Secondaire', steps: [
    { text: 'Apporte le thé de Zen au moine Ryu, au sanctuaire Inari.', target: npcPos('ryu'), talk: 'ryu' },
  ], reward: { xp: 50, ryo: 25, item: ['onigiri', 2] } },
  mochi: { title: 'Où est Mochi ?', kind: 'Secondaire', steps: [
    { text: "Kai a perdu sa chatte rousse, Mochi. Elle aime les rizières de l'ouest.", target: () => ({ x: -62, z: 74 }), check: () => ST.flags.mochiFound },
    { text: 'Ramène la bonne nouvelle à Kai, sur la place du marché.', target: npcPos('kai'), talk: 'kai' },
  ], reward: { xp: 60, ryo: 35, unlock: 'hana' } },
  rouleaux: { title: 'Les rouleaux perdus', kind: 'Secondaire', steps: [
    { text: "Retrouve les 5 rouleaux de Maître Hana cachés dans la vallée (regarde en hauteur, près de l'eau, dans les bambous).", progress: () => `${Object.keys(ST.scrolls).length} / 5`, check: () => Object.keys(ST.scrolls).length >= 5 },
  ], reward: { xp: 150, sp: 2 } },
};
/* chapitres des neuf dojos + quêtes secondaires */
for (const reg of REGIONS) {
  if (reg.built) continue;
  const ch = reg.chapter, id = 'main' + reg.num;
  const cnt = () => ST.counts.kills['trial_' + reg.id] || 0;
  QUESTS[id] = { title: ch.title, kind: 'Principale', steps: [
    { text: `Rejoins le ${reg.dojo}, au ${reg.name}.`, target: () => ({ x: reg.gatePos.x, z: reg.gatePos.z }), check: () => Math.hypot(G.pl.pos.x - reg.x, G.pl.pos.z - reg.z) < reg.r + 20 },
    { text: `Présente-toi à ${reg.master}, à l'intérieur du dojo.`, target: () => reg.masterPos, talk: 'master_' + reg.id },
    { text: `Prouve ta valeur : défais 4 hommes de main autour du dojo.`, target: () => reg.enemyPos, progress: () => `${Math.min(4, cnt())} / 4`, check: () => cnt() >= 4, start: () => spawnTrial(reg, 4, 'trial_') },
    { text: `Affronte ${reg.master} en duel.`, target: () => reg.duelPos, check: () => ST.flags['duelWon_' + reg.id] },
    { text: `Reçois le sceau du ${reg.chapter.seal}.`, target: () => reg.masterPos, talk: 'master_' + reg.id },
  ], reward: { xp: 220 + reg.num * 55, ryo: 120 + reg.num * 20, sp: 1, item: ['elixir', 1] } };
  if (reg.side) {
    const s = reg.side, sid = 'side_' + reg.id;
    const prog = () => {
      if (s.kind === 'hunt') return `${Math.min(s.count, ST.counts.kills['hunt_' + reg.id] || 0)} / ${s.count}`;
      if (s.kind === 'collect') return `${Math.min(s.count, ST.relics[reg.id] || 0)} / ${s.count}`;
      return `${Math.min(s.count, W.interact.filter(i => i.kind === 'brazier' && i.reg === reg.id && i.lit).length)} / ${s.count}`;
    };
    const done = () => {
      if (s.kind === 'hunt') return (ST.counts.kills['hunt_' + reg.id] || 0) >= s.count;
      if (s.kind === 'collect') return (ST.relics[reg.id] || 0) >= s.count;
      return W.interact.filter(i => i.kind === 'brazier' && i.reg === reg.id && i.lit).length >= s.count;
    };
    QUESTS[sid] = { title: s.title, kind: 'Secondaire', steps: [
      { text: s.text, target: () => (s.kind === 'collect' ? reg.relicPos[0] : reg.dojoPos), progress: prog, check: done, start: () => { if (s.kind === 'hunt') spawnTrial(reg, s.count, 'hunt_', 34); } },
      { text: `Retourne voir ${reg.shop ? reg.shop.keeper : 'le disciple'} au ${reg.name}.`, target: () => reg.questPos, talk: 'quest_' + reg.id },
    ], reward: { xp: 120 + reg.num * 18, ryo: 80 + reg.num * 12, item: ['dango', 2] } };
  }
}
export function startQuest(id) { if (ST.quests[id] || !QUESTS[id]) return; ST.quests[id] = { step: 0, done: false }; const s = QUESTS[id].steps[0]; s.start?.(); S.quest(); notify('Nouvelle quête : ' + QUESTS[id].title, 'quest'); G.emit('quests'); save(); }
export function curStep(id) { const q = ST.quests[id]; if (!q || q.done) return null; return QUESTS[id].steps[q.step]; }
function advance(id) {
  const q = ST.quests[id]; if (!q || !QUESTS[id]) return;
  const st = QUESTS[id].steps[q.step]; st.end?.();
  q.step++;
  if (q.step >= QUESTS[id].steps.length) {
    q.done = true; const r = QUESTS[id].reward || {}; notify('Quête terminée : ' + QUESTS[id].title, 'quest'); S.quest();
    if (r.xp) addXP(r.xp); if (r.ryo) { G.pl.ryo += r.ryo; S.coin(); } if (r.sp) { G.pl.sp += r.sp; notify(`+${r.sp} point${r.sp > 1 ? 's' : ''} de compétence`); }
    if (r.item) G.pl.inv[r.item[0]] = (G.pl.inv[r.item[0]] || 0) + r.item[1];
    if (r.unlock) { ST.unlocks[r.unlock] = true; notify('Tenue débloquée : ' + OUTFITS[r.unlock].name.split(' (')[0], 'gold'); }
    if (id.startsWith('main')) {
      const n = +id.slice(4) + 1; if (QUESTS['main' + n] && !ST.flags.ended) { ST.track = 'main' + n; setTimeout(() => { if (QUESTS['main' + n] && !ST.quests['main' + n]) startQuest('main' + n); }, 900); }
    }
  } else { QUESTS[id].steps[q.step].start?.(); notify(QUESTS[id].steps[q.step].text, 'step'); S.uiOk(); }
  G.emit('quests'); save();
}
function questTick() { for (const id in ST.quests) { const s = curStep(id); if (s && s.check && s.check()) advance(id); } }
export function questTalk(npcId) { for (const id in ST.quests) { const s = curStep(id); if (s && s.talk === npcId) return id; } return null; }
export function activeTarget() {
  const order = [ST.track, 'main1', ...Object.keys(ST.quests)];
  for (const id of order) { const s = curStep(id); if (!s) continue; if (s.target) { const t = s.target(); if (t) return { id, text: s.text, t, progress: s.progress?.() }; } return { id, text: s.text, t: null, progress: s.progress?.() }; }
  return null;
}

/* ============================ PROGRESSION ============================ */
export const need = (lv) => 100 + (lv - 1) * 60;
export function addXP(n) {
  const pl = G.pl; pl.xp += n; G.emit('xp', n);
  while (pl.xp >= need(pl.level)) { pl.xp -= need(pl.level); pl.level++; pl.sp++; pl.hpMax = hpMaxOf(pl); pl.hp = pl.hpMax; S.level(); notify(`Niveau ${pl.level}  ·  +1 point de compétence`, 'gold'); }
}
export const SKILLS = {
  quatrieme: { name: 'Quatrième coup', cost: 2, text: "Un quatrième coup tournoyant prolonge l'enchaînement rapide." },
  souffle: { name: 'Souffle long', cost: 1, text: "Les coups portés rechargent l'énergie plus vite." },
  garde: { name: 'Garde de fer', cost: 1, text: "La garde absorbe davantage et la fenêtre de parade s'élargit." },
  vent: { name: 'Pas du vent', cost: 1, text: 'Esquive plus fréquente, invincibilité plus longue.' },
  vitalite: { name: 'Vitalité', cost: 1, text: '+25 points de vie.' },
  nage: { name: 'Souffle des abysses', cost: 1, text: "Ton apnée dure presque deux fois plus longtemps." },
};
export function buySkill(id) { const pl = G.pl, s = SKILLS[id]; if (!s || pl.skills[id] || pl.sp < s.cost) return false; pl.sp -= s.cost; pl.skills[id] = true; pl.hpMax = hpMaxOf(pl); S.uiOk(); notify('Compétence apprise : ' + s.name, 'gold'); save(); return true; }
export const ITEMS = {
  onigiri: { name: 'Onigiri', text: 'Rend 40 points de vie.', use: (pl) => { pl.hp = Math.min(pl.hpMax, pl.hp + 40); } },
  the: { name: 'Thé vert', text: 'Rend 40 d\'énergie.', use: (pl) => { pl.en = Math.min(100, pl.en + 40); } },
  dango: { name: 'Dango', text: 'Rend 70 points de vie et 25 d\'énergie.', use: (pl) => { pl.hp = Math.min(pl.hpMax, pl.hp + 70); pl.en = Math.min(100, pl.en + 25); } },
  sake: { name: 'Saké chaud', text: 'Rend 60 d\'énergie. Force accrue 30 s.', use: (pl) => { pl.en = Math.min(100, pl.en + 60); pl.buffs = pl.buffs || {}; pl.buffs.might = 30; } },
  elixir: { name: 'Élixir du dragon', text: 'Restaure toute la vie et toute l\'énergie.', use: (pl) => { pl.hp = pl.hpMax; pl.en = 100; } },
  theRyu: { name: 'Thé pour Ryu', text: 'Un pot de thé encore chaud, à porter au sanctuaire.', quest: true },
};
export function useItem(id) { const pl = G.pl, it = ITEMS[id]; if (!it || it.quest || !(pl.inv[id] > 0)) return false; it.use(pl); pl.inv[id]--; S.uiOk(); notify(it.name + ' utilisé'); return true; }
export function buyGear(kind, tier, price) {
  const pl = G.pl, g = GEAR[kind]; if (!g) return false;
  const cur = (pl.gear && pl.gear[kind]) || 0;
  if (tier <= cur) { notify('Tu as déjà mieux.'); return false; }
  if (pl.ryo < price) { notify('Pas assez de ryo.'); return false; }
  pl.ryo -= price; pl.gear[kind] = tier; pl.hpMax = hpMaxOf(pl); pl.hp = Math.min(pl.hpMax, pl.hp + 20);
  S.coin(); S.uiOk(); notify(g.tiers[tier].name + ' équipé', 'gold'); save(); return true;
}

/* ============================ HABITANTS ============================ */
const LORE = [
  { id: 'r1', x: -24, z: 19, yTop: true, title: 'Le KAGE TRIAL', text: "Tous les cent ans, dix dojos ouvrent leurs portes à dix combattants. Le tournoi porte un nom ancien : KAGE TRIAL, l'épreuve de l'ombre. Personne ne se souvient de qui l'a fondé." },
  { id: 'r2', x: 83, z: -66, title: 'Les dix dojos', text: "Sakura, l'Ombre, la Montagne, le Rouge, l'Eau, le Jade, la Neige, la Foudre, la Lune, et le Vide. Chacun garde une vallée et une manière de se battre. Le dixième n'apparaît sur aucune carte." },
  { id: 'r3', x: -99, z: -95, title: 'THE NULL', text: "Le Null n'efface pas les choses. Il efface le souvenir des choses. Un pont disparaît des mémoires, et un matin plus personne ne le traverse : il finit par tomber." },
  { id: 'r4', x: -106, z: -60, title: 'Hana', text: "Hana a gagné le dernier KAGE TRIAL. C'est ce qu'on raconte. Elle-même dit ne garder aucun souvenir de la finale." },
  { id: 'r5', x: -22.8, z: 17.8, yTop: true, title: 'Kage', text: "Le nom du tournoi est aussi celui d'un combattant. Les anciens disent que Kage n'a jamais perdu, et jamais gagné non plus." },
];
export function populate() {
  const sc = G.scene;
  /* portes coulissantes du dojo central */
  const D = W.dojo, door = W.doors[0];
  const pm = new THREE.MeshStandardMaterial({ map: T.shoji(), emissive: new THREE.Color('#fff2d8'), emissiveMap: T.shoji(), emissiveIntensity: 0.2, side: THREE.DoubleSide, roughness: 0.9 });
  W.shojiMats.push(pm);
  door.panels = [-3, -1, 1, 3].map((x, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(2, 4.2, 0.08), pm); m.position.set(x, D.y + 2.1, D.door - 0.05 - (i === 1 || i === 2 ? 0.1 : 0)); m.userData.x0 = x; m.userData.dx = i === 1 ? -2 : (i === 2 ? 2 : 0); m.castShadow = true; sc.add(m); return m; });
  W.colliders.push({ x0: -4, x1: -2, z0: D.door - 0.35, z1: D.door + 0.25, y0: D.y - 1, y1: D.y + 6 }, { x0: 2, x1: 4, z0: D.door - 0.35, z1: D.door + 0.25, y0: D.y - 1, y1: D.y + 6 });
  W.doorCol = { x0: -2, x1: 2, z0: D.door - 0.35, z1: D.door + 0.25, y0: D.y - 1, y1: D.y + 6 };
  W.colliders.push(W.doorCol); door.col = W.doorCol;
  sc.add(W.dojoLight);
  /* rais de lumière dans le dojo */
  const rm = new THREE.MeshBasicMaterial({ map: T.ray(), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  W.rayMat = rm;
  for (let k = 0; k < 7; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 7.5), rm); m.position.set(D.x0 + 3.2, D.y + 3.4, D.z0 + 3 + k * 4); m.rotation.set(0, Math.PI / 2, -0.62); sc.add(m); }
  /* makiwara comme cibles */
  W.dummyFighters = W.dummies.map(d => ({ isDummy: true, pos: V(d.x, d.y, d.z), radius: 0.4, hits: 0, shake: 0, dead: false, yaw: 0, id: d.id, mesh: null }));
  /* rouleaux */
  const sm = new THREE.MeshStandardMaterial({ color: '#efe6cf', emissive: new THREE.Color('#ffe7b0'), emissiveIntensity: 0.6, roughness: 0.7 });
  for (const L of LORE) {
    const y = L.yTop ? groundAt(L.x, L.z, 99).h : terrainH(L.x, L.z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 10), sm); m.rotation.z = Math.PI / 2; m.position.set(L.x, y + 0.45, L.z); sc.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.soft(), color: '#ffdca0', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(1.4); glow.position.copy(m.position); sc.add(glow);
    W.interact.push({ id: L.id, kind: 'rouleau', x: L.x, z: L.z, y: y + 0.4, label: 'Ramasser le rouleau', mesh: m, glow, lore: L });
  }
  /* coins de repos */
  for (const r of [{ x: W.teaHouse.x - 0.5, z: W.teaHouse.z + 1.5, n: 'salon de thé' }, { x: W.shrine.x + 2, z: W.shrine.z + 3, n: 'sanctuaire' }, { x: 6, z: -79, n: 'engawa du dojo' }])
    W.interact.push({ id: 'repos_' + r.n, kind: 'repos', x: r.x, z: r.z, y: groundAt(r.x, r.z, 9).h + 0.5, label: 'Se reposer (' + r.n + ')' });
  /* salut au grand torii */
  W.interact.push({ id: 'bow_sakura', kind: 'bow', reg: 'sakura', x: 0, z: 114, y: groundAt(0, 114, 9).h + 1, label: 'S\'incliner devant le grand torii' });

  /* --- personnages nommés --- */
  NPC.yuki = spawnNPC({ id: 'yuki', name: 'Ancienne Yuki', x: -8, z: -23, yaw: Math.PI / 2, look: { outfit: 'cendre', hair: 'chignon', hairColor: '#cfcbc4', scale: 0.93, skin: 0 }, path: [[-8, -23, 8], [-7.2, -16, 5], [-8, -23, 12]], speed: 0.7,
    barks: ['Le vent descend de la montagne, ce matin.', 'Tu as les yeux de quelqu\'un qui a marché longtemps.'] });
  NPC.hana = spawnNPC({ id: 'hana', name: 'Maître Hana', x: 0, z: -108.4, yaw: 0, look: { outfit: 'hana', hair: 'queue', hairColor: '#1e1b1f', skin: 0, sword: true }, activity: 'seiza' });
  NPC.akira = spawnNPC({ id: 'akira', name: 'Akira', x: 4.5, z: -100, yaw: -Math.PI / 2, look: { outfit: 'indigo', hair: 'queue', band: true, sword: true, chains: true } });
  NPC.akira.actor.sheathe(false); kata(NPC.akira);
  for (const [x, z] of [[3.5, -92], [6.5, -92], [3.5, -88.5], [6.5, -88.5]]) { const s = spawnNPC({ id: 'eleve', name: 'Élève du dojo', x, z, yaw: -Math.PI / 2, look: { outfit: 'sakura', hair: R() < 0.5 ? 'court' : 'chignon', band: true, sword: true }, talkable: true, barks: ['Hai !', 'Encore cent coups avant le repas.', 'Akira ne fatigue jamais.'] }); s.actor.sheathe(false); kata(s); }
  NPC.zen = spawnNPC({ id: 'zen', name: 'Zen', x: 17.6, z: -12.5, yaw: -Math.PI / 2, look: { outfit: 'foret', hair: 'court', hairColor: '#2a2420', skin: 1 }, activity: 'talk', shop: W.teaHouse ? { name: 'Salon de thé Tsubaki', keeper: 'Zen', items: [{ id: 'onigiri', price: 15 }, { id: 'the', price: 10 }, { id: 'dango', price: 30 }, { id: 'sake', price: 28 }] } : null, barks: ['Un thé ? Le meilleur de la vallée.', 'Assieds-toi, voyageur.'] });
  NPC.ryu = spawnNPC({ id: 'ryu', name: 'Moine Ryu', x: W.shrine.x + 3, z: W.shrine.z + 4, look: { outfit: 'cendre', hair: 'court', hairColor: '#7a7066', skin: 1, scale: 1.02 }, activity: 'sweep', path: [[W.shrine.x + 3, W.shrine.z + 4, 9], [W.shrine.x + 6, W.shrine.z + 8, 8], [W.shrine.x - 1, W.shrine.z + 7, 9]], speed: 0.6, barks: ['Les feuilles tombent, je balaie. Le monde est simple.'] });
  NPC.raizo = spawnNPC({ id: 'raizo', name: 'Raizo, le forgeron', x: 8.6, z: -35, yaw: -Math.PI / 2, look: { outfit: 'cendre', hair: 'court', skin: 2, scale: 1.1 }, activity: 'sweep', barks: ['Une lame, ça s\'écoute avant de se regarder.'] });
  NPC.kai = spawnNPC({ id: 'kai', name: 'Kai', x: 2, z: 6, look: { outfit: 'indigo', hair: 'court', scale: 0.66, skin: 0 }, path: [[2, 6, 1], [-3, 12, 0.5], [-2, -4, 1], [3, -8, 2]], speed: 2.4, barks: ['Tu as vu Mochi ? Elle est toute rousse !', 'Un jour j\'entrerai au dojo, moi aussi.'] });
  if (W.inn) NPC.innkeeper = spawnNPC({ id: 'innkeeper', name: 'Aya, l\'aubergiste', x: W.inn.counter[0] + 0.6, z: W.inn.counter[1] + 0.6, yaw: -Math.PI / 2, look: { outfit: 'sakura', hair: 'chignon', skin: 1 }, activity: 'talk',
    shop: { name: 'Auberge du Cerisier', keeper: 'Aya', items: [{ id: 'onigiri', price: 15 }, { id: 'the', price: 10 }, { id: 'dango', price: 30 }, { id: 'sake', price: 28 }, { id: 'elixir', price: 130 }] }, barks: ['Un lit chaud, un bol de riz, et demain tu repars.'] });
  /* habitants qui vivent leur journée */
  const outfits = ['indigo', 'foret', 'cendre', 'sakura', 'encre'], hairs = ['chignon', 'court', 'queue'];
  const routes = [
    [[0, 30], [0, 0, 4], [0, -40], [-2, -52, 6]], [[-40, 0], [-10, 1, 3], [10, -1], [40, 0, 5]], [[5, -30, 6], [4, -10], [-4, 12, 5], [-3, 26]],
    [[30, 2], [52, -8, 6], [56, -22, 5], [34, 0]], [[-30, 1], [-46, -6, 4], [-58, -14, 6], [-46, -6]], [[0, 56, 8], [24, 72, 6], [0, 60]],
    [[-4, -44, 5], [-4, -20, 3], [4, 0, 4], [4, -30]], [[8, 20, 7], [-6, 8, 3], [6, -14, 5]], [[0, 90, 5], [-24, 74, 7], [-48, 70, 9], [-22, 76]], [[20, -6, 4], [44, 2, 6], [24, 2]],
  ];
  routes.forEach((r, i) => spawnNPC({ id: 'h' + i, name: ['Aiko', 'Daichi', 'Emi', 'Goro', 'Haru', 'Ichiro', 'Kana', 'Masa', 'Nori', 'Rin'][i], x: r[0][0], z: r[0][1], look: { outfit: outfits[i % 5], hair: hairs[i % 3], skin: i % 3, hairColor: i % 4 === 0 ? '#3a2a20' : '#141210', scale: rr(0.92, 1.04) }, path: r, speed: rr(1.0, 1.5), night: true, rain: i % 2 === 0,
    barks: [['Belle matinée, n\'est-ce pas ?', 'Le marché ferme au coucher du soleil.'], ['On dit que des rônin rôdent près du camp au sud-est.', 'Fais attention sur la route.'], ['Les cerisiers ont fleuri tôt, cette année.', 'Tu viens pour le dojo ?'], ['Le moine Ryu cherche quelqu\'un pour ses lanternes.', 'Le thé de Zen est le meilleur.'], ['La tour de guet offre une vue sur toute la vallée.', 'Il paraît que des rouleaux anciens traînent un peu partout.']][i % 5] }));
  const pairs = [[[-2.5, 15], [-1.2, 15.6]], [[2.5, -18], [3.6, -17.2]], [[-30, -3], [-29, -2.2]]];
  pairs.forEach((p, i) => {
    const a = spawnNPC({ id: 'c' + i, name: 'Villageois', x: p[0][0], z: p[0][1], look: { outfit: outfits[(i + 2) % 5], hair: hairs[i % 3], skin: (i + 1) % 3 }, activity: 'talk', night: true, barks: ['… et alors il a dit que le pont avait toujours été là !', 'Chut, on écoute.'] });
    const b = spawnNPC({ id: 'd' + i, name: 'Villageoise', x: p[1][0], z: p[1][1], look: { outfit: outfits[(i + 3) % 5], hair: 'chignon', skin: i % 3 }, activity: 'talk', night: true, barks: ['Bonjour !'] });
    a.yaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z); b.yaw = a.yaw + Math.PI; a.lookTarget = b.pos.clone().setY(b.pos.y + 1.5); b.lookTarget = a.pos.clone().setY(a.pos.y + 1.5);
  });
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { if ((i + (sx > 0 ? 1 : 0)) % 2) continue; spawnNPC({ id: 'm' + i + sx, name: 'Marchand', x: sx * 7.3, z: -6 + i * 6, yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2, look: { outfit: outfits[(i * 2) % 5], hair: 'court', skin: i % 3 }, activity: 'talk', night: true, barks: ['Des kakis, des radis, du riz !', 'Approche, approche !'] }); }
  /* chats */
  for (const [x, z, c] of [[3, 14, '#2a2420'], [-20, -6, '#e9e2d6'], [-80, -30, '#5a5048'], [16, -18, '#2a2420']]) { const cat = new Cat(sc, c); cat.root.position.set(x, 0, z); cat.home = { x, z }; G.cats.push(cat); }
  const mochi = new Cat(sc, '#d9822b'); mochi.root.position.set(-62, 0, 76); mochi.home = { x: -62, z: 76 }; G.cats.push(mochi); ST.mochi = mochi;
  /* Rei : n'apparaît que dans les scènes */
  NPC.rei = spawnNPC({ id: 'rei', name: 'Rei', x: 13, z: 26, look: { outfit: 'kage', hair: 'capuche', mask: true, scarf: true, chains: true, sword: true }, talkable: false });
  NPC.rei.hidden = true; NPC.rei.noGround = true; NPC.rei.script = (n) => { n.hidden = !n.show; };

  /* --- les neuf maîtres, leurs élèves et leurs marchands --- */
  for (const reg of REGIONS) {
    if (reg.built) continue;
    const master = spawnNPC({ id: 'master_' + reg.id, name: reg.master, x: reg.masterPos.x, z: reg.masterPos.z, yaw: reg.rot, look: Object.assign({ sword: true }, reg.masterLook), activity: 'seiza', reg,
      barks: ['Un dojo n\'est pas un lieu. C\'est une dette.', 'La pluie se souvient de chaque toit.'] });
    NPC['master_' + reg.id] = master;
    reg.disciplePos.forEach((p, i) => { const st = reg.students[i % reg.students.length]; const s = spawnNPC({ id: 'eleve_' + reg.id + '_' + i, name: st.name, x: p.x, z: p.z, yaw: reg.rot, look: st.look, band: true, barks: ['Hai !', 'Le maître ne parle pas beaucoup. Écoute quand même.'] }); s.actor.sheathe(false); kata(s); });
    if (reg.shop) {
      const sp = reg.shopPos, kp = reg.place(-20, 27.4);
      NPC['shop_' + reg.id] = spawnNPC({ id: 'shop_' + reg.id, name: reg.shop.keeper, x: kp.x, z: kp.z, yaw: reg.rot + Math.PI, look: { outfit: 'foret', hair: 'court', skin: (reg.num % 3), scarf: false, sword: false }, activity: 'talk', shop: reg.shop, reg, barks: ['Approche, voyageur !', 'Tout ce qui se mange, se vend.'] });
      NPC['quest_' + reg.id] = spawnNPC({ id: 'quest_' + reg.id, name: 'Disciple ' + reg.chapter.seal, x: reg.questPos.x, z: reg.questPos.z, yaw: reg.rot + Math.PI, look: { outfit: 'sakura', hair: 'queue', band: true, sword: false }, activity: 'talk', reg, side: true, barks: ['Le maître t\'attend.', 'Chaque vallée cache trois offrandes.'] });
    }
    /* deux habitants de la vallée */
    for (let i = 0; i < 2; i++) {
      const a = R() * 6.28, d = rr(24, 44), p = reg.place(Math.cos(a) * d, Math.sin(a) * d + 20);
      spawnNPC({ id: 'rv_' + reg.id + '_' + i, name: i ? 'Villageoise' : 'Villageois', x: p.x, z: p.z, look: { outfit: ['indigo', 'cendre', 'foret', 'sakura'][Math.floor(R() * 4)], hair: ['chignon', 'court', 'queue'][i % 3], skin: i % 3 }, night: true, rain: true, barks: ['Ici, on ne demande pas d\'où tu viens.', 'Les dix dojos… mon grand-père en parlait comme d\'une légende.'] });
    }
  }
  /* carpes et oiseaux */
  const koiM = new THREE.MeshStandardMaterial({ color: '#e8732a', roughness: 0.4 }); W.koi = [];
  for (let i = 0; i < 6; i++) { const k = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.28, 3, 6), i % 3 ? koiM : new THREE.MeshStandardMaterial({ color: '#f2eee6' })); k.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(k); sc.add(g); W.koi.push({ g, a: R() * 6, r: rr(1, 3), s: rr(0.3, 0.6) }); }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute([-0.4, 0.05, 0, 0, 0, 0.1, 0, 0, 0.1, 0.4, 0.05, 0], 3));
  W.birds = []; const bm = new THREE.LineBasicMaterial({ color: '#1a1a1a' });
  for (let i = 0; i < 26; i++) { const b = new THREE.LineSegments(bg, bm); sc.add(b); W.birds.push({ m: b, a: R() * 6, r: rr(30, 90), h: rr(35, 60), s: rr(0.08, 0.16), cx: rr(-40, 40), cz: rr(-60, 40) }); }
}
function kata(n) { n.ki = Math.floor(R() * 3); n.kt = rr(0, 2); n.stance = 'guard'; n.script = (n2, dt) => {
  if (n2.duel) return;
  if (!n2.action) { n2.kt -= dt; if (n2.kt <= 0) n2.action = { move: ['l1', 'l2', 'l3'][n2.ki++ % 3], t: 0 }; }
  else { n2.action.t += dt * 0.75; if (n2.action.t > MOVES[n2.action.move].dur) { n2.action = null; n2.kt = n2.ki % 3 === 0 ? 1.6 : 0.35; } } }; }
export function resetNPCs() {
  if (NPC.akira) { NPC.akira.hidden = false; NPC.akira.duel = false; NPC.akira.hold = false; }
  for (const id in NPC) { const n = NPC[id]; if (n && n.def && n.def.reg) { n.hidden = false; n.duel = false; n.hold = false; } }
  if (NPC.rei) NPC.rei.show = false; ST.drill = null;
  if (ST.mochi) { ST.mochi.home = { x: -62, z: 76 }; ST.mochi.root.position.set(-62, 0, 76); }
}
export function animalsUpdate(dt) {
  if (W.koi) for (const k of W.koi) { k.a += dt * k.s; k.g.position.set(W.pond.x + Math.cos(k.a) * k.r, W.pond.y - 0.05, W.pond.z + Math.sin(k.a) * k.r); k.g.rotation.y = -k.a; }
  if (W.birds) for (const b of W.birds) { b.a += dt * b.s; b.m.position.set(b.cx + Math.cos(b.a) * b.r, b.h + Math.sin(b.a * 3) * 2, b.cz + Math.sin(b.a) * b.r); b.m.rotation.y = -b.a; b.m.scale.y = 1 + Math.sin(performance.now() * 0.012 + b.r) * 1.5; b.m.visible = W.time > 5.5 && W.time < 19.5; }
  if (W.interact) for (const it of W.interact) if (it.glow && it.glow.visible) it.glow.material.opacity = 0.35 + Math.sin(performance.now() * 0.003) * 0.25;
}

/* exercice de parade avec Akira */
function parryDrill(on) {
  const a = NPC.akira;
  if (on) { a.hidden = true; a.hold = true; const e = spawnEnemy('sparring', 3, -97, { tag: 'drill', name: 'Akira', aggro: true }); e.actor.setOutfit({ outfit: 'indigo', hair: 'queue', band: true, chains: true }); e.actor.sheathe(false); e.T = Object.assign({}, e.T, { moves: ['e1'], block: 1 }); e.hp = e.hpMax = 999; ST.counts.parry = 0; ST.drill = e; }
  else { clearEnemies('drill'); a.hidden = false; a.hold = false; }
}

/* ============================ INTERACTIONS ============================ */
export function findInteract() {
  const pl = G.pl, f = pl.facing(); let best = null, bd = 2.8;
  const consider = (o, x, z, y) => { const dx = x - pl.pos.x, dz = z - pl.pos.z, d = Math.hypot(dx, dz); if (d > bd || Math.abs(y - pl.pos.y - 1) > 2.4) return; const dot = (dx * f.x + dz * f.z) / (d || 1); if (d > 1.2 && dot < 0.1) return; bd = d; best = o; };
  for (const n of G.npcs) if (n.talkable && n.actor.root.visible && !n.duel) consider({ npc: n, label: 'Parler à ' + n.name }, n.pos.x, n.pos.z, n.pos.y + 1);
  for (const it of W.interact) if (!it.taken) consider(it, it.x, it.z, it.y);
  if (ST.mochi && ST.quests.mochi && !ST.flags.mochiFound) consider({ kind: 'mochi', label: 'Prendre Mochi dans tes bras' }, ST.mochi.root.position.x, ST.mochi.root.position.z, ST.mochi.root.position.y + 0.5);
  for (const L of W.ladders) if (Math.abs(pl.pos.y - L.y1) < 0.4 && Math.hypot(pl.pos.x - L.topX, pl.pos.z - L.topZ) < 2.2) consider({ kind: 'descendre', L, label: 'Descendre l\'échelle' }, L.topX, L.topZ, L.y1 + 0.5);
  return best;
}
export function interact(o) {
  const pl = G.pl;
  if (o.npc) return talk(o.npc);
  if (o.kind === 'cloche') { S.bell(); pl.hp = pl.hpMax; notify('La cloche résonne dans la vallée. Tes forces reviennent.'); ring(V(o.x, o.y + 2.5, o.z), '#ffe7b0', 2); return; }
  if (o.kind === 'toro') {
    if (o.lit) return notify('La lanterne brûle déjà.');
    if (!ST.quests.lanternes) return notify('Une lanterne de pierre, froide. Le moine Ryu en sait sans doute plus.');
    o.lit = true; o.light.intensity = 4; o.glow.material.opacity = 0.9; S.fire(); sparks(V(o.x, o.y + 0.6, o.z), 16, '#ffb35a', 3); notify('Lanterne allumée'); return;
  }
  if (o.kind === 'brazier') {
    if (o.lit) return notify('Le brasero brûle déjà.');
    o.lit = true; ST.braziers[o.id] = true; if (o.mesh) o.mesh.visible = true; if (o.glow) o.glow.material.opacity = 0.8;
    S.fire(); sparks(V(o.x, o.y + 0.4, o.z), 20, '#ffb35a', 4); ring(V(o.x, o.y, o.z), '#ffcf86', 1); notify('Brasero allumé'); save(); return;
  }
  if (o.kind === 'rouleau') { o.taken = true; o.mesh.visible = false; o.glow.visible = false; ST.scrolls[o.id] = true; S.uiOk(); addXP(30); if (!ST.quests.rouleaux) startQuest('rouleaux'); G.emit('lore', o.lore); save(); return; }
  if (o.kind === 'relic') {
    o.taken = true; if (o.mesh) o.mesh.visible = false; if (o.glow) o.glow.visible = false;
    ST.relics[o.reg] = (ST.relics[o.reg] || 0) + 1; pl.ryo += 45; addXP(35); S.coin(); S.uiOk(); notify('Offrande retrouvée (' + ST.relics[o.reg] + ' / 3) · +45 ryo'); save(); return;
  }
  if (o.kind === 'secret') {
    if (ST.altars[o.reg]) return notify('L\'autel est silencieux. Son offrande a déjà été reçue.');
    ST.altars[o.reg] = true; pl.blessings = (pl.blessings || 0) + 2; pl.hpMax = hpMaxOf(pl); pl.hp = pl.hpMax; pl.ryo += 150; S.bell(); ring(V(o.x, o.y, o.z), '#ffe7b0', 2.5); notify('Bénédiction ancienne : +10 points de vie maximum, +150 ryo', 'gold'); save(); return;
  }
  if (o.kind === 'bow') {
    if (ST.bowed[o.reg]) return notify('Le torii t\'a déjà reconnu.');
    ST.bowed[o.reg] = true; pl.blessings = (pl.blessings || 0) + 1; pl.hpMax = hpMaxOf(pl); pl.ryo += 40; S.uiOk(); sparks(V(o.x, o.y + 1.5, o.z), 22, '#f6c6d3', 4); notify('Le torii s\'incline · +5 points de vie maximum, +40 ryo', 'gold'); save(); return;
  }
  if (o.kind === 'repos') return G.emit('rest', o);
  if (o.kind === 'mochi') { ST.flags.mochiFound = true; S.meow(); notify('Mochi ronronne. Elle rentrera seule au village.'); ST.mochi.home = { x: 2, z: 10 }; ST.mochi.root.position.set(2, 0, 10); return; }
  if (o.kind === 'descendre') { pl.climb = o.L; pl.pos.set(o.L.x, o.L.y1 - 0.4, o.L.z); return; }
}

/* ============================ DIALOGUES ============================ */
function L(who, text, emo) { return { who, text, emo }; }
export function talk(n) {
  if (n.def.shop) return openShop(n.def.shop, n);
  if (n.def.reg && n.def.side) return sideTalk(n.def.reg, n);
  if (n.def.reg && n.def.id.startsWith('master_')) return masterTalk(n.def.reg, n);
  const id = n.def.id, qid = questTalk(id), q = (k) => ST.quests[k], st = (k) => q(k) && !q(k).done ? q(k).step : -1;
  let lines = [], choices = null, after = null;
  if (id === 'yuki') {
    if (qid === 'main1') { lines = [L('Ancienne Yuki', 'Te voilà enfin. La lettre portait le sceau de Hana, je l\'ai reconnu de loin.', 'joie'), L('Sora', 'Elle dit seulement : « Viens au dojo avant la pleine lune. »'), L('Ancienne Yuki', 'Alors ne la fais pas attendre. Le dojo est tout au nord, en haut des marches de pierre.'), L('Ancienne Yuki', 'Et Sora… le KAGE TRIAL recommence. Les anciens l\'ont senti dans leurs rêves. Sois prudent.', 'surprise')]; after = () => advance('main1'); }
    else lines = [L('Ancienne Yuki', ['La vallée a l\'air calme. Elle ne l\'est jamais vraiment.', 'Hana était déjà la meilleure à ton âge. Et la plus têtue.', 'Neuf autres dojos t\'attendent dans les montagnes. J\'en ai vu deux dans ma vie. C\'est déjà beaucoup.'][Math.floor(R() * 3)])];
  } else if (id === 'hana') {
    const s = st('main1');
    if (qid === 'main1' && s === 3) { lines = [L('Maître Hana', 'Sora. Tu as la démarche de ton père.', 'neutre'), L('Sora', 'Je ne l\'ai presque pas connu.'), L('Maître Hana', 'Moi si. Assez parlé. Le KAGE TRIAL va s\'ouvrir, et ce dojo doit y envoyer un combattant.'), L('Maître Hana', 'Montre-moi d\'abord ce que valent tes bras. Les makiwara, à gauche. Trois coups enchaînés sur chacun.', 'colere')]; after = () => advance('main1'); }
    else if (qid === 'main1' && s === 6) { lines = [L('Maître Hana', 'Tu pares au lieu de reculer. Bien.', 'joie'), L('Maître Hana', 'Je vais t\'apprendre la technique de ce dojo : le Pétale d\'ombre. Une ruée, trois entailles. Elle se paie avec ton énergie.'), L('Maître Hana', 'Maintenant, un vrai travail. Des rônin rançonnent la route du sud-est. Chasse-les de ma vallée.', 'colere')]; after = () => { G.pl.special = true; notify('Technique apprise : Pétale d\'ombre (Q, 50 d\'énergie)', 'gold'); advance('main1'); }; }
    else if (qid === 'main1' && s === 8) { lines = [L('Maître Hana', 'Le camp est vide ? Alors tu es prêt pour l\'épreuve.'), L('Maître Hana', 'Akira est mon meilleur élève. Il espérait partir seul au KAGE TRIAL. Bats-le, et c\'est toi qui iras.'), L('Akira', 'Je ne retiendrai pas mes coups.', 'colere')]; after = () => { advance('main1'); duel(); }; }
    else if (st('main1') === 9 && ST.flags.duelReady && !ST.flags.duelOn) { lines = [L('Maître Hana', 'Prêt ? Akira t\'attend au centre.')]; choices = [{ t: 'Commencer le duel', f: () => duel() }, { t: 'Pas encore', f: null }]; }
    else if (ST.quests.main1?.done) lines = [L('Maître Hana', 'Les neuf autres dojos t\'attendent. Le premier est au nord-ouest, dans le Quartier des Ombres. Les cols sont ouverts : c\'est toi qu\'ils attendaient.'), L('Maître Hana', 'Reviens avec leurs sceaux. Et reviens vivant, c\'est un ordre.')];
    else lines = [L('Maître Hana', 'Concentre-toi sur ce que je t\'ai demandé.')];
  } else if (id === 'akira') {
    lines = [L('Akira', ST.flags.duelWon ? 'Tu as gagné. Ne crois pas que ce sera toujours le cas.' : 'Tu es le nouveau ? On verra combien de temps tu tiens.', 'colere')];
    if (ST.chars.akira) choices = [{ t: 'Peux-tu m\'accompagner ?', f: () => { setCharacter('akira'); notify('Akira rejoint ton équipe. Ouvre Personnage pour changer de combattant.', 'gold'); } }, { t: 'Plus tard', f: null }];
  } else if (id === 'zen') {
    openShop(n.def.shop, n);
  } else if (id === 'ryu') {
    if (qid === 'the') { lines = [L('Moine Ryu', 'Du thé de Zen ? Il pense encore à moi. Merci, voyageur.', 'joie')]; after = () => { delete G.pl.inv.theRyu; advance('the'); }; }
    else if (qid === 'lanternes') { lines = [L('Moine Ryu', 'Les quatre flammes brûlent. Inari voit de nouveau le chemin. Prends ceci, et que ta lame reste droite.', 'joie')]; after = () => advance('lanternes'); }
    else if (!ST.quests.lanternes) { lines = [L('Moine Ryu', 'Les lanternes du sanctuaire se sont éteintes la nuit où le vent a tourné.'), L('Moine Ryu', 'Mes vieilles jambes ne m\'obéissent plus. Voudrais-tu les rallumer ? Elles sont quatre, devant le sanctuaire.')]; choices = [{ t: 'J\'y vais', f: () => startQuest('lanternes') }, { t: 'Plus tard', f: null }]; }
    else lines = [L('Moine Ryu', 'Balayer, c\'est aussi une forme de méditation.')];
  } else if (id === 'kai') {
    if (qid === 'mochi') { lines = [L('Kai', 'Mochi est rentrée ! Elle sent la boue des rizières. Merci, merci !', 'joie'), L('Kai', 'Ma sœur a cousu une tenue pour le dojo, elle est trop grande pour moi. Prends-la !')]; after = () => advance('mochi'); }
    else if (!ST.quests.mochi) { lines = [L('Kai', 'Tu n\'aurais pas vu une chatte rousse ? Elle s\'appelle Mochi. Elle part toujours vers les rizières…', 'surprise')]; choices = [{ t: 'Je vais la chercher', f: () => startQuest('mochi') }, { t: 'Désolé', f: null }]; }
    else lines = [L('Kai', 'Tu l\'as trouvée ? Elle adore se cacher entre les champs inondés.')];
  } else if (id === 'raizo') {
    lines = [L('Raizo, le forgeron', 'Ta lame a été forgée dans le nord. Bon acier. Garde-la sèche et elle te gardera en vie.'), L('Raizo, le forgeron', 'Si tu trouves les forges des autres vallées, demande-leur une lame plus lourde. Tu en auras besoin.')];
  } else if (id === 'innkeeper') {
    openShop(n.def.shop, n);
  } else {
    const b = n.def.barks || ['…']; lines = [L(n.name, b[Math.floor(R() * b.length)])];
  }
  dialog(lines, choices, after, n);
}

/* ---------- maîtres des neuf dojos ---------- */
function masterTalk(reg, npc) {
  const qid = 'main' + reg.num, ch = reg.chapter;
  let q = ST.quests[qid];
  if (!q && !ST.flags.ended) {
    const prev = 'main' + (reg.num - 1);
    if (reg.num === 2 ? !ST.quests.main1?.done : !ST.quests[prev]?.done) {
      return dialog([L(reg.master, "Tu n'as pas encore fini le dojo précédent. Un sceau ne se saute pas ; il se mérite.", 'neutre')], null, null, npc);
    }
    startQuest(qid); q = ST.quests[qid];
    /* le maître est devant nous : l'étape « rejoindre le dojo » est déjà remplie */
    if (q && q.step === 0 && QUESTS[qid].steps[0].check?.()) advance(qid);
  }
  const step = q && !q.done ? q.step : -1;
  let lines = [], choices = null, after = null;
  if (step === 1) {
    lines = ch.master.map((t) => L(reg.master, t, 'neutre'));
    after = () => advance(qid);
  } else if (step === 2) {
    const n = ST.counts.kills['trial_' + reg.id] || 0;
    lines = [L(reg.master, n >= 4 ? 'Le calme est revenu. Viens maintenant.' : 'Les hommes de main sont encore là. ' + n + ' sur 4 sont tombés.', n >= 4 ? 'joie' : 'neutre')];
  } else if (step === 3) {
    const n = ST.counts.kills['trial_' + reg.id] || 0;
    if (n < 4) return dialog([L(reg.master, `D'abord les hommes de main. ${n} sur 4.` )], null, null, npc);
    lines = [L(reg.master, ch.trial[0]), L(reg.master, 'Nous allons voir ce que tu retiens. En garde.', 'colere')];
    choices = [{ t: 'Commencer le duel', f: () => startDuel(reg) }, { t: 'Pas encore', f: null }];
  } else if (step === 4 || ST.flags['duelWon_' + reg.id] && q && !q.done) {
    lines = [L(reg.master, ch.trial[1], 'joie'), L(reg.master, `Prends le sceau du ${ch.seal}. Dix dojos font une serrure, Sora. Souviens-toi de ça.`), L('Sora', 'Et si la serrure s\'ouvre ?'), L(reg.master, 'Alors il faudra savoir quoi mettre derrière.')];
    after = () => { ST.seals[reg.id] = true; grantSealRewards(reg); advance(qid); };
  } else if (q && q.done) {
    lines = [L(reg.master, reg.id === 'mugen' ? 'Le dojo est à toi. Les dix sceaux sont une seule école, maintenant.' : 'Les quarante-douze marches sont à toi quand tu veux. Reviens t\'entraîner.', 'joie')];
    if (reg.id === 'mugen' && ST.flags.ended) choices = [{ t: 'Merci, Kage.', f: null }];
  } else {
    lines = [L(reg.master, 'Le sceau attend. Finis ce que tu as commencé.')];
  }
  dialog(lines, choices, after, npc);
}

function grantSealRewards(reg) {
  const n = sealsCount(ST.seals);
  if (n >= 1) ST.chars.akira = true;
  if (n >= 3) ST.chars.rei = true;
  if (n >= 6) ST.chars.hana = true;
  G.emit('seal', { reg, count: n }); music('dojo'); save();
}

/* ---------- quêtes secondaires ---------- */
function sideTalk(reg, npc) {
  const id = 'side_' + reg.id, q = ST.quests[id], s = reg.side;
  if (!q) {
    dialog([L(npc.name, s.text), L(npc.name, 'Reviens quand ce sera fait. Le maître ne récompense pas les mains vides.' )], [
      { t: 'Je m\'en occupe', f: () => startQuest(id) }, { t: 'Plus tard', f: null },
    ], null, npc);
    return;
  }
  if (!q.done && q.step === 1) {
    dialog([L(npc.name, 'Tu l\'as fait ? Le dojo s\'en souviendra.', 'joie')], null, () => advance(id), npc);
    return;
  }
  if (q.done) return dialog([L(npc.name, 'Merci encore. Les offrandes de cette vallée sont en paix.')], null, null, npc);
  dialog([L(npc.name, s.text)], null, null, npc);
}

/* ---------- boutiques ---------- */
export function openShop(shop, npc) {
  const pl = G.pl, choices = [], seen = new Set();
  for (const it of shop.items) {
    if (seen.has(it.id + (it.tier || ''))) continue; seen.add(it.id + (it.tier || ''));
    if (it.id === 'lame' || it.id === 'armure' || it.id === 'bottes') {
      const kind = it.id, cur = (pl.gear && pl.gear[kind]) || 0;
      if (it.tier <= cur) continue;
      const g = GEAR[kind].tiers[it.tier];
      choices.push({ t: `${g.name} — ${it.price} ryo · ${g.text}`, f: () => { if (buyGear(kind, it.tier, it.price)) openShop(shop, npc); } });
    } else {
      const item = ITEMS[it.id]; if (!item) continue;
      choices.push({ t: `${item.name} — ${it.price} ryo · ${item.text}`, f: () => { buyItem(it.id, it.price); openShop(shop, npc); } });
    }
  }
  choices.push({ t: 'Fermer', f: null });
  dialog([L(shop.keeper || 'Marchand', `Bienvenue chez ${shop.name || 'moi'}. Tu as ${pl.ryo} ryo.`), L(shop.keeper || 'Marchand', 'Prends ton temps. Ce qui est rare ne se presse pas.')], choices, null, npc);
}
function buyItem(id, price) {
  const pl = G.pl; if (pl.ryo < price) return notify('Pas assez de ryo.');
  pl.ryo -= price; pl.inv[id] = (pl.inv[id] || 0) + 1; S.coin(); notify(ITEMS[id].name + ' acheté'); save();
}

export function dialog(lines, choices, after, npc) {
  ST.dialog = { lines, i: 0, choices, after, npc, chars: 0 }; G.mode = 'dialog'; G.pl.vel.set(0, 0, 0);
  if (npc) { npc.hold = true; npc.yaw = Math.atan2(G.pl.pos.x - npc.pos.x, G.pl.pos.z - npc.pos.z); G.pl.yaw = Math.atan2(npc.pos.x - G.pl.pos.x, npc.pos.z - G.pl.pos.z); }
  if (document.pointerLockElement) document.exitPointerLock();
  G.emit('dialog'); clearTaps();
}
export function dialogNext(choice) {
  const d = ST.dialog; if (!d) return;
  const line = d.lines[d.i];
  if (line && d.chars < line.text.length) { d.chars = line.text.length; return; }
  if (d.i < d.lines.length - 1) { d.i++; d.chars = 0; G.emit('dialog'); return; }
  if (d.choices && choice === undefined) return;
  const c = d.choices ? d.choices[choice] : null;
  ST.dialog = null; if (d.npc) d.npc.hold = false; G.mode = 'play'; G.camOverride = null; G.emit('dialog');
  if (c && c.f) c.f(); if (d.after) d.after();
}
export function dialogUpdate(dt) {
  const d = ST.dialog; if (!d) return;
  const line = d.lines[d.i]; const before = Math.floor(d.chars); d.chars = Math.min(line.text.length, d.chars + dt * 48);
  if (Math.floor(d.chars) > before && Math.floor(d.chars) % 3 === 0) S.voice(line.who === 'Sora' ? 1.2 : (line.who.includes('Yuki') ? 1.5 : 0.9));
  const sp = line.who === 'Sora' ? G.pl.actor : (d.npc ? d.npc.actor : null); if (sp) { sp.talking = d.chars < line.text.length ? 0.15 : 0; sp.emotion = line.emo || 'neutre'; }
  if (d.npc) {
    const a = d.npc.pos, b = G.pl.pos, spk = line.who === 'Sora' ? b : a, lis = line.who === 'Sora' ? a : b;
    const dir = new THREE.Vector3().subVectors(spk, lis); dir.y = 0; dir.normalize(); const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const pos = lis.clone().addScaledVector(dir, -1.3).addScaledVector(side, 0.85); pos.y = lis.y + 1.7;
    const look = spk.clone(); look.y += 1.5 * (line.who === 'Sora' ? 1 : d.npc.actor.o.scale);
    if (!G.camOverride) G.camOverride = { pos: pos.clone(), look: look.clone(), fov: 38 };
    G.camOverride.pos.lerp(pos, 1 - Math.exp(-dt * 4)); G.camOverride.look.lerp(look, 1 - Math.exp(-dt * 5)); G.camOverride.fov = 36;
  }
  return line;
}

/* ============================ COMBATS SCÉNARISÉS ============================ */
G.on('dummyHit', ({ d, move }) => {
  const now = performance.now(); d.chainN = now - (d.lastT || 0) < 1500 ? (d.chainN || 0) + 1 : 1; d.lastT = now;
  if (curStep('main1') === QUESTS.main1.steps[4]) d.stepHits = (d.stepHits || 0) + 1;
  if ((move === 'l3' || d.chainN >= 3 || d.stepHits >= 3) && curStep('main1') === QUESTS.main1.steps[4] && !ST.counts.maki.has(d.id)) { ST.counts.maki.add(d.id); notify(`Makiwara ${ST.counts.maki.size} / 4`); }
});
G.on('parry', (att) => { if (att === ST.drill) { ST.counts.parry++; notify(`Parade ${ST.counts.parry} / 3`); } addXP(5); });
G.on('enemyDown', (e) => {
  const T0 = e.T; addXP(T0.xp || 20); const r = Math.round(rr(T0.ryo?.[0] || 0, T0.ryo?.[1] || 0)); if (r) { G.pl.ryo += r; S.coin(); notify(`+${r} ryo`); }
  if (e.tag) ST.counts.kills[e.tag] = (ST.counts.kills[e.tag] || 0) + 1;
  if (e.tag === 'camp' && G.enemies.filter(o => o.tag === 'camp' && !o.dead).length === 0) { ST.flags.campCleared = true; notify('Le camp est libéré.', 'gold'); }
  if (e.tag === 'nuit') ST.flags.nightDone = true;
  if (e.tag && e.tag.startsWith('trial_')) { const id = e.tag.slice(6), n = ST.counts.kills[e.tag]; if (n === 4) notify('Les hommes de main sont tombés. Retourne voir le maître.', 'gold'); }
  save(true);
});
G.on('yield', (e) => {
  if (e.tag === 'duel') { ST.flags.duelWon = true; ST.flags.duelOn = false; G.pl.ult = true; music('dojo');
    setTimeout(() => { dialog([L('Akira', 'Assez… Je cède.', 'colere'), L('Maître Hana', 'L\'épreuve est terminée. Sora représentera le dojo Sakura no Kage.', 'joie'), L('Maître Hana', 'Une dernière chose. Ta colère a réveillé quelque chose dans ta lame : la Renaissance de l\'ombre. Garde-la pour les vrais combats.')], null, () => { clearEnemies('duel'); NPC.akira.hidden = false; NPC.akira.duel = false; notify('Technique ultime : Renaissance de l\'ombre (R, 100 d\'énergie)', 'gold'); }, NPC.hana); }, 1400);
  }
  if (e.tag === 'spar') { notify('Ton partenaire s\'incline.'); setTimeout(() => clearEnemies('spar'), 1500); }
  if (e.tag && e.tag.startsWith('duel_')) {
    const id = e.tag.slice(5), reg = regionOf(id);
    ST.flags['duelWon_' + id] = true; ST.flags['duelOn_' + id] = false; music('dojo'); S.gong();
    const mN = NPC['master_' + id];
    if (mN) { mN.hidden = false; mN.duel = false; const mp = reg.place(0, -4), g = groundAt(mp.x, mp.z, 99).h; mN.pos.set(mp.x, g, mp.z); mN.yaw = reg.rot + Math.PI; }
    clearEnemies('duel_' + id);
    if (id !== 'mugen') {
      notify(reg.master + " s'incline. Le sceau t'attend au dojo.", 'gold');
      const nxt = REGIONS.find(r => r.num === reg.num + 1);
      if (nxt) setTimeout(() => notify('Nouvelle route ouverte : ' + nxt.name, 'quest'), 1800);
    } else {
      setTimeout(() => finalVictory(reg, sealsCount(ST.seals)), 1500);
    }
  }
});
G.on('playerDown', () => {
  if (G.training) { G.pl.hp = G.pl.hpMax; notify('Entraînement : vie rendue.'); return; }
  G.pl.dead = true; G.emit('defeat');
  setTimeout(() => {
    const pl = G.pl; pl.dead = false; pl.hp = pl.hpMax; pl.downT = 0; pl.hurtT = 0; pl.lock = null; pl.oxygen = 100; pl.inWater = false; pl.buffs = {};
    const g = groundAt(ST.rest.x, ST.rest.z, 99); pl.pos.set(ST.rest.x, g.h, ST.rest.z); pl.vel.set(0, 0, 0);
    if (ST.flags.duelOn) { clearEnemies('duel'); ST.flags.duelOn = false; NPC.akira.hidden = false; NPC.akira.duel = false; notify('Maître Hana : « Relève-toi. Reviens me voir quand tu seras prêt. »'); }
    for (const id in ST.flags) if (id.startsWith('duelOn_')) ST.flags[id] = false;
    for (const e of G.enemies.slice()) if (e.tag && e.tag.startsWith('duel_')) clearEnemies(e.tag);
    for (const id in NPC) { const n = NPC[id]; if (n && n.def && n.def.reg) { n.hidden = false; n.duel = false; } }
    if (ST.flags.campArmed && !ST.flags.campCleared) { clearEnemies('camp'); ST.flags.campSpawned = false; }
    clearEnemies('nuit'); G.emit('respawn');
  }, 3200);
});
function duel() {
  if (ST.flags.duelOn) return; ST.flags.duelOn = true;
  const pl = G.pl, D = W.dojo; pl.pos.set(0, D.y, D.cz + 4); pl.yaw = Math.PI; pl.vel.set(0, 0, 0);
  NPC.akira.hidden = true; NPC.akira.duel = true;
  const e = spawnEnemy('akira', 0, D.cz - 4, { tag: 'duel', name: 'Akira' }); e.yaw = 0; e.actor.sheathe(false);
  music('duel');
  cutscene([
    { d: 2.2, from: { p: [5, D.y + 1.6, D.cz + 6], l: [0, D.y + 1.3, D.cz - 4] }, to: { p: [3, D.y + 1.2, D.cz + 2], l: [0, D.y + 1.4, D.cz - 4] }, fov: 34, sub: 'Akira — premier élève du dojo Sakura no Kage' },
    { d: 2.0, from: { p: [-4, D.y + 1.5, D.cz - 6], l: [0, D.y + 1.4, D.cz + 4] }, to: { p: [-2.5, D.y + 1.3, D.cz - 3], l: [0, D.y + 1.5, D.cz + 4] }, fov: 34, sub: 'Sora' },
    { d: 2.0, from: { p: [9, D.y + 4, D.cz], l: [0, D.y + 1, D.cz] }, to: { p: [7, D.y + 2.2, D.cz + 1], l: [0, D.y + 1.2, D.cz] }, fov: 46, sub: 'Maître Hana : « Commencez ! »', fn: () => { S.gong(); } },
  ], () => { e.aggro = true; pl.lock = e; notify('Duel : Akira', 'gold'); });
}

/* ---------- duels des neuf dojos ---------- */
export function startDuel(reg) {
  const key = 'duelOn_' + reg.id; if (ST.flags[key]) return; ST.flags[key] = true;
  const pl = G.pl; pl.pos.set(reg.duelPos.x, terrainH(reg.duelPos.x, reg.duelPos.z), reg.duelPos.z);
  pl.yaw = reg.rot; pl.vel.set(0, 0, 0); pl.ox = pl.oxygen;
  const boss = spawnBoss(reg, 'duel_' + reg.id, 0, -9);
  boss.yaw = reg.rot + Math.PI;
  const mN = NPC['master_' + reg.id]; if (mN) { mN.hidden = true; mN.duel = true; }
  music('duel'); G.cam.yaw = reg.rot + Math.PI;
  cutscene([
    { d: 1.8, from: { p: [reg.place(4, 8).x, reg.y + 1.6, reg.place(4, 8).z], l: [reg.duelPos.x, reg.y + 1.4, reg.duelPos.z] }, to: { p: [reg.place(3, 5).x, reg.y + 1.3, reg.place(3, 5).z], l: [reg.duelPos.x, reg.y + 1.5, reg.duelPos.z] }, fov: 34, sub: reg.master + ' — ' + reg.dojo },
    { d: 1.6, from: { p: [reg.place(-5, 5).x, reg.y + 1.6, reg.place(-5, 5).z], l: [reg.duelPos.x, reg.y + 1.4, reg.duelPos.z] }, to: { p: [reg.place(-3, 3).x, reg.y + 1.3, reg.place(-3, 3).z], l: [reg.duelPos.x, reg.y + 1.5, reg.duelPos.z] }, fov: 34, sub: 'Sora' },
    { d: 1.4, from: { p: [reg.place(0, 12).x, reg.y + 4, reg.place(0, 12).z], l: [reg.duelPos.x, reg.y + 1, reg.duelPos.z] }, to: { p: [reg.place(0, 8).x, reg.y + 2.4, reg.place(0, 8).z], l: [reg.duelPos.x, reg.y + 1.2, reg.duelPos.z] }, fov: 44, sub: '« En garde. »', fn: () => S.gong() },
  ], () => { boss.aggro = true; pl.lock = boss; notify('Duel : ' + reg.master, 'gold'); });
}

/* le camp s'arme quand on approche */
function campTick() {
  if (ST.flags.campArmed && !ST.flags.campCleared && !ST.flags.campSpawned && Math.hypot(G.pl.pos.x - W.camp.x, G.pl.pos.z - W.camp.z) < 42) {
    ST.flags.campSpawned = true; const c = W.camp;
    spawnEnemy('ronin', c.x - 4, c.z + 2, { tag: 'camp' }); spawnEnemy('ronin', c.x + 3, c.z - 3, { tag: 'camp' }); spawnEnemy('scout', c.x + 5, c.z + 4, { tag: 'camp' }); spawnEnemy('brute', c.x, c.z - 6, { tag: 'camp', name: 'Gonzo le colosse' });
    notify('Quatre rônin autour du feu. TAB pour verrouiller une cible.');
  }
  const night = W.time > 20.5 || W.time < 4.5;
  if (night && ST.quests.main1 && ST.quests.main1.step >= 7 && !ST.flags.nightSpawned && Math.hypot(G.pl.pos.x, G.pl.pos.z - 95) < 30) { ST.flags.nightSpawned = true; spawnEnemy('ronin', -3, 112, { tag: 'nuit', aggro: true }); spawnEnemy('scout', 4, 108, { tag: 'nuit', aggro: true }); notify('Embuscade sur la route !'); }
  if (!night) ST.flags.nightSpawned = false;
}

/* forces d'une épreuve : quatre hommes de main de la vallée */
function spawnTrial(reg, n, tag, spread = 26) {
  if (ST.flags['spawned_' + tag + reg.id]) return;
  ST.flags['spawned_' + tag + reg.id] = true;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + 0.4, d = spread * (0.5 + (i % 3) * 0.25);
    const p = reg.place(Math.cos(a) * d, 52 + Math.sin(a) * d * 0.5);
    const e = spawnRegionFoe(reg, p.x, p.z, tag + reg.id);
    e.aggro = false; e.aggroDelay = 1.5;
  }
  notify('Des hommes de main rôdent autour du dojo.', 'warn');
}

/* ============================ CINÉMATIQUES ============================ */
export function cutscene(shots, done) { ST.cut = { shots, i: 0, t: 0, done }; G.mode = 'cutscene'; G.camOverride = { pos: V(), look: V(), fov: 50 }; G.emit('cut', true); shots[0].fn?.(); if (document.pointerLockElement) document.exitPointerLock(); }
export function cutUpdate(dt) {
  const c = ST.cut; if (!c) return null; const s = c.shots[c.i]; c.t += dt;
  const u = easeInOut(clamp(c.t / s.d, 0, 1)), A = s.from, B = s.to || s.from;
  const p = (k) => V(lerp(A[k][0], B[k][0], u), lerp(A[k][1], B[k][1], u), lerp(A[k][2], B[k][2], u));
  G.camOverride.pos.copy(p('p')); G.camOverride.look.copy(p('l')); G.camOverride.fov = s.fov || 50;
  s.tick?.(c.t, dt);
  if (tap('Enter') || tap('Escape')) { c.i = c.shots.length - 1; c.t = s.d; }
  if (c.t >= s.d) { c.i++; c.t = 0; if (c.i >= c.shots.length) { endCut(); return null; } c.shots[c.i].fn?.(); }
  return c.shots[c.i];
}
function endCut() { const c = ST.cut; ST.cut = null; G.mode = 'play'; G.camOverride = null; G.pl.autoWalk = 0; G.emit('cut', false); c.done?.(); }
export function introCut() {
  const pl = G.pl, rei = NPC.rei; W.time = 6.25;
  pl.pos.set(0, groundAt(0, 124).h, 124); pl.yaw = Math.PI; pl.autoWalk = 0;
  const ry = groundAt(-24, 19, 99).h;
  cutscene([
    { d: 6.5, from: { p: [-60, 70, 220], l: [0, 8, 0] }, to: { p: [-20, 46, 170], l: [0, 6, -40] }, fov: 46, sub: 'Sakura Valley. La première des dix vallées du KAGE TRIAL.' },
    { d: 5.5, from: { p: [5, 1.3, 104], l: [0, 1.6, 116] }, to: { p: [3.2, 1.5, 106], l: [0, 1.6, 112] }, fov: 34, sub: 'Sora. Une lettre scellée du dojo Sakura no Kage t\'a fait venir jusqu\'ici.', fn: () => { pl.autoWalk = 1.5; } },
    { d: 4.5, from: { p: [-26.5, ry + 1.1, 25], l: [-24, ry + 1.5, 19] }, to: { p: [-25.6, ry + 1.4, 23.2], l: [-24, ry + 1.6, 19] }, fov: 32, sub: 'Quelqu\'un t\'attendait.', fn: () => { rei.show = true; rei.pos.set(-24, ry, 19); rei.yaw = Math.PI * 0.85; rei.actor.emotion = 'neutre'; }, tick: (t) => { if (t > 3.8) rei.show = false; } },
    { d: 3.5, from: { p: [0, 3, 120], l: [0, 2, 96] }, to: { p: [0, 2.6, 109], l: [0, 1.6, 98] }, fov: 50, sub: 'CHAPITRE 1 — L\'APPEL DU DOJO', fn: () => { rei.show = false; pl.pos.set(0, groundAt(0, 104).h, 104); pl.autoWalk = 1.2; }, title: true },
  ], () => { rei.show = false; G.cam.yaw = Math.PI; G.cam.pitch = 0.2; startQuest('main1'); });
}
function cutRei() {
  const rei = NPC.rei, x = 82, z = -52, y = groundAt(x, z, 99).h;
  rei.show = true; rei.pos.set(x, y, z); rei.yaw = Math.atan2(G.pl.pos.x - x, G.pl.pos.z - z);
  G.pl.yaw = Math.atan2(x - G.pl.pos.x, z - G.pl.pos.z);
  cutscene([
    { d: 3, from: { p: [x + 6, y + 3, z + 8], l: [x, y + 1.4, z] }, to: { p: [x + 3, y + 1.8, z + 5], l: [x, y + 1.5, z] }, fov: 36, sub: 'Rei' },
  ], () => {
    dialog([L('Rei', 'Tu as battu Akira. Hana a choisi vite, cette fois.', 'neutre'), L('Sora', 'Qui es-tu ?'), L('Rei', 'Quelqu\'un qui se souvient. C\'est rare, par ici.'),
      L('Rei', 'Le Null a déjà pris deux ponts dans la région de l\'Ombre. Personne ne s\'en est rendu compte. Les gens contournent la rivière sans savoir pourquoi.'),
      L('Rei', 'Les dix dojos ne sont pas un tournoi, Sora. C\'est une serrure. Et Kage cherche la clé.', 'colere'),
      L('Rei', 'Les cols sont ouverts. Commence par le Quartier des Ombres, au nord-ouest. Je t\'y attendrai peut-être.')], null, () => {
      rei.show = false; sparks(V(x, y + 1, z), 40, '#f6c6d3', 4); S.gong();
      ST.flags.chapter1 = true; ST.seals.sakura = true; ST.chars.akira = true;
      notify('Les neuf autres dojos sont ouverts. Suis les routes !', 'quest');
      G.emit('seal', { reg: REGIONS[0], count: sealsCount(ST.seals) });
    }, rei);
  });
}
/* ---------- fin ---------- */
function finalVictory(reg, n) {
  clearEnemies('duel_mugen');
  if (ST.flags.ended) return;
  const mN = NPC['master_mugen']; if (mN) { mN.hidden = false; mN.duel = false; }
  ST.seals.mugen = true; ST.chars.hana = true; ST.ended = true; ST.flags.ended = true;
  const q10 = ST.quests.main10 || (ST.quests.main10 = { step: 4, done: false });
  q10.step = 4; q10.done = true; ST.track = 'main10';
  dialog([
    L('Kage', 'Tu m\'as battu avec mes propres coups. C\'est la seule manière.', 'joie'),
    L('Kage', 'Je n\'étais pas le gardien du Vide. J\'étais le premier élève. Celui que les dix dojos ont oublié le jour où ils ont cessé de se parler.'),
    L('Sora', 'Le Null… c\'est toi ?'),
    L('Kage', 'C\'est le silence entre les dojos. Tant que quelqu\'un se souviendra, il ne sera qu\'un souvenir.'),
    L('Kage', 'Alors souviens-toi de moi. Garde les dix. Enseigne aux suivants qu\'une école seule n\'est qu\'une chambre vide.'),
  ], null, () => {
    ST.unlocks.mugen = true; addXP(1200); G.pl.ryo += 500; G.emit('ending', { seals: sealsCount(ST.seals) });
    save(true);
  }, NPC['master_mugen']);
}
export function secretEndingCodex() {
  return ST.flags.ended ? 'Les dix dojos sont réunis. Le Null n\'est plus qu\'un souvenir.' : 'Le KAGE TRIAL n\'est pas un tournoi. C\'est une serrure.';
}

/* ============================ BOUCLE DE L'Histoire ============================ */
let fogT = 0, saveT = 0;
export function storyUpdate(dt) {
  if (G.training) return;
  questTick(); campTick();
  const pl = G.pl;
  for (const p of W.pois) if (!ST.disc[p.id] && !p.hidden && Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < p.r) { ST.disc[p.id] = true; notify('Lieu découvert : ' + p.name, 'place'); addXP(15); S.uiOk(); }
  fogT -= dt;
  if (fogT < 0) { fogT = 0.5; const cx = Math.floor((pl.pos.x + MAP_SIZE / 2) / (MAP_SIZE / FOGN)), cz = Math.floor((pl.pos.z + MAP_SIZE / 2) / (MAP_SIZE / FOGN)); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const x = cx + i, z = cz + j; if (x >= 0 && z >= 0 && x < FOGN && z < FOGN) ST.fog[z * FOGN + x] = 1; } }
  const safe = G.inDojo || Math.hypot(pl.pos.x - W.shrine.x, pl.pos.z - W.shrine.z) < 12 || Math.hypot(pl.pos.x - W.teaHouse.x, pl.pos.z - W.teaHouse.z) < 8 || Math.hypot(pl.pos.x - (W.inn ? W.inn.x : 9999), pl.pos.z - (W.inn ? W.inn.z : 9999)) < 9;
  if (safe) ST.rest = { x: G.inDojo ? pl.pos.x : pl.pos.x, z: G.inDojo ? pl.pos.z : pl.pos.z };
  saveT += dt; if (saveT > 75 && G.mode === 'play') { saveT = 0; save(true); }
}

/* ============================ SAUVEGARDE ============================ */
const KEY = 'kage-rebirth-3d-v1';
let memSave = null;
export function snapshot() {
  const pl = G.pl;
  return { v: 2, t: Date.now(), pos: [pl.pos.x, pl.pos.y, pl.pos.z], yaw: pl.yaw, time: W.time, weather: W.weather.target,
    pl: { hp: pl.hp, en: pl.en, level: pl.level, xp: pl.xp, sp: pl.sp, skills: pl.skills, ryo: pl.ryo, inv: pl.inv, special: pl.special, ult: pl.ult, char: pl.char, gear: pl.gear, blessings: pl.blessings, oxygen: pl.oxygen,
      look: { outfit: pl.look.outfit, hair: pl.look.hair, skin: pl.look.skin, scarf: pl.look.scarf, band: pl.look.band, kasa: pl.look.kasa, mask: pl.look.mask } },
    quests: ST.quests, disc: ST.disc, scrolls: ST.scrolls, flags: ST.flags, fog: Array.from(ST.fog), unlocks: ST.unlocks, seals: ST.seals, chars: ST.chars,
    relics: ST.relics, braziers: ST.braziers, bowed: ST.bowed, altars: ST.altars, ended: ST.ended,
    lit: W.interact.filter(i => i.kind === 'toro' && i.lit).map(i => i.id), relicsTaken: W.interact.filter(i => i.kind === 'relic' && i.taken).map(i => i.id), braziersLit: W.interact.filter(i => i.kind === 'brazier' && i.lit).map(i => i.id),
    track: ST.track, rest: ST.rest, counts: { maki: Array.from(ST.counts.maki), parry: ST.counts.parry, kills: ST.counts.kills } };
}
export function save(quiet) {
  if (G.training || G.mode === 'title') return false;
  const snap = snapshot(), data = JSON.stringify(snap); memSave = data; G.emit('snapshot', snap);
  try { localStorage.setItem(KEY, data); if (!quiet) notify('Partie sauvegardée'); G.emit('saved'); return true; }
  catch (e) { if (!quiet) notify('Ce navigateur refuse la sauvegarde locale : utilise le code de sauvegarde dans Paramètres.', 'warn'); return false; }
}
export function putSave(d) { memSave = JSON.stringify(d); try { localStorage.setItem(KEY, memSave); } catch (e) {} }
export function hasSave() { try { return !!localStorage.getItem(KEY) || !!memSave; } catch (e) { return !!memSave; } }
export function readSave() { try { return JSON.parse(localStorage.getItem(KEY) || memSave || 'null'); } catch (e) { return memSave ? JSON.parse(memSave) : null; } }
export function exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(snapshot())))); }
export function importCode(code) { try { const d = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (!d || (d.v !== 1 && d.v !== 2)) return null; memSave = JSON.stringify(d); try { localStorage.setItem(KEY, memSave); } catch (e) {} return d; } catch (e) { return null; } }
export function applySave(d) {
  const pl = G.pl;
  Object.assign(pl, { hp: d.pl.hp, en: d.pl.en, level: d.pl.level, xp: d.pl.xp, sp: d.pl.sp, skills: d.pl.skills || {}, ryo: d.pl.ryo, inv: d.pl.inv || {}, special: d.pl.special, ult: d.pl.ult,
    gear: Object.assign({ lame: 0, armure: 0, bottes: 0 }, d.pl.gear || {}), blessings: d.pl.blessings || 0, oxygen: d.pl.oxygen ?? 100 });
  if (d.pl.char && CHARS[d.pl.char]) { setCharacter(d.pl.char); }
  if (d.pl.look) setLook(d.pl.look);
  pl.hpMax = hpMaxOf(pl); pl.hp = Math.min(pl.hp, pl.hpMax);
  pl.pos.set(d.pos[0], d.pos[1], d.pos[2]); pl.yaw = d.yaw; W.time = d.time;
  ST.quests = d.quests || {}; ST.disc = d.disc || {}; ST.scrolls = d.scrolls || {}; Object.assign(ST.flags, d.flags || {}); ST.unlocks = d.unlocks || {}; ST.track = d.track || 'main1'; ST.rest = d.rest || ST.rest;
  ST.seals = d.seals || {}; ST.chars = Object.assign({ sora: true }, d.chars || {}); ST.relics = d.relics || {}; ST.braziers = d.braziers || {}; ST.bowed = d.bowed || {}; ST.altars = d.altars || {}; ST.ended = !!d.ended;
  ST.counts.maki = new Set(d.counts?.maki || []); ST.counts.parry = d.counts?.parry || 0; ST.counts.kills = d.counts?.kills || {};
  if (d.fog) { if (d.fog.length === FOGN * FOGN) ST.fog.set(d.fog); else ST.fog = new Uint8Array(FOGN * FOGN); }
  for (const it of W.interact) {
    if (it.kind === 'rouleau' && ST.scrolls[it.id]) { it.taken = true; it.mesh.visible = false; it.glow.visible = false; }
    if (it.kind === 'toro' && d.lit?.includes(it.id)) { it.lit = true; it.light.intensity = 4; it.glow.material.opacity = 0.9; }
    if (it.kind === 'relic' && d.relicsTaken?.includes(it.id)) { it.taken = true; if (it.mesh) it.mesh.visible = false; if (it.glow) it.glow.visible = false; }
    if (it.kind === 'brazier' && (ST.braziers[it.id] || d.braziersLit?.includes(it.id))) { it.lit = true; if (it.mesh) it.mesh.visible = true; if (it.glow) it.glow.material.opacity = 0.8; }
  }
  if (d.weather) W.weather.target = d.weather;
  if (ST.flags.campArmed) { const p = W.pois.find(p => p.id === 'camp'); if (p) p.hidden = false; }
  const s = curStep('main1'); if (s === QUESTS.main1.steps[5]) parryDrill(true);
  if (ST.mochi && ST.flags.mochiFound) { ST.mochi.home = { x: 2, z: 10 }; ST.mochi.root.position.set(2, 0, 10); }
  /* on ne recharge jamais au milieu d'un duel : les camps se vident */
  for (const k in ST.flags) if (k.startsWith('duelOn_') || k === 'duelOn') ST.flags[k] = false;
  clearEnemies();
  resetNPCs();
  /* si on recharge en pleine épreuve, les hommes de main encore vivants reviennent */
  for (const reg of REGIONS) {
    if (reg.built) continue;
    const q = ST.quests['main' + reg.num];
    if (q && !q.done && q.step === 2) {
      const c = ST.counts.kills['trial_' + reg.id] || 0;
      if (c < 4) { delete ST.flags['spawned_trial_' + reg.id]; spawnTrial(reg, 4 - c, 'trial_'); }
    }
    if (reg.side && reg.side.kind === 'hunt') {
      const sq = ST.quests['side_' + reg.id], c = ST.counts.kills['hunt_' + reg.id] || 0;
      if (sq && !sq.done && c < reg.side.count) { delete ST.flags['spawned_hunt_' + reg.id]; spawnTrial(reg, reg.side.count - c, 'hunt_', 34); }
    }
  }
  G.emit('quests'); G.emit('seal', { reg: REGIONS[0], count: sealsCount(ST.seals) });
  notify('Partie chargée · ' + sealsCount(ST.seals) + ' / 10 sceaux'); save(true);
}
