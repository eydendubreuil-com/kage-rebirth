/* KAGE: REBIRTH — interface : menus, HUD, carte, journal, dialogues, cinématiques */
import * as THREE from 'three';
import { G, setLook, hpMaxOf } from './game.js';
import { W } from './world.js';
import { ST, QUESTS, curStep, activeTarget, dialogNext, dialogSay, closeDialog, ITEMS, useItem, SKILLS, buySkill, need, save, exportCode, importCode } from './story.js';
import { OUTFITS, HAIRS, SKINS } from './actor.js';
import { CHARS, GEAR, REGIONS, MAP_SIZE, sealsCount } from './regions.js';
import { S, A, applyVolumes, TRACK_NAMES } from './audio.js';
import { angDiff, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
export const UI = { panel: null, pauseTab: null, prompt: null, bubbles: [], loreOpen: false, helpT: 0 };

/* ---------- chargement ---------- */
export function loadProgress(label, p) { $('loadl').textContent = label; $('ensoc').style.strokeDashoffset = String(540 * (1 - p)); }
export function hideLoad() { const l = $('load'); l.style.opacity = '0'; setTimeout(() => l.classList.add('hide'), 1300); }

/* ---------- notifications ---------- */
export function toast(text, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text; $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 5000); while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
}
G.on('toast', ({ text, kind }) => toast(text, kind));
G.on('bubble', ({ n, text }) => { const b = document.createElement('div'); b.className = 'bb'; b.textContent = text; $('bubbles').appendChild(b); UI.bubbles.push({ el: b, n, t: 4 }); });

/* ---------- accueil ---------- */
export function showTitle(on) { $('title').classList.toggle('hide', !on); if (on) refreshMenu(); }
export function refreshMenu(hasSave) { const c = document.querySelector('#menu [data-a=continue]'); if (hasSave !== undefined) c.disabled = !hasSave; }
export function setTrack(name) { $('trk').textContent = name ? '♪  ' + name : ''; }

