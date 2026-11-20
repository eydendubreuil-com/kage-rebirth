/* KAGE: REBIRTH — démarrage, accueil cinématographique, boucle principale */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { W, buildWorld, updateWorld, groundAt, terrainH, inWater, RIVER } from './world.js';
import { G, initInput, initCamera, initFx, createPlayer, gameUpdate, tap, clearTaps, notify, spawnEnemy, clearEnemies, setLook, hpMaxOf } from './game.js';
import { ST, QUESTS, populate, storyUpdate, cutUpdate, dialogUpdate, dialogNext, dialog, findInteract, interact, introCut, save, hasSave, readSave, applySave, startQuest, animalsUpdate, resetNPCs, putSave, readSave as readLocal, useItem, buySkill, importCode, exportCode } from './story.js';
import { UI, loadProgress, hideLoad, toast, showTitle, refreshMenu, setTrack, openPanel, closePanel, pauseOpen, pauseClose, pauseTab, hudUpdate, showHelp, dialogDraw, cine, subs, card, fade, lore, loreClose } from './ui.js';
import { A, S, audioInit, applyVolumes, music, ambience, TRACK_NAMES } from './audio.js';
import { CLOUD, cloudInit, cloudSave, cloudLoad, signIn, signOut, onCloud } from './cloud.js';
import { polyDist, clamp, lerp, damp, easeInOut } from './util.js';

const QUAL = {
  basse: { terrainSeg: 170, trees: 650, grass: 7000, petals: 140, shadow: 1024, pr: 0.8, bloom: false, fogMul: 1.25, aa: false },
  moyenne: { terrainSeg: 230, trees: 1300, grass: 17000, petals: 300, shadow: 2048, pr: 1.25, bloom: true, fogMul: 1, aa: true },
  haute: { terrainSeg: 300, trees: 2100, grass: 34000, petals: 520, shadow: 4096, pr: 2, bloom: true, fogMul: 0.9, aa: true },
};
const SKEY = 'kage-rebirth-3d-settings';
const qp = new URLSearchParams(location.search);
try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (s) { Object.assign(G.settings, s.settings || {}); Object.assign(A.vol, s.vol || {}); G.savedLook = s.look; } } catch (e) {}
 if (qp.get('q')) G.settings.quality = qp.get('q'); if (qp.get('r')) G.autoRes = +qp.get('r');
const Q = QUAL[G.settings.quality] || QUAL.moyenne;
function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify({ settings: G.settings, vol: A.vol, look: G.pl ? G.pl.look : G.savedLook })); } catch (e) {} }

/* ---------- rendu ---------- */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = !qp.get('ns'); renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); G.scene = scene; G.renderer = renderer;
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.08, 6000);
let composer, bloom, bokeh, gtao;
function resize() {
  const pr = Math.min(devicePixelRatio || 1, Q.pr) * G.settings.res * (G.autoRes || 1);
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
}
addEventListener('resize', resize);
function buildComposer() {
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  /* occlusion ambiante : les coins, les dessous de toits et les pieds s'assombrissent naturellement */
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight); gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 12 }); gtao.blendIntensity = 0.85;
  composer.addPass(gtao);
  bokeh = new BokehPass(scene, camera, { focus: 4, aperture: 0.004, maxblur: 0.008 }); bokeh.enabled = false; if (G.settings.quality === 'haute') composer.addPass(bokeh);
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 0.86); composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

function applyPerf() {
  if (W.sun) W.sun.castShadow = G.settings.shadows !== false && !qp.get('ns');
  W.grassMul = G.settings.grass || 1;
  if (gtao) gtao.enabled = G.settings.ao ?? (G.settings.quality === 'haute');
  const f = document.getElementById('fpsc'); if (f) f.classList.toggle('hide', !G.settings.fpsc);
}
/* ---------- démarrage ---------- */
async function boot() {
  resize();
  try {
    await buildWorld(scene, renderer, Q, loadProgress);
    loadProgress('Habitants du village', 0.97); await new Promise(r => setTimeout(r, 0));
    initCamera(camera); initFx(scene); initInput(canvas);
    createPlayer(scene, G.savedLook);
    populate();
    if (Q.bloom) buildComposer();
    applyPerf();
    W.time = 6.3; updateWorld(0.016, camera.position, scene, renderer, G.pl.pos, Q, false);
    applyPerf(); titleSetup(); renderer.compile(scene, camera);
    loadProgress('Prêt', 1);
  } catch (e) { console.error(e); document.getElementById('loadl').textContent = 'Erreur au chargement : ' + e.message; return; }
  setTimeout(() => { hideLoad(); if (G.mode === 'title') showTitle(true); refreshMenu(hasSave()); }, 250);
  last = performance.now(); requestAnimationFrame(loop);
}

