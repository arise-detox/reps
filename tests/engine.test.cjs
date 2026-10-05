const assert = require('node:assert/strict');
const E = require('../engine.js');

// ---- reconnaissance du texte
assert.equal(E.detect('15 Tractions'), 'pullup');
assert.equal(E.detect('Thrusters avec un disque'), 'squat');
assert.equal(E.detect('wall balls'), 'squat');
assert.equal(E.detect('20 pompes diamant'), 'pushup');
assert.equal(E.detect('Burpees'), 'burpee');
assert.equal(E.detect('toes to bar'), 'hangRaise');
assert.equal(E.detect('Développé couché'), 'bench');
assert.equal(E.detect('Développé militaire'), 'press');
assert.equal(E.detect('kettlebell swings'), 'hinge');
assert.equal(E.detect('rowing buste penché'), 'row');
assert.equal(E.detect('méditation'), null);
assert.equal(E.targetFrom('15 Tractions'), 15);
assert.equal(E.targetFrom('15 min de vélo'), 0);
assert.equal(E.targetFrom('Tractions'), 0);
assert.ok(Object.keys(E.EX).every(k => E.EX[k].icon && E.EX[k].short && E.EX[k].group && E.EX[k].req));

// ---- machine à états (valeurs d'angle simulées à 10 images/s)
function run(key, values, level) {
  const m = new E.Machine(E.EX[key], level || 'normal'); let reps = 0;
  values.forEach((v, i) => { const r = m.push(v, i * 100); if (r.rep) reps++; });
  return { reps, m };
}
const ramp = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * (i + 1) / n);
const cycle = (hi, lo, n) => [...ramp(hi, lo, n), ...ramp(lo, hi, n)];
// squat : départ debout (haut), descente, remontée = 1 répétition
let seq = [...new Array(4).fill(165), ...cycle(165, 90, 7), ...cycle(165, 90, 7)];
assert.equal(run('squat', seq).reps, 2);
// amplitude insuffisante : pas de répétition, une partielle signalée
let r = run('squat', [...new Array(4).fill(165), ...cycle(165, 125, 7)]);
assert.equal(r.reps, 0); assert.ok(r.m.partials >= 1);
// mode « souple » : la même amplitude compte
assert.equal(run('squat', [...new Array(4).fill(165), ...cycle(165, 106, 7)], 'souple').reps, 1);
assert.equal(run('squat', [...new Array(4).fill(165), ...cycle(165, 106, 7)], 'normal').reps, 0);
assert.equal(run('squat', [...new Array(4).fill(165), ...cycle(165, 106, 7)], 'strict').reps, 0);
// développé (compte en haut) : départ bas, montée = 1, retour bas puis remontée = 2
seq = [...new Array(4).fill(80), ...ramp(80, 165, 8), ...ramp(165, 80, 8), ...ramp(80, 165, 8)];
assert.equal(run('press', seq).reps, 2);
// vitesse impossible : deux cycles en moins de minRepMs ne comptent qu'une fois
const fast = [...new Array(3).fill(165), ...cycle(165, 90, 1), ...cycle(165, 90, 1)];
assert.ok(run('squat', fast).reps <= 1);
// corps perdu plus de 1,5 s : on repart de zéro, y compris la valeur lissée
const m = new E.Machine(E.EX.pullup, 'normal');
for (let i = 0; i < 6; i++) m.push(160, i * 100);
for (let i = 0; i < 20; i++) m.push(null, 600 + i * 100);
assert.equal(m.state, 'wait'); assert.equal(m.s, null);
assert.equal(m.push(150, 3000).value, 150);

