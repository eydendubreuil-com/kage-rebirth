/* KAGE: REBIRTH — les dix dojos, les combattants jouables, l'équipement et les boutiques.
   Module de données pur : aucun import, utilisable par le monde, l'histoire et l'interface. */

export const MAP_SIZE = 1900;

/* look des maîtres et champions */
const LOOK = {
  kuro: { outfit: 'kuro', hair: 'capuche', mask: true, scarf: true, chains: true, sword: true },
  tetsu: { outfit: 'tetsu', hair: 'court', beard: true, chains: false, sword: true, scale: 1.16 },
  akane: { outfit: 'akane', hair: 'queue', band: true, chains: true, sword: true },
  nagi: { outfit: 'nagi', hair: 'chignon', scarf: true, chains: false, sword: true },
  hisui: { outfit: 'hisui', hair: 'queue', band: true, chains: true, sword: true },
  yuki: { outfit: 'yuki', hair: 'chignon', scarf: true, chains: true, sword: true },
  raiden: { outfit: 'raiden', hair: 'court', band: true, chains: false, sword: true, scale: 1.08 },
  tsuki: { outfit: 'tsuki', hair: 'queue', mask: true, scarf: true, chains: true, sword: true },
  kage: { outfit: 'mugen', hair: 'capuche', mask: true, scarf: true, chains: true, sword: true, scale: 1.12 },
};

const SHOP_BASE = [
  { id: 'onigiri', price: 15 }, { id: 'the', price: 10 },
];
const SHOP_LATE = [
  { id: 'dango', price: 30 }, { id: 'sake', price: 28 }, { id: 'elixir', price: 130 },
];
const SHOP_GEAR = [
  { id: 'lame', tier: 1, price: 180 }, { id: 'armure', tier: 1, price: 170 }, { id: 'bottes', tier: 1, price: 160 },
];