/* ---------- accueil : la caméra traverse la vallée jusqu'au dojo ---------- */
const TITLE_PATH = [[-14, 3.2, 128, 0, 4, 96], [-8, 2.6, 104, 0, 4, 70], [6, 3.4, 68, 0, 5, 30], [-4, 4.2, 30, 0, 6, -20], [3, 6, -20, 0, 9, -70], [0, 7.5, -50, 0, 9, -96], [-6, 5.2, -62, 0, 6.2, -94]];
let titleT = 0;
function titleSetup() {
  G.mode = 'title'; titleT = 0; W.time = 6.35; W.weather.target = 'clair'; W.weather.rain = 0; W.weather.cloud = 0.3; W.weather.fog = 0.1;
  const pl = G.pl; pl.pos.set(-7.5, terrainH(-7.5, -71), -71); pl.yaw = 0.15 + Math.PI; if (pl.actor.swordDrawn) pl.actor.sheathe(true);
  G.camOverride = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 48 };
}
function titleCam(dt) {
  if (UI.panel === 'perso') { const pl = G.pl; const f = new THREE.Vector3(Math.sin(pl.yaw), 0, Math.cos(pl.yaw)); const side = new THREE.Vector3(-f.z, 0, f.x);
    G.camOverride.pos.lerp(pl.pos.clone().addScaledVector(f, 3.0).addScaledVector(side, 1.2).setY(pl.pos.y + 1.45), 1 - Math.exp(-dt * 3)); G.camOverride.look.lerp(pl.pos.clone().addScaledVector(side, 0.9).setY(pl.pos.y + 1.05), 1 - Math.exp(-dt * 3)); G.camOverride.fov = 34; return; }
  titleT += dt * 0.022; const n = TITLE_PATH.length - 1, u = (titleT % 1) * n, i = Math.floor(u), k = easeInOut(u - i);
  const a = TITLE_PATH[i], b = TITLE_PATH[Math.min(n, i + 1)];
  const p = new THREE.Vector3(lerp(a[0], b[0], k), 0, lerp(a[2], b[2], k)); p.y = Math.max(terrainH(p.x, p.z) + 1.2, lerp(a[1], b[1], k));
  G.camOverride.pos.lerp(p, 1 - Math.exp(-dt * 2)); G.camOverride.look.lerp(new THREE.Vector3(lerp(a[3], b[3], k), lerp(a[4], b[4], k), lerp(a[5], b[5], k)), 1 - Math.exp(-dt * 2)); G.camOverride.fov = 48;
}

/* ---------- partie : nouvelle, continuer, entraînement ---------- */
function resetGame() {
  clearEnemies(); const pl = G.pl;
  Object.assign(pl, { hp: 100, hpMax: 100, en: 30, level: 1, xp: 0, sp: 0, skills: {}, ryo: 40, inv: { onigiri: 2, the: 1 }, special: false, ult: false, lock: null, dead: false, combo: 0, action: null, climb: null });
  ST.quests = {}; ST.disc = {}; ST.scrolls = {}; ST.flags = {}; ST.unlocks = {}; ST.fog.fill(0); ST.track = 'main1'; ST.counts.maki = new Set(); ST.counts.parry = 0; ST.rest = { x: 0, z: -72 };
  for (const it of W.interact) { if (it.kind === 'rouleau') { it.taken = false; it.mesh.visible = true; it.glow.visible = true; } if (it.kind === 'toro') { it.lit = false; it.light.intensity = 0; it.glow.material.opacity = 0; } }
  const camp = W.pois.find(p => p.id === 'camp'); if (camp) camp.hidden = true;
  G.training = false; W.time = 6.3; resetNPCs();
}
function enterPlay() { closePanel(); showTitle(false); G.camOverride = null; G.mode = 'play'; G.cam.yaw = G.pl.yaw; G.cam.pitch = 0.22; clearTaps(); }
function newGame() {
  audioInit(); resetGame(); enterPlay(); cine(true); music('aube'); introCut();
  showHelp('<b>ZQSD</b> se déplacer · <b>Souris</b> caméra (clic pour la capturer, Échap la libère)<br><b>Maj</b> courir · <b>Espace</b> sauter, esquiver en combat · <b>E</b> parler, agir<br><b>Clic gauche</b> attaque rapide · <b>Clic droit</b> attaque lourde · <b>F</b> garde et parade<br><b>Tab</b> verrouiller une cible · <b>M</b> carte · <b>J</b> journal · <b>Échap</b> pause', 40);
}
function continueGame() { const d = readSave(); if (!d) return; audioInit(); resetGame(); applySave(d); enterPlay(); toast('Partie chargée'); }
function training() {
  audioInit(); resetGame(); G.training = true; G.pl.special = true; G.pl.ult = true; G.pl.en = 100; G.pl.skills = { quatrieme: true };
  const D = W.dojo; G.pl.pos.set(0, D.y, D.cz + 6); G.pl.yaw = Math.PI; enterPlay(); music('dojo');
  showHelp('<b>Mode entraînement</b> · rien n\'est sauvegardé<br>Makiwara à gauche · <b>T</b> appeler un partenaire · <b>Échap</b> menu<br>Toutes les techniques sont débloquées ici.', 30);
}

