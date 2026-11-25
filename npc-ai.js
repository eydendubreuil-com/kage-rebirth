/* KAGE: REBIRTH — esprit local des habitants.
   Chaque PNJ possède sa personnalité, sa mémoire et ses réponses contextuelles.
   Aucune requête réseau, aucune clé : le jeu reste entièrement hors-ligne. */
import { W } from './world.js';
import { G } from './game.js';
import { REGIONS, nearestRegion } from './regions.js';
import { R, rr } from './util.js';

let MINDS = new WeakMap();
const SAVED = new Map();

const strip = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’`']/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const has = (s, ...words) => words.some(w => s.includes(w));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (s, w) => new RegExp(`(^| )${esc(w)}( |$)`).test(s);
const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const DIRS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
function dirTo(from, to) {
  const a = Math.atan2(to.x - from.x, to.z - from.z);
  return DIRS[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}
function distTxt(d) { return d < 35 ? 'tout près' : d < 90 ? 'à quelques minutes' : d < 220 ? 'plus loin dans la vallée' : 'de l\'autre côté des montagnes'; }

const TRAITS = ['chaleureux', 'curieux', 'fier', 'fatigué', 'malicieux', 'prudent', 'poétique', 'pratique'];
const DREAMS = [
  'voir la mer, un jour, quand les routes seront sûres',
  'ouvrir une petite école où les enfants apprendraient les dix signes',
  'retrouver quelqu\'un que la montagne m\'a pris',
  'apprendre à lire les nuages comme mon grand-père',
  'avoir une maison avec un vrai toit, et le temps de m\'y asseoir',
  'marcher jusqu\'au dojo de Mugen sans avoir peur',
];
const FEARS = [
  'que le silence entre les dojos redevienne une guerre',
  'les nuits sans lune, quand la rivière parle trop fort',
  'perdre encore quelqu\'un sans pouvoir lui dire au revoir',
  'les hommes qui portent une lame et pas de nom',
  'que les jeunes partent et ne reviennent pas',
];
const SECRETS = [
  'Je viens parfois écouter les carpes au bassin, quand personne ne regarde.',
  'J\'ai gardé une lettre de mon frère pendant trois hivers sans oser l\'ouvrir.',
  'Je sais un raccourci vers le sanctuaire que les moines eux-mêmes ont oublié.',
  'Il m\'arrive de laisser une offrande au petit torii, même quand je dis que je n\'y crois pas.',
  'J\'ai vu une silhouette marcher sur l\'eau, près de la cascade. Je n\'en ai jamais parlé.',
  'Mon père disait que les dix dojos étaient une seule maison. Je commence à le croire.',
];
const OPINIONS = [
  'Les dix dojos ne sont pas dix royaumes. Ce sont dix portes de la même maison.',
  'Le KAGE TRIAL ne rend personne meilleur. Il montre seulement ce qu\'on est déjà.',
  'Les maîtres parlent de force, mais ce qui manque à cette vallée, c\'est la mémoire.',
  'Le Null n\'est pas un monstre. C\'est ce qui reste quand plus personne ne se parle.',
];

export function mindFor(npc) {
  let m = MINDS.get(npc);
  if (m) return m;
  const base = personaFor(npc);
  const saved = SAVED.get(npc.uid);
  m = Object.assign(base, {
    affinity: 0, greeted: false, conversations: 0, topics: {}, history: [], last: '',
    toldSecret: false, lastMood: '', lastGreet: 0,
  }, saved || {});
  m.uid = npc.uid || npc.def?.id || npc.name;
  MINDS.set(npc, m);
  return m;
}

function personaFor(npc) {
  const id = npc.def.id || '';
  const name = npc.name || 'Villageois';
  const seed = hash((npc.uid || id || name) + name);
  let role = 'villageois', job = name === 'Villageoise' ? 'une habitante' : 'un habitant', tone = 'paisible';
  if (npc.def.shop) { role = 'marchand'; job = name === 'Marchande' ? 'une marchande' : 'un marchand'; tone = 'commerçant'; }
  if (id.startsWith('master_')) { role = 'maître'; job = 'un gardien du dojo'; tone = 'grave'; }
  else if (id.startsWith('eleve_') || id === 'eleve') { role = 'élève'; job = 'un élève du dojo'; tone = 'vif'; }
  else if (id.startsWith('quest_')) { role = 'disciple'; job = 'un disciple'; tone = 'discret'; }
  else if (id === 'yuki') { role = 'ancienne'; job = 'l\'ancienne du village'; tone = 'lent'; }
  else if (id === 'hana') { role = 'maître'; job = 'la maîtresse du dojo'; tone = 'grave'; }
  else if (id === 'akira') { role = 'rival'; job = 'le meilleur élève de Hana'; tone = 'sec'; }
  else if (id === 'zen') { role = 'aubergiste'; job = 'le tenancier du salon de thé'; tone = 'chaleureux'; }
  else if (id === 'ryu') { role = 'moine'; job = 'le moine du sanctuaire'; tone = 'calme'; }
  else if (id === 'raizo') { role = 'forgeron'; job = 'le forgeron'; tone = 'rude'; }
  else if (id === 'kai') { role = 'enfant'; job = 'un enfant du marché'; tone = 'joyeux'; }
  else if (id === 'innkeeper') { role = 'aubergiste'; job = 'l\'aubergiste'; tone = 'maternel'; }
  const reg = npc.def.reg || nearestRegion(npc.pos.x, npc.pos.z, 420) || REGIONS[0];
  const home = reg ? reg.name : 'Sakura';
  const t1 = TRAITS[seed % TRAITS.length], t2 = TRAITS[(seed >>> 3) % TRAITS.length];
  return {
    name, role, job, home, tone,
    traits: Array.from(new Set([t1, t2])).slice(0, 2),
    dream: DREAMS[(seed >>> 5) % DREAMS.length],
    fear: FEARS[(seed >>> 7) % FEARS.length],
    secret: SECRETS[(seed >>> 9) % SECRETS.length],
    opinion: OPINIONS[(seed >>> 11) % OPINIONS.length],
    age: role === 'enfant' ? 9 : 18 + (seed % 55),
  };
}

function context(npc, ST) {
  const reg = npc.def.reg || nearestRegion(npc.pos.x, npc.pos.z, 420) || REGIONS[0];
  const hour = W.time;
  const part = hour < 5 ? 'nuit' : hour < 8.5 ? 'aube' : hour < 12 ? 'matin' : hour < 17.5 ? 'après-midi' : hour < 20.5 ? 'soir' : 'nuit';
  const weather = W.weather.kind || 'clair';
  const seals = ST ? Object.keys(ST.seals || {}).length : 0;
  const level = G.pl ? G.pl.level : 1;
  const gear = G.pl && G.pl.gear ? (G.pl.gear.lame || 0) : 0;
  return { reg, hour, part, weather, seals, level, gear, place: reg ? reg.name : 'Sakura' };
}

function weatherLine(w, c, npc) {
  if (w === 'pluie') return `La pluie tient les chemins. Reste un peu à l'abri, Sora.`;
  if (w === 'orage') return `L'orage gronde sur les crêtes. Même les rônin doivent baisser la tête.`;
  if (w === 'neige') return `La neige efface les traces. C'est beau, et c'est dangereux.`;
  if (w === 'brume') return `La brume monte de la rivière. On entend mieux ce qu'elle cache.`;
  if (w === 'nuageux') return `Le ciel est bas. Les vieux disent que c'est le temps des souvenirs.`;
  return c.part === 'aube' ? `L'aube est belle sur ${c.place}.` : c.part === 'soir' ? `Le soir tombe sur ${c.place}.` : `Le temps est clair, aujourd'hui.`;
}