/* Chaque région est un plateau construit autour d'un dojo. Les coordonnées locales ont +z vers la vallée centrale. */
const RAW = [
  {
    id: 'kage', num: 2, name: 'Quartier des Ombres', kanji: '影', style: 'Ombre', theme: 'kage',
    dojo: "Dojo de l'Ombre", master: 'Maître Kuro', x: -433, z: -250, y: 4.2, climate: ['pluie', 'brume', 'nuageux', 'clair'],
    boss: { hp: 235, speed: 4.25, block: 0.42, dodge: 0.28, moves: ['l1', 'l2', 'e1'], scale: 1.04, xp: 420, ryo: [70, 110] },
    shop: { name: "Échoppe de l'Ombre", keeper: 'Ren', items: [...SHOP_BASE, { id: 'dango', price: 30 }, { id: 'lame', tier: 1, price: 180 }] },
    side: { title: 'Les lanternes de l\'Ombre', kind: 'collect', count: 3, text: 'Trois lanternes d\'ombre sont tombées dans les ruelles. Rapporte-les à Ren.' },
    chapter: { title: 'Chapitre 2 — Les lanternes de l\'Ombre',
      intro: 'Les toits de Kuro brillent sous la pluie. Ici, on ne demande pas ton nom : on demande ce que tu as oublié.',
      master: ['Tu as traversé le col. Peu le font sans lanterne.', 'Mon dojo garde l\'ombre, pas la peur. Montre-moi la différence : nettoie mes ruelles des rônin qui s\'y cachent.', 'Reviens ensuite. Je veux voir ta lame dans la lumière des lanternes.'],
      trial: ['Bien. La pluie efface les traces, pas les dettes.', 'Un dernier mot : ne crois pas que l\'ombre soit vide. Elle se souvient de tout, elle.'],
      bossName: 'Kuro', seal: 'Ombre' },
    lore: 'Kuro fut le premier à comprendre que le Null ne détruit pas : il oublie. Son dojo garde les noms des choses disparues.',
  },
  {
    id: 'yama', num: 3, name: 'Mont du Silence', kanji: '山', style: 'Montagne', theme: 'yama',
    dojo: 'Dojo de la Montagne', master: 'Maître Tetsu', x: -171, z: -470, y: 13.5, climate: ['neige', 'brume', 'nuageux', 'clair'],
    lake: { x: 56, z: -8, r: 26, kind: 'glace' },
    boss: { hp: 275, speed: 3.4, block: 0.3, dodge: 0.15, moves: ['e2', 'heavy', 'l2'], scale: 1.2, xp: 500, ryo: [80, 120] },
    shop: { name: 'Forge du Silence', keeper: 'Iwa', items: [...SHOP_BASE, { id: 'lame', tier: 2, price: 460 }, { id: 'armure', tier: 1, price: 170 }] },
    side: { title: 'Le souffle des cimes', kind: 'hunt', count: 4, text: 'Quatre pillards coupent la route du col. Tetsu veut la route libre avant la nuit.' },
    chapter: { title: 'Chapitre 3 — Le silence de la montagne',
      intro: 'La neige ne tombe pas ici : elle reste. Le col est blanc depuis trois hivers.',
      master: ['Un sabre qui cherche la gloire fait plus de bruit qu\'un éboulement.', 'Quatre pillards tiennent le col. Va me les chercher. Reviens avec leurs armes, pas avec leurs excuses.', 'Alors, seulement, tu verras pourquoi je forge des lames que personne ne peut lever.'],
      trial: ['Ton souffle est court, mais honnête.', 'La montagne ne t\'a pas vaincu. C\'est tout ce que je demande.'],
      bossName: 'Tetsu', seal: 'Montagne' },
    lore: 'Tetsu forge des lames trop lourdes pour lui. Il dit que c\'est une leçon, pas un défaut.',
  },
  {
    id: 'akai', num: 4, name: 'Forteresse Écarlate', kanji: '紅', style: 'Feu', theme: 'akai',
    dojo: 'Dojo Écarlate', master: 'Maître Akane', x: 171, z: -470, y: 6.2, climate: ['clair', 'brume', 'nuageux', 'orage'],
    boss: { hp: 260, speed: 4.5, block: 0.36, dodge: 0.32, moves: ['l2', 'l3', 'heavy'], scale: 1.02, xp: 520, ryo: [90, 130] },
    shop: { name: 'Bazar Écarlate', keeper: 'Hina', items: [...SHOP_BASE, { id: 'armure', tier: 2, price: 360 }, { id: 'dango', price: 30 }] },
    side: { title: 'Les braseros de la forteresse', kind: 'lantern', count: 3, text: 'Trois braseros sont froids. Rallume-les pour guider les voyageurs.' },
    chapter: { title: 'Chapitre 4 — Le feu de la forteresse',
      intro: 'Les érables brûlent plus lentement que les murs. Akane a bâti sa maison entre les deux.',
      master: ['Chaque année, mes élèves confondent la colère et le courage.', 'Montre-moi que tu sais choisir : chasse les rônin de mes murailles. Ne brûle rien d\'autre.', 'Après, nous allumerons les braseros ensemble.'],
      trial: ['Le feu que tu as gardé est le bon : il éclaire sans dévorer.', 'Prends ce sceau. Il pèse plus qu\'une lame.'],
      bossName: 'Akane', seal: 'Feu' },
    lore: 'Akane brûle ses propres calligraphies chaque hiver pour ne pas s\'attacher à sa gloire.',
  },
  {
    id: 'mizu', num: 5, name: 'Temple de l\'Eau', kanji: '水', style: 'Eau', theme: 'mizu',
    dojo: "Temple-Dojo de l'Eau", master: 'Maître Nagi', x: 433, z: -250, y: 3.0, climate: ['brume', 'pluie', 'clair', 'nuageux'],
    lake: { x: 74, z: 6, r: 46, kind: 'lac' },
    boss: { hp: 255, speed: 4.4, block: 0.4, dodge: 0.35, moves: ['l1', 'l3', 'e1'], scale: 1.0, xp: 540, ryo: [90, 140] },
    shop: { name: 'Maison du Poisson', keeper: 'Ami', items: [...SHOP_BASE, { id: 'dango', price: 30 }, { id: 'bottes', tier: 2, price: 400 }] },
    side: { title: 'Les perles de la rivière', kind: 'collect', count: 3, text: 'Trois perles ont roulé au fond du lac. Remonte-les sans te noyer : surveille ton souffle.' },
    chapter: { title: 'Chapitre 5 — Le reflet de l\'eau',
      intro: 'Le lac ne reflète que ce qu\'on accepte de voir. Nagi y enseigne depuis trente ans.',
      master: ['L\'eau ne frappe pas : elle attend, puis elle emporte.', 'Le lac est profond, et mes disciples y ont perdu des perles. Plonge, respire, reviens.', 'Puis, si tu peux encore tenir ta lame, nous verrons qui de nous deux suit le courant.'],
      trial: ['Tu es remonté. C\'est déjà une réponse.', 'L\'eau garde ceux qui se croient plus forts qu\'elle. Toi, tu as nagé.'],
      bossName: 'Nagi', seal: 'Eau' },
    lore: 'On dit que le temple a été bâti sur l\'eau pour rappeler que rien ne tient sans mouvement.',
  },
  {
    id: 'hisui', num: 6, name: 'Sanctuaire de Jade', kanji: '翠', style: 'Jade', theme: 'hisui',
    dojo: 'Dojo de Jade', master: 'Maître Hisui', x: 492, z: 87, y: 3.6, climate: ['brume', 'pluie', 'clair', 'nuageux'],
    lake: { x: 58, z: 8, r: 20, kind: 'etang' },
    boss: { hp: 285, speed: 4.2, block: 0.45, dodge: 0.3, moves: ['l2', 'l3', 'heavy'], scale: 1.04, xp: 580, ryo: [100, 150] },
    shop: { name: 'Herboristerie de Jade', keeper: 'Momo', items: [...SHOP_BASE, { id: 'the', price: 10 }, { id: 'elixir', price: 130 }, { id: 'bottes', tier: 1, price: 160 }] },
    side: { title: 'Le chant du bambou', kind: 'hunt', count: 4, text: 'Quatre brigands coupent les bambous sacrés. Hisui veut la forêt intacte.' },
    chapter: { title: 'Chapitre 6 — Le bambou et le jade',
      intro: 'La forêt de jade chante quand personne ne ment. Ce matin, elle est silencieuse.',
      master: ['Le jade se polit avec du sable, pas avec des serments.', 'Des brigands abîment la bambouseraie. Ils sont quatre. Fais taire leurs lames, pas la forêt.', 'Reviens. Je te montrerai ce que mon dojo garde sous ses racines.'],
      trial: ['La forêt respire de nouveau. Écoute.', 'Un sceau n\'est pas une récompense : c\'est une promesse de revenir.'],
      bossName: 'Hisui', seal: 'Jade' },
    lore: 'Sous le dojo de Jade dort une racine de bambou vieille de mille ans. Quand elle tremble, c\'est le Null qui rêve.',
  },
  {
    id: 'yuki', num: 7, name: 'Village de Neige', kanji: '雪', style: 'Glace', theme: 'yuki',
    dojo: 'Dojo des Neiges', master: 'Maître Yuki', x: 321, z: 383, y: 7.5, climate: ['neige', 'brume', 'nuageux', 'clair'],
    lake: { x: -54, z: 10, r: 15, kind: 'source' },
    boss: { hp: 300, speed: 4.1, block: 0.4, dodge: 0.3, moves: ['l1', 'l2', 'heavy'], scale: 1.0, xp: 620, ryo: [110, 160] },
    shop: { name: 'Auberge des Neiges', keeper: 'Sora-la-vieille', items: [...SHOP_BASE, { id: 'sake', price: 28 }, { id: 'armure', tier: 2, price: 360 }, { id: 'elixir', price: 130 }] },
    side: { title: 'Les lanternes de neige', kind: 'lantern', count: 3, text: 'Trois lanternes guident les voyageurs perdus dans la tempête.' },
    chapter: { title: 'Chapitre 7 — Le souffle de neige',
      intro: 'À Yuki, on compte les hivers par les lanternes qu\'on rallume.',
      master: ['Le froid ne tue pas les forts. Il tue les pressés.', 'Des rônin se sont perdus dans le village. Retrouve-les, désarme-les, et ramène-les au feu.', 'Ensuite, nous parlerons de la source chaude. Et de ce qui dort dessous.'],
      trial: ['Tu as gardé ton souffle dans la tempête. C\'est cela, le sabre.'],
      bossName: 'Yuki', seal: 'Glace' },
    lore: 'La source chaude du village ne gèle jamais. Les anciens y voient une larme du volcan qui dort.',
  },
  {
    id: 'raiden', num: 8, name: 'Plateau de la Foudre', kanji: '雷', style: 'Foudre', theme: 'raiden',
    dojo: 'Dojo du Tonnerre', master: 'Maître Raiden', x: 0, z: 500, y: 9.2, climate: ['orage', 'pluie', 'nuageux', 'clair'],
    boss: { hp: 320, speed: 4.9, block: 0.35, dodge: 0.38, moves: ['l1', 'l2', 'l3'], scale: 1.05, xp: 680, ryo: [120, 180] },
    shop: { name: 'Forge du Tonnerre', keeper: 'Kaminari', items: [...SHOP_BASE, { id: 'lame', tier: 3, price: 940 }, { id: 'bottes', tier: 2, price: 400 }, { id: 'elixir', price: 130 }] },
    side: { title: 'Les pillards de la foudre', kind: 'hunt', count: 5, text: 'Cinq pillards profitent de l\'orage pour détrousser les voyageurs.' },
    chapter: { title: 'Chapitre 8 — La foudre apprivoisée',
      intro: 'Ici, le ciel frappe le sol pour se rappeler qu\'il existe.',
      master: ['On ne bloque pas la foudre. On décide où elle tombe.', 'Cinq pillards tiennent le plateau. Chasse-les avant que l\'orage ne les cache.', 'Après, je te montrerai pourquoi mon dojo n\'a pas de toit.'],
      trial: ['Le tonnerre t\'a vu et n\'a rien dit. C\'est un bon signe.', 'Prends le sceau de la foudre. Le prochain orage sera plus court.'],
      bossName: 'Raiden', seal: 'Foudre' },
    lore: 'Le dojo du Tonnerre n\'a pas de toit : Raiden voulait que chaque élève voie ce qui arrive.',
  },
  {
    id: 'tsuki', num: 9, name: 'Champs de Lune', kanji: '月', style: 'Lune', theme: 'tsuki',
    dojo: 'Dojo de la Lune', master: 'Maître Tsuki', x: -321, z: 383, y: 4.6, climate: ['brume', 'clair', 'nuageux', 'pluie'],
    lake: { x: 36, z: 24, r: 19, kind: 'etang' },
    boss: { hp: 340, speed: 4.6, block: 0.42, dodge: 0.36, moves: ['l1', 'l2', 'l3', 'heavy'], scale: 1.0, xp: 740, ryo: [130, 190] },
    shop: { name: 'Boutique de Tsuki', keeper: 'Yoru', items: [...SHOP_BASE, { id: 'elixir', price: 130 }, { id: 'armure', tier: 3, price: 780 }, { id: 'dango', price: 30 }] },
    side: { title: 'Les miroirs de lune', kind: 'collect', count: 3, text: 'Trois miroirs de lune sont tombés dans les champs. Sans eux, le dojo ne se reflète plus.' },
    chapter: { title: 'Chapitre 9 — La lune et le miroir',
      intro: 'Les champs de Tsuki sont blancs même sans neige. La lune y descend tous les soirs.',
      master: ['Un combattant sans reflet est un combattant qui oublie son nom.', 'Trois miroirs de lune manquent au dojo. Retrouve-les dans les champs.', 'Puis viens te battre. Je veux voir ce que la lune retient de toi.'],
      trial: ['Les miroirs sont revenus. La lumière aussi.', 'Il ne reste qu\'un dojo, Sora. Celui du Vide. Celui que personne ne doit ouvrir.'],
      bossName: 'Tsuki', seal: 'Lune' },
    lore: 'Tsuki affirme que le KAGE TRIAL n\'a jamais été un tournoi, mais une porte qu\'on apprend à garder.',
  },
  {
    id: 'mugen', num: 10, name: 'Dojo du Vide', kanji: '無', style: 'Vide', theme: 'mugen',
    dojo: 'Dojo du Vide', master: 'Kage', x: -492, z: 87, y: 15.0, climate: ['brume', 'nuageux', 'orage', 'clair'],
    boss: { hp: 620, speed: 5.0, block: 0.5, dodge: 0.4, moves: ['l1', 'l2', 'l3', 'heavy', 'special'], scale: 1.18, xp: 1600, ryo: [400, 600] },
    shop: null,
    side: null,
    chapter: { title: 'Chapitre 10 — Le dojo du Vide',
      intro: 'Il n\'y a pas de route jusqu\'ici. C\'est pour cela que tout le monde y arrive.',
      master: ['Tu as réuni dix sceaux. Tu as donc compris : ce n\'était pas un tournoi.', 'Je suis Kage. Je suis le premier élève, et le dojo que l\'on a oublié.', 'Le Null n\'est pas un monstre, Sora. C\'est un souvenir qui refuse de mourir. Viens. Nous allons voir lequel de nous deux s\'en souvient.'],
      trial: ['Tu m\'as battu avec mes propres coups. C\'est la seule manière.', 'Alors garde ce dojo. Garde les dix. Et souviens-toi de moi : c\'est tout ce que je demande.'],
      bossName: 'Kage', seal: 'Vide' },
    lore: 'Le KAGE TRIAL n\'était pas une épreuve. C\'était un souvenir que l\'on se transmettait.',
  },
];

