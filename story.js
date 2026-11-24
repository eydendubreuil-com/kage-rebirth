/* KAGE: REBIRTH — histoire : quêtes, dialogues, cinématiques, progression, sauvegarde */
import * as THREE from 'three';
import { W, groundAt, terrainH } from './world.js';
import { G, spawnNPC, spawnEnemy, clearEnemies, notify, slowmo, setLook, hpMaxOf, clearTaps, tap, sparks, ring } from './game.js';
import { Actor, MOVES, Cat, OUTFITS } from './actor.js';
import { S, music } from './audio.js';
import { clamp, lerp, easeInOut, rr, R, T } from './util.js';

export const ST = { quests: {}, main: 'main1', disc: {}, scrolls: {}, flags: {}, fog: new Uint8Array(28 * 28), dialog: null, cut: null, unlocks: {}, rest: { x: 0, z: -72 }, counts: { maki: new Set(), parry: 0 }, track: 'main1' };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const NPC = {};
const npcPos = (id) => () => NPC[id] ? { x: NPC[id].pos.x, z: NPC[id].pos.z } : null;

/* ============================ QUÊTES ============================ */
export const QUESTS = {
  main1: { title: 'Chapitre 1 — L\'appel du dojo', kind: 'Principale', steps: [
    { text: 'Franchis le grand torii et entre dans le village.', target: () => ({ x: 0, z: 30 }), check: () => G.pl.pos.z < 62 },
    { text: 'Parle à l\'Ancienne Yuki, devant sa maison, côté ouest de la grand-rue.', target: npcPos('yuki'), talk: 'yuki' },
    { text: 'Monte au dojo Sakura no Kage, tout au nord du village.', target: () => ({ x: 0, z: -80 }), check: () => G.inDojo },
    { text: 'Présente-toi à Maître Hana, au fond du dojo.', target: npcPos('hana'), talk: 'hana' },
    { text: 'Frappe chacun des 4 makiwara trois fois : clic gauche, clic gauche, clic gauche, pour enchaîner.', target: () => ({ x: -7.6, z: -97 }), progress: () => `${ST.counts.maki.size} / 4`, check: () => ST.counts.maki.size >= 4 },
    { text: 'Pare 3 attaques d\'Akira : appuie sur F juste avant l\'impact.', target: npcPos('akira'), start: () => parryDrill(true), progress: () => `${ST.counts.parry} / 3`, check: () => ST.counts.parry >= 3, end: () => parryDrill(false) },
    { text: 'Retourne voir Maître Hana.', target: npcPos('hana'), talk: 'hana' },
    { text: 'Des rônin rançonnent la route du sud-est. Trouve leur camp et chasse-les.', target: () => W.camp, start: () => { ST.flags.campArmed = true; W.pois.find(p => p.id === 'camp').hidden = false; }, check: () => ST.flags.campCleared },
    { text: 'Rapporte la nouvelle à Maître Hana.', target: npcPos('hana'), talk: 'hana' },
    { text: 'L\'épreuve du dojo : bats Akira en duel. Il ne retient pas ses coups.', target: () => ({ x: 0, z: -96 }), start: () => { ST.flags.duelReady = true; }, check: () => ST.flags.duelWon },
    { text: 'Une silhouette t\'observe depuis la pagode, à l\'est. Va la trouver.', target: () => ({ x: 80, z: -52 }), check: () => Math.hypot(G.pl.pos.x - 80, G.pl.pos.z + 52) < 9, end: () => cutRei() },
  ], reward: { xp: 250, ryo: 120, unlock: 'kage' } },
  lanternes: { title: 'Les lanternes d\'Inari', kind: 'Secondaire', steps: [
    { text: 'Allume les 4 lanternes de pierre devant le sanctuaire.', target: () => ({ x: W.shrine.x, z: W.shrine.z }), progress: () => `${W.interact.filter(i => i.kind === 'toro' && i.lit).length} / 4`, check: () => W.interact.filter(i => i.kind === 'toro' && i.lit).length >= 4 },
    { text: 'Retourne voir le moine Ryu.', target: npcPos('ryu'), talk: 'ryu' },
  ], reward: { xp: 90, ryo: 30, sp: 1 } },
  the: { title: 'Un thé pour le sanctuaire', kind: 'Secondaire', steps: [
    { text: 'Apporte le thé de Zen au moine Ryu, au sanctuaire Inari.', target: npcPos('ryu'), talk: 'ryu' },
  ], reward: { xp: 50, ryo: 25, item: ['onigiri', 2] } },
  mochi: { title: 'Où est Mochi ?', kind: 'Secondaire', steps: [
    { text: 'Kai a perdu sa chatte rousse, Mochi. Elle aime les rizières de l\'ouest.', target: () => ({ x: -62, z: 74 }), check: () => ST.flags.mochiFound },
    { text: 'Ramène la bonne nouvelle à Kai, sur la place du marché.', target: npcPos('kai'), talk: 'kai' },
  ], reward: { xp: 60, ryo: 35, unlock: 'hana' } },
  rouleaux: { title: 'Les rouleaux perdus', kind: 'Secondaire', steps: [
    { text: 'Retrouve les 5 rouleaux de Maître Hana cachés dans la vallée (regarde en hauteur, près de l\'eau, dans les bambous).', progress: () => `${Object.keys(ST.scrolls).length} / 5`, check: () => Object.keys(ST.scrolls).length >= 5 },
  ], reward: { xp: 150, sp: 2 } },
};
export function startQuest(id) { if (ST.quests[id]) return; ST.quests[id] = { step: 0, done: false }; const s = QUESTS[id].steps[0]; s.start?.(); S.quest(); notify('Nouvelle quête : ' + QUESTS[id].title, 'quest'); G.emit('quests'); save(); }
export function curStep(id) { const q = ST.quests[id]; if (!q || q.done) return null; return QUESTS[id].steps[q.step]; }
function advance(id) {
  const q = ST.quests[id], st = QUESTS[id].steps[q.step]; st.end?.();
  q.step++;
  if (q.step >= QUESTS[id].steps.length) { q.done = true; const r = QUESTS[id].reward; notify('Quête terminée : ' + QUESTS[id].title, 'quest'); S.quest();
    if (r.xp) addXP(r.xp); if (r.ryo) { G.pl.ryo += r.ryo; S.coin(); } if (r.sp) { G.pl.sp += r.sp; notify(`+${r.sp} point${r.sp > 1 ? 's' : ''} de compétence`); } if (r.item) G.pl.inv[r.item[0]] = (G.pl.inv[r.item[0]] || 0) + r.item[1];
    if (r.unlock) { ST.unlocks[r.unlock] = true; notify('Tenue débloquée : ' + OUTFITS[r.unlock].name.split(' (')[0], 'gold'); } }
  else { QUESTS[id].steps[q.step].start?.(); notify(QUESTS[id].steps[q.step].text, 'step'); S.uiOk(); }
  G.emit('quests'); save();
}
function questTick() {
  for (const id in ST.quests) { const s = curStep(id); if (s && s.check && s.check()) advance(id); }
}
export function questTalk(npcId) { for (const id in ST.quests) { const s = curStep(id); if (s && s.talk === npcId) return id; } return null; }
export function activeTarget() {
  const order = [ST.track, 'main1', ...Object.keys(ST.quests)];
  for (const id of order) { const s = curStep(id); if (s && s.target) { const t = s.target(); if (t) return { id, text: s.text, t, progress: s.progress?.() }; } else if (s) return { id, text: s.text, t: null, progress: s.progress?.() }; }
  return null;
}

