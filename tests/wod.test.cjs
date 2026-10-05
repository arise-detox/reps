const assert = require('node:assert/strict');
const W = require('../wod.js');

// ---- lecture de texte
let r = W.parse('Cindy : AMRAP 20 min : 5 tractions, 10 pompes, 15 squats');
assert.equal(r.wod.name, 'Cindy'); assert.equal(r.wod.format, 'amrap'); assert.equal(r.wod.cap, 1200);
assert.deepEqual(r.wod.moves.map(m => [m.k, m.reps]), [['pullup', 5], ['pushup', 10], ['squat', 15]]);
assert.equal(r.warn.length, 0);

r = W.parse('21-15-9 thrusters, pull-ups');
assert.equal(r.wod.format, 'time'); assert.deepEqual(r.wod.scheme, [21, 15, 9]); assert.equal(r.wod.rounds, 3);
assert.deepEqual(r.wod.moves.map(m => [m.k, m.reps]), [['squat', 0], ['pullup', 0]]);
assert.equal(r.wod.moves[0].n, 'Thrusters');

r = W.parse('3 rounds : 10 squats, 10 pompes');
assert.equal(r.wod.format, 'time'); assert.equal(r.wod.rounds, 3);
assert.deepEqual(r.wod.moves.map(m => [m.k, m.reps]), [['squat', 10], ['pushup', 10]]);

r = W.parse('EMOM 10 : 8 burpees, 12 squats');
assert.equal(r.wod.format, 'interval'); assert.equal(r.wod.work, 60); assert.equal(r.wod.rounds, 10); assert.equal(r.wod.each, 'one');
assert.deepEqual(r.wod.moves.map(m => [m.k, m.reps]), [['burpee', 8], ['squat', 12]]);

r = W.parse('Tabata squats');
assert.equal(r.wod.format, 'interval'); assert.equal(r.wod.work, 20); assert.equal(r.wod.rest, 10); assert.equal(r.wod.rounds, 8);

r = W.parse('100 tractions, 100 pompes, 100 squats pour le temps');
assert.equal(r.wod.format, 'time'); assert.equal(r.wod.rounds, 1); assert.deepEqual(r.wod.moves.map(m => m.reps), [100, 100, 100]);

r = W.parse('AMRAP 12 min\n5 pull-ups\n10 push-ups');
assert.equal(r.wod.format, 'amrap'); assert.equal(r.wod.cap, 720); assert.deepEqual(r.wod.moves.map(m => [m.k, m.reps]), [['pullup', 5], ['pushup', 10]]);

r = W.parse('5 rounds : 20 pullups, 30 pushups, repos 3 min');
assert.equal(r.wod.rounds, 5); assert.equal(r.wod.restRound, 180); assert.equal(r.wod.moves.length, 2);

r = W.parse('blabla'); assert.equal(r.wod.moves.length, 0); assert.ok(r.warn.length > 0);
r = W.parse(''); assert.ok(r.warn.length > 0);
r = W.parse('10 squats, 5 saltos mortales'); assert.equal(r.wod.moves.length, 1); assert.equal(r.warn.length, 1);

// ---- normalisation
const n = W.normalize({ format: 'amrap', moves: [{ k: 'squat', reps: 5000 }, { k: 'inconnu', reps: 3 }], cap: 0 });
assert.equal(n.moves.length, 1); assert.equal(n.moves[0].reps, 999); assert.equal(n.cap, 600); assert.equal(n.rounds, 0);
assert.equal(W.normalize({ format: 'bizarre', moves: [] }).format, 'time');
assert.equal(W.validate(W.normalize({ moves: [] })).length, 1);
assert.equal(W.validate(W.normalize({ format: 'time', moves: [{ k: 'squat', reps: 0 }] })).length, 1);
assert.equal(W.validate(W.normalize({ format: 'time', scheme: [3, 2, 1], moves: [{ k: 'squat', reps: 0 }] })).length, 0);