export const REGIONS = RAW.map((r) => {
  const rot = Math.atan2(-r.x, -r.z);
  const R = { ...r, rot, r: 150, built: false };
  R.place = (lx, lz) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    return { x: r.x + lx * c + lz * s, z: r.z - lx * s + lz * c };
  };
  R.dojoPos = R.place(0, -26);
  R.gatePos = R.place(0, 52);
  R.shopPos = R.place(-20, 26);
  R.masterPos = R.place(0, -36);
  R.duelPos = R.place(0, 0);
  R.enemyPos = R.place(0, 74);
  R.disciplePos = [R.place(-7, -19), R.place(7, -19)];
  R.questPos = R.place(17, 19);
  R.relicPos = [R.place(-62, 22), R.place(58, -18), R.place(2, -70)];
  R.secretPos = R.place(46, 41);
  R.students = [
    { name: 'Élève', look: { outfit: 'cendre', hair: 'chignon', band: true, sword: true } },
    { name: 'Élève', look: { outfit: 'foret', hair: 'court', band: true, sword: true } },
  ];
  R.masterLook = LOOK[r.id] || LOOK.kuro;
  R.bossLook = { ...R.masterLook, scale: R.boss.scale };
  return R;
});

export const SAKURA = {
  id: 'sakura', num: 1, name: 'Sakura Valley', kanji: '桜', style: 'Vent', theme: 'sakura',
  dojo: 'Dojo Sakura no Kage', master: 'Maître Hana', x: 0, z: 0, rot: 0, r: 238, built: true, y: 3.2,
  x0: 0, z0: 0, dojoPos: { x: 0, z: -96 }, gatePos: { x: 0, z: 114 }, shopPos: { x: 14.5, z: -14 },
  masterPos: { x: 0, z: -108.4 }, duelPos: { x: 0, z: -96 }, enemyPos: { x: 0, z: 60 },
  climate: ['clair', 'nuageux', 'pluie', 'brume'], shop: { name: 'Salon de thé Tsubaki', keeper: 'Zen', items: [...SHOP_BASE] },
  questPos: { x: 2, z: 6 }, disciplePos: [{ x: 3.5, z: -92 }, { x: 6.5, z: -92 }],
  place: (lx, lz) => ({ x: lx, z: lz }),
};
REGIONS.unshift(SAKURA);