/* ============================ PROGRESSION ============================ */
export const need = (lv) => 100 + (lv - 1) * 60;
export function addXP(n) {
  const pl = G.pl; pl.xp += n; G.emit('xp', n);
  while (pl.xp >= need(pl.level)) { pl.xp -= need(pl.level); pl.level++; pl.sp++; pl.hpMax = hpMaxOf(pl); pl.hp = pl.hpMax; S.level(); notify(`Niveau ${pl.level}  ·  +1 point de compétence`, 'gold'); }
}
export const SKILLS = {
  quatrieme: { name: 'Quatrième coup', cost: 2, text: 'Un quatrième coup tournoyant prolonge l\'enchaînement rapide.' },
  souffle: { name: 'Souffle long', cost: 1, text: 'Les coups portés rechargent l\'énergie plus vite.' },
  garde: { name: 'Garde de fer', cost: 1, text: 'La garde absorbe davantage et la fenêtre de parade s\'élargit.' },
  vent: { name: 'Pas du vent', cost: 1, text: 'Esquive plus fréquente, invincibilité plus longue.' },
  vitalite: { name: 'Vitalité', cost: 1, text: '+25 points de vie.' },
};
export function buySkill(id) { const pl = G.pl, s = SKILLS[id]; if (pl.skills[id] || pl.sp < s.cost) return false; pl.sp -= s.cost; pl.skills[id] = true; pl.hpMax = hpMaxOf(pl); S.uiOk(); notify('Compétence apprise : ' + s.name, 'gold'); save(); return true; }
export const ITEMS = { onigiri: { name: 'Onigiri', text: 'Rend 40 points de vie.', use: (pl) => { pl.hp = Math.min(pl.hpMax, pl.hp + 40); } }, the: { name: 'Thé vert', text: 'Rend 40 d\'énergie.', use: (pl) => { pl.en = Math.min(100, pl.en + 40); } }, theRyu: { name: 'Thé pour Ryu', text: 'Un pot de thé encore chaud, à porter au sanctuaire.', quest: true } };
export function useItem(id) { const pl = G.pl, it = ITEMS[id]; if (!it || it.quest || !(pl.inv[id] > 0)) return false; it.use(pl); pl.inv[id]--; S.uiOk(); notify(it.name + ' utilisé'); return true; }