/* ---------- panneaux (accueil et pause) ---------- */
const QNAMES = { basse: 'Basse', moyenne: 'Moyenne', haute: 'Haute' };
export function panelHTML(kind, ctx) {
  if (kind === 'worlds') {
    return `<h2>十の道場</h2><div class="h2sub">Dix vallées, dix dojos · toutes jouables</div>` + REGIONS.map((r, i) => `<div class="world ok"><div class="n">${r.kanji}</div><div class="t">${i + 1} · ${r.name}</div><div class="d">${r.dojo} · ${r.master}${ST.seals[r.id] ? ' · sceau obtenu' : ''}</div></div>`).join('') + `<button class="back" data-b="${ctx === 'pause' ? 'pause' : 'title'}">Retour</button>`;
  }
  if (kind === 'perso') {
    const lk = G.pl.look, opt = (grp, val, label, on, lock) => `<button class="opt ${on ? 'on' : ''} ${lock ? 'lock' : ''}" data-g="${grp}" data-v="${val}">${label}</button>`;
    const outs = Object.entries(OUTFITS).map(([k, o]) => opt('outfit', k, o.name.split(' (')[0], lk.outfit === k, o.locked && !ST.unlocks[o.locked])).join('');
    const cards = Object.entries(CHARS).map(([k, c]) => { const on = G.pl.char === k, locked = !ST.chars[k];
      return `<button class="char ${on ? 'on' : ''} ${locked ? 'lock' : ''}" data-char="${k}" ${locked ? 'disabled' : ''}><b>${c.name}</b><span>${c.title}</span><small>${locked ? 'Verrouillé · ' + (c.unlock === 'seals:3' ? '3 sceaux' : c.unlock === 'seals:6' ? '6 sceaux' : 'histoire') : c.blurb}</small></button>`; }).join('');
    const gear = ['lame', 'armure', 'bottes'].map((k) => { const t = G.pl.gear[k] || 0, ti = GEAR[k].tiers[t];
      return `<div class="item"><div><div class="nm">${GEAR[k].label} · ${ti.name}</div><div class="ds">${ti.text}</div></div><span class="tag">${t + 1} / ${GEAR[k].tiers.length}</span></div>`; }).join('');
    return `<h2>${CHARS[G.pl.char]?.name || 'Sora'}</h2><div class="h2sub">Combattants · équipement · apparence</div>
      <h3 style="margin:6px 0 10px;font-size:12px;letter-spacing:.3em;color:var(--gold)">QUI ES-TU ?</h3>
      <div class="chars">${cards}</div>
      <h3 style="margin:24px 0 6px;font-size:12px;letter-spacing:.3em;color:var(--gold)">ÉQUIPEMENT</h3>${gear}
      <div class="h2sub" style="margin-top:8px">Les paliers suivants s'achètent chez les forgerons et herboristes des neuf vallées.</div>
      <h3 style="margin:24px 0 6px;font-size:12px;letter-spacing:.3em;color:var(--gold)">APPARENCE</h3>
      <div class="row"><span class="lab">Tenue</span><div class="opts">${outs}</div></div>
      <div class="row"><span class="lab">Coiffure</span><div class="opts">${Object.entries(HAIRS).map(([k, n]) => opt('hair', k, n, lk.hair === k)).join('')}</div></div>
      <div class="row"><span class="lab">Teint</span><div class="opts">${SKINS.map((c, i) => opt('skin', i, ['Clair', 'Mat', 'Foncé'][i], lk.skin === i)).join('')}</div></div>
      <div class="row"><span class="lab">Foulard</span><div class="opts">${opt('scarf', 1, 'Oui', lk.scarf)}${opt('scarf', 0, 'Non', !lk.scarf)}</div></div>
      <div class="row"><span class="lab">Bandeau</span><div class="opts">${opt('band', 1, 'Oui', lk.band)}${opt('band', 0, 'Non', !lk.band)}</div></div>
      <div class="row"><span class="lab">Chapeau de paille</span><div class="opts">${opt('kasa', 1, 'Oui', lk.kasa)}${opt('kasa', 0, 'Non', !lk.kasa)}</div></div>
      <div class="row"><span class="lab">Masque</span><div class="opts">${opt('mask', 1, 'Oui', lk.mask)}${opt('mask', 0, 'Non', !lk.mask)}</div></div>
      <div class="h2sub" style="margin-top:16px">Les tenues et combattants grisés se débloquent dans l'histoire. L'apparence s'applique au combattant choisi.</div>
      <button class="back" data-b="${ctx === 'pause' ? 'pause' : 'title'}">Retour</button>`;
  }
  if (kind === 'settings') {
    const st = G.settings, o = (grp, val, label, on) => `<button class="opt ${on ? 'on' : ''}" data-g="${grp}" data-v="${val}">${label}</button>`;
    const rng = (id, v, min, max, step) => `<input type="range" data-r="${id}" min="${min}" max="${max}" step="${step}" value="${v}">`;
    return `<h2>設定</h2><div class="h2sub">Paramètres</div>
      <div class="row"><span class="lab">Qualité graphique</span><div class="opts">${['basse', 'moyenne', 'haute'].map(q => o('quality', q, QNAMES[q], st.quality === q)).join('')}</div></div>
      <div class="row"><span class="lab">Résolution de rendu</span>${rng('res', st.res, 0.5, 1, 0.05)}</div>
      <div class="row"><span class="lab">Images par seconde</span><div class="opts">${[[30, '30'], [60, '60'], [0, 'Libre']].map(([v, l]) => o('fps', v, l, st.fpsCap === v)).join('')}</div></div>
      <div class="row"><span class="lab">Sensibilité de la caméra</span>${rng('sens', st.sens, 0.3, 2.5, 0.05)}</div>
      <div class="row"><span class="lab">Inverser l'axe vertical</span><div class="opts">${o('inv', 1, 'Oui', st.invertY)}${o('inv', 0, 'Non', !st.invertY)}</div></div>
      <div class="row"><span class="lab">Volume général</span>${rng('master', A.vol.master, 0, 1, 0.05)}</div>
      <div class="row"><span class="lab">Musique</span>${rng('music', A.vol.music, 0, 1, 0.05)}</div>
      <div class="row"><span class="lab">Effets sonores</span>${rng('sfx', A.vol.sfx, 0, 1, 0.05)}</div>
      <div class="row"><span class="lab">Ambiances</span>${rng('amb', A.vol.amb, 0, 1, 0.05)}</div>
      <div class="row"><span class="lab">Sous-titres</span><div class="opts">${o('sub', 1, 'Oui', st.sub)}${o('sub', 0, 'Non', !st.sub)}</div></div>
      <div class="row"><span class="lab">Langue</span><div class="opts"><button class="opt on">Français</button></div></div>
      <div class="row"><span class="lab">Interface en jeu</span><div class="opts">${o('hud', 1, 'Visible', st.hud)}${o('hud', 0, 'Masquée', !st.hud)}</div></div>
      <h3 style="margin:26px 0 12px;font-size:12px;letter-spacing:.3em;color:var(--gold)">COMMANDES</h3>
      <div class="keys"><b>ZQSD · flèches</b><span>se déplacer</span><b>Souris</b><span>caméra (clic pour la capturer, Échap pour la libérer)</span><b>Maj</b><span>courir</span><b>Alt · C</b><span>marcher</span><b>Espace</b><span>sauter, esquiver en combat</span><b>Clic gauche</b><span>attaque rapide (enchaînement)</span><b>Clic droit</b><span>attaque lourde</span><b>F</b><span>garde ; juste avant l'impact : parade</span><b>Q</b><span>technique (50 d'énergie)</span><b>R</b><span>ultime (100 d'énergie)</span><b>Tab · clic molette</b><span>verrouiller une cible</span><b>E</b><span>interagir, parler</span><b>T</b><span>discuter librement avec un habitant</span><b>Espace · Ctrl</b><span>nager en surface · plonger (surveille ton souffle)</span><b>1 · 2</b><span>onigiri · thé</span><b>M · J · I · K</b><span>carte · journal · inventaire · compétences</span><b>Molette</b><span>distance de la caméra</span><b>Échap</b><span>pause</span></div>
      <div class="h2sub" style="margin-top:14px">Les touches suivent la position physique : ZQSD sur un clavier AZERTY, WASD sur un clavier QWERTY.</div>
      <div class="h2sub" style="margin-top:8px">Certains mots anciens, tapés en jeu, réveillent des bénédictions. Les murs des dix dojos en connaissent plus d'un.</div>
      ${ctx === 'pause' ? `<h3 style="margin:26px 0 12px;font-size:12px;letter-spacing:.3em;color:var(--gold)">CODE DE SAUVEGARDE</h3><div class="h2sub">Copie ce code pour garder ta partie si le navigateur efface ses données.</div><textarea id="savecode" readonly></textarea><button class="opt" data-g="code" data-v="gen" style="margin-top:8px">Générer le code</button>` : `<h3 style="margin:26px 0 12px;font-size:12px;letter-spacing:.3em;color:var(--gold)">IMPORTER UNE PARTIE</h3><textarea id="importcode" placeholder="Colle ici un code de sauvegarde"></textarea><button class="opt" data-g="code" data-v="imp" style="margin-top:8px">Importer</button>`}
      <div class="h2sub" style="margin-top:14px">La qualité Basse / Moyenne / Haute change aussi la densité d'herbe et d'arbres : elle s'applique entièrement au prochain lancement.</div>
      <button class="back" data-b="${ctx === 'pause' ? 'pause' : 'title'}">Retour</button>`;
  }
  if (kind === 'credits') return `<h2>KAGE: REBIRTH</h2><div class="h2sub">Crédits</div><div class="credits">
      <p><b>Direction</b> · Eyden</p><p><b>Musique</b> · les compositions originales d'Eyden pour KAGE: REBIRTH (dix pistes de dojo et le thème Wrath of the Jade Dragon).</p>
      <p><b>Moteur, monde, personnages, animations, sons et code</b> · construits par Claude (Anthropic), avec Three.js. Tout est généré par le jeu sur ta machine : aucune image, aucun modèle 3D importé.</p>
      <p><b>Références d'ambiance</b> · vidéos de paysages de rônin transmises par Eyden, utilisées comme modèle de lumière, de brume et de cadrage, sans aucune image reprise.</p>
      <p><b>Version</b> · Sakura Valley, chapitre 1. Les six autres régions ne sont pas encore construites.</p></div>
      <button class="back" data-b="${ctx === 'pause' ? 'pause' : 'title'}">Retour</button>`;
  if (kind === 'confirmNew') return `<h2>新</h2><div class="h2sub">Nouvelle partie</div><p style="color:var(--paper2);line-height:1.8">Une partie est déjà sauvegardée. Commencer une nouvelle partie l'effacera.</p><div style="display:flex;gap:10px;margin-top:20px"><button class="back" data-b="newgo">Effacer et commencer</button><button class="back" data-b="title">Annuler</button></div>`;
  return '';
}
export function openPanel(kind, ctx = 'title') {
  UI.panel = kind; document.body.classList.toggle('perso', kind === 'perso' && ctx === 'title'); $('panel').classList.remove('hide'); $('pbox').innerHTML = panelHTML(kind, ctx); $('pbox').dataset.ctx = ctx; $('pbox').dataset.kind = kind;
  if (ctx === 'title') $('title').querySelector('.menu').style.opacity = '0.25';
}
export function closePanel() { document.body.classList.remove('perso'); UI.panel = null; $('panel').classList.add('hide'); $('title').querySelector('.menu').style.opacity = ''; }