export function regionOf(id) { return REGIONS.find((r) => r.id === id) || SAKURA; }
export function nearestRegion(x, z, max = 220) {
  let best = null, bd = max;
  for (const r of REGIONS) { const d = Math.hypot(x - r.x, z - r.z); if (d < bd) { bd = d; best = r; } }
  return best;
}
export function inRegion(r, x, z, pad = 0) { return Math.hypot(x - r.x, z - r.z) < r.r + pad; }
export function sealsCount(seals) { return Object.keys(seals || {}).length; }

/* ---------- combattants jouables ---------- */
export const CHARS = {
  sora: { name: 'Sora', title: "L'enfant de la vallée", look: { outfit: 'encre', hair: 'chignon', band: true, scarf: true }, speed: 1.0, hp: 1.0, dmg: 1.0, en: 1.0, blurb: 'Équilibré. Trois coups rapides, une garde sûre.', unlock: null },
  akira: { name: 'Akira', title: 'Le poing du dojo', look: { outfit: 'indigo', hair: 'queue', band: true, chains: true, scarf: false }, speed: 0.94, hp: 1.25, dmg: 1.16, en: 0.9, blurb: 'Lent mais puissant. Encaisse et punit.', unlock: 'seal:sakura' },
  rei: { name: 'Rei', title: 'Celle qui se souvient', look: { outfit: 'kage', hair: 'capuche', mask: true, scarf: true, chains: true }, speed: 1.13, hp: 0.88, dmg: 1.02, en: 1.2, blurb: 'Rapide et insaisissable. Peu de vie, beaucoup d\'énergie.', unlock: 'seals:3' },
  hana: { name: 'Hana', title: 'La maîtresse du vent', look: { outfit: 'hana', hair: 'queue', scarf: false }, speed: 1.04, hp: 1.0, dmg: 1.1, en: 1.25, blurb: 'La technique avant la force. Techniques moins chères.', unlock: 'seals:6' },
};