function greetingFor(npc, m, c) {
  if (!m.greeted) {
    m.greeted = true;
    const who = m.name;
    if (who === 'Maître Hana') return `Sora. Tu as fait le chemin. Entre, et parle vrai : je n'aime pas les mots qui tournent autour.`;
    if (m.role === 'maître') return `Je suis ${who}. Hana m'a parlé de toi, ou peut-être l'ai-je rêvé. Entre, et parle vrai.`;
    if (m.role === 'moine') return `Le vent t'a amené jusqu'ici. Je suis ${who}. Assieds-toi si tu veux, le silence du sanctuaire est plus bavard que moi.`;
    if (m.role === 'forgeron') return `Approche. Je suis ${who}. Montre-moi cette lame, et ne me raconte pas qu'elle est tombée du ciel.`;
    if (m.role === 'aubergiste') return `Entre, tu as l'air fatigué. Je suis ${who}. Ici, on mange, on boit, et on parle si le cœur te dit.`;
    if (m.role === 'marchand') return isGenericName(who) ? pick(m, [`Approche, voyageur. Ce que je vends n'est pas toujours ce que tu cherches. On me dit d'un tempérament ${m.traits[0]}.`, `Tu as l'air de chercher quelque chose. Ici, on a surtout des histoires et du thé. On me dit d'un tempérament ${m.traits[0]}.`]) : `Approche, voyageur. Je m'appelle ${who}. Ce que je vends n'est pas toujours ce que tu cherches.`;
    if (m.role === 'enfant') return `Oh ! Tu es le nouveau du dojo ? Moi c'est ${who}. Tu sais où est Mochi ?`;
    if (m.role === 'élève') return isGenericName(who) ? pick(m, [`Tu es le nouveau ? Bien. Ici, à ${c.place}, on se lève avant le soleil et on range son ego avec ses sandales.`, `Le maître dit que le sabre commence dans les pieds. Moi, je dis qu'il commence dans le dos, quand on se lève. Ici, à ${c.place}, on apprend vite.`]) : `Je suis ${who}. Tu es le nouveau ? Bien. Ici, on se lève avant le soleil.`;
    if (m.role === 'disciple') return who && who !== 'Disciple' ? `Je suis ${who}. Le maître t'attend, ou peut-être l'inverse.` : pick(m, [`Le maître t'attend, ou peut-être l'inverse. Je suis là pour veiller sur le dojo.`, `Ne touche pas aux lanternes. Enfin, pas avant d'avoir salué.`]);
    if (m.role === 'ancienne') return `Entre, Sora. Le vent m'a dit que tu viendrais avant la fin du jour.`;
    if (m.role === 'rival') return `Tu es le nouveau. Je m'appelle ${who}. On verra si tu tiens trois coups.`;
    return isGenericName(who) ? pick(m, [`Sora, n'est-ce pas ? Tu as fait le chemin depuis la vallée. Pose ton sac et reprends ton souffle. On me dit d'un tempérament ${m.traits[0]}.`, `Tu es le nouveau du dojo. On se souviendra de ton nom si tu restes assez longtemps. Ici, à ${c.place}, la mémoire est longue.`, `Approche. Le village n'est pas grand, mais il a ses détours. On me dit d'un tempérament ${m.traits[0]}.`, `Sora. On t'attendait, ou on attendait quelqu'un qui te ressemble. Ici, à ${c.place}, on reconnaît les visages.`]) : `Sora, n'est-ce pas ? Je m'appelle ${who}. Je n'avais pas vu de voyageur depuis la fonte des neiges.`;
  }
  if (m.affinity >= 8) return pick(m, [`Te revoilà. J'ai gardé un peu de thé, si tu veux.`, `Tu tombes bien. J'avais envie de parler à quelqu'un qui écoute.`, `Encore toi ? Bon. Assieds-toi, alors.`]);
  if (m.affinity <= -2) return pick(m, [`C'est encore toi.`, `Qu'est-ce que tu veux ?`, `Je n'ai pas changé d'avis.`]);
  if (c.weather === 'pluie' || c.weather === 'orage') return `${pick(m, [`Tu marches sous la pluie ?`, `Tu devrais t'abriter.`])} ${weatherLine(c.weather, c, npc)}`;
  return pick(m, [`Te revoilà, Sora.`, `Tu as l'air d'avoir marché longtemps.`, `Approche. Qu'est-ce qui t'amène ?`]);
}