/* ---------- pause ---------- */
export function pauseOpen(tab = 'journal') { G.mode = 'pause'; $('pause').classList.remove('hide'); pauseTab(tab); if (document.pointerLockElement) document.exitPointerLock(); }
export function pauseClose() { $('pause').classList.add('hide'); closePanel(); G.mode = 'play'; UI.pauseTab = null; }
export function pauseTab(tab) {
  UI.pauseTab = tab; const c = $('pcontent'); document.querySelectorAll('#pmenu button').forEach(b => b.classList.toggle('sel', b.dataset.p === tab));
  if (tab === 'journal') {
    let h = '<h3>Quêtes</h3>'; const ids = Object.keys(ST.quests);
    if (!ids.length) h += '<p class="qd" style="color:var(--mute)">Aucune quête pour le moment.</p>';
    for (const id of ['main1', ...ids.filter(i => i !== 'main1')]) { const q = ST.quests[id]; if (!q) continue; const Q = QUESTS[id], s = curStep(id);
      h += `<div class="q ${q.done ? 'done' : ''}"><div class="qk">${Q.kind}${ST.track === id ? ' · suivie' : ''}</div><div class="qt">${Q.title}</div><div class="qd">${q.done ? 'Terminée.' : s.text + (s.progress ? ' — ' + s.progress() : '')}</div>${!q.done && ST.track !== id ? `<button data-track="${id}">Suivre cette quête</button>` : ''}</div>`; }
    h += `<h3 style="margin-top:26px">Les dix sceaux · ${sealsCount(ST.seals)} / 10</h3><div class="seals">${REGIONS.map(r => `<span class="${ST.seals[r.id] ? 'on' : ''}"><b>${r.kanji}</b>${r.name}</span>`).join('')}</div>`;
    const sc = Object.keys(ST.scrolls).length; h += `<h3 style="margin-top:26px">Rouleaux · ${sc} / 5</h3>`;
    for (const it of W.interact.filter(i => i.kind === 'rouleau' && ST.scrolls[i.id])) h += `<div class="q"><div class="qt">${it.lore.title}</div><div class="qd">${it.lore.text}</div></div>`;
    c.innerHTML = h;
  } else if (tab === 'map') {
    c.innerHTML = '<h3>Carte des dix vallées</h3><div id="bigmap"><canvas id="bigc" width="1024" height="1024"></canvas></div><p class="qd" style="color:var(--mute);margin-top:10px">Les zones sombres n\'ont pas encore été explorées. Or : objectif suivi.</p>';
    drawBigMap($('bigc'));
  } else if (tab === 'inv') {
    const pl = G.pl; let h = `<h3>Inventaire · ${pl.ryo} ryo</h3>`;
    const ks = Object.keys(pl.inv).filter(k => pl.inv[k] > 0); if (!ks.length) h += '<p class="qd" style="color:var(--mute)">Rien pour le moment.</p>';
    for (const k of ks) { const it = ITEMS[k]; h += `<div class="item"><div><div class="nm">${it.name} × ${pl.inv[k]}</div><div class="ds">${it.text}</div></div>${it.quest ? '' : `<button data-use="${k}">Utiliser</button>`}</div>`; }
    h += '<h3 style="margin-top:26px">Équipement</h3>' + ['lame', 'armure', 'bottes'].map((k) => { const t = pl.gear[k] || 0, ti = GEAR[k].tiers[t]; return `<div class="item"><div><div class="nm">${GEAR[k].label} · ${ti.name}</div><div class="ds">${ti.text}</div></div><span class="tag">${t + 1} / ${GEAR[k].tiers.length}</span></div>`; }).join('') + `<div class="item"><div><div class="nm">Tenue : ${OUTFITS[pl.look.outfit].name.split(' (')[0]}</div><div class="ds">Combattant : ${CHARS[pl.char]?.name || 'Sora'} · change de tenue dans l'onglet Personnage.</div></div></div>`;
    c.innerHTML = h;
  } else if (tab === 'skills') {
    const pl = G.pl; let h = `<h3>Compétences · ${pl.sp} point${pl.sp > 1 ? 's' : ''} · niveau ${pl.level}</h3>`;
    h += `<div class="skill ${pl.special ? 'own' : ''}"><div><div class="nm">Pétale d'ombre ${pl.special ? '· acquise' : '· histoire'}</div><div class="ds">Technique du dojo (Q). Une ruée, trois entailles. 50 d'énergie.</div></div></div>`;
    h += `<div class="skill ${pl.ult ? 'own' : ''}"><div><div class="nm">Renaissance de l'ombre ${pl.ult ? '· acquise' : '· histoire'}</div><div class="ds">Ultime (R). Le temps se suspend, la lame frappe tout autour. 100 d'énergie.</div></div></div>`;
    for (const [k, s] of Object.entries(SKILLS)) h += `<div class="skill ${pl.skills[k] ? 'own' : ''}"><div><div class="nm">${s.name} · ${s.cost} pt${s.cost > 1 ? 's' : ''}</div><div class="ds">${s.text}</div></div>${pl.skills[k] ? '<span class="ds">acquise</span>' : `<button data-skill="${k}" ${pl.sp < s.cost ? 'disabled style="opacity:.4"' : ''}>Apprendre</button>`}</div>`;
    c.innerHTML = h;
  } else if (tab === 'look') { c.innerHTML = panelHTML('perso', 'pause').replace(/<button class="back"[^>]*>Retour<\/button>/, ''); }
  else if (tab === 'settings') { c.innerHTML = panelHTML('settings', 'pause').replace(/<button class="back"[^>]*>Retour<\/button>/, ''); }
}