/* ============================ HABITANTS ET LIEUX ============================ */
const LORE = [
  { id: 'r1', x: -24, z: 19, yTop: true, title: 'Le KAGE TRIAL', text: 'Tous les cent ans, sept dojos ouvrent leurs portes à dix combattants. Le tournoi porte un nom ancien : KAGE TRIAL, l\'épreuve de l\'ombre. Personne ne se souvient de qui l\'a fondé.' },
  { id: 'r2', x: 83, z: -66, title: 'Les sept dojos', text: 'Sakura, l\'Ombre, la Montagne, le Rouge, l\'Eau, le Jade, et le Vide. Chacun garde une région et une manière de se battre. Le septième n\'apparaît sur aucune carte.' },
  { id: 'r3', x: -99, z: -95, title: 'THE NULL', text: 'Le Null n\'efface pas les choses. Il efface le souvenir des choses. Un pont disparaît des mémoires, et un matin plus personne ne le traverse : il finit par tomber.' },
  { id: 'r4', x: -106, z: -60, title: 'Hana', text: 'Hana a gagné le dernier KAGE TRIAL. C\'est ce qu\'on raconte. Elle-même dit ne garder aucun souvenir de la finale.' },
  { id: 'r5', x: -22.8, z: 17.8, yTop: true, title: 'Kage', text: 'Le nom du tournoi est aussi celui d\'un combattant. Les anciens disent que Kage n\'a jamais perdu, et jamais gagné non plus.' },
];
export function populate() {
  const sc = G.scene;
  /* portes coulissantes du dojo */
  const D = W.dojo, door = W.doors[0], pm = new THREE.MeshStandardMaterial({ map: T.shoji(), emissive: new THREE.Color('#fff2d8'), emissiveMap: T.shoji(), emissiveIntensity: 0.2, side: THREE.DoubleSide, roughness: 0.9 });
  W.shojiMats.push(pm);
  door.panels = [-3, -1, 1, 3].map((x, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(2, 4.2, 0.08), pm); m.position.set(x, D.y + 2.1, D.door - 0.05 - (i === 1 || i === 2 ? 0.1 : 0)); m.userData.x0 = x; m.userData.dx = i === 1 ? -2 : (i === 2 ? 2 : 0); m.castShadow = true; sc.add(m); return m; });
  W.colliders.push({ x0: -4, x1: -2, z0: D.door - 0.35, z1: D.door + 0.25, y0: D.y - 1, y1: D.y + 6 }, { x0: 2, x1: 4, z0: D.door - 0.35, z1: D.door + 0.25, y0: D.y - 1, y1: D.y + 6 });
  W.doorCol = { x0: -2, x1: 2, z0: D.door - 0.35, z1: D.door + 0.25, y0: D.y - 1, y1: D.y + 6 }; W.colliders.push(W.doorCol);
  sc.add(W.dojoLight);
  /* rais de lumière dans le dojo */
  const rm = new THREE.MeshBasicMaterial({ map: T.ray(), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  W.rayMat = rm;
  for (let k = 0; k < 7; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 7.5), rm); m.position.set(D.x0 + 3.2, D.y + 3.4, D.z0 + 3 + k * 4); m.rotation.set(0, Math.PI / 2, -0.62); sc.add(m); }
  /* makiwara comme cibles */
  W.dummyFighters = W.dummies.map(d => ({ isDummy: true, pos: V(d.x, D.y, d.z), radius: 0.4, hits: 0, shake: 0, dead: false, yaw: 0, id: d.id, mesh: null }));
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

  /* --- personnages nommés --- */
  NPC.yuki = spawnNPC({ id: 'yuki', name: 'Ancienne Yuki', x: -8, z: -23, yaw: Math.PI / 2, look: { outfit: 'cendre', hair: 'chignon', hairColor: '#cfcbc4', scale: 0.93, skin: 0 }, path: [[-8, -23, 8], [-7.2, -16, 5], [-8, -23, 12]], speed: 0.7,
    barks: ['Le vent descend de la montagne, ce matin.', 'Tu as les yeux de quelqu\'un qui a marché longtemps.'] });
  NPC.hana = spawnNPC({ id: 'hana', name: 'Maître Hana', x: 0, z: -108.4, yaw: 0, look: { outfit: 'hana', hair: 'queue', hairColor: '#1e1b1f', skin: 0, sword: true }, activity: 'seiza' });
  NPC.akira = spawnNPC({ id: 'akira', name: 'Akira', x: 4.5, z: -100, yaw: -Math.PI / 2, look: { outfit: 'indigo', hair: 'queue', band: true, sword: true, chains: true } });
  NPC.akira.actor.sheathe(false); kata(NPC.akira);
  for (const [x, z] of [[3.5, -92], [6.5, -92], [3.5, -88.5], [6.5, -88.5]]) { const s = spawnNPC({ id: 'eleve', name: 'Élève du dojo', x, z, yaw: -Math.PI / 2, look: { outfit: 'sakura', hair: R() < 0.5 ? 'court' : 'chignon', band: true, sword: true }, talkable: true, barks: ['Hai !', 'Encore cent coups avant le repas.', 'Akira ne fatigue jamais.'] }); s.actor.sheathe(false); kata(s); }
  NPC.zen = spawnNPC({ id: 'zen', name: 'Zen', x: 17.6, z: -12.5, yaw: -Math.PI / 2, look: { outfit: 'foret', hair: 'court', hairColor: '#2a2420', skin: 1 }, activity: 'talk', barks: ['Un thé ? Le meilleur de la vallée.', 'Assieds-toi, voyageur.'] });
  NPC.ryu = spawnNPC({ id: 'ryu', name: 'Moine Ryu', x: W.shrine.x + 3, z: W.shrine.z + 4, look: { outfit: 'cendre', hair: 'court', hairColor: '#7a7066', skin: 1, scale: 1.02 }, activity: 'sweep', path: [[W.shrine.x + 3, W.shrine.z + 4, 9], [W.shrine.x + 6, W.shrine.z + 8, 8], [W.shrine.x - 1, W.shrine.z + 7, 9]], speed: 0.6, barks: ['Les feuilles tombent, je balaie. Le monde est simple.'] });
  NPC.raizo = spawnNPC({ id: 'raizo', name: 'Raizo, le forgeron', x: 8.6, z: -35, yaw: -Math.PI / 2, look: { outfit: 'cendre', hair: 'court', skin: 2, scale: 1.1 }, activity: 'sweep', barks: ['Une lame, ça s\'écoute avant de se regarder.'] });
  NPC.kai = spawnNPC({ id: 'kai', name: 'Kai', x: 2, z: 6, look: { outfit: 'indigo', hair: 'court', scale: 0.66, skin: 0 }, path: [[2, 6, 1], [-3, 12, 0.5], [-2, -4, 1], [3, -8, 2]], speed: 2.4, barks: ['Tu as vu Mochi ? Elle est toute rousse !', 'Un jour j\'entrerai au dojo, moi aussi.'] });
  /* habitants qui vivent leur journée */
  const outfits = ['indigo', 'foret', 'cendre', 'sakura', 'encre'], hairs = ['chignon', 'court', 'queue'];
  const routes = [
    [[0, 30], [0, 0, 4], [0, -40], [-2, -52, 6]], [[-40, 0], [-10, 1, 3], [10, -1], [40, 0, 5]], [[5, -30, 6], [4, -10], [-4, 12, 5], [-3, 26]],
    [[30, 2], [52, -8, 6], [56, -22, 5], [34, 0]], [[-30, 1], [-46, -6, 4], [-58, -14, 6], [-46, -6]], [[0, 56, 8], [24, 72, 6], [0, 60]],
    [[-4, -44, 5], [-4, -20, 3], [4, 0, 4], [4, -30]], [[8, 20, 7], [-6, 8, 3], [6, -14, 5]], [[0, 90, 5], [-24, 74, 7], [-48, 70, 9], [-22, 76]], [[20, -6, 4], [44, 2, 6], [24, 2]],
  ];
  routes.forEach((r, i) => spawnNPC({ id: 'h' + i, name: ['Aiko', 'Daichi', 'Emi', 'Goro', 'Haru', 'Ichiro', 'Kana', 'Masa', 'Nori', 'Rin'][i], x: r[0][0], z: r[0][1], look: { outfit: outfits[i % 5], hair: hairs[i % 3], skin: i % 3, hairColor: i % 4 === 0 ? '#3a2a20' : '#141210', scale: rr(0.92, 1.04) }, path: r, speed: rr(1.0, 1.5), night: true, rain: i % 2 === 0,
    barks: [['Belle matinée, n\'est-ce pas ?', 'Le marché ferme au coucher du soleil.'], ['On dit que des rônin rôdent près du camp au sud-est.', 'Fais attention sur la route.'], ['Les cerisiers ont fleuri tôt, cette année.', 'Tu viens pour le dojo ?'], ['Le moine Ryu cherche quelqu\'un pour ses lanternes.', 'Le thé de Zen est le meilleur.'], ['La tour de guet offre une vue sur toute la vallée.', 'Il paraît que des rouleaux anciens traînent un peu partout.']][i % 5] }));
  /* conversations sur la place */
  const pairs = [[[-2.5, 15], [-1.2, 15.6]], [[2.5, -18], [3.6, -17.2]], [[-30, -3], [-29, -2.2]]];
  pairs.forEach((p, i) => { const a = spawnNPC({ id: 'c' + i, name: 'Villageois', x: p[0][0], z: p[0][1], look: { outfit: outfits[(i + 2) % 5], hair: hairs[i % 3], skin: (i + 1) % 3 }, activity: 'talk', night: true, barks: ['… et alors il a dit que le pont avait toujours été là !', 'Chut, on écoute.'] });
    const b = spawnNPC({ id: 'd' + i, name: 'Villageoise', x: p[1][0], z: p[1][1], look: { outfit: outfits[(i + 3) % 5], hair: 'chignon', skin: i % 3 }, activity: 'talk', night: true, barks: ['Bonjour !'] });
    a.yaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z); b.yaw = a.yaw + Math.PI; a.lookTarget = b.pos.clone().setY(b.pos.y + 1.5); b.lookTarget = a.pos.clone().setY(a.pos.y + 1.5); });
  /* marchands derrière les étals */
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { if ((i + (sx > 0 ? 1 : 0)) % 2) continue; spawnNPC({ id: 'm' + i + sx, name: 'Marchand', x: sx * 7.3, z: -6 + i * 6, yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2, look: { outfit: outfits[(i * 2) % 5], hair: 'court', skin: i % 3 }, activity: 'talk', night: true, barks: ['Des kakis, des radis, du riz !', 'Approche, approche !'] }); }
  /* chats, dont Mochi */
  for (const [x, z, c] of [[3, 14, '#2a2420'], [-20, -6, '#e9e2d6'], [-80, -30, '#5a5048'], [16, -18, '#2a2420']]) { const cat = new Cat(sc, c); cat.root.position.set(x, 0, z); cat.home = { x, z }; G.cats.push(cat); }
  const mochi = new Cat(sc, '#d9822b'); mochi.root.position.set(-62, 0, 76); mochi.home = { x: -62, z: 76 }; G.cats.push(mochi); ST.mochi = mochi;
  /* Rei : n'apparaît que dans les scènes */
  NPC.rei = spawnNPC({ id: 'rei', name: 'Rei', x: 13, z: 26, look: { outfit: 'encre', hair: 'capuche', mask: true, scarf: true, chains: true, sword: true }, talkable: false });
  NPC.rei.hidden = true; NPC.rei.noGround = true; NPC.rei.script = (n) => { n.hidden = !n.show; };
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
  const pl = G.pl, f = pl.facing(); let best = null, bd = 2.6;
  const consider = (o, x, z, y) => { const dx = x - pl.pos.x, dz = z - pl.pos.z, d = Math.hypot(dx, dz); if (d > bd || Math.abs(y - pl.pos.y - 1) > 2.2) return; const dot = (dx * f.x + dz * f.z) / (d || 1); if (d > 1.2 && dot < 0.2) return; bd = d; best = o; };
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
  if (o.kind === 'rouleau') { o.taken = true; o.mesh.visible = false; o.glow.visible = false; ST.scrolls[o.id] = true; S.uiOk(); addXP(30); if (!ST.quests.rouleaux) startQuest('rouleaux'); G.emit('lore', o.lore); save(); return; }
  if (o.kind === 'repos') return G.emit('rest', o);
  if (o.kind === 'mochi') { ST.flags.mochiFound = true; S.meow(); notify('Mochi ronronne. Elle rentrera seule au village.'); ST.mochi.home = { x: 2, z: 10 }; ST.mochi.root.position.set(2, 0, 10); return; }
  if (o.kind === 'descendre') { pl.climb = o.L; pl.pos.set(o.L.x, o.L.y1 - 0.4, o.L.z); return; }
}

