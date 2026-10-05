const assert = require('node:assert/strict');
const I = require('../i18n.js');
const E = require('../engine.js');
const W = require('../wod.js');

// ---- langue et paramètres
assert.equal(I.lang(), 'fr');
assert.equal(I.t('Choisis ton exercice'), 'Choisis ton exercice');
assert.equal(I.t('Série {a}/{b}', { a: 2, b: 5 }), 'Série 2/5');
I.setLang('az');
assert.equal(I.lang(), 'az');
assert.equal(I.t('Choisis ton exercice'), 'Hərəkətini seç');
assert.equal(I.t('Série {a}/{b}', { a: 2, b: 5 }), 'Set 2/5');
assert.equal(I.t('Un texte inconnu du dictionnaire'), 'Un texte inconnu du dictionnaire');
assert.ok(I.missing().includes('Un texte inconnu du dictionnaire'));
assert.equal(I.locale(), 'az-AZ');
assert.equal(I.lower('İSTİRAHƏT'), 'istirahət');
I.setLang('fr');
assert.equal(I.t('Choisis ton exercice'), 'Choisis ton exercice');
assert.equal(I.locale(), 'fr-FR');
assert.equal(I.setLang('xx'), undefined); assert.equal(I.lang(), 'fr');

// ---- le dictionnaire : mêmes paramètres des deux côtés, aucune traduction vide
const placeholders = s => (s.match(/\{(\w+)\}/g) || []).sort().join(',');
for (const [fr, az] of Object.entries(I.dict)) {
  assert.ok(az && az.trim(), `traduction vide pour « ${fr} »`);
  assert.equal(placeholders(az), placeholders(fr), `paramètres différents pour « ${fr} »`);
  assert.equal(/<strong>/.test(az), /<strong>/.test(fr), `balises différentes pour « ${fr} »`);
}
// chaque exercice a un nom, un groupe, un conseil et un libellé traduits
Object.values(E.EX).forEach(def => ['short', 'group', 'tip', 'label'].forEach(f => assert.ok(f === 'label' && !(def[f] in I.dict) ? def[f] === 'Squats' || def[f] === 'Fentes' || def[f] === 'Pompes' || def[f] === 'Tractions' || def[f] === 'Dips' || def[f] === 'Burpees' : def[f] in I.dict, `non traduit : ${def[f]}`)));
// formats et présélections
Object.values(W.FORMATS).forEach(f => assert.ok(f in I.dict, `format non traduit : ${f}`));
W.PRESETS.forEach(p => { assert.ok(p.name in I.dict, `préselection : ${p.name}`); assert.ok(p.info in I.dict, `info : ${p.info}`); });
['Corps non détecté', 'Place-toi en position de départ', 'Amplitude insuffisante : va plus bas'].forEach(h => assert.ok(h in I.dict));

// ---- reconnaissance de mots azéris (exercices et WOD écrits en azerbaïdjanais)
assert.equal(E.detect('Dartınma'), 'pullup');
assert.equal(E.detect('Turnikdə dartınma'), 'pullup');
assert.equal(E.detect('Şınav'), 'pushup');
assert.equal(E.detect('Çömelmə'), 'squat');
assert.equal(E.detect('Burpi'), 'burpee');
assert.equal(E.detect('Addımlama'), 'lunge');
assert.equal(E.detect('Qarın əzələsi'), 'situp');
assert.equal(E.detect('Çiyin pressi'), 'press');
assert.equal(E.detect('Ayaq pressi'), 'legpress');
assert.equal(E.detect('Skamyada press'), 'bench');
assert.equal(E.detect('Dartma'), 'row');
assert.equal(E.detect('Deadlift / svinq'), 'hinge');
// libellés produits par l'appli en azéri : ils doivent eux-mêmes être reconnus
I.setLang('az');
Object.keys(E.EX).forEach(k => assert.equal(E.detect(I.t(E.EX[k].short)), k, `« ${I.t(E.EX[k].short)} » (${k}) non reconnu`));
let r = W.parse('AMRAP 12 dəq: 5 dartınma, 10 şınav, 15 çömelmə');
assert.equal(r.wod.format, 'amrap'); assert.equal(r.wod.cap, 720);
assert.deepEqual(r.wod.moves.map(m => [m.k, m.reps]), [['pullup', 5], ['pushup', 10], ['squat', 15]]);
r = W.parse('3 raund: 10 çömelmə, 10 şınav, istirahət 2 dəq');
assert.equal(r.wod.rounds, 3); assert.equal(r.wod.restRound, 120);
assert.deepEqual(r.wod.moves.map(m => [m.k, m.reps]), [['squat', 10], ['pushup', 10]]);
// sorties de wod.js dans la langue choisie
assert.equal(W.fmtDur(90), '1 dəq 30'); assert.equal(W.fmtDur(45), '45 san');
assert.equal(W.scoreText({ format: 'amrap', rounds: 5, extra: 12 }), '5 raund + 12 təkrar');
assert.equal(W.scoreText({ format: 'time', finished: true, sec: 754 }), '12:34');
assert.equal(W.scoreText({ format: 'interval', okIntervals: 7, intervals: new Array(10) }), '7/10 interval uğurlu');
assert.ok(W.describe(W.normalize(W.PRESETS[0].wod)).startsWith('AMRAP 20 dəq'));
assert.equal(W.formatName('time'), 'Vaxt üçün');
I.setLang('fr');
console.log('Langues : toutes les assertions ont réussi.');