/* ---------- carte ---------- */
function worldToMap(x, z, S) { return [(x + MAP_SIZE / 2) / MAP_SIZE * S, (z + MAP_SIZE / 2) / MAP_SIZE * S]; }
export function drawBigMap(cv) {
  const g = cv.getContext('2d'), S = cv.width; g.drawImage(W.mapCanvas, 0, 0, S, S);
  const cs = S / 64; g.fillStyle = 'rgba(8,8,10,0.86)';
  for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) if (!ST.fog[z * 64 + x]) g.fillRect(x * cs - 0.5, z * cs - 0.5, cs + 1, cs + 1);
  g.font = '600 18px "Zen Kaku Gothic New"'; g.textAlign = 'center';
  for (const p of W.pois) { if (!ST.disc[p.id]) continue; const [x, y] = worldToMap(p.x, p.z, S); g.fillStyle = '#141210'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = '#f2ede4'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    g.fillStyle = 'rgba(10,10,12,.75)'; const w = g.measureText(p.name).width; g.fillRect(x - w / 2 - 6, y - 34, w + 12, 22); g.fillStyle = '#f2ede4'; g.fillText(p.name, x, y - 17); }
  const at = activeTarget(); if (at && at.t) { const [x, y] = worldToMap(at.t.x, at.t.z, S); g.strokeStyle = '#c9a45c'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 16, 0, 7); g.stroke(); g.fillStyle = '#c9a45c'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  const pl = G.pl, [px, py] = worldToMap(pl.pos.x, pl.pos.z, S); g.save(); g.translate(px, py); g.rotate(-pl.yaw + Math.PI); g.fillStyle = '#c2392a'; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -16); g.lineTo(10, 12); g.lineTo(0, 6); g.lineTo(-10, 12); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function drawMini() {
  const cv = $('mini'), g = cv.getContext('2d'), S = cv.width, pl = G.pl, R0 = 70, k = S / (R0 * 2), mk = W.mapCanvas.width / MAP_SIZE;
  g.save(); g.clearRect(0, 0, S, S); g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.clip(); g.fillStyle = '#1a1a1c'; g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2); g.rotate(G.cam.yaw + Math.PI);
  const sx = (pl.pos.x + MAP_SIZE / 2) * mk, sz = (pl.pos.z + MAP_SIZE / 2) * mk, r = R0 * mk * 1.45;
  g.drawImage(W.mapCanvas, sx - r, sz - r, r * 2, r * 2, -R0 * 1.45 * k, -R0 * 1.45 * k, R0 * 2.9 * k, R0 * 2.9 * k);
  const at = activeTarget(); if (at && at.t) { let dx = (at.t.x - pl.pos.x) * k, dz = (at.t.z - pl.pos.z) * k; const d = Math.hypot(dx, dz), m = S / 2 - 10; if (d > m) { dx *= m / d; dz *= m / d; } g.fillStyle = '#c9a45c'; g.beginPath(); g.arc(dx, dz, 6, 0, 7); g.fill(); }
  for (const e of G.enemies) if (!e.dead && e.aggro) { const dx = (e.pos.x - pl.pos.x) * k, dz = (e.pos.z - pl.pos.z) * k; if (Math.hypot(dx, dz) < S / 2) { g.fillStyle = '#d6533f'; g.beginPath(); g.arc(dx, dz, 4, 0, 7); g.fill(); } }
  g.restore();
  g.save(); g.translate(S / 2, S / 2); g.rotate(G.cam.yaw - pl.yaw); g.fillStyle = '#f2ede4'; g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.restore();
  const th = G.cam.yaw + Math.PI; g.fillStyle = '#f2ede4'; g.font = '700 20px "Zen Kaku Gothic New"'; g.textAlign = 'center'; g.fillText('N', S / 2 + Math.sin(th) * (S / 2 - 18), S / 2 - Math.cos(th) * (S / 2 - 18) + 7);
}