/* ---------- équipement ---------- */
export const GEAR = {
  lame: {
    name: 'Lame', label: 'Katana',
    tiers: [
      { name: 'Katana du nord', text: 'La lame de ton père. Simple et droite.', dmg: 1.0, price: 0 },
      { name: 'Lame de fer', text: '+8 % de dégâts.', dmg: 1.08, price: 180 },
      { name: "Lame d'acier", text: '+16 % de dégâts.', dmg: 1.16, price: 460 },
      { name: 'Katana du Vide', text: '+28 % de dégâts. Forgé à Mugen.', dmg: 1.28, price: 940 },
    ],
  },
  armure: {
    name: 'Armure', label: 'Armure',
    tiers: [
      { name: 'Kimono de voyage', text: 'Aucune protection particulière.', hp: 0, price: 0 },
      { name: 'Armure de cuir', text: '+20 points de vie.', hp: 20, price: 170 },
      { name: 'Armure de fer', text: '+45 points de vie.', hp: 45, price: 360 },
      { name: 'Haori du Vide', text: '+80 points de vie.', hp: 80, price: 780 },
    ],
  },
  bottes: {
    name: 'Bottes', label: 'Bottes',
    tiers: [
      { name: 'Sandales de paille', text: 'Légères, sans plus.', speed: 1.0, price: 0 },
      { name: 'Bottes de jade', text: '+10 % de vitesse.', speed: 1.1, price: 160 },
      { name: 'Sandales du vent', text: '+18 % de vitesse.', speed: 1.18, price: 400 },
    ],
  },
};