/* ============================ DIALOGUES ============================ */
function L(who, text, emo) { return { who, text, emo }; }
export function talk(n) {
  const id = n.def.id, qid = questTalk(id), q = (k) => ST.quests[k], st = (k) => q(k) && !q(k).done ? q(k).step : -1;
  let lines = [], choices = null, after = null;
  if (id === 'yuki') {
    if (qid === 'main1') { lines = [L('Ancienne Yuki', 'Te voilà enfin. La lettre portait le sceau de Hana, je l\'ai reconnu de loin.', 'joie'), L('Sora', 'Elle dit seulement : « Viens au dojo avant la pleine lune. »'), L('Ancienne Yuki', 'Alors ne la fais pas attendre. Le dojo est tout au nord, en haut des marches de pierre.'), L('Ancienne Yuki', 'Et Sora… le KAGE TRIAL recommence. Les anciens l\'ont senti dans leurs rêves. Sois prudent.', 'surprise')]; after = () => advance('main1'); }
    else lines = [L('Ancienne Yuki', ['La vallée a l\'air calme. Elle ne l\'est jamais vraiment.', 'Hana était déjà la meilleure à ton âge. Et la plus têtue.', 'Les sept dojos… j\'en ai vu deux dans ma vie. C\'est déjà beaucoup.'][Math.floor(R() * 3)])];
  } else if (id === 'hana') {
    const s = st('main1');
    if (qid === 'main1' && s === 3) { lines = [L('Maître Hana', 'Sora. Tu as la démarche de ton père.', 'neutre'), L('Sora', 'Je ne l\'ai presque pas connu.'), L('Maître Hana', 'Moi si. Assez parlé. Le KAGE TRIAL va s\'ouvrir, et ce dojo doit y envoyer un combattant.'), L('Maître Hana', 'Montre-moi d\'abord ce que valent tes bras. Les makiwara, à gauche. Trois coups enchaînés sur chacun.', 'colere')]; after = () => advance('main1'); }
    else if (qid === 'main1' && s === 6) { lines = [L('Maître Hana', 'Tu pares au lieu de reculer. Bien.', 'joie'), L('Maître Hana', 'Je vais t\'apprendre la technique de ce dojo : le Pétale d\'ombre. Une ruée, trois entailles. Elle se paie avec ton énergie.'), L('Maître Hana', 'Maintenant, un vrai travail. Des rônin rançonnent la route du sud-est. Chasse-les de ma vallée.', 'colere')]; after = () => { G.pl.special = true; notify('Technique apprise : Pétale d\'ombre (Q, 50 d\'énergie)', 'gold'); advance('main1'); }; }
    else if (qid === 'main1' && s === 8) { lines = [L('Maître Hana', 'Le camp est vide ? Alors tu es prêt pour l\'épreuve.'), L('Maître Hana', 'Akira est mon meilleur élève. Il espérait partir seul au KAGE TRIAL. Bats-le, et c\'est toi qui iras.'), L('Akira', 'Je ne retiendrai pas mes coups.', 'colere')]; after = () => { advance('main1'); duel(); }; }
    else if (st('main1') === 9 && ST.flags.duelReady && !ST.flags.duelOn) { lines = [L('Maître Hana', 'Prêt ? Akira t\'attend au centre.')]; choices = [{ t: 'Commencer le duel', f: () => duel() }, { t: 'Pas encore', f: null }]; }
    else if (ST.quests.main1?.done) lines = [L('Maître Hana', 'Les six autres dojos t\'attendent au-delà des montagnes. Le chemin n\'est pas encore ouvert. Entraîne-toi, en attendant.')];
    else lines = [L('Maître Hana', 'Concentre-toi sur ce que je t\'ai demandé.')];
  } else if (id === 'akira') {
    lines = [L('Akira', ST.flags.duelWon ? 'Tu as gagné. Ne crois pas que ce sera toujours le cas.' : 'Tu es le nouveau ? On verra combien de temps tu tiens.', 'colere')];
  } else if (id === 'zen') {
    lines = [L('Zen', 'Bienvenue au salon Tsubaki ! Onigiri, thé, et les nouvelles du village.', 'joie')];
    choices = [{ t: 'Acheter un onigiri (15 ryo)', f: () => buy('onigiri', 15) }, { t: 'Acheter un thé vert (10 ryo)', f: () => buy('the', 10) }];
    if (!ST.quests.the) choices.push({ t: 'Tu as besoin d\'aide ?', f: () => { G.pl.inv.theRyu = 1; startQuest('the'); dialog([L('Zen', 'Justement ! Porte ce thé au moine Ryu, au sanctuaire Inari, à l\'ouest. Il oublie toujours de manger.')]); } });
    choices.push({ t: 'Au revoir', f: null });
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
    lines = [L('Raizo, le forgeron', 'Ta lame a été forgée dans le nord. Bon acier. Garde-la sèche et elle te gardera en vie.')];
  } else {
    const b = n.def.barks || ['…']; lines = [L(n.name, b[Math.floor(R() * b.length)])];
  }
  dialog(lines, choices, after, n);
}
function buy(item, price) { const pl = G.pl; if (pl.ryo < price) { notify('Pas assez de ryo.'); return; } pl.ryo -= price; pl.inv[item] = (pl.inv[item] || 0) + 1; S.coin(); notify(ITEMS[item].name + ' acheté'); save(); }
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
  /* plan de dialogue : champ / contrechamp */
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
G.on('dummyHit', ({ d, move }) => { const now = performance.now(); d.chainN = now - (d.lastT || 0) < 1500 ? (d.chainN || 0) + 1 : 1; d.lastT = now;
  if (curStep('main1') === QUESTS.main1.steps[4]) d.stepHits = (d.stepHits || 0) + 1;
  if ((move === 'l3' || d.chainN >= 3 || d.stepHits >= 3) && curStep('main1') === QUESTS.main1.steps[4] && !ST.counts.maki.has(d.id)) { ST.counts.maki.add(d.id); notify(`Makiwara ${ST.counts.maki.size} / 4`); } });