// ---- reconnaissance de l'exercice (WOD en ordre libre) : trajectoires de caractéristiques simulées à 15 images/s
const base = { trunk: 5, knee: 170, hip: 170, elbow: 160, wrNose: -1.3, wrSh: -1.0, shYa: 0.30, hpYa: 0.55, wrYa: 0.62, ankHip: 1.6 };
const osc = (a, b, t, period) => a + (b - a) * (0.5 - 0.5 * Math.cos(2 * Math.PI * t / period));
function traj(seconds, fn) { const h = []; for (let t = 0; t <= seconds * 1000; t += 66) h.push({ t, f: Object.assign({}, base, fn(t / 1000)) }); return h; }
const T = {
  squat: traj(5, s => ({ knee: osc(170, 60, s, 2.4), hip: osc(165, 60, s, 2.4), trunk: osc(5, 30, s, 2.4), hpYa: osc(0.40, 0.72, s, 2.4), shYa: osc(0.22, 0.62, s, 2.4), wrYa: osc(0.55, 0.45, s, 2.4), elbow: 90 })),
  pushup: traj(5, s => ({ trunk: 86, elbow: osc(160, 70, s, 2), wrSh: -0.35, knee: 172, hip: 172, hpYa: 0.60, shYa: osc(0.55, 0.62, s, 2), ankHip: 0.3 })),
  pullup: traj(5, s => ({ wrSh: 0.6, wrNose: 0.3, wrYa: 0.12, shYa: osc(0.22, 0.46, s, 2.6), hpYa: osc(0.45, 0.68, s, 2.6), elbow: osc(160, 100, s, 2.6), trunk: 8 })),
  press: traj(5, s => ({ wrNose: osc(-0.2, 0.55, s, 2.2), wrSh: osc(0.0, 0.8, s, 2.2), wrYa: osc(0.55, 0.25, s, 2.2), elbow: osc(80, 155, s, 2.2), trunk: 4, knee: 165, hip: 168, ankHip: 1.1 })),
  hinge: traj(5, s => ({ hip: osc(165, 70, s, 2.4), trunk: osc(4, 75, s, 2.4), knee: osc(172, 150, s, 2.4), shYa: osc(0.26, 0.58, s, 2.4), hpYa: 0.56, elbow: 158, wrSh: -1.2 })),
  situp: traj(5, s => ({ trunk: osc(20, 87, s, 2.4), hip: osc(150, 55, s, 2.4), knee: 100, shYa: osc(0.45, 0.62, s, 2.4), hpYa: 0.64 + 0.01 * Math.sin(s), elbow: osc(45, 90, s, 2.4), wrSh: 0.3, ankHip: osc(-0.2, 0.4, s, 2.4) })),
  row: traj(5, s => ({ trunk: 24, elbow: osc(155, 110, s, 2), wrSh: osc(-1.4, -0.7, s, 2), wrYa: osc(0.8, 0.62, s, 2), shYa: 0.40, hip: 125, knee: 145 }))
};
// burpee : debout (0-1,5 s), descente au sol (1,5-3 s), planche (3-4,5 s), retour debout (4,5-6 s), debout (6-7 s)
T.burpee = traj(7, s => {
  const down = Math.min(1, Math.max(0, (s - 1.5) / 1.5)), up = Math.min(1, Math.max(0, (s - 4.5) / 1.5)), p = down * (1 - up);
  return { trunk: 89 * p, ankHip: 1.7 - 1.45 * p, hpYa: 0.35 + 0.35 * p, shYa: 0.3 + 0.4 * p, hip: 170 - 130 * p, knee: 170 - 100 * p, elbow: 160 };
});
const all = Object.keys(E.EX);
for (const k of Object.keys(T)) {
  const t = k === 'burpee' ? 6500 : 4900, sc = E.recognize(T[k], t, all), best = Object.keys(sc).sort((a, b) => sc[b] - sc[a])[0];
  assert.equal(best, k, `${k} reconnu comme ${best} : ${JSON.stringify(sc)}`);
  assert.ok(sc[k] > 0.6, `${k} : note trop faible ${sc[k]}`);
}
// les sit-ups ne sont pas pris pour un burpee, ni l'inverse
assert.ok(E.recognize(T.situp, 4900, ['burpee', 'situp']).burpee < 0.2);
assert.ok(E.recognize(T.burpee, 6500, ['burpee', 'situp']).situp < 0.2);
// peu de données : aucune note
assert.equal(E.recognize(T.squat.slice(0, 3), 200, ['squat']).squat, 0);

// ---- compteur multi-exercices : un geste ne doit être compté que pour l'exercice reconnu
const multi = E.createMulti(['squat', 'pushup'], {});
assert.deepEqual(multi.keys, ['squat', 'pushup']);
assert.equal(multi.adjust('squat', 3), 3); assert.equal(multi.adjust('squat', -9), 0);
multi.reset(); assert.equal(multi.tallies.squat, 0);
assert.throws(() => E.createMulti([], {}));
assert.deepEqual(E.createMulti(['squat', 'squat', 'inconnu'], {}).keys, ['squat']);

console.log('Moteur : toutes les assertions ont réussi.');