/* ---------- menus ---------- */
document.getElementById('menu').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; audioInit(); music('menu'); S.ui(); menuAction(b.dataset.a); });
document.getElementById('menu').addEventListener('mouseover', (e) => { const b = e.target.closest('button'); if (b && !b.disabled && b !== UI.hover) { UI.hover = b; S.ui(); } });
function menuAction(a) {
  if (a === 'new') { if (hasSave()) openPanel('confirmNew'); else newGame(); }
  if (a === 'continue') continueGame();
  if (a === 'worlds') openPanel('worlds'); if (a === 'perso') openPanel('perso'); if (a === 'settings') openPanel('settings'); if (a === 'credits') openPanel('credits');
  if (a === 'training') training();
  if (a === 'account') openAccount();
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-b],[data-g],[data-p],[data-track],[data-use],[data-skill]'); if (!t) return; S.ui();
  if (t.dataset.b === 'logout') { signOut(); return; }
  if (t.dataset.b) { if (t.dataset.b === 'title') closePanel(); else if (t.dataset.b === 'newgo') newGame(); else if (t.dataset.b === 'pause') { closePanel(); } return; }
  if (t.dataset.p) return pauseAction(t.dataset.p);
  if (t.dataset.track) { ST.track = t.dataset.track; pauseTab('journal'); return; }
  if (t.dataset.use) { useItem(t.dataset.use); pauseTab('inv'); return; }
  if (t.dataset.skill) { buySkill(t.dataset.skill); pauseTab('skills'); return; }
  if (t.dataset.g) option(t.dataset.g, t.dataset.v, t);
});
document.addEventListener('input', (e) => {
  const r = e.target.dataset?.r; if (!r) return; const v = parseFloat(e.target.value);
  if (r === 'res') { G.settings.res = v; resize(); } else if (r === 'sens') G.settings.sens = v; else { A.vol[r] = v; applyVolumes(); }
  saveSettings();
});
function option(g, v, el) {
  const pl = G.pl, lk = Object.assign({}, pl.look);
  if (['outfit', 'hair', 'skin', 'scarf', 'band', 'kasa', 'mask'].includes(g)) {
    if (el.classList.contains('lock')) return toast('Tenue verrouillée : elle se débloque dans l\'histoire.');
    lk[g] = g === 'skin' ? +v : (['scarf', 'band', 'kasa', 'mask'].includes(g) ? v === '1' : v); setLook(lk); G.savedLook = pl.look; saveSettings();
  }
  else if (g === 'quality') { G.settings.quality = v; saveSettings(); toast('Qualité « ' + v + ' » enregistrée : elle s\'applique entièrement au prochain lancement.'); }
  else if (g === 'fps') G.settings.fpsCap = +v; else if (g === 'inv') G.settings.invertY = v === '1'; else if (g === 'sub') G.settings.sub = v === '1'; else if (g === 'hud') G.settings.hud = v === '1'; else if (g === 'shadows') { G.settings.shadows = v === '1'; applyPerf(); } else if (g === 'grass') { G.settings.grass = +v; applyPerf(); } else if (g === 'ao') { G.settings.ao = v === '1'; applyPerf(); } else if (g === 'fpsc') { G.settings.fpsc = v === '1'; applyPerf(); }
  else if (g === 'code') { if (v === 'gen') document.getElementById('savecode').value = exportCode(); else { const d = importCode(document.getElementById('importcode').value); toast(d ? 'Partie importée : choisis Continuer.' : 'Code invalide.'); refreshMenu(hasSave()); } return; }
  saveSettings();
  const box = document.getElementById('pbox'); if (UI.panel) openPanel(box.dataset.kind, box.dataset.ctx); else if (UI.pauseTab) pauseTab(UI.pauseTab);
}
function pauseAction(p) {
  if (p === 'resume') return pauseClose();
  if (p === 'save') { if (G.training) toast('Rien n\'est sauvegardé en mode entraînement.'); else save(); return; }
  if (p === 'quit') { if (!G.training) save(true); pauseClose(); clearEnemies(); cine(false); G.camOverride = null; titleSetup(); showTitle(true); refreshMenu(hasSave()); music('menu'); return; }
  pauseTab(p);
}