G.on('parry', (att) => { if (att === ST.drill) { ST.counts.parry++; notify(`Parade ${ST.counts.parry} / 3`); } addXP(5); });
G.on('enemyDown', (e) => { const T0 = e.T; addXP(T0.xp); const r = Math.round(rr(T0.ryo[0], T0.ryo[1])); if (r) { G.pl.ryo += r; S.coin(); notify(`+${r} ryo`); }
  if (e.tag === 'camp' && G.enemies.filter(o => o.tag === 'camp' && !o.dead).length === 0) { ST.flags.campCleared = true; notify('Le camp est libéré.', 'gold'); }
  if (e.tag === 'nuit') ST.flags.nightDone = true; });
G.on('yield', (e) => {
  if (e.tag === 'duel') { ST.flags.duelWon = true; ST.flags.duelOn = false; G.pl.ult = true; music('dojo');
    setTimeout(() => { dialog([L('Akira', 'Assez… Je cède.', 'colere'), L('Maître Hana', 'L\'épreuve est terminée. Sora représentera le dojo Sakura no Kage.', 'joie'), L('Maître Hana', 'Une dernière chose. Ta colère a réveillé quelque chose dans ta lame : la Renaissance de l\'ombre. Garde-la pour les vrais combats.')], null, () => { clearEnemies('duel'); NPC.akira.hidden = false; NPC.akira.duel = false; notify('Technique ultime : Renaissance de l\'ombre (R, 100 d\'énergie)', 'gold'); }, NPC.hana); }, 1400); }
  if (e.tag === 'spar') { notify('Ton partenaire s\'incline.'); setTimeout(() => clearEnemies('spar'), 1500); }
});
G.on('playerDown', () => {
  if (G.training) { G.pl.hp = G.pl.hpMax; notify('Entraînement : vie rendue.'); return; }
  G.pl.dead = true; G.emit('defeat');
  setTimeout(() => {
    const pl = G.pl; pl.dead = false; pl.hp = pl.hpMax; pl.downT = 0; pl.hurtT = 0; pl.lock = null;
    const g = groundAt(ST.rest.x, ST.rest.z, 99); pl.pos.set(ST.rest.x, g.h, ST.rest.z); pl.vel.set(0, 0, 0);
    if (ST.flags.duelOn) { clearEnemies('duel'); ST.flags.duelOn = false; NPC.akira.hidden = false; NPC.akira.duel = false; notify('Maître Hana : « Relève-toi. Reviens me voir quand tu seras prêt. »'); }
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
/* le camp s'arme quand on approche */
function campTick() {
  if (ST.flags.campArmed && !ST.flags.campCleared && !ST.flags.campSpawned && Math.hypot(G.pl.pos.x - W.camp.x, G.pl.pos.z - W.camp.z) < 42) {
    ST.flags.campSpawned = true; const c = W.camp;
    spawnEnemy('ronin', c.x - 4, c.z + 2, { tag: 'camp' }); spawnEnemy('ronin', c.x + 3, c.z - 3, { tag: 'camp' }); spawnEnemy('scout', c.x + 5, c.z + 4, { tag: 'camp' }); spawnEnemy('brute', c.x, c.z - 6, { tag: 'camp', name: 'Gonzo le colosse' });
    notify('Quatre rônin autour du feu. TAB pour verrouiller une cible.');
  }
  /* la nuit, une embuscade sur la route du torii (une fois par nuit, après le chapitre engagé) */
  const night = W.time > 20.5 || W.time < 4.5;
  if (night && ST.quests.main1 && ST.quests.main1.step >= 7 && !ST.flags.nightSpawned && Math.hypot(G.pl.pos.x, G.pl.pos.z - 95) < 30) { ST.flags.nightSpawned = true; spawnEnemy('ronin', -3, 112, { tag: 'nuit', aggro: true }); spawnEnemy('scout', 4, 108, { tag: 'nuit', aggro: true }); notify('Embuscade sur la route !'); }
  if (!night) ST.flags.nightSpawned = false;
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
    { d: 6.5, from: { p: [-60, 70, 220], l: [0, 8, 0] }, to: { p: [-20, 46, 170], l: [0, 6, -40] }, fov: 46, sub: 'Sakura Valley. La première des sept régions du KAGE TRIAL.' },
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
      L('Rei', 'Les sept dojos ne sont pas un tournoi, Sora. C\'est une serrure. Et Kage cherche la clé.', 'colere'), L('Rei', 'On se reverra au-delà des montagnes.')], null, () => {
      rei.show = false; sparks(V(x, y + 1, z), 40, '#f6c6d3', 4); S.gong();
      ST.flags.chapter1 = true; G.emit('chapterEnd');
    }, rei);
  });
}