function pick(m, arr) {
  if (!arr || !arr.length) return '';
  let i = hash(`${m.uid || m.name}|${m.home}|${m.conversations}|${arr.length}`) % arr.length;
  for (let k = 0; k < arr.length; k++) {
    const s = arr[(i + k) % arr.length];
    if (s !== m.last) { m.last = s; return s; }
  }
  return arr[0];
}

function topicsFor(npc, m) {
  const pool = [
    { t: 'Parle-moi de toi', say: 'Parle-moi de toi.' },
    { t: 'Et ce village ?', say: 'Parle-moi de ce village.' },
    { t: 'Des rumeurs ?', say: 'Tu connais des rumeurs ?' },
    { t: 'Un conseil ?', say: 'Tu as un conseil pour moi ?' },
    { t: 'Comment vas-tu ?', say: 'Comment vas-tu ?' },
    { t: 'La météo', say: 'Quel temps fait-il ?' },
  ];
  const open = pool.filter(x => !m.topics[strip(x.t)] || m.topics[strip(x.t)] < 2);
  const chosen = (open.length ? open : pool).slice(0, 4).map(x => ({ t: x.t, say: x.say }));
  if (m.affinity >= 6 && !m.toldSecret) chosen.splice(2, 0, { t: 'Un secret ?', say: 'Tu peux me confier un secret ?' });
  chosen.push({ t: 'Au revoir', bye: true });
  return chosen;
}