/* ---------- compte en ligne ---------- */
G.on('snapshot', (snap) => cloudSave(snap));
function accountHTML() {
  if (!CLOUD.ready) return `<h2>Compte</h2><div class="h2sub">Connexion par adresse e-mail</div><p style="color:var(--paper2);line-height:1.8">${CLOUD.error || 'La connexion n\'est pas encore activée sur cette version du jeu. Ta partie est gardée sur cet appareil.'}</p><button class="back" data-b="title">Retour</button>`;
  if (CLOUD.user) return `<h2>Compte</h2><div class="h2sub">Connecté : ${CLOUD.user.email.replace(/[<>&]/g, '')}</div><p style="color:var(--paper2);line-height:1.8">Ta partie est sauvegardée en ligne à chaque sauvegarde. Connecte-toi avec la même adresse sur un autre appareil pour la retrouver.${CLOUD.last ? '<br>Dernier envoi : ' + new Date(CLOUD.last).toLocaleTimeString('fr-FR') : ''}${CLOUD.error ? '<br>' + CLOUD.error : ''}</p><div style="display:flex;gap:10px;margin-top:20px"><button class="back" data-b="logout">Se déconnecter</button><button class="back" data-b="title">Retour</button></div>`;
  return `<h2>Compte</h2><div class="h2sub">Connexion par adresse e-mail · sans mot de passe</div><p style="color:var(--paper2);line-height:1.8">Saisis ton adresse : tu reçois un lien de connexion. Ta partie sera ensuite sauvegardée en ligne et tu la retrouveras sur n'importe quel appareil.</p>
    <form id="loginf" style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap"><input id="loginm" type="email" required placeholder="ton@adresse.fr" autocomplete="email" style="flex:1;min-width:220px;font:inherit;font-size:16px;padding:10px 14px;border-radius:24px;border:1px solid var(--line);background:#0e0e10;color:var(--paper)"><button class="back" style="margin:0" type="submit">Recevoir le lien</button></form><p id="loginr" style="margin-top:14px;color:var(--gold);font-size:14px"></p><button class="back" data-b="title">Retour</button>`;
}
function openAccount() { openPanel('credits'); const b = document.getElementById('pbox'); b.dataset.kind = 'account'; b.innerHTML = accountHTML();
  const f = document.getElementById('loginf'); if (f) f.addEventListener('submit', async (e) => { e.preventDefault(); const m = document.getElementById('loginm').value.trim(), r = document.getElementById('loginr'); r.textContent = 'Envoi…'; const res = await signIn(m); r.textContent = res.error ? 'Erreur : ' + res.error : 'Lien envoyé à ' + m + '. Ouvre-le sur cet appareil pour te connecter.'; }); }