/* ---------- HUD ---------- */
const _p = new THREE.Vector3();
function project(v) { _p.copy(v).project(G.camera); return { x: (_p.x * 0.5 + 0.5) * innerWidth, y: (-_p.y * 0.5 + 0.5) * innerHeight, ok: _p.z < 1 }; }
let compassBuilt = false, miniT = 0;
export function hudUpdate(dt, inter) {
  const show = (G.mode === 'play') && G.settings.hud;
  $('hud').classList.toggle('hide', !(G.mode === 'play' || G.mode === 'dialog') || !G.settings.hud);
  if (!show && G.mode !== 'dialog') return;
  const pl = G.pl;
  /* boussole */
  const st = $('cstrip'), wdt = $('compass').clientWidth, span = 1.9;
  const marks = [['N', Math.PI, 'c'], ['NE', Math.PI * 0.75], ['E', Math.PI / 2, 'c'], ['SE', Math.PI / 4], ['S', 0, 'c'], ['SO', -Math.PI / 4], ['O', -Math.PI / 2, 'c'], ['NO', -Math.PI * 0.75]];
  let h = '';
  for (const [l, a, c] of marks) { const rel = angDiff(G.cam.yaw, a); if (Math.abs(rel) < span / 2) h += `<span class="${c || ''}" style="left:${wdt / 2 - rel / span * wdt}px">${l}</span>`; }
  for (const p of W.pois) { if (!ST.disc[p.id]) continue; const d = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z); if (d > 160 || d < 6) continue; const rel = angDiff(G.cam.yaw, Math.atan2(p.x - pl.pos.x, p.z - pl.pos.z)); if (Math.abs(rel) < span / 2) h += `<span class="p" style="left:${wdt / 2 - rel / span * wdt}px">▾</span>`; }
  const at = activeTarget();
  if (at && at.t) { const rel = angDiff(G.cam.yaw, Math.atan2(at.t.x - pl.pos.x, at.t.z - pl.pos.z)); const c = clamp(rel, -span / 2 + 0.05, span / 2 - 0.05); h += `<span class="q" style="left:${wdt / 2 - c / span * wdt}px">◆</span>`; }
  st.innerHTML = h;
  /* objectif */
  if (at) { $('objt').textContent = G.training ? 'Entraînement' : QUESTS[at.id].title; $('objs').textContent = at.text; $('objp').textContent = (at.progress || '') + (at.t ? `   ${Math.round(Math.hypot(at.t.x - pl.pos.x, at.t.z - pl.pos.z))} m` : ''); }
  else { $('objt').textContent = G.training ? 'Mode entraînement' : 'Le KAGE TRIAL'; $('objs').textContent = G.training ? 'Makiwara à gauche · T : appeler un partenaire · Échap : menu' : `Les dix dojos t'attendent. Sceaux : ${sealsCount(ST.seals)} / 10 · cherche les braseros, offrandes et autels des vallées.`; $('objp').textContent = ''; }
  /* barres, discrètes hors combat */
  const calm = G.combatT < -2 && pl.hp >= pl.hpMax * 0.99 && !pl.lock;
  $('bars').style.opacity = calm ? '0.35' : '1'; $('tech').style.opacity = calm ? '0' : '1';
  $('hpb').style.width = (pl.hp / pl.hpMax * 100) + '%'; $('enb').style.width = pl.en + '%'; $('xpb').style.width = (pl.xp / need(pl.level) * 100) + '%';
  $('lvl').textContent = `NIVEAU ${pl.level}   ·   ${Math.ceil(pl.hp)} / ${pl.hpMax}`;
  $('tq').classList.toggle('ready', pl.special && pl.en >= 50); $('tr').classList.toggle('ready', pl.ult && pl.en >= 100);
  $('tq').style.opacity = pl.special ? 1 : 0.35; $('tr').style.opacity = pl.ult ? 1 : 0.35;
  const hr = Math.floor(W.time), mn = Math.floor((W.time - hr) * 60);
  $('clock').textContent = `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}  ·  ${W.weather.kind}`;
  const reg = G.region || REGIONS[0];
  $('regk').textContent = reg.kanji; $('regn').textContent = reg.name; $('sealn').textContent = sealsCount(ST.seals) + ' / 10 sceaux';
  $('ox').classList.toggle('hide', !pl.inWater);
  $('oxb').style.width = Math.max(0, pl.oxygen) + '%';
  $('oxb').classList.toggle('low', pl.oxygen < 30);
  $('uw').classList.toggle('on', !!W.underwater);
  miniT -= dt; if (miniT < 0) { miniT = 0.08; drawMini(); }
  /* invite d'interaction */
  if (inter && G.mode === 'play') { $('prompt').classList.remove('hide'); $('promptt').textContent = inter.label; } else $('prompt').classList.add('hide');
  /* cible verrouillée, combo */
  const L = pl.lock; $('lockbar').classList.toggle('hide', !L); if (L) { $('lockn').textContent = L.name; $('lockh').style.width = Math.max(0, L.hp / L.hpMax * 100) + '%'; const p = project(_p.set(L.pos.x, L.pos.y + 1.1, L.pos.z)); const r = $('reticle'); r.classList.toggle('hide', !p.ok); r.style.left = p.x + 'px'; r.style.top = p.y + 'px'; } else $('reticle').classList.add('hide');
  $('combo').classList.toggle('hide', !(pl.comboT > 0 && pl.combo > 1)); $('combon').textContent = pl.combo;
  /* barres ennemies */
  const eb = $('ebars'); let html = '';
  for (const e of G.enemies) { if (e.dead || !e.aggro || e === L) continue; const p = project(_p.set(e.pos.x, e.pos.y + 2.15 * (e.T.scale || 1), e.pos.z)); if (!p.ok || p.x < 0 || p.x > innerWidth) continue;
    html += `<div class="eb ${e.glint > 0 ? 'glint' : ''}" style="left:${p.x}px;top:${p.y}px"><i style="width:${Math.max(0, e.hp / e.hpMax * 100)}%"></i></div>`; }
  if (L && L.glint > 0) { const p = project(_p.set(L.pos.x, L.pos.y + 2.15, L.pos.z)); html += `<div class="eb glint" style="left:${p.x}px;top:${p.y}px;background:none"></div>`; }
  eb.innerHTML = html;
  /* bulles des habitants */
  for (let i = UI.bubbles.length - 1; i >= 0; i--) { const b = UI.bubbles[i]; b.t -= dt; if (b.t <= 0) { b.el.remove(); UI.bubbles.splice(i, 1); continue; } const p = project(_p.set(b.n.pos.x, b.n.pos.y + 2.1 * b.n.actor.o.scale, b.n.pos.z)); b.el.style.left = p.x + 'px'; b.el.style.top = p.y + 'px'; b.el.style.display = p.ok ? '' : 'none'; }
  if (UI.helpT > 0) { UI.helpT -= dt; if (UI.helpT <= 0) $('help').classList.add('hide'); }
}
export function showHelp(html, t = 26) { $('help').innerHTML = html; $('help').classList.remove('hide'); UI.helpT = t; }