// ---- étapes en ordre imposé
const fran = W.normalize(W.PRESETS.find(p => p.id === 'fran').wod);
assert.equal(W.totalSteps(fran), 6);
let s = W.stepAt(fran, 0); assert.equal(s.k, 'squat'); assert.equal(s.target, 21); assert.equal(s.round, 0);
s = W.stepAt(fran, 1); assert.equal(s.k, 'pullup'); assert.equal(s.target, 21);
s = W.stepAt(fran, 2); assert.equal(s.target, 15);
s = W.stepAt(fran, 5); assert.equal(s.target, 9); assert.equal(s.last, true);
assert.equal(W.stepAt(fran, 6), null);
const cindy = W.normalize(W.PRESETS.find(p => p.id === 'cindy').wod);
s = W.stepAt(cindy, 7); assert.equal(s.k, 'pushup'); assert.equal(s.round, 2); assert.equal(s.target, 10);
assert.ok(W.stepAt(cindy, 999) !== null); assert.equal(W.totalSteps(cindy), Infinity);
const chelsea = W.normalize(W.PRESETS.find(p => p.id === 'chelsea').wod);
s = W.stepAt(chelsea, 4); assert.equal(s.all, true); assert.equal(s.moves.length, 3); assert.equal(W.stepAt(chelsea, 30), null);
const emom = W.normalize({ format: 'interval', rounds: 4, work: 60, moves: [{ k: 'burpee', reps: 8 }, { k: 'squat', reps: 12 }] });
assert.equal(W.stepAt(emom, 2).k, 'burpee'); assert.equal(W.stepAt(emom, 3).k, 'squat'); assert.equal(W.stepAt(emom, 4), null);

// ---- totaux
assert.deepEqual(W.requiredTotals(fran), { squat: 45, pullup: 45 });
assert.deepEqual(W.requiredTotals(W.normalize(W.PRESETS.find(p => p.id === 'angie').wod)), { pullup: 100, pushup: 100, situp: 100, squat: 100 });

// ---- progression en ordre libre
let p = W.freeProgress(fran, { squat: 21, pullup: 21 }); assert.equal(p.roundsDone, 1); assert.equal(p.done, false);
p = W.freeProgress(fran, { squat: 45, pullup: 45 }); assert.equal(p.roundsDone, 3); assert.equal(p.done, true);
p = W.freeProgress(fran, { squat: 45, pullup: 36 }); assert.equal(p.roundsDone, 2); assert.equal(p.done, false);
p = W.freeProgress(cindy, { pullup: 12, pushup: 25, squat: 31 }); assert.equal(p.roundsDone, 2); assert.equal(p.extra, 2 + 5 + 1);
p = W.freeProgress(cindy, {}); assert.equal(p.roundsDone, 0); assert.equal(p.extra, 0);

// ---- textes
assert.equal(W.fmtClock(65), '1:05'); assert.equal(W.fmtClock(3725), '1:02:05'); assert.equal(W.fmtDur(90), '1 min 30'); assert.equal(W.fmtDur(45), '45 s');
assert.equal(W.scoreText({ format: 'amrap', rounds: 5, extra: 12 }), '5 tours + 12 reps');
assert.equal(W.scoreText({ format: 'amrap', rounds: 1, extra: 0 }), '1 tour');
assert.equal(W.scoreText({ format: 'time', finished: true, sec: 754 }), '12:34');
assert.equal(W.scoreText({ format: 'time', finished: false, sec: 600 }), 'non terminé (10:00)');
assert.equal(W.scoreText({ format: 'interval', okIntervals: 7, intervals: new Array(10) }), '7/10 intervalles réussis');
assert.ok(W.describe(cindy).startsWith('AMRAP 20 min'));
assert.ok(W.describe(fran).startsWith('21-15-9'));
assert.ok(W.PRESETS.every(pr => W.validate(W.normalize(pr.wod)).length === 0));
console.log('WOD : toutes les assertions ont réussi.');