/* ---------- commandes secrètes ---------- */
export const SECRETS = [
  { keys: 'kage', title: 'Le nom de l\'ombre', text: 'Ultime débloquée, 5 points de compétence et 999 ryo.' },
  { keys: 'kami', title: 'Bénédiction des kamis', text: 'Invulnérabilité pendant 45 secondes.' },
  { keys: 'kaze', title: 'Pas du vent', text: 'Vitesse doublée pendant 60 secondes.' },
  { keys: 'sakura', title: 'Pétales de vie', text: 'Vie et énergie restaurées, météo apaisée.' },
  { keys: 'yuki', title: 'Neige silencieuse', text: 'La neige tombe sur la vallée.' },
  { keys: 'rai', title: 'Colère du ciel', text: 'L\'orage éclate.' },
  { keys: 'tsuki', title: 'Nuit de lune', text: 'La nuit tombe d\'un coup.' },
  { keys: 'oni', title: 'L\'invité', text: 'Un oni apparaît. Bon courage.' },
  { keys: 'tenshi', title: 'Ailes de l\'ange', text: 'Renaissance immédiate au dernier repos.' },
  { keys: 'sensei', title: 'Leçon du maître', text: 'Toutes les compétences sont apprises.' },
];

export const MUSIC_BY_REGION = {
  sakura: 'dojo', kage: 'sanctuaire', yama: 'crepuscule', akai: 'duel',
  mizu: 'dojo', hisui: 'sanctuaire', yuki: 'nuit', raiden: 'combat', tsuki: 'crepuscule', mugen: 'duel',
};