/* ---------- dialogue ---------- */
G.on('dialog', () => {
  const d = ST.dialog; $('dialog').classList.toggle('hide', !d);
  if (!d) { $('dfree').classList.add('hide'); $('dinput').blur(); return; }
  const line = d.lines[d.i]; $('dwho').textContent = line.who; $('dch').innerHTML = '';
  const free = !!d.free;
  $('dfree').classList.toggle('hide', !free);
  $('dmore').textContent = free ? 'Entrée pour envoyer · ÉCHAP pour quitter' : 'E · ESPACE · CLIC';
  if (free) { $('dinput').placeholder = `Parler à ${d.npc ? d.npc.name : '…'}…`; $('dinput').focus(); setTimeout(() => { if (ST.dialog?.free) $('dinput').focus(); }, 40); }
  if (d.i === d.lines.length - 1 && d.choices) d.choices.forEach((c, i) => { const b = document.createElement('button'); b.textContent = `${i + 1}.  ${c.t}`; b.onclick = (ev) => { ev.stopPropagation(); S.ui(); dialogNext(i); }; $('dch').appendChild(b); });
});
$('dfree').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('dinput'), text = input.value.trim();
  if (!text) return;
  input.value = ''; S.ui(); dialogSay(text);
});
$('dinput').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
});
export function dialogDraw() { const d = ST.dialog; if (!d) return; const line = d.lines[d.i]; $('dtxt').textContent = line.text.slice(0, Math.floor(d.chars)); $('dmore').style.opacity = d.chars >= line.text.length && !(d.choices && d.i === d.lines.length - 1) ? 1 : 0; }

/* ---------- cinématique ---------- */
export function cine(on) { $('cine').classList.toggle('on', on); $('skip').classList.toggle('hide', !on); if (!on) { $('subs').textContent = ''; card(null); } }
export function subs(t) { $('subs').textContent = G.settings.sub ? (t || '') : ''; }
export function card(a, b) { const c = $('card'); if (!a && !b) { c.classList.remove('on'); return; } $('carda').textContent = a || ''; $('cardb').textContent = b || ''; c.classList.add('on'); }
export function fade(on, t = '', s = '') { $('fade').classList.toggle('on', on); $('fadet').textContent = t; $('fades').textContent = s; }
export function lore(L) { UI.loreOpen = true; $('loreh').textContent = L.title; $('lorep').textContent = L.text; $('lore').classList.remove('hide'); if (document.pointerLockElement) document.exitPointerLock(); }
export function loreClose() { UI.loreOpen = false; $('lore').classList.add('hide'); }