export function greet(npc, ST) {
  const m = mindFor(npc), c = context(npc, ST);
  if (!m.greeted) m.affinity += 1;
  m.conversations++;
  const text = greetingFor(npc, m, c);
  const extra = m.sealsLine !== c.seals && c.seals > 0 ? ` On dit que tu portes déjà ${c.seals} sceau${c.seals > 1 ? 'x' : ''}.` : '';
  m.sealsLine = c.seals;
  SAVED.set(npc.uid, serializeMind(m));
  return { text: text + extra, emo: m.affinity >= 6 ? 'joie' : 'neutre', choices: topicsFor(npc, m), mind: m };
}

function addAffinity(m, n) {
  m.affinity = Math.max(-10, Math.min(20, m.affinity + n));
}
function serializeMind(m) {
  return { affinity: m.affinity, greeted: m.greeted, conversations: m.conversations, topics: m.topics, history: m.history, toldSecret: m.toldSecret, last: m.last };
}

function remember(m, key) {
  m.topics[key] = (m.topics[key] || 0) + 1;
  m.history.push(key);
  if (m.history.length > 14) m.history.shift();
}

function questHint(ST, c) {
  if (!ST) return '';
  const id = ST.track;
  const q = id && ST.quests ? ST.quests[id] : null;
  if (!q || q.done) return c.seals >= 10 ? 'Les dix sceaux sont réunis. Le reste dépend de toi.' : 'Suis les routes. Les maîtres savent reconnaître ceux qui arrivent.';
  const quests = ST.quests || {};
  const active = Object.keys(quests).find(k => !quests[k].done);
  if (!active) return "Le journal est vide. C'est parfois le plus dur : choisir soi-même son chemin.";
  return 'Ouvre ton journal. La prochaine étape y est écrite mieux que je ne saurais le dire.';
}

const NAME_STOP = new Set(['maitre', 'maitresse', 'ancienne', 'villageois', 'villageoise', 'marchand', 'enfant', 'le', 'la', 'les', 'du', 'de', 'des', 'aubergiste', 'forgeron', 'moine']);
const isGenericName = (n) => /^(villageois|villageoise|marchand|eleve|disciple)/.test(strip(n));
function findNamedNpc(low, npc) {
  return (G.npcs || []).find(o => {
    if (o === npc || !o.name || o.def?.id?.startsWith('rv_') || isGenericName(o.name)) return false;
    const words = strip(o.name).split(' ').filter(w => w.length > 2 && !NAME_STOP.has(w));
    return words.some(w => hasWord(low, w));
  }) || null;
}
function namedNpcHint(low, npc) {
  const target = findNamedNpc(low, npc);
  if (!target) return null;
  const d = Math.hypot(target.pos.x - npc.pos.x, target.pos.z - npc.pos.z);
  return `${target.name} ? On peut trouver cette personne ${distTxt(d)}, vers le ${dirTo(npc.pos, target.pos)}.`;
}
function whoHint(low, npc) {
  const target = findNamedNpc(low, npc);
  if (!target) return null;
  const p = personaFor(target);
  return `${p.name} ? C'est ${p.job}, de ${p.home}. On lui prête un tempérament ${p.traits.join(' et ')}.`;
}