/* ============================ BOUCLE DE L'HISTOIRE ============================ */
let fogT = 0, saveT = 0;
export function storyUpdate(dt) {
  if (G.training) return;
  questTick(); campTick();
  /* lieux découverts, brouillard de la carte */
  const pl = G.pl;
  for (const p of W.pois) if (!ST.disc[p.id] && !p.hidden && Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < p.r) { ST.disc[p.id] = true; notify('Lieu découvert : ' + p.name, 'place'); addXP(15); S.uiOk(); }
  fogT -= dt; if (fogT < 0) { fogT = 0.5; const cx = Math.floor((pl.pos.x + 280) / 20), cz = Math.floor((pl.pos.z + 280) / 20); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const x = cx + i, z = cz + j; if (x >= 0 && z >= 0 && x < 28 && z < 28) ST.fog[z * 28 + x] = 1; } }
  if (G.inDojo || Math.hypot(pl.pos.x - W.shrine.x, pl.pos.z - W.shrine.z) < 12 || Math.hypot(pl.pos.x - W.teaHouse.x, pl.pos.z - W.teaHouse.z) < 8) ST.rest = { x: G.inDojo ? 0 : pl.pos.x, z: G.inDojo ? -90 : pl.pos.z };
  saveT += dt; if (saveT > 60 && G.mode === 'play') { saveT = 0; save(true); }
}