onCloud(async () => {
  const btn = document.querySelector('#menu [data-a=account]'); if (btn) btn.textContent = CLOUD.user ? 'Compte · connecté' : 'Compte';
  if (CLOUD.user) { const d = await cloudLoad(); const loc = readLocal(); if (d && (!loc || (d.t || 0) > (loc.t || 0))) { putSave(d); toast('Partie en ligne récupérée.'); } refreshMenu(hasSave()); }
  if (document.getElementById('pbox')?.dataset.kind === 'account') openAccount();
});
cloudInit();
/* ---------- événements du jeu ---------- */
G.on('pause', () => { if (G.mode === 'play' && !UI.loreOpen) pauseOpen('journal'); });
G.on('cut', (on) => { cine(on); if (!on) subs(''); });
G.on('lore', (L) => lore(L));
G.on('defeat', () => { fade(true, '敗', 'Tu t\'effondres… tu reprends conscience au dernier lieu de repos.'); G.mode = 'cutscene'; });
G.on('respawn', () => { fade(false); G.mode = 'play'; G.camOverride = null; });
G.on('ultimate', () => { canvas.classList.add('bw'); setTimeout(() => canvas.classList.remove('bw'), 1700); });
G.on('chapterEnd', () => {
  G.mode = 'cutscene'; fade(true, '第一章 · FIN DU CHAPITRE 1', 'Tenue « Kage » débloquée. Les six autres régions ne sont pas encore construites : tu peux continuer à explorer Sakura Valley.');
  setTimeout(() => { fade(false); G.mode = 'play'; save(true); }, 7000);
});
G.on('rest', (o) => {
  const go = (h) => () => { fade(true, '休', 'Le temps passe…'); G.mode = 'cutscene'; setTimeout(() => { W.time = h; G.pl.hp = G.pl.hpMax; G.pl.en = Math.max(G.pl.en, 50); fade(false); G.mode = 'play'; save(true); }, 1600); };
  dialog([{ who: 'Repos', text: 'Te reposer un moment ? Le temps avancera et tu récupéreras toutes tes forces.' }], [{ t: 'Jusqu\'à l\'aube (6 h)', f: go(6) }, { t: 'Jusqu\'à midi', f: go(12) }, { t: 'Jusqu\'au soir (18 h 30)', f: go(18.5) }, { t: 'Jusqu\'à la nuit (22 h)', f: go(22) }, { t: 'Annuler', f: null }]);
});