function regionHint(low, npc, c) {
  const reg = REGIONS.find(r => low.includes(strip(r.name)) || low.includes(strip(r.dojo || '')))
    || (low.includes('dojo') ? REGIONS.slice().sort((a, b) => Math.hypot(a.x - npc.pos.x, a.z - npc.pos.z) - Math.hypot(b.x - npc.pos.x, b.z - npc.pos.z))[0] : null);
  if (reg) {
    const d = Math.hypot(reg.x - npc.pos.x, reg.z - npc.pos.z);
    return `Le ${reg.dojo} est ${distTxt(d)}, vers le ${dirTo(npc.pos, reg)}. ${reg.master} y enseigne. On ne s'y perd pas, mais on peut s'y perdre soi-même.`;
  }
  const poi = (W.pois || []).find(p => strip(p.name).split(' ').some(w => w.length > 2 && hasWord(low, w)));
  if (poi) { const d = Math.hypot(poi.x - npc.pos.x, poi.z - npc.pos.z); return `${poi.name} est ${distTxt(d)}, vers le ${dirTo(npc.pos, poi)}.`; }
  return null;
}

function replyText(npc, low, m, c, ST) {
  const name = m.name;
  const hint = questHint(ST, c);
  if (has(low, 'au revoir', 'adieu', 'a plus', 'bye', 'bonne route', 'je dois partir', 'je m en vais')) return `Va. Et si tu reviens, je serai là.`;
  if (/\bia\b/.test(low) || has(low, 'robot', 'programme', 'intelligence artificielle', 'machine', 'algorithme')) return `Je ne suis pas un programme, Sora. Je suis ${isGenericName(name) ? `un habitant de ${c.place}` : `${name}, de ${c.place}`}. J'ai vu assez d'hivers pour savoir quand on se moque de moi.`;
  if (has(low, 'humain', 'conscience', 'sentiments', 'tu ressens', 'vrai personne')) return pick(m, [`Je saigne quand je me coupe, je ris quand quelque chose est drôle, et je me trompe souvent. C'est assez humain pour moi.`, `Je ne sais pas ce que je suis quand personne ne me regarde. Mais devant toi, je suis là.`]);
  if (has(low, 'idiot', 'debile', 'con ', 'ta gueule', 'ferme la', 'sale') || /\bnul\b/.test(low)) { addAffinity(m, -3); return `Garde tes insultes pour ceux qui te ressemblent. Ici, on parle autrement.`; }
  if (has(low, 'merci', 'remercie', 'tu es gentil', 'tu es bon', 'bravo')) { addAffinity(m, 2); return pick(m, [`Ne me remercie pas. Fais bon usage de ce que tu apprends.`, `C'est rare, la gratitude. Garde-la.`]); }
  if (has(low, 'bonjour', 'salut', 'hey', 'bonsoir', 'konnichiwa', 'coucou')) { addAffinity(m, 1); return `Bonjour, Sora. ${weatherLine(c.weather, c, npc)}`; }
  if (has(low, 'qui es tu', 'ton nom', 'ton prenom', 'quel est ton nom', 'presente toi', 'tu es qui', 'comment tu t appelles', 'comment t appelles tu', 'parle moi de toi', 'parle de toi')) {
    const intro = isGenericName(name) ? `Je suis ${m.job}.` : `Je m'appelle ${name}. Je suis ${m.job}.`;
    if (m.role === 'maître' || m.role === 'rival') return `${intro} Je vis à ${m.home}. ${m.role === 'rival' ? 'On verra si tu tiens trois coups.' : 'Ici, on apprend en écoutant avant de frapper.'}`;
    return `${intro} Je vis à ${m.home}. ${m.traits.includes('curieux') ? 'Je pose trop de questions, on me le reproche souvent.' : 'Je ne suis pas quelqu\'un de très important, mais je connais mon village.'}`;
  }
  if (has(low, 'qui est', 'connais tu', 'parle moi de')) { const who = whoHint(low, npc); if (who) return who; }
  if (has(low, 'comment vas tu', 'ca va', 'tu vas bien', 'comment tu vas')) {
    const mood = c.weather === 'orage' ? 'Un peu inquiet, avec cet orage. Et toi ?' : c.part === 'nuit' ? 'Fatigué. La nuit me rend bavard.' : m.affinity >= 6 ? 'Mieux, maintenant que tu es là.' : 'Comme toujours. Le dos un peu raide, mais vivant.';
    return mood;
  }
  if (has(low, 'meteo', 'temps', 'pluie', 'neige', 'orage', 'brume', 'soleil', 'chaud', 'froid')) return weatherLine(c.weather, c, npc) + ` ${c.weather === 'neige' ? 'Couvre-toi.' : c.weather === 'pluie' ? 'Évite les berges.' : ''}`;
  if (has(low, 'ou est', 'ou se trouve', 'trouver', 'aller voir')) { const n = namedNpcHint(low, npc); if (n) return n; const r = regionHint(low, npc, c); if (r) return r; }
  if (has(low, 'dojo', 'maitre', 'maitresse', 'ecole', 'entrainement')) return `Les dojos ne sont pas des auberges. On y entre pour apprendre, pas pour se vanter. ${c.seals > 0 ? `Tu as déjà ${c.seals} sceau${c.seals > 1 ? 'x' : ''}, il paraît.` : 'Va voir le maître quand tu seras prêt à écouter.'}`;
  if (has(low, 'kage', 'null', 'vide', 'rei', 'conspiration', 'serrure')) return `${m.opinion} ${m.affinity >= 5 ? 'Je ne dis pas ça devant tout le monde.' : 'Ce n\'est que mon avis.'}`;
  if (has(low, 'quete', 'mission', 'travail', 'aider', 'que faire', 'ou aller')) return hint;
  if (has(low, 'conseil', 'aide', 'comment', 'combat', 'sabre', 'lame', 'technique', 'parade', 'se battre')) {
    const tips = [
      'Une garde trop haute laisse le ventre ouvert. Une garde trop basse laisse la tête seule.',
      'Ne frappe pas quand tu es en colère. La colère est une lame qui coupe des deux côtés.',
      'Écoute les pieds, pas la lame. Les pieds mentent mal.',
      'Le souffle mène le coup. Si tu retiens ton souffle, tu retiens ta main.',
    ];
    return pick(m, tips) + (c.gear > 0 ? ' Ta lame est meilleure que celle de la plupart des rônin. Ne la laisse pas rouiller.' : '');
  }
  if (has(low, 'rumeur', 'on dit', 'nouvelle', 'secret', 'histoire', 'legende')) {
    if (m.affinity >= 6 && !m.toldSecret) { m.toldSecret = true; return `Puisque tu es là... ${m.secret}`; }
    const rumors = [
      'On dit que le camp des rônin, au sud-est, change de chef chaque saison. Aucun ne reste assez longtemps pour apprendre à se battre.',
      'Une femme en noir a été vue près de la pagode. Elle regarde la vallée comme si elle y cherchait une porte.',
      'Le vieux puits du marché donne une eau plus froide que la rivière. Personne ne sait pourquoi.',
      'Les lanternes du sanctuaire s\'éteignent parfois sans vent. Ryu prétend que c\'est Inari qui respire.',
    ];
    return pick(m, rumors);
  }
  if (has(low, 'manger', 'faim', 'the', 'riz', 'onigiri', 'dango', 'sake', 'restaurant', 'auberge')) return m.role === 'marchand' || m.role === 'aubergiste' ? 'Tu as de la chance : c\'est encore chaud. Pour quelques ryo, je te sers quelque chose qui tient au ventre.' : 'Le thé de Zen est le meilleur de la vallée. Le riz, ici, a le goût de la terre noire.';
  if (has(low, 'famille', 'enfant', 'femme', 'mari', 'frere', 'soeur', 'parents', 'fils', 'fille')) return pick(m, [`Ma famille est comme les racines d'un vieux cerisier : on ne la voit pas, mais elle tient tout debout.`, `J'ai un frère qui est parti au nord. Il m'écrit quand les routes le permettent.`, `Je n'ai pas d'enfant. J'ai les enfants du village, et c'est déjà beaucoup de bruit.`]);
  if (has(low, 'ton passe', 'du passe', 'enfance', 'souvenirs', 'quand tu etais jeune')) return `Avant, ${c.place} était plus calme. Les routes étaient plus longues, et on avait le temps de saluer les étrangers. Je ne sais pas si c'était mieux, seulement plus lent.`;
  if (has(low, 'ton age', 'quel age as tu', 'tu as quel age', 'ton enfance')) return `J'ai ${m.age} ans. Enfin, c'est ce que dit le recensement. Les années, ici, se comptent plutôt en récoltes.`;
  if (has(low, 'peur', 'reve', 'avenir', 'espoir', 'mourir', 'mort')) return m.affinity >= 4 ? `J'ai peur que ${m.fear}. Et je rêve de ${m.dream}.` : `Tout le monde a peur de quelque chose. Ce qui compte, c'est ce qu'on fait ensuite.`;
  if (has(low, 'mon niveau', 'mon arme', 'mon equipement', 'mon sabre', 'ma force', 'mes competences', 'mes stats')) return `Tu portes tes choix comme on porte un fourreau. ${c.level >= 5 ? 'Tu as déjà l\'allure de ceux qui reviennent.' : 'Tu apprends encore. C\'est bien. Les imbéciles n\'apprennent jamais.'}`;
  if (has(low, 'ou habites tu', 'tu habites ou', 'd ou viens tu', 'tu viens d ou')) return `Je vis à ${m.home}. Enfin, je vis surtout sur le chemin entre le marché et la maison. Les murs, ici, ne tiennent pas les gens longtemps.`;
  if (has(low, 'ou suis je', 'endroit', 'village', 'vallee', 'region', 'pays')) return `Ici, c'est ${c.place}. ${m.home !== c.place ? `Moi, je viens de ${m.home}.` : 'Je connais chaque pierre du chemin.'} Les dix vallées se ressemblent, mais aucune n'a le même silence.`;
  if (has(low, 'aide moi', 'peux tu m aider', 'donne moi', 'argent', 'ryo')) { addAffinity(m, -1); return `Je ne donne pas de ryo, Sora. Je peux te donner une information, ou un bol de riz si tu as vraiment faim.`; }
  if (has(low, 'je t aime', 'tu me plais', 'amour', 'tu es belle', 'tu es beau', 'es tu seul', 'es tu seule', 'tu m aimes')) {
    if (m.affinity >= 6) return `Tu dis ça comme un coup de vent. Je ne sais pas encore si c'est une promesse ou une plaisanterie. Mais ça me touche, Sora.`;
    return `L'amour, ici, ressemble à la pluie : il arrive sans prévenir et il laisse le sol plus vivant. Mais ce n'est pas une question qu'on pose à un inconnu.`;
  }
  const word = low.split(/\s+/).filter(w => w.length > 4).sort((a, b) => b.length - a.length)[0];
  if (word) return pick(m, [`« ${cap(word)} »... Je ne suis pas sûr de bien comprendre. Explique-moi autrement.`, `${cap(word)} ? Tu parles de choses qui me dépassent, peut-être. Ou qui me concernent plus que tu ne crois.`, `Je n'ai pas de réponse toute faite à ça. Mais je t'écoute.`]);
  return pick(m, [`Parle-moi encore. Les mots sont rares, par ici.`, `Je ne sais pas quoi te répondre. Mais reste un instant.`, `Tu poses des questions que même les maîtres évitent.`]);
}