/* ============================ SAUVEGARDE ============================ */
const KEY = 'kage-rebirth-3d-v1';
let memSave = null;
export function snapshot() {
  const pl = G.pl;
  return { v: 1, t: Date.now(), pos: [pl.pos.x, pl.pos.y, pl.pos.z], yaw: pl.yaw, time: W.time,
    pl: { hp: pl.hp, en: pl.en, level: pl.level, xp: pl.xp, sp: pl.sp, skills: pl.skills, ryo: pl.ryo, inv: pl.inv, special: pl.special, ult: pl.ult, look: { outfit: pl.look.outfit, hair: pl.look.hair, skin: pl.look.skin, scarf: pl.look.scarf, band: pl.look.band, kasa: pl.look.kasa, mask: pl.look.mask } },
    quests: ST.quests, disc: ST.disc, scrolls: ST.scrolls, flags: { campCleared: ST.flags.campCleared, campArmed: ST.flags.campArmed, duelWon: ST.flags.duelWon, duelReady: ST.flags.duelReady, mochiFound: ST.flags.mochiFound, chapter1: ST.flags.chapter1 }, fog: Array.from(ST.fog), unlocks: ST.unlocks, lit: W.interact.filter(i => i.kind === 'toro' && i.lit).map(i => i.id), track: ST.track, rest: ST.rest };
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
export function importCode(code) { try { const d = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (!d || d.v !== 1) return null; memSave = JSON.stringify(d); try { localStorage.setItem(KEY, memSave); } catch (e) {} return d; } catch (e) { return null; } }
export function applySave(d) {
  const pl = G.pl; Object.assign(pl, { hp: d.pl.hp, en: d.pl.en, level: d.pl.level, xp: d.pl.xp, sp: d.pl.sp, skills: d.pl.skills || {}, ryo: d.pl.ryo, inv: d.pl.inv || {}, special: d.pl.special, ult: d.pl.ult });
  setLook(d.pl.look); pl.hpMax = hpMaxOf(pl);
  pl.pos.set(d.pos[0], d.pos[1], d.pos[2]); pl.yaw = d.yaw; W.time = d.time;
  ST.quests = d.quests || {}; ST.disc = d.disc || {}; ST.scrolls = d.scrolls || {}; Object.assign(ST.flags, d.flags || {}); ST.unlocks = d.unlocks || {}; ST.track = d.track || 'main1'; ST.rest = d.rest || ST.rest;
  if (d.fog) ST.fog.set(d.fog);
  for (const it of W.interact) { if (it.kind === 'rouleau' && ST.scrolls[it.id]) { it.taken = true; it.mesh.visible = false; it.glow.visible = false; } if (it.kind === 'toro' && d.lit?.includes(it.id)) { it.lit = true; it.light.intensity = 4; it.glow.material.opacity = 0.9; } }
  if (ST.flags.campArmed) { const p = W.pois.find(p => p.id === 'camp'); if (p) p.hidden = false; }
  const s = curStep('main1'); if (s === QUESTS.main1.steps[5]) parryDrill(true);
  if (ST.mochi && ST.flags.mochiFound) { ST.mochi.home = { x: 2, z: 10 }; ST.mochi.root.position.set(2, 0, 10); }
  G.emit('quests');
}