/* ---------- boucle ---------- */
let last = 0, acc = 0, fpsAcc = 0, fpsN = 0, lowT = 0, musicT = 0, musicWant = null;
function loop(now) {
  requestAnimationFrame(loop); G.frame = (G.frame || 0) + 1;
  const cap = G.settings.fpsCap; if (cap && now - last < 1000 / cap - 1) return;
  let rdt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  G.ftimes = G.ftimes || []; G.ftimes.push(rdt * 1000); if (G.ftimes.length > 120) G.ftimes.shift();
  fpsAcc += rdt; fpsN++; if (fpsAcc > 0.5) { const fps = fpsN / fpsAcc; G.fps = fps; fpsAcc = 0; fpsN = 0; if (G.settings.fpsc) { const s = G.ftimes.slice().sort((a, b) => a - b); document.getElementById('fpsc').textContent = `${Math.round(fps)} IPS · pire image ${Math.round(s[s.length - 1])} ms`; } G.fpsW = (G.fpsW || 0) + 1;
    if (G.fpsW % 4 === 0) { if (fps < 26 && G.mode !== 'title') { lowT++; if (lowT >= 2 && (G.autoRes || 1) > 0.55) { G.autoRes = (G.autoRes || 1) * 0.85; resize(); toast('Résolution réduite automatiquement pour garder le jeu fluide.'); lowT = 0; } } else lowT = 0; } }
  const pl = G.pl;
  if (G.mode === 'title') { titleCam(rdt); W.time = 6.35 + Math.sin(now * 0.00005) * 0.05; }
  else if (G.mode === 'play') W.time = (W.time + rdt / 60) % 24;
  const T0 = performance.now();
  if (G.mode !== 'pause') {
    gameUpdate(rdt); animalsUpdate(rdt);
    if (G.mode === 'play' || G.mode === 'dialog') storyUpdate(rdt);
    const shot = cutUpdate(rdt); if (shot) { subs(shot.sub); if (shot.title) card('', shot.sub); else card(null); }
    dialogUpdate(rdt); dialogDraw();
  }
  const T1 = performance.now();
  /* commandes hors combat */
  let inter = null;
  if (UI.loreOpen) { if (tap('KeyE') || tap('Escape') || tap('LMB')) loreClose(); }
  else if (G.mode === 'play') {
    inter = findInteract();
    if (tap('KeyE') && inter) { interact(inter); S.ui(); }
    if (tap('KeyM')) pauseOpen('map'); if (tap('KeyJ')) pauseOpen('journal'); if (tap('KeyI')) pauseOpen('inv'); if (tap('KeyK')) pauseOpen('skills');
    if (tap('Escape') && !G.locked) pauseOpen('journal');
    if (tap('Digit1')) { if (!useItem('onigiri')) toast('Plus d\'onigiri.'); } if (tap('Digit2')) { if (!useItem('the')) toast('Plus de thé.'); }
    if (tap('KeyH')) { G.settings.hud = !G.settings.hud; }
    if (G.training && tap('KeyT')) { if (!G.enemies.some(e => e.tag === 'spar' && !e.dead)) { const D = W.dojo; const e = spawnEnemy('sparring', 2, D.cz - 3, { tag: 'spar', aggro: true }); e.actor.sheathe(false); toast('Un partenaire entre sur le tatami.'); } }
  } else if (G.mode === 'dialog') {
    if (tap('KeyE') || tap('Space') || tap('Enter') || tap('LMB')) dialogNext();
    for (let i = 1; i <= 5; i++) if (tap('Digit' + i)) dialogNext(i - 1);
  } else if (G.mode === 'pause') { if (tap('Escape')) pauseClose(); }
  else if (G.mode === 'title') { if (tap('Escape') && UI.panel) closePanel(); }
  /* monde */
  const camPos = camera.position;
  const env = updateWorld(rdt, camPos, scene, renderer, G.mode === 'title' ? camPos : pl.pos, Q, G.inDojo);
  if (W.rayMat) W.rayMat.opacity = env.day * Math.max(0, env.sd.y) * 0.12 * (1 - W.weather.cloud * 0.7);
  const T2 = performance.now();
  /* son */
  if (A.on) {
    const rv = polyDist(RIVER, camPos.x, camPos.z);
    ambience(rdt, { wind: W.wind, alt: Math.max(0, camPos.y - 5), waterD: rv.d, rain: W.weather.rain, townD: Math.hypot(camPos.x, camPos.z), day: env.day, fallD: Math.hypot(camPos.x + 112, camPos.z + 104), indoor: G.inDojo });
    let want = 'jour';
    if (G.mode === 'title') want = 'menu';
    else if (ST.flags.duelOn) want = 'duel';
    else if (G.enemies.some(e => !e.dead && e.aggro && !e.nonLethal && e.pos.distanceTo(pl.pos) < 25)) want = 'combat';
    else if (G.inDojo) want = 'dojo';
    else if (Math.hypot(pl.pos.x - W.shrine.x, pl.pos.z - W.shrine.z) < 30) want = 'sanctuaire';
    else { const h = W.time; want = h >= 5 && h < 8.5 ? 'aube' : (h < 17 ? 'jour' : (h < 20 ? 'crepuscule' : 'nuit')); if (h < 5) want = 'nuit'; }
    if (want !== musicWant) { musicWant = want; musicT = want === 'combat' || want === 'duel' || want === 'menu' ? 0.2 : 3; }
    musicT -= rdt; if (musicT <= 0 && A.track !== musicWant) { music(musicWant); setTrack(TRACK_NAMES[musicWant]); }
  }
  hudUpdate(rdt, inter);
  /* rendu */
  if (bokeh) { bokeh.enabled = (G.mode === 'cutscene' || G.mode === 'dialog'); if (bokeh.enabled) { const f = G.mode === 'dialog' && ST.dialog?.npc ? camera.position.distanceTo(ST.dialog.npc.pos) : 8; bokeh.uniforms.focus.value = f; } }
  const T3 = performance.now();
  if (!(qp.get('nr') && G.frame % 40)) { if (composer) composer.render(); else renderer.render(scene, camera); }
  G.prof = { jeu: +(T1 - T0).toFixed(2), monde: +(T2 - T1).toFixed(2), hud: +(T3 - T2).toFixed(2), rendu: +(performance.now() - T3).toFixed(2) };
}

/* points d'entrée pour les tests automatisés */
window.KAGE = { G, W, ST, QUESTS, newGame, continueGame, training, save, startQuest, spawnEnemy, setTime: (h) => { W.time = h; }, weather: (k) => { W.weather.target = k; W.weather.t = 0; }, menuAction, pauseAction, option, info: () => ({ mode: G.mode, fps: G.fps, pos: G.pl && [G.pl.pos.x.toFixed(1), G.pl.pos.y.toFixed(1), G.pl.pos.z.toFixed(1)], hp: G.pl && G.pl.hp, quest: ST.quests.main1, enemies: G.enemies.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }) };
boot();
