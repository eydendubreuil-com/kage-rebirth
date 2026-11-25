/* KAGE: REBIRTH — commandes secrètes : dix mots anciens et le code du créateur.
   Tape les mots en jeu (sans ouvrir de menu) pour invoquer leurs effets. */
import * as THREE from 'three';
import { G, notify, spawnEnemy, hpMaxOf, ring } from './game.js';
import { W, groundAt } from './world.js';
import { ST, SKILLS, save } from './story.js';
import { S } from './audio.js';
import { SECRETS, CHARS } from './regions.js';

const cool = {};
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function burst(color = '#ffe7b0', size = 2.2) {
  const pl = G.pl; if (!pl) return;
  ring(V(pl.pos.x, pl.pos.y + 1, pl.pos.z), color, size);
}

function setWeather(kind, dur = 180) {
  const wt = W.weather;
  wt.from = { rain: wt.rain, fog: wt.fog, cloud: wt.cloud, snow: wt.snow, storm: wt.storm };
  wt.target = kind; wt.blend = 0; wt.t = 0; wt.next = dur;
}

function learnAll() {
  const pl = G.pl;
  for (const k in SKILLS) pl.skills[k] = true;
  pl.hpMax = hpMaxOf(pl); pl.hp = pl.hpMax;
}

function cast(s) {
  const pl = G.pl; if (!pl) return;
  S.uiOk();
  switch (s.keys) {
    case 'kage':
      pl.ult = true; pl.sp += 5; pl.ryo += 999; S.level();
      notify('影 · Le nom de l’ombre — ultime, 5 points et 999 ryo.', 'gold'); break;
    case 'kami':
      pl.buffs = pl.buffs || {}; pl.buffs.god = 45; S.bell();
      notify('神 · Bénédiction des kamis — invulnérable 45 secondes.', 'gold'); break;
    case 'kaze':
      pl.buffs = pl.buffs || {}; pl.buffs.speed = 60; S.swish?.(1);
      notify('風 · Pas du vent — vitesse doublée 60 secondes.', 'gold'); break;
    case 'sakura':
      pl.hp = pl.hpMax; pl.en = 100; setWeather('clair', 240); S.bell();
      notify('桜 · Pétales de vie — vie et énergie restaurées.', 'gold'); break;
    case 'yuki':
      setWeather('neige', 240); notify('雪 · Neige silencieuse — la vallée se couvre de blanc.', 'place'); break;
    case 'rai':
      setWeather('orage', 120); S.thunder();
      notify('雷 · Colère du ciel — l’orage éclate.', 'warn'); break;
    case 'tsuki':
      W.time = 22.2; notify('月 · Nuit de lune — la nuit tombe d’un coup.', 'place'); break;
    case 'oni': {
      const f = pl.facing();
      spawnEnemy('oni', pl.pos.x + f.x * 9, pl.pos.z + f.z * 9, { aggro: true, tag: 'secret_oni' });
      S.thunder(); notify('鬼 · L’invité est arrivé. Bon courage.', 'warn'); break;
    }
    case 'tenshi': {
      pl.hp = pl.hpMax; pl.en = 100; pl.oxygen = 100; pl.inWater = false; pl.submerged = false; pl.buffs = {};
      const g = groundAt(ST.rest.x, ST.rest.z, 99);
      pl.pos.set(ST.rest.x, g.h + 0.1, ST.rest.z); pl.vel.set(0, 0, 0);
      W.underwater = false; S.bell(); notify('天 · Ailes de l’ange — tu renais au dernier repos.', 'gold'); break;
    }
    case 'sensei':
      learnAll(); S.level();
      notify('先生 · Leçon du maître — toutes les compétences sont acquises.', 'gold'); break;
    default: break;
  }
  burst();
  save(true);
}

G.on('keys', (buf) => {
  if (!buf) return;
  const s = SECRETS.find((x) => buf.endsWith(x.keys));
  if (!s) return;
  const now = performance.now();
  if (now - (cool[s.keys] || 0) < 5000) return;
  cool[s.keys] = now;
  cast(s);
});

/* le code du créateur : tout est débloqué */
G.on('konami', () => {
  const pl = G.pl; if (!pl) return;
  for (const k in CHARS) ST.chars[k] = true;
  learnAll(); pl.ult = true; pl.special = true; pl.sp += 10; pl.ryo += 1999;
  ST.seals.sakura = ST.seals.sakura || true;
  S.level(); S.gong();
  notify('KONAMI · Les dix voies t’appartiennent : personnages, techniques et 10 points.', 'gold');
  save(true);
});