export function replyTo(npc, text, ST) {
  const m = mindFor(npc), c = context(npc, ST);
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean) return { text: '…', emo: 'neutre', choices: topicsFor(npc, m) };
  m.conversations++;
  m.last = clean;
  const low = strip(clean);
  const out = replyText(npc, low, m, c, ST);
  const key = low.slice(0, 40);
  remember(m, key);
  m.history = m.history.slice(-14);
  const emo = (has(low, 'idiot', 'debile', 'sale', 'ta gueule') || /\bnul\b/.test(low)) || m.affinity <= -2 ? 'colere'
    : has(low, 'peur', 'mort', 'orage') ? 'surprise'
      : has(low, 'merci', 'bravo', 'gentil') || m.affinity >= 8 ? 'joie' : 'neutre';
  SAVED.set(npc.uid, serializeMind(m));
  return { text: out, emo, choices: topicsFor(npc, m) };
}

export function exportMinds() {
  const out = {};
  for (const [uid, m] of SAVED) out[uid] = m;
  return out;
}

export function importMinds(data) {
  SAVED.clear(); MINDS = new WeakMap();
  if (!data || typeof data !== 'object') return;
  for (const k of Object.keys(data)) SAVED.set(k, data[k]);
}

export function clearMinds() { SAVED.clear(); MINDS = new WeakMap(); }
