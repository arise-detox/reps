/* REPS - logique pure des WOD : modèle, lecture de texte, présélections, progression, scores.
   Aucune dépendance au navigateur : testable seul. Les exercices viennent de RepEngine (engine.js). */
(function (root, factory) {
  'use strict';
  var api = factory(function () { return typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.RepEngine; });
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RepWod = api;
})(typeof window !== 'undefined' ? window : this, function (engine) {
  'use strict';

  var FORMATS = { time: 'Pour le temps', amrap: 'AMRAP (max de tours)', interval: 'Intervalles (EMOM, Tabata)' };
  var LIMITS = { reps: 999, rounds: 99, cap: 10800, work: 3600, moves: 12 };

  function num(v, def, min, max) { var n = Math.floor(Number(v)); return isFinite(n) && v !== '' && v !== null && v !== undefined ? Math.min(max, Math.max(min, n)) : def; }
  function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); }
  function fmtDur(sec) { sec = Math.round(sec); if (sec < 60) return sec + ' s'; var m = Math.floor(sec / 60), r = sec % 60; return r ? m + ' min ' + String(r).padStart(2, '0') : m + ' min'; }
  function label(m) { var E = engine(); return m.n || (E.EX[m.k] ? E.EX[m.k].short : m.k); }

  /* Nettoie et borne un WOD (venant du formulaire, d'un texte, d'une sauvegarde importée…). */
  function normalize(w) {
    var E = engine(), o = { v: 1 };
    w = w && typeof w === 'object' ? w : {};
    o.name = String(w.name || '').trim().slice(0, 60);
    o.format = FORMATS[w.format] ? w.format : 'time';
    o.order = w.order === 'free' ? 'free' : 'ordered';
    o.moves = (Array.isArray(w.moves) ? w.moves : []).filter(function (m) { return m && E.EX[m.k]; }).slice(0, LIMITS.moves).map(function (m) {
      var r = { k: m.k, reps: num(m.reps, 0, 0, LIMITS.reps) };
      if (typeof m.n === 'string' && m.n.trim()) r.n = m.n.trim().slice(0, 30);
      return r;
    });
    o.scheme = Array.isArray(w.scheme) && w.scheme.length ? w.scheme.slice(0, 20).map(function (x) { return num(x, 0, 1, LIMITS.reps); }).filter(Boolean) : null;
    if (o.scheme && !o.scheme.length) o.scheme = null;
    o.cap = num(w.cap, 0, 0, LIMITS.cap);
    o.restRound = num(w.restRound, 0, 0, 1800);
    o.work = num(w.work, 60, 5, LIMITS.work);
    o.rest = num(w.rest, 0, 0, LIMITS.work);
    o.each = w.each === 'all' ? 'all' : 'one';
    if (o.format === 'time') o.rounds = o.scheme ? o.scheme.length : num(w.rounds, 1, 1, LIMITS.rounds);
    else if (o.format === 'interval') { o.scheme = null; o.rounds = num(w.rounds, 8, 1, 200); }
    else { o.scheme = null; o.rounds = 0; if (!o.cap) o.cap = 600; }
    return o;
  }
  function validate(w) {
    var errs = [];
    if (!w.moves.length) errs.push('Ajoute au moins un exercice.');
    if (w.format === 'time' && w.scheme) { if (w.moves.some(function (m) { return !m.reps; })) { /* reps = schéma : accepté */ } }
    else if (w.format !== 'interval' && w.moves.some(function (m) { return !m.reps; })) errs.push('Indique un nombre de répétitions pour chaque exercice.');
    if (w.format === 'amrap' && !w.cap) errs.push('Indique la durée de l’AMRAP.');
    return errs;
  }

  /* Objectif de répétitions d'un exercice à un tour donné (le schéma 21-15-9 s'applique aux exercices sans nombre propre). */
  function targetFor(w, round, m) { return m.reps || (w.scheme ? w.scheme[round] || 0 : 0); }

  /* Étape numéro i en mode « ordre imposé ». Renvoie null quand le WOD est fini (jamais pour un AMRAP). */
  function stepAt(w, i) {
    var n = w.moves.length; if (!n) return null;
    if (w.format === 'interval') {
      if (i >= w.rounds) return null;
      if (w.each === 'all') return { index: i, round: i, rounds: w.rounds, all: true, moves: w.moves.map(function (m) { return { k: m.k, n: m.n, target: m.reps }; }), work: w.work, rest: w.rest };
      var m = w.moves[i % n];
      return { index: i, round: i, rounds: w.rounds, k: m.k, n: m.n, target: m.reps, work: w.work, rest: w.rest, mi: i % n };
    }
    var r = Math.floor(i / n), mi = i % n;
    if (w.format === 'time' && r >= w.rounds) return null;
    var mm = w.moves[mi];
    return { index: i, round: r, rounds: w.format === 'time' ? w.rounds : 0, k: mm.k, n: mm.n, target: targetFor(w, r, mm), mi: mi, last: w.format === 'time' && r === w.rounds - 1 && mi === n - 1, firstOfRound: mi === 0 };
  }
  function totalSteps(w) { return w.format === 'time' ? w.rounds * w.moves.length : w.format === 'interval' ? w.rounds : Infinity; }

  /* Répétitions à faire au total par exercice (pour un WOD fini). */
  function requiredTotals(w) {
    var t = {};
    if (w.format === 'time') for (var r = 0; r < w.rounds; r++) w.moves.forEach(function (m) { t[m.k] = (t[m.k] || 0) + targetFor(w, r, m); });
    else if (w.format === 'interval') for (var i = 0; i < w.rounds; i++) { var s = stepAt(w, i); (s.all ? s.moves : [s]).forEach(function (m) { t[m.k] = (t[m.k] || 0) + (m.target || 0); }); }
    return t;
  }
  /* Progression en mode « ordre libre » à partir des compteurs par exercice. */
  function freeProgress(w, tallies) {
    var keys = [], perRound = {}, i;
    w.moves.forEach(function (m) { if (keys.indexOf(m.k) < 0) keys.push(m.k); });
    var roundsDone = Infinity, extra = 0, done = false;
    if (w.format === 'time') {
      var req = requiredTotals(w); done = keys.every(function (k) { return (tallies[k] || 0) >= req[k]; });
      keys.forEach(function (k) {
        var cum = 0, rd = 0;
        for (i = 0; i < w.rounds; i++) { w.moves.forEach(function (m) { if (m.k === k) cum += targetFor(w, i, m); }); if ((tallies[k] || 0) >= cum) rd++; else break; }
        roundsDone = Math.min(roundsDone, rd);
      });
      if (roundsDone === Infinity) roundsDone = 0;
      return { roundsDone: roundsDone, done: done, required: req, extra: 0 };
    }
    // AMRAP (et intervalles à exercices multiples) : tours complets = min des quotients, reste = répétitions du tour en cours
    w.moves.forEach(function (m) { perRound[m.k] = (perRound[m.k] || 0) + m.reps; });
    var usable = keys.filter(function (k) { return perRound[k] > 0; });
    roundsDone = usable.length ? Math.min.apply(null, usable.map(function (k) { return Math.floor((tallies[k] || 0) / perRound[k]); })) : 0;
    usable.forEach(function (k) { extra += Math.min(perRound[k], Math.max(0, (tallies[k] || 0) - roundsDone * perRound[k])); });
    return { roundsDone: roundsDone, extra: extra, done: false, perRound: perRound };
  }

  /* ---------- lecture d'un WOD écrit en français ou en anglais ---------- */
  function strip(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘´`]/g, "'"); }
  var HEADER_WORDS = /amrap|emom|tabata|for time|pour le temps|chrono|time ?cap|\bcap\b|rounds?|tours?|toutes les|every|\bon\b|\boff\b|repos|rest/;
  var STRIP_HEAD = /(?:amrap|emom)\s*(?:de|en)?\s*\d*\s*(?:min(?:utes?)?|mn|')?|tabata|\d+\s*(?:rounds?|tours?|s[eé]ries?|intervalles?)\b|for time|pour le temps|(?:time ?cap|cap|plafond)\s*(?:de|:|=)?\s*\d+\s*(?:min|mn)|(?:toutes les|every)\s*\d*\s*(?:min(?:utes?)?|mn)(?:\s*(?:pendant|for)\s*\d+\s*(?:min(?:utes?)?|mn))?|\d+\s*(?:min(?:utes?)?|mn)\b|repos[^,;\n]*/gi;
  var SCHEME_RX_G = /(?:^|[^\d])\d{1,3}(?:\s*[-–]\s*\d{1,3}){1,9}(?!\d)/g;
  function parse(text) {
    var E = engine(), raw = String(text || '').trim(), s = strip(raw), warn = [], w = { moves: [], format: 'time' };
    if (!s) return { wod: normalize(w), warn: ['Le texte est vide.'] };
    var m;
    // nom : « Cindy : AMRAP 20 min … » (le mot avant le premier « : » n'est ni un exercice ni un mot-clé)
    var head = raw.match(/^\s*([A-Za-zÀ-ÿ'’ \-]{2,28})\s*[:：]\s*\S/);
    if (head && !E.detect(head[1]) && !HEADER_WORDS.test(strip(head[1]))) w.name = head[1].trim();
    var body = w.name ? s.slice(s.indexOf(':') + 1) : s;
    var bodyRaw = w.name ? raw.slice(raw.indexOf(':') + 1) : raw;
    // format
    if ((m = body.match(/amrap\s*(?:de|en|:|-)?\s*(\d+)\s*(?:min|mn|')?/)) || (m = body.match(/(?:max(?:imum)?\s*de\s*(?:tours|rounds)|as many (?:rounds|reps) as possible)[^0-9]{0,24}(\d+)\s*(?:min|mn)/))) { w.format = 'amrap'; w.cap = +m[1] * 60; }
    else if (/tabata/.test(body)) { w.format = 'interval'; w.work = 20; w.rest = 10; w.rounds = 8; }
    else if ((m = body.match(/emom\s*(?:de|:|-)?\s*(\d+)?/))) { w.format = 'interval'; w.work = 60; w.rest = 0; w.rounds = m[1] ? +m[1] : 10; }
    else if ((m = body.match(/(?:toutes les|every)\s*(\d+)?\s*(min|minutes?|mn)[^0-9]{0,24}(?:pendant|for|x)?\s*(\d+)\s*(?:min|mn|fois|rounds?|tours?)?/))) { w.format = 'interval'; w.work = (m[1] ? +m[1] : 1) * 60; w.rest = 0; var tot = +m[3]; w.rounds = tot ? Math.max(1, Math.round(tot * 60 / w.work)) : 10; }
    else if ((m = body.match(/(\d+)\s*(?:s|sec|secondes?)\s*(?:on|travail|work|effort)\D{0,6}(\d+)\s*(?:s|sec|secondes?)\s*(?:off|repos|rest|pause)/))) { w.format = 'interval'; w.work = +m[1]; w.rest = +m[2]; w.rounds = 8; }
    if (w.format === 'interval') {
      var r2 = body.match(/(\d+)\s*(?:rounds?|tours?|series?|intervalles?)/); if (r2) w.rounds = +r2[1];
      if (/\ball\b|tous|chaque minute.{0,20}(?:\d+.*\d+)/.test(body) && /chaque|each|every/.test(body) && /\+|,|;|\n/.test(bodyRaw)) w.each = 'all';
    }
    // plafond de temps et repos entre tours
    if ((m = body.match(/(?:time ?cap|cap|plafond)\s*(?:de|:|=)?\s*(\d+)\s*(?:min|mn)/))) { if (w.format !== 'amrap') w.cap = +m[1] * 60; }
    if ((m = body.match(/repos\s*(?:entre (?:les )?(?:tours|rounds))?\s*(?:de|:)?\s*(\d+)\s*(min|mn|s|sec)\b/)) && w.format === 'time') w.restRound = m[2][0] === 'm' ? +m[1] * 60 : +m[1];
    // tours et schéma
    var sch = body.match(/(?:^|[^\d])(\d{1,3}(?:\s*[-–]\s*\d{1,3}){1,9})(?!\d)/);
    if (sch && w.format === 'time') {
      var nums = sch[1].split(/[-–]/).map(function (x) { return +x.trim(); });
      // « 3-2-1 » est un schéma ; « 12-15 reps » (fourchette) n'en est pas : on exige ≥ 2 nombres décroissants/croissants simples
      w.scheme = nums;
    }
    if (w.format === 'time' && !w.scheme && (m = body.match(/(\d+)\s*(?:rounds?|tours?|series?)\b/))) w.rounds = +m[1];
    // exercices : on retire d'abord les mots d'en-tête (AMRAP, tours, durées…) de chaque morceau
    var pieces = bodyRaw.split(/\n|;|\+|,(?!\d)|\bpuis\b|\bet\b(?=\s*\d)|\bthen\b/i).map(function (x) { return x.trim(); }).filter(Boolean);
    pieces.forEach(function (p) {
      var hs = p.replace(STRIP_HEAD, ' ').replace(SCHEME_RX_G, ' ').replace(/^[\s:]+/, ''), ps = strip(hs), key = E.detect(ps);
      if (!key) { if (/[a-z]{3,}/.test(ps.replace(/\b(x|reps?|de|d)\b/g, ''))) warn.push('Exercice non reconnu : « ' + p + ' »'); return; }
      var reps = 0, mm = ps.match(/(?:^|\s)(\d{1,3})\s*(?:x|×|reps?|repetitions?)?\s*[a-z]/) || ps.match(/[a-z]\s*(?:x|×)\s*(\d{1,3})\b/) || ps.match(/[a-z]\s+(\d{1,3})\s*$/);
      if (mm) reps = +mm[1];
      // nom affiché : le texte de l'exercice sans nombres (« thrusters », « pull-ups »…) quand il diffère du nom standard
      var nm = hs.replace(/\d+/g, ' ').replace(/[x×:()]/gi, ' ').replace(/\b(reps?|repetitions?|de|d')\b/gi, ' ').replace(/\s+/g, ' ').trim();
      var mv = { k: key, reps: reps };
      if (nm && strip(nm) !== strip(E.EX[key].label) && strip(nm) !== strip(E.EX[key].short) && nm.length <= 30) mv.n = nm.charAt(0).toUpperCase() + nm.slice(1);
      w.moves.push(mv);
    });
    if (!w.moves.length) warn.push('Aucun exercice reconnu.');
    return { wod: normalize(w), warn: warn };
  }

  /* ---------- présélections ---------- */
  var PRESETS = [
    { id: 'cindy', name: 'Cindy', info: '20 min · 5 tractions, 10 pompes, 15 squats', wod: { format: 'amrap', cap: 1200, moves: [{ k: 'pullup', reps: 5 }, { k: 'pushup', reps: 10 }, { k: 'squat', reps: 15 }] } },
    { id: 'angie', name: 'Angie', info: '100 tractions, 100 pompes, 100 sit-ups, 100 squats', wod: { format: 'time', rounds: 1, moves: [{ k: 'pullup', reps: 100 }, { k: 'pushup', reps: 100 }, { k: 'situp', reps: 100 }, { k: 'squat', reps: 100 }] } },
    { id: 'barbara', name: 'Barbara', info: '5 tours · 20 tractions, 30 pompes, 40 sit-ups, 50 squats · 3 min de repos', wod: { format: 'time', rounds: 5, restRound: 180, moves: [{ k: 'pullup', reps: 20 }, { k: 'pushup', reps: 30 }, { k: 'situp', reps: 40 }, { k: 'squat', reps: 50 }] } },
    { id: 'fran', name: 'Fran', info: '21-15-9 · thrusters et tractions', wod: { format: 'time', scheme: [21, 15, 9], moves: [{ k: 'squat', reps: 0, n: 'Thrusters' }, { k: 'pullup', reps: 0 }] } },
    { id: 'chelsea', name: 'Chelsea', info: 'EMOM 30 · chaque minute 5 tractions, 10 pompes, 15 squats', wod: { format: 'interval', work: 60, rest: 0, rounds: 30, each: 'all', moves: [{ k: 'pullup', reps: 5 }, { k: 'pushup', reps: 10 }, { k: 'squat', reps: 15 }] } },
    { id: 'murph', name: 'Murph (sans la course)', info: '100 tractions, 200 pompes, 300 squats', wod: { format: 'time', rounds: 1, moves: [{ k: 'pullup', reps: 100 }, { k: 'pushup', reps: 200 }, { k: 'squat', reps: 300 }] } },
    { id: 'tabata', name: 'Tabata squats', info: '8 × (20 s effort, 10 s repos)', wod: { format: 'interval', work: 20, rest: 10, rounds: 8, moves: [{ k: 'squat', reps: 0 }] } },
    { id: 'trio', name: 'Trio express', info: '3 tours · 10 burpees, 15 squats, 10 pompes', wod: { format: 'time', rounds: 3, moves: [{ k: 'burpee', reps: 10 }, { k: 'squat', reps: 15 }, { k: 'pushup', reps: 10 }] } }
  ];
  PRESETS.forEach(function (p) { p.wod.name = p.name; });

  /* ---------- descriptions et scores ---------- */
  function describe(w) {
    var mv = w.moves.map(function (m) { var t = m.reps || ''; return (t ? t + ' ' : '') + label(m).toLowerCase(); }).join(', ');
    if (w.format === 'amrap') return 'AMRAP ' + fmtDur(w.cap) + ' · ' + mv;
    if (w.format === 'interval') {
      var head = w.rest ? w.rounds + ' × (' + w.work + ' s effort, ' + w.rest + ' s repos)' : (w.work === 60 ? 'EMOM ' + w.rounds : 'Toutes les ' + fmtDur(w.work) + ' × ' + w.rounds);
      return head + ' · ' + mv + (w.each === 'all' ? ' (tous à chaque intervalle)' : '');
    }
    var head2 = w.scheme ? w.scheme.join('-') : w.rounds > 1 ? w.rounds + ' tours' : '1 tour';
    return head2 + ' · ' + mv + (w.cap ? ' · cap ' + fmtDur(w.cap) : '') + (w.restRound && w.rounds > 1 ? ' · repos ' + fmtDur(w.restRound) : '');
  }
  function scoreText(r) {
    if (r.format === 'amrap') return r.rounds + ' tour' + (r.rounds > 1 ? 's' : '') + (r.extra ? ' + ' + r.extra + ' rep' + (r.extra > 1 ? 's' : '') : '');
    if (r.format === 'interval') return (r.okIntervals || 0) + '/' + (r.intervals ? r.intervals.length : 0) + ' intervalles réussis';
    return r.finished ? fmtClock(r.sec) : 'non terminé (' + fmtClock(r.sec) + ')';
  }
  function totalOf(tallies) { var s = 0; for (var k in tallies) s += tallies[k]; return s; }

  return { FORMATS: FORMATS, PRESETS: PRESETS, normalize: normalize, validate: validate, parse: parse, stepAt: stepAt, totalSteps: totalSteps, targetFor: targetFor, requiredTotals: requiredTotals, freeProgress: freeProgress, describe: describe, scoreText: scoreText, totalOf: totalOf, fmtClock: fmtClock, fmtDur: fmtDur, label: label };
});
