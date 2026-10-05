/* REPS - interface : onglets Exercice / WOD / Carnet, séance caméra, résultats, historique, sauvegarde, langue (français / azerbaïdjanais). */
(function () {
  'use strict';
  var E = window.RepEngine, W = window.RepWod, S = window.RepSound, V = window.RepVision, SES = window.RepSession, I = window.RepI18n;
  var tr = I.t;
  var trn = function (n, one, many) { return tr(n > 1 ? many : one, { n: n }); };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var KEY = 'reps_v1';
  var EXKEYS = Object.keys(E.EX);
  var LEVELS = { souple: 1, normal: 1, strict: 1 };
  var fmtDate = function (t) { return new Date(t).toLocaleString(I.locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  var num = function (v, d, lo, hi) { var n = Math.floor(Number(v)); return isFinite(n) && v !== '' && v != null ? Math.min(hi, Math.max(lo, n)) : d; };
  var id = function () { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var presetName = function (p) { return tr(p.name); };

  /* ------------------------------------------------------------ état et stockage */
  function defaults() {
    return {
      tab: 'exo',
      settings: { voice: true, beep: true, vibrate: true, auto: false, level: 'normal', countdown: 5, diag: false, lang: 'fr' },
      exo: { key: 'squat', target: 10, sets: 1, rest: 60 },
      draft: { name: '', format: 'time', order: 'ordered', moves: [{ k: 'squat', reps: 10 }, { k: 'pushup', reps: 10 }], rounds: 3, scheme: '', capMin: 0, work: 60, rest: 0, restRound: 0, each: 'one', text: '', add: 'squat', warn: [] },
      wods: [], sessions: []
    };
  }
  function sanitize(raw) {
    var d = defaults(); if (!raw || typeof raw !== 'object') return d;
    var s = raw.settings || {};
    d.settings = { voice: s.voice !== false, beep: s.beep !== false, vibrate: s.vibrate !== false, auto: !!s.auto, level: LEVELS[s.level] ? s.level : 'normal', countdown: [0, 3, 5, 10].indexOf(s.countdown) >= 0 ? s.countdown : 5, diag: !!s.diag, lang: 'fr' }; /* l'option de langue est retirée : français seulement */
    var x = raw.exo || {}; d.exo = { key: E.EX[x.key] ? x.key : 'squat', target: num(x.target, 10, 0, 999), sets: num(x.sets, 1, 1, 30), rest: num(x.rest, 60, 0, 600) };
    var dr = raw.draft || {}; d.draft = Object.assign(d.draft, { name: String(dr.name || '').slice(0, 60), format: W.FORMATS[dr.format] ? dr.format : 'time', order: dr.order === 'free' ? 'free' : 'ordered', rounds: num(dr.rounds, 3, 1, 99), scheme: String(dr.scheme || '').slice(0, 60), capMin: num(dr.capMin, 0, 0, 180), work: num(dr.work, 60, 5, 3600), rest: num(dr.rest, 0, 0, 3600), restRound: num(dr.restRound, 0, 0, 1800), each: dr.each === 'all' ? 'all' : 'one', text: String(dr.text || '').slice(0, 2000), add: E.EX[dr.add] ? dr.add : 'squat', warn: [] });
    d.draft.moves = (Array.isArray(dr.moves) ? dr.moves : d.draft.moves).filter(function (m) { return m && E.EX[m.k]; }).slice(0, 12).map(function (m) { var o = { k: m.k, reps: num(m.reps, 0, 0, 999) }; if (typeof m.n === 'string' && m.n.trim()) o.n = m.n.trim().slice(0, 30); return o; });
    d.wods = (Array.isArray(raw.wods) ? raw.wods : []).slice(0, 30).map(function (w) { var n = W.normalize(w && w.wod); return { id: String(w && w.id || id()).slice(0, 24), wod: n }; }).filter(function (w) { return w.wod.moves.length; });
    d.sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).filter(function (s) { return s && (s.type === 'single' || s.type === 'wod') && isFinite(s.t); }).slice(0, 300).map(cleanSession);
    d.tab = ['exo', 'wod', 'book'].indexOf(raw.tab) >= 0 ? raw.tab : 'exo';
    return d;
  }
  function cleanSession(s) {
    if (s.type === 'single') return { type: 'single', t: +s.t, k: E.EX[s.k] ? s.k : 'squat', level: s.level || 'normal', total: num(s.total, 0, 0, 99999), sec: num(s.sec, 0, 0, 86400), target: num(s.target, 0, 0, 999), sets: (Array.isArray(s.sets) ? s.sets : []).slice(0, 50).map(function (x) { return { n: num(x.n, 0, 0, 999), sec: num(x.sec, 0, 0, 86400), target: num(x.target, 0, 0, 999), partials: num(x.partials, 0, 0, 999), reps: (Array.isArray(x.reps) ? x.reps : []).slice(0, 400).map(function (v) { return Math.max(0, Math.round(+v || 0)); }) }; }) };
    return { type: 'wod', t: +s.t, name: String(s.name || 'WOD').slice(0, 60), format: W.FORMATS[s.format] ? s.format : 'time', order: s.order === 'free' ? 'free' : 'ordered', wod: W.normalize(s.wod), sec: num(s.sec, 0, 0, 86400), finished: !!s.finished, total: num(s.total, 0, 0, 99999), rounds: num(s.rounds, 0, 0, 999), extra: num(s.extra, 0, 0, 9999), okIntervals: num(s.okIntervals, 0, 0, 999), tallies: cleanTallies(s.tallies), intervals: (Array.isArray(s.intervals) ? s.intervals : []).slice(0, 200).map(function (x) { return { i: num(x.i, 0, 0, 999), ok: !!x.ok, moves: (Array.isArray(x.moves) ? x.moves : []).slice(0, 12).map(function (m) { return { k: E.EX[m.k] ? m.k : 'squat', target: num(m.target, 0, 0, 999), n: num(m.n, 0, 0, 999) }; }) }; }), moveTimes: [] };
  }
  function cleanTallies(t) { var o = {}; if (t && typeof t === 'object') Object.keys(t).forEach(function (k) { if (E.EX[k]) o[k] = num(t[k], 0, 0, 99999); }); return o; }
  var state;
  try { state = sanitize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { state = defaults(); }
  I.setLang(state.settings.lang);
  var storageOK = true;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); storageOK = true; } catch (e) { if (storageOK) toast(tr('Stockage indisponible : les données ne seront pas conservées.')); storageOK = false; } }
  function applySettings() { S.cfg.voice = state.settings.voice; S.cfg.beep = state.settings.beep; S.cfg.vibrate = state.settings.vibrate; }
  applySettings();

  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4500); }

  /* ------------------------------------------------------------ composants */
  function seg(name, opts, cur) { return '<div class="seg" role="group">' + opts.map(function (o) { return '<button type="button" class="' + (String(o[0]) === String(cur) ? 'on' : '') + '" data-seg="' + name + '" data-v="' + esc(o[0]) + '" aria-pressed="' + (String(o[0]) === String(cur)) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  function pills(name, list, cur, fmt) { return '<div class="pills">' + list.map(function (v) { return '<button type="button" class="pill ' + (v === cur ? 'on' : '') + '" data-pill="' + name + '" data-v="' + v + '">' + esc(fmt ? fmt(v) : v) + '</button>'; }).join('') + '</div>'; }
  function stepper(name, val, lo, hi, label) { return '<div class="field"><label for="in-' + name + '">' + esc(label) + '</label><div class="stepper"><button type="button" data-step="' + name + '" data-d="-1" aria-label="' + esc(tr('Moins')) + '">−</button><input id="in-' + name + '" type="number" inputmode="numeric" min="' + lo + '" max="' + hi + '" value="' + val + '" data-in="' + name + '"><button type="button" data-step="' + name + '" data-d="1" aria-label="' + esc(tr('Plus')) + '">+</button></div></div>'; }
  function exOptions(cur) { return EXKEYS.map(function (k) { return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + E.EX[k].icon + ' ' + esc(tr(E.EX[k].label)) + '</option>'; }).join(''); }
  var fmtName = function (f) { return W.formatName(f).split(' (')[0]; };

  /* ------------------------------------------------------------ onglet Exercice */
  function viewExo() {
    var x = state.exo, def = E.EX[x.key], s = state.settings;
    var grid = EXKEYS.map(function (k) { var d = E.EX[k]; return '<button type="button" class="ex ' + (k === x.key ? 'on' : '') + '" data-ex="' + k + '" aria-pressed="' + (k === x.key) + '"><span class="ico" aria-hidden="true">' + d.icon + '</span><strong>' + esc(tr(d.short)) + '</strong><small>' + esc(tr(d.group)) + '</small></button>'; }).join('');
    return '<h2>' + tr('Choisis ton exercice') + '</h2><div class="ex-grid">' + grid + '</div>' +
      '<div class="card" style="margin-top:14px"><div class="card-head"><h3>' + def.icon + ' ' + esc(tr(def.label)) + '</h3></div>' +
      '<p class="notice">' + esc(tr(def.tip)) + '</p>' +
      '<div class="field"><span class="label">' + tr('Objectif de répétitions (un bip et la série s’arrête à l’objectif)') + '</span>' + pills('target', [0, 5, 8, 10, 12, 15, 20, 30, 50], x.target, function (v) { return v ? v : tr('Libre'); }) + '</div>' +
      '<div class="form-grid">' + stepper('target', x.target, 0, 999, tr('Objectif (0 = libre)')) + stepper('sets', x.sets, 1, 30, tr('Nombre de séries')) + '</div>' +
      (x.sets > 1 ? '<div class="field"><span class="label">' + tr('Repos entre les séries') + '</span>' + pills('rest', [0, 15, 30, 45, 60, 90, 120, 180], x.rest, function (v) { return v ? W.fmtDur(v) : tr('aucun'); }) + '</div>' : '') +
      '<div class="field"><span class="label">' + tr('Sensibilité') + '</span>' + seg('level', [['souple', tr('Souple')], ['normal', tr('Normale')], ['strict', tr('Stricte')]], s.level) + '</div>' +
      '<p class="muted small" style="margin:-4px 0 10px">' + tr('Souple : compte plus facilement. Stricte : exige l’amplitude complète.') + '</p>' +
      '<label class="check"><input type="checkbox" data-set="voice" ' + (s.voice ? 'checked' : '') + '> ' + tr('Annoncer les reps à voix haute') + '</label>' +
      '<label class="check"><input type="checkbox" data-set="auto" ' + (s.auto ? 'checked' : '') + '> ' + tr('Départ automatique quand je suis bien cadré') + '</label>' +
      '<div class="actions"><button class="btn primary big" type="button" data-act="exo-cam">' + tr('📷 Démarrer la caméra') + '</button></div>' +
      '<div class="actions"><label class="btn" style="flex:1;text-align:center">' + tr('🎞 Analyser une vidéo') + '<input type="file" accept="video/*" hidden data-file="exo"></label></div>' +
      '<p class="muted small" style="margin:12px 0 0">' + tr('Les images restent sur ton téléphone : rien n’est enregistré ni envoyé. Première utilisation : le modèle de détection (environ 15 Mo) est téléchargé, puis gardé pour le hors-ligne.') + '</p></div>';
  }

  /* ------------------------------------------------------------ onglet WOD */
  function draftToWod(d) {
    var w = { name: d.name, format: d.format, order: d.order, moves: d.moves.map(function (m) { return { k: m.k, reps: m.reps, n: m.n }; }), cap: d.capMin * 60, restRound: d.restRound, work: d.work, rest: d.rest, each: d.each };
    if (d.format === 'time') { var sc = String(d.scheme || '').split(/[-–, ]+/).map(function (x) { return +x; }).filter(function (x) { return x > 0; }); if (sc.length > 1) { w.scheme = sc; w.moves = w.moves.map(function (m) { return { k: m.k, reps: 0, n: m.n }; }); } else w.rounds = d.rounds; }
    else if (d.format === 'interval') w.rounds = d.rounds;
    return W.normalize(w);
  }
  function wodToDraft(w) {
    var d = state.draft;
    d.name = w.name || ''; d.format = w.format; d.order = w.order; d.moves = w.moves.map(function (m) { return { k: m.k, reps: m.reps, n: m.n }; }); d.rounds = w.rounds || 3; d.scheme = w.scheme ? w.scheme.join('-') : '';
    d.capMin = Math.round((w.cap || 0) / 60); d.work = w.work; d.rest = w.rest; d.restRound = w.restRound; d.each = w.each; d.warn = [];
  }
  function viewWod() {
    var d = state.draft, w = draftToWod(d), errs = W.validate(w);
    var presets = W.PRESETS.map(function (p) { return '<button type="button" class="preset" data-preset="' + p.id + '"><strong>' + esc(presetName(p)) + '</strong><small>' + esc(tr(p.info)) + '</small><span class="tag">' + esc(fmtName(p.wod.format)) + '</span></button>'; }).join('');
    var moves = d.moves.map(function (m, i) { var def = E.EX[m.k]; return '<div class="move"><div><strong>' + def.icon + ' ' + esc(W.label(m)) + '</strong><small>' + esc(tr(def.group)) + '</small></div><input type="number" inputmode="numeric" min="0" max="999" value="' + m.reps + '" data-mreps="' + i + '" aria-label="' + esc(tr('Répétitions de {e}', { e: tr(def.short) })) + '" ' + (d.format === 'time' && w.scheme ? 'disabled title="' + esc(tr('Le schéma fixe les répétitions')) + '"' : '') + '><div class="mini"><button type="button" data-mv="' + i + '" data-d="-1" aria-label="' + esc(tr('Monter')) + '">↑</button><button type="button" data-mv="' + i + '" data-d="1" aria-label="' + esc(tr('Descendre')) + '">↓</button><button type="button" data-rm="' + i + '" aria-label="' + esc(tr('Retirer')) + '">✕</button></div></div>'; }).join('');
    var params = '';
    if (d.format === 'time') params = '<div class="form-grid">' + stepper('rounds', d.rounds, 1, 99, tr('Nombre de tours')) + '<div class="field"><label for="in-scheme">' + tr('Schéma (ex. 21-15-9)') + '</label><input id="in-scheme" type="text" data-in="scheme" value="' + esc(d.scheme) + '" placeholder="' + esc(tr('facultatif')) + '"></div></div><div class="form-grid">' + stepper('capMin', d.capMin, 0, 180, tr('Temps max (min, 0 = aucun)')) + stepper('restRoundMin', Math.round(d.restRound / 60), 0, 30, tr('Repos entre tours (min)')) + '</div>';
    else if (d.format === 'amrap') params = stepper('capMin', d.capMin || 10, 1, 180, tr('Durée (minutes)'));
    else params = '<div class="form-grid">' + stepper('work', d.work, 5, 3600, tr('Effort (secondes)')) + stepper('rest', d.rest, 0, 3600, tr('Repos (secondes)')) + '</div>' + stepper('rounds', d.rounds, 1, 200, tr('Nombre d’intervalles')) + '<div class="field"><span class="label">' + tr('À chaque intervalle') + '</span>' + seg('each', [['one', tr('Un exercice à tour de rôle')], ['all', tr('Tous les exercices')]], d.each) + '</div>';
    var saved = state.wods.map(function (s) { return '<div class="history-row"><div><strong>' + esc(s.wod.name || 'WOD') + '</strong><small>' + esc(W.describe(s.wod)) + '</small></div><div class="actions" style="margin:0;flex-wrap:nowrap"><button class="btn primary small" type="button" data-wod-run="' + esc(s.id) + '" aria-label="' + esc(tr('Lancer')) + '">▶</button><button class="btn small" type="button" data-wod-edit="' + esc(s.id) + '">' + tr('Modifier') + '</button><button class="btn danger small" type="button" data-wod-del="' + esc(s.id) + '" aria-label="' + esc(tr('Supprimer')) + '">✕</button></div></div>'; }).join('');
    var warn = d.warn && d.warn.length ? '<p class="notice">' + d.warn.map(esc).join('<br>') + '</p>' : '';
    return '<h2>WOD</h2><p class="muted small" style="margin-top:-6px">' + tr('Plusieurs exercices dans une même séance. Choisis une présélection, décris ton WOD ou construis-le.') + '</p>' +
      '<div class="preset-row" role="list">' + presets + '</div>' +
      '<div class="card"><div class="card-head"><h3>' + tr('Mon WOD') + '</h3><span class="tag">' + esc(fmtName(d.format)) + '</span></div>' +
      '<div class="field"><label for="in-name">' + tr('Nom') + '</label><input id="in-name" type="text" data-in="name" value="' + esc(d.name) + '" placeholder="' + esc(tr('Ex. : WOD du samedi')) + '" maxlength="60"></div>' +
      '<div class="field"><span class="label">' + tr('Format') + '</span>' + seg('format', [['time', fmtName('time')], ['amrap', 'AMRAP'], ['interval', fmtName('interval')]], d.format) + '</div>' + params +
      '<div class="divider"></div><h4 style="margin-bottom:8px">' + tr('Exercices') + ' <span class="tag">' + d.moves.length + '</span></h4>' + (moves || '<div class="empty">' + tr('Ajoute au moins un exercice.') + '</div>') +
      '<div class="form-grid" style="grid-template-columns:1fr auto;align-items:end;margin-top:8px"><div class="field" style="margin:0"><label for="in-add">' + tr('Ajouter un exercice') + '</label><select id="in-add" data-in="add">' + exOptions(d.add) + '</select></div><button class="btn" type="button" data-act="wod-add" style="min-width:90px">' + tr('＋ Ajouter') + '</button></div>' +
      '<div class="divider"></div><div class="field"><span class="label">' + tr('Comment je compte les exercices ?') + '</span>' + seg('order', [['ordered', tr('Dans l’ordre')], ['free', tr('Détection auto (bêta)')]], d.order) + '</div>' +
      '<p class="notice">' + (d.order === 'free' ? tr('<strong>Détection automatique :</strong> je reconnais seul l’exercice que tu fais (parmi ceux de la liste) et je compte chacun. Tu peux les enchaîner dans l’ordre que tu veux. Le cadrage doit montrer tout le corps.') : tr('<strong>Dans l’ordre :</strong> je suis la liste. Quand tu atteins les répétitions d’un exercice, un signal annonce le suivant. C’est la méthode la plus fiable.')) + '</p>' +
      '<div class="divider"></div><div class="field"><label for="in-text">' + tr('Ou décris-le en texte') + '</label><textarea id="in-text" rows="3" data-in="text" spellcheck="false" placeholder="' + esc(tr('AMRAP 12 min : 5 tractions, 10 pompes, 15 squats\n21-15-9 thrusters, tractions\nEMOM 10 : 8 burpees, 12 squats')) + '">' + esc(d.text) + '</textarea></div>' +
      '<div class="actions"><button class="btn" type="button" data-act="wod-parse">' + tr('Lire la description') + '</button></div>' + warn +
      (errs.length ? '<p class="notice">' + errs.map(esc).join('<br>') + '</p>' : '<p class="muted small" style="margin:12px 0 0">' + esc(W.describe(w)) + '</p>') +
      '<div class="actions"><button class="btn primary big" type="button" data-act="wod-cam" ' + (errs.length ? 'disabled' : '') + '>' + tr('📷 Lancer le WOD') + '</button></div>' +
      '<div class="actions"><button class="btn" type="button" data-act="wod-save" ' + (errs.length ? 'disabled' : '') + '>' + tr('Enregistrer ce WOD') + '</button><label class="btn" style="flex:1;text-align:center">' + tr('🎞 Analyser une vidéo') + '<input type="file" accept="video/*" hidden data-file="wod"></label></div></div>' +
      (state.wods.length ? '<div class="card"><div class="card-head"><h3>' + tr('Mes WOD') + '</h3><span class="tag">' + state.wods.length + '</span></div>' + saved + '</div>' : '');
  }

  /* ------------------------------------------------------------ onglet Carnet */
  function bestSets() {
    var best = {}; state.sessions.forEach(function (s) { if (s.type === 'single') s.sets.forEach(function (x) { if (!best[s.k] || x.n > best[s.k].n) best[s.k] = { n: x.n, t: s.t }; }); });
    return best;
  }
  function viewBook() {
    var ss = state.sessions, week = Date.now() - 7 * 86400000, wk = ss.filter(function (s) { return s.t >= week; });
    var totalReps = ss.reduce(function (a, s) { return a + (s.total || 0); }, 0), wkReps = wk.reduce(function (a, s) { return a + (s.total || 0); }, 0);
    var best = bestSets(), recs = Object.keys(best).sort(function (a, b) { return best[b].n - best[a].n; }).map(function (k) { return '<div class="history-row"><div><strong>' + E.EX[k].icon + ' ' + esc(tr(E.EX[k].short)) + '</strong><small>' + fmtDate(best[k].t) + '</small></div><div><span class="tag">' + tr('{n} reps', { n: best[k].n }) + '</span></div></div>'; }).join('');
    var wodBest = {}; ss.forEach(function (s) { if (s.type !== 'wod' || !s.name) return; var b = wodBest[s.name]; var score = s.format === 'amrap' ? s.rounds * 1000 + s.extra : s.finished ? -s.sec : null; if (score == null) return; if (!b || score > b.score) wodBest[s.name] = { score: score, s: s }; });
    var wrec = Object.keys(wodBest).map(function (n) { var s = wodBest[n].s; return '<div class="history-row"><div><strong>🏆 ' + esc(n) + '</strong><small>' + fmtDate(s.t) + '</small></div><div><span class="tag">' + esc(W.scoreText(s)) + '</span></div></div>'; }).join('');
    var hist = ss.slice(0, 40).map(function (s, i) {
      var del = '<div class="actions"><button class="btn danger small" type="button" data-del-session="' + i + '">' + tr('Supprimer') + '</button></div>';
      if (s.type === 'single') { var d = E.EX[s.k]; return '<details class="history-row" style="display:block"><summary style="display:flex;justify-content:space-between;gap:10px;cursor:pointer"><span><strong>' + d.icon + ' ' + esc(tr(d.short)) + ' · ' + tr('{n} reps', { n: s.total }) + '</strong><small>' + fmtDate(s.t) + ' · ' + trn(s.sets.length, '{n} série', '{n} séries') + ' · ' + W.fmtDur(s.sec) + '</small></span></summary><div style="margin-top:8px">' + s.sets.map(function (x, j) { return '<small>' + tr('Série {a} :', { a: j + 1 }) + ' <b>' + x.n + '</b>' + (x.target ? ' / ' + x.target : '') + ' · ' + W.fmtDur(x.sec) + (x.partials ? ' · ' + tr('{n} partielle(s)', { n: x.partials }) : '') + '</small>'; }).join('') + del + '</div></details>'; }
      var tl = Object.keys(s.tallies).map(function (k) { return tr(E.EX[k].short) + ' ' + s.tallies[k]; }).join(' · ');
      return '<details class="history-row" style="display:block"><summary style="display:flex;justify-content:space-between;gap:10px;cursor:pointer"><span><strong>🏆 ' + esc(s.name) + ' · ' + esc(W.scoreText(s)) + '</strong><small>' + fmtDate(s.t) + ' · ' + tr('{n} reps', { n: s.total }) + '</small></span></summary><div style="margin-top:8px"><small>' + esc(W.describe(s.wod)) + '</small><br><small>' + esc(tl) + '</small>' + (s.intervals.length ? '<br><small>' + s.intervals.map(function (x) { return (x.i + 1) + (x.ok ? '✓' : '✗'); }).join(' ') + '</small>' : '') + del + '</div></details>';
    }).join('');
    var st = state.settings;
    return '<h2>' + tr('Carnet') + '</h2><div class="stats"><div class="stat"><b>' + wk.length + '</b><span>' + tr('séances (7 jours)') + '</span></div><div class="stat"><b>' + wkReps + '</b><span>' + tr('reps (7 jours)') + '</span></div><div class="stat"><b>' + totalReps + '</b><span>' + tr('reps au total') + '</span></div></div>' +
      '<div class="card"><div class="card-head"><h3>' + tr('Records') + '</h3></div>' + (recs || wrec ? recs + wrec : '<div class="empty">' + tr('Tes records apparaîtront ici après ta première séance.') + '</div>') + '</div>' +
      '<div class="card"><div class="card-head"><h3>' + tr('Historique') + '</h3><span class="tag">' + ss.length + '</span></div>' + (hist || '<div class="empty">' + tr('Aucune séance enregistrée pour l’instant.') + '</div>') + '</div>' +
      '<div class="card"><div class="card-head"><h3>' + tr('Réglages') + '</h3></div>' +
      '<label class="check"><input type="checkbox" data-set="voice" ' + (st.voice ? 'checked' : '') + '> ' + tr('Annoncer les reps à voix haute') + '</label>' +
      '<label class="check"><input type="checkbox" data-set="beep" ' + (st.beep ? 'checked' : '') + '> ' + tr('Bips (décompte, objectif, fin)') + '</label>' +
      '<label class="check"><input type="checkbox" data-set="vibrate" ' + (st.vibrate ? 'checked' : '') + '> ' + tr('Vibrations') + '</label>' +
      '<label class="check"><input type="checkbox" data-set="auto" ' + (st.auto ? 'checked' : '') + '> ' + tr('Départ automatique quand je suis bien cadré') + '</label>' +
      '<label class="check"><input type="checkbox" data-set="diag" ' + (st.diag ? 'checked' : '') + '> ' + tr('Afficher le diagnostic (réglages fins)') + '</label>' +
      '<div class="field"><span class="label">' + tr('Compte à rebours avant le départ') + '</span>' + pills('countdown', [0, 3, 5, 10], st.countdown, function (v) { return v ? tr('{n} s', { n: v }) : tr('aucun'); }) + '</div></div>' +
      '<div class="card"><div class="card-head"><h3>' + tr('Mes données') + '</h3></div><p class="muted small">' + tr('Tout reste sur ce téléphone. Sauvegarde ton carnet pour le retrouver après un effacement du navigateur ou sur un autre appareil.') + '</p>' +
      '<div class="actions"><button class="btn" type="button" data-act="backup" ' + (ss.length || state.wods.length ? '' : 'disabled') + '>' + tr('Sauvegarder') + '</button><label class="btn" style="text-align:center">' + tr('Restaurer') + '<input type="file" accept=".json,application/json" hidden data-file="restore"></label><button class="btn danger" type="button" data-act="reset">' + tr('Tout effacer') + '</button></div><p id="bookNote" class="muted small" role="status"></p></div>' +
      '<div class="card"><button class="btn" type="button" data-act="about">' + tr('À propos et limites') + '</button></div>';
  }

  /* ------------------------------------------------------------ rendu */
  function render() {
    var v = $('view'); document.querySelectorAll('.tabs button').forEach(function (b) { var on = b.dataset.tab === state.tab; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    v.innerHTML = state.tab === 'wod' ? viewWod() : state.tab === 'book' ? viewBook() : viewExo();
  }
  function go(tab) { state.tab = tab; save(); render(); window.scrollTo(0, 0); }

  /* ------------------------------------------------------------ langue */
  function setLanguage(l) {
    l = l === 'az' ? 'az' : 'fr'; state.settings.lang = l; save(); I.setLang(l); syncLangButtons(); render();
    if (!$('cam').hidden) { if (pendingResult) onDone(pendingResult); else if (ctl) ctl.emit(); }
    if ($('about').open) about();
  }
  function syncLangButtons() { document.querySelectorAll('[data-lang]').forEach(function (b) { var on = b.dataset.lang === state.settings.lang; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }

  /* ------------------------------------------------------------ interactions des onglets */
  function bindEvents() {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.tab); }); });
    document.querySelectorAll('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { setLanguage(b.dataset.lang); }); });
    $('aboutBtn').addEventListener('click', about);
    var view = $('view');
    view.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return; var d = t.dataset;
      if (d.ex) { state.exo.key = d.ex; save(); render(); return; }
      if (d.seg) { segChange(d.seg, d.v); return; }
      if (d.pill) { pillChange(d.pill, +d.v); return; }
      if (d.step) { stepChange(d.step, +d.d); return; }
      if (d.preset) { var p = W.PRESETS.find(function (x) { return x.id === d.preset; }); if (p) { var pw = W.normalize(p.wod); pw.name = presetName(p); wodToDraft(pw); save(); render(); window.scrollTo(0, 400); toast(tr('Présélection « {p} » chargée : modifie-la ou lance-la.', { p: presetName(p) })); } return; }
      if (d.mv != null) { var i = +d.mv, j = i + (+d.d), mv = state.draft.moves; if (j >= 0 && j < mv.length) { var tmp = mv[i]; mv[i] = mv[j]; mv[j] = tmp; save(); render(); } return; }
      if (d.rm != null) { state.draft.moves.splice(+d.rm, 1); save(); render(); return; }
      if (d.wodRun) { var s = state.wods.find(function (x) { return x.id === d.wodRun; }); if (s) openWod(s.wod); return; }
      if (d.wodEdit) { var s2 = state.wods.find(function (x) { return x.id === d.wodEdit; }); if (s2) { wodToDraft(s2.wod); save(); render(); window.scrollTo(0, 0); } return; }
      if (d.wodDel) { var s3 = state.wods.find(function (x) { return x.id === d.wodDel; }); if (s3 && confirm(tr('Supprimer « {n} » ?', { n: s3.wod.name || 'WOD' }))) { state.wods = state.wods.filter(function (x) { return x !== s3; }); save(); render(); } return; }
      if (d.delSession != null) { if (confirm(tr('Supprimer cette séance du carnet ?'))) { state.sessions.splice(+d.delSession, 1); save(); render(); } return; }
      if (d.act) action(d.act);
    });
    view.addEventListener('input', function (e) {
      var t = e.target, d = t.dataset;
      if (d.in) { inputChange(d.in, t.value, t); return; }
      if (d.mreps != null) { state.draft.moves[+d.mreps].reps = num(t.value, 0, 0, 999); save(); }
    });
    view.addEventListener('change', function (e) {
      var t = e.target, d = t.dataset;
      if (d.set) { state.settings[d.set] = t.checked; save(); applySettings(); if (ctl && d.set === 'auto') ctl.settings.autoStart = t.checked; return; }
      if (d.file) { var f = t.files && t.files[0]; t.value = ''; if (!f) return; if (d.file === 'exo') openSingle({ file: f }); else if (d.file === 'wod') openWod(draftToWod(state.draft), { file: f }); else if (d.file === 'restore') restore(f); }
    });
  }
  function segChange(name, v) {
    if (name === 'level') state.settings.level = v;
    else if (name === 'format') { state.draft.format = v; if (v === 'amrap' && !state.draft.capMin) state.draft.capMin = 10; }
    else if (name === 'order') state.draft.order = v;
    else if (name === 'each') state.draft.each = v;
    save(); render();
  }
  function pillChange(name, v) {
    if (name === 'target') state.exo.target = v; else if (name === 'rest') state.exo.rest = v; else if (name === 'countdown') state.settings.countdown = v;
    save(); render();
  }
  var STEPS = { target: ['exo', 'target', 0, 999, 1], sets: ['exo', 'sets', 1, 30, 1], rounds: ['draft', 'rounds', 1, 200, 1], capMin: ['draft', 'capMin', 0, 180, 1], work: ['draft', 'work', 5, 3600, 5], rest: ['draft', 'rest', 0, 3600, 5], restRoundMin: ['draft', 'restRound', 0, 1800, 60] };
  function stepChange(name, dlt) {
    var s = STEPS[name]; if (!s) return; var o = state[s[0]]; var step = s[4]; var cur = o[s[1]];
    if (name === 'target' && Math.abs(dlt) === 1) step = cur >= 20 ? 5 : 1;
    o[s[1]] = Math.min(s[3], Math.max(s[2], cur + dlt * step)); save(); render();
  }
  function inputChange(name, val, el) {
    if (name === 'name') state.draft.name = val.slice(0, 60);
    else if (name === 'text') state.draft.text = val;
    else if (name === 'scheme') { state.draft.scheme = val; save(); return; }
    else if (name === 'add') state.draft.add = val;
    else if (STEPS[name]) {
      var s = STEPS[name], before = state[s[0]][s[1]], n = num(val, before, s[2], s[3]); state[s[0]][s[1]] = name === 'restRoundMin' ? n * 60 : n;
      save();
      /* on ne redessine pas pendant la frappe (le champ perdrait le focus), sauf quand l'affichage change vraiment */
      if (name === 'sets' && (before > 1) !== (n > 1)) render();
      return;
    }
    save();
  }
  function action(a) {
    if (a === 'exo-cam') return openSingle({});
    if (a === 'wod-cam') return openWod(draftToWod(state.draft), {});
    if (a === 'wod-add') { state.draft.moves.push({ k: state.draft.add, reps: state.draft.format === 'time' && state.draft.scheme ? 0 : 10 }); save(); render(); return; }
    if (a === 'wod-parse') { var r = W.parse(state.draft.text); if (r.wod.moves.length) { wodToDraft(r.wod); if (r.wod.name) state.draft.name = r.wod.name; state.draft.text = ''; } state.draft.warn = r.warn; save(); render(); if (r.wod.moves.length) toast(tr('Description lue : vérifie la liste puis lance le WOD.')); return; }
    if (a === 'wod-save') { var w = draftToWod(state.draft); if (W.validate(w).length) return; if (!w.name) w.name = tr('WOD du {d}', { d: new Date().toLocaleDateString(I.locale(), { day: '2-digit', month: '2-digit' }) }); state.wods.unshift({ id: id(), wod: w }); state.wods = state.wods.slice(0, 30); save(); render(); toast(tr('WOD enregistré.')); return; }
    if (a === 'backup') return backup();
    if (a === 'reset') { if (confirm(tr('Tout effacer : séances, WOD et réglages de cet appareil ? Cette action est définitive.'))) { var keep = state.settings.lang; state = defaults(); state.settings.lang = keep; save(); applySettings(); render(); } return; }
    if (a === 'about') return about();
  }
  function about() {
    var d = $('about');
    d.innerHTML = '<h2 id="aboutTitle" style="margin-top:0">REPS</h2><p>' + tr('Compteur de répétitions par caméra. La caméra de ton téléphone suit ton corps et compte tes répétitions : un exercice au choix, ou un WOD avec plusieurs exercices.') + '</p>' +
      '<h3>' + tr('Vie privée') + '</h3><p>' + tr('Les images sont analysées sur ton téléphone. Elles ne sont ni enregistrées ni envoyées. Seuls des chiffres (tes résultats) restent sur l’appareil. Le modèle de détection et sa bibliothèque (environ 15 Mo) sont téléchargés la première fois depuis des serveurs publics, puis gardés pour le hors-ligne.') + '</p>' +
      '<h3>' + tr('Bien se placer') + '</h3><p>' + tr('Téléphone calé, à 2,5 à 3 m, à la verticale, de profil ou de trois-quarts, corps entier visible. Un fond uni et un bon éclairage aident. Plusieurs personnes dans le cadre : l’appli se fixe sur toi et ignore les autres.') + '</p>' +
      '<h3>' + tr('Limites') + '</h3><p>' + tr('C’est une aide, pas un arbitre. Le comptage est validé sur des vidéos de démonstration ; il peut se tromper selon l’angle, la lumière, les vêtements ou la vitesse. Dips, toes to bar, rowing assis et tirage vertical sont moins fiables ; en position allongée, la détection peut décrocher. La détection automatique d’exercice (WOD en ordre libre) est plus fragile que le suivi dans l’ordre. Corrige avec −1 / +1 si besoin. Écoute ton corps : cette appli ne remplace pas l’avis d’un professionnel.') + '</p>' +
      '<div class="actions"><button class="btn primary" type="button" id="aboutClose">' + tr('Fermer') + '</button></div>';
    if (!d.open) d.showModal(); $('aboutClose').onclick = function () { d.close(); };
  }
  function backup() {
    var blob = new Blob([JSON.stringify({ app: 'reps', v: 1, savedAt: new Date().toISOString(), data: { settings: state.settings, exo: state.exo, wods: state.wods, sessions: state.sessions } }, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'reps-sauvegarde.json'; document.body.append(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    var n = $('bookNote'); if (n) n.textContent = tr('Sauvegarde créée : garde le fichier en lieu sûr.');
  }
  async function restore(file) {
    var n = function (t) { var el = $('bookNote'); if (el) el.textContent = t; };
    try {
      if (file.size > 3000000) throw new Error(tr('Fichier trop volumineux.'));
      var raw = JSON.parse(await file.text());
      if (!raw || raw.app !== 'reps' || !raw.data) throw new Error(tr('Ce fichier n’est pas une sauvegarde REPS.'));
      var next = sanitize(Object.assign({}, raw.data, { tab: 'book' }));
      if (!confirm(tr('Restaurer cette sauvegarde ? {a} séance(s) et {b} WOD remplaceront les données de cet appareil.', { a: next.sessions.length, b: next.wods.length }))) return;
      next.draft = state.draft; next.settings.lang = state.settings.lang; state = next; save(); applySettings(); render(); n(tr('Sauvegarde restaurée.'));
    } catch (err) { n(err.message || tr('Sauvegarde illisible.')); }
  }

  /* ------------------------------------------------------------ séance caméra */
  var ctl = null, vision = null, lastView = null, pendingResult = null;
  function ensureVision() {
    if (vision) return vision;
    vision = new V.Vision({
      video: $('camVideo'), canvas: $('camCanvas'), view: $('camView'),
      onFrame: function (d) { return ctl ? ctl.onFrame(d) : {}; },
      onStatus: function (t, w) { if (ctl) { ctl.setStatus(tr(t), w); ctl.emit(); } },
      onEnded: function () { if (ctl && ctl.phase === 'running') ctl.end(); }
    });
    return vision;
  }
  function showCam(on) { $('cam').hidden = !on; document.body.classList.toggle('cam-open', on); }
  function camMessage(text, small) { var m = $('camMsg'); m.textContent = text || ''; m.hidden = !text; m.classList.toggle('small', !!small); }
  function env() {
    return {
      vision: ensureVision(), settings: { voice: state.settings.voice, autoStart: state.settings.auto, countdown: state.settings.countdown },
      render: renderCam, onDone: onDone
    };
  }
  /* Démarre la caméra (ou la vidéo) puis laisse la main au contrôleur. */
  async function launch(make, opts) {
    S.unlock(); S.cfg.voice = state.settings.voice;
    var file = opts && opts.file, v = ensureVision();
    ctl = null; pendingResult = null; $('camResult').hidden = true; $('camStage').hidden = false; showCam(true);
    $('camPre').hidden = true; $('camRun').hidden = true; $('camRest').hidden = true; $('camEnd').hidden = true; $('camHud').hidden = true; $('camChips').hidden = true; $('frameBadge').hidden = true;
    $('camCount').textContent = '0'; $('camTarget').textContent = ''; $('camNow').textContent = ''; $('camTempo').textContent = ''; $('camStatus').textContent = ''; $('camAuto').checked = state.settings.auto;
    $('camTitle').textContent = tr('Compteur'); $('camDiagBox').hidden = true;
    camMessage(tr('Chargement du modèle de détection…'), true); $('camStatus').textContent = tr('Première utilisation : environ 15 Mo à télécharger.');
    try { await v.load(); } catch (e) { camMessage(''); $('camStatus').textContent = tr('Impossible de charger le modèle : vérifie ta connexion (nécessaire la première fois).'); $('camStatus').classList.add('warn'); $('camPre').hidden = true; return; }
    if ($('cam').hidden) return; /* séance fermée pendant le chargement */
    var r = file ? await v.startFile(file) : await v.startCamera('user');
    if (!r.ok) { camMessage(''); $('camStatus').textContent = r.message ? tr(r.message) : tr('Impossible de démarrer.'); $('camStatus').classList.add('warn'); return; }
    camMessage(''); $('camStatus').classList.remove('warn');
    var c = make(); ctl = c; c.settings.countdown = file ? 0 : state.settings.countdown;
    if (!file) { v.begin(); c.emit(); } else { c.start(); }
  }
  function openSingle(o) {
    var x = state.exo;
    launch(function () { return new SES.Single(env(), { key: x.key, target: x.target, sets: x.sets, rest: x.rest, level: state.settings.level, results: [] }); }, o);
  }
  function openWod(wod, o) {
    var w = W.normalize(wod); if (W.validate(w).length) { toast(W.validate(w)[0]); return; }
    launch(function () { return new SES.Wod(env(), { wod: w, level: state.settings.level }); }, o);
  }
  function renderCam(vw) {
    lastView = vw; var ph = vw.phase;
    $('camTitle').textContent = vw.title; $('camCount').textContent = vw.count != null ? vw.count : 0;
    var c = $('camCount'); if (c.dataset.n !== String(vw.count)) { c.dataset.n = String(vw.count); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
    $('camTarget').textContent = vw.target ? '/ ' + vw.target : ''; $('camNow').textContent = vw.now || ''; $('camTempo').textContent = vw.tempo || '';
    $('camStatus').textContent = vw.status || ''; $('camStatus').classList.toggle('warn', !!vw.warn);
    camMessage(vw.msg, vw.msgSmall);
    var hud = vw.hud; $('camHud').hidden = !hud;
    if (hud) { $('hudTitle').textContent = hud.title; $('hudClock').textContent = hud.clock; $('hudSub').textContent = hud.sub; $('hudBar').style.width = Math.max(0, Math.min(100, Math.round((hud.pct || 0) * 100))) + '%'; }
    var chips = vw.chips; $('camChips').hidden = !chips || !chips.length;
    if (chips && chips.length) $('camChips').innerHTML = chips.map(function (ch) { return '<div class="chip ' + (ch.active ? 'active ' : '') + (ch.done ? 'done' : '') + '"><span class="ico" aria-hidden="true">' + ch.icon + '</span><strong>' + esc(ch.label) + '</strong><b>' + ch.n + '</b>' + (ch.of ? '<small> / ' + ch.of + '</small>' : '') + '</div>'; }).join('');
    var fb = $('frameBadge'); fb.hidden = !(vw.frame && vw.frame.show); fb.className = 'frame-badge ' + (vw.frame && vw.frame.ok ? 'ok' : 'ko'); fb.textContent = vw.frame && vw.frame.ok ? tr('✓ Cadrage OK') : tr('⚠ Cadre-toi');
    $('camPre').hidden = ph !== 'framing'; $('camRest').hidden = ph !== 'rest' || vw.kind !== 'single';
    $('camRun').hidden = ph !== 'running'; $('camEnd').hidden = !(ph === 'running' || ph === 'rest');
    $('camPause').textContent = vw.paused ? tr('Reprendre') : tr('Pause'); $('camNext').hidden = !(vw.kind === 'wod' && vw.canSkip && ph === 'running'); $('camZero').hidden = vw.kind === 'wod' && vw.free;
    $('camFinish').textContent = vw.kind === 'wod' ? tr('Terminer le WOD') : (ph === 'rest' ? tr('Terminer la séance') : tr('Terminer la série'));
    var dg = $('camDiagBox'); dg.hidden = !(state.settings.diag && vw.diag); if (!dg.hidden) $('camDiag').textContent = vw.diag;
  }
  function closeCam() { if (ctl) { ctl.destroy(); ctl = null; } if (vision) vision.stop(); pendingResult = null; showCam(false); $('camResult').hidden = true; S.silence(); }
  function bindCam() {
    $('camClose').addEventListener('click', function () { if (pendingResult) { closeCam(); return; } if (ctl && (ctl.phase === 'running' || ctl.phase === 'rest') && !confirm(tr('Quitter la séance ? Les répétitions comptées ne seront pas enregistrées.'))) return; closeCam(); });
    $('camGo').addEventListener('click', function () { S.unlock(); if (ctl) { ctl.autoFired = true; ctl.start(); } });
    $('camAuto').addEventListener('change', function (e) { state.settings.auto = e.target.checked; save(); if (ctl) { ctl.settings.autoStart = e.target.checked; ctl.autoFired = false; } });
    $('camPause').addEventListener('click', function () { if (ctl) ctl.pause(); });
    $('camMinus').addEventListener('click', function () { if (ctl) ctl.adjust(-1); });
    $('camPlus').addEventListener('click', function () { if (ctl) ctl.adjust(1); });
    $('camZero').addEventListener('click', function () { if (ctl && ctl.zero) ctl.zero(); });
    $('camFlip').addEventListener('click', async function () { if (!vision || !ctl) return; var next = vision.facing === 'user' ? 'environment' : 'user'; var r = await vision.startCamera(next); if (r.ok) vision.begin(); else toast(r.message ? tr(r.message) : tr('Impossible de changer de caméra.')); });
    $('camFinish').addEventListener('click', function () { if (ctl) ctl.end(); });
    $('camNext').addEventListener('click', function () { if (ctl && ctl.skip) ctl.skip(); });
    $('camSkip').addEventListener('click', function () { if (ctl && ctl.skipRest) ctl.skipRest(); });
    $('camPlus15').addEventListener('click', function () { if (ctl && ctl.addRest) ctl.addRest(15); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && ctl && ctl.phase === 'running' && !ctl.paused && vision && vision.mode === 'camera') ctl.pause(true); });
  }

  /* ------------------------------------------------------------ résultat d'une séance */
  function onDone(res) {
    if (!res) { closeCam(); return; }
    pendingResult = res; $('camStage').hidden = true; $('camResult').hidden = false;
    var best = bestSets(), box = $('camResult'), h = '';
    if (res.type === 'single') {
      var d = E.EX[res.k], prev = best[res.k] ? best[res.k].n : 0, top = Math.max.apply(null, res.sets.map(function (s) { return s.n; }).concat([0])), pb = top > prev && top > 0;
      var allReps = []; res.sets.forEach(function (s) { for (var i = 1; i < s.reps.length; i++) allReps.push((s.reps[i] - s.reps[i - 1]) / 1000); });
      var avg = allReps.length ? allReps.reduce(function (a, b) { return a + b; }, 0) / allReps.length : 0, partials = res.sets.reduce(function (a, s) { return a + (s.partials || 0); }, 0);
      var bars = res.sets.map(function (s) { return Math.max(3, s.n); }), mx = Math.max.apply(null, bars.concat([1]));
      h = '<h2 style="margin-top:0">' + d.icon + ' ' + esc(tr(d.label)) + '</h2>' + (pb ? '<p><span class="tag ok">' + tr('🏆 Nouveau record de série : {n} reps', { n: top }) + '</span></p>' : '') +
        '<div class="res-big">' + res.total + ' <small style="font-size:22px;color:var(--muted)">' + tr('reps') + '</small></div>' +
        '<div class="res-grid"><div class="stat"><b>' + res.sets.length + '</b><span>' + (res.sets.length > 1 ? tr('séries') : tr('série')) + '</span></div><div class="stat"><b>' + W.fmtClock(res.sec) + '</b><span>' + tr('temps actif') + '</span></div><div class="stat"><b>' + (avg ? avg.toFixed(1).replace('.', ',') : '–') + '</b><span>' + tr('s / rep') + '</span></div></div>' +
        (res.sets.length > 1 ? '<div class="bars" aria-hidden="true">' + bars.map(function (b) { return '<i style="height:' + Math.round(b / mx * 100) + '%"></i>'; }).join('') + '</div>' : '') +
        res.sets.map(function (s, i) { return '<div class="history-row"><div><strong>' + tr('Série {a}', { a: i + 1 }) + '</strong><small>' + W.fmtDur(s.sec) + (s.target ? ' · ' + tr('objectif {n}', { n: s.target }) : '') + (s.partials ? ' · ' + tr('{n} partielle(s) ignorée(s)', { n: s.partials }) : '') + '</small></div><div><strong style="font-size:22px">' + s.n + '</strong>' + (s.target && s.n >= s.target ? ' ✓' : '') + '</div></div>'; }).join('') +
        (partials ? '<p class="notice">' + tr('{n} répétition(s) pas assez profondes n’ont pas été comptées. Choisis « Souple » si tu veux qu’elles comptent.', { n: partials }) + '</p>' : '');
    } else {
      h = '<h2 style="margin-top:0">🏆 ' + esc(res.name) + '</h2><p class="muted small">' + esc(W.describe(res.wod)) + '</p>' +
        '<div class="res-big">' + esc(W.scoreText(res)) + '</div>' +
        '<div class="res-grid"><div class="stat"><b>' + res.total + '</b><span>' + tr('reps comptées') + '</span></div><div class="stat"><b>' + W.fmtClock(res.sec) + '</b><span>' + tr('temps') + '</span></div><div class="stat"><b>' + (res.format === 'amrap' ? res.rounds : res.format === 'interval' ? res.okIntervals : res.rounds) + '</b><span>' + (res.format === 'interval' ? tr('réussis') : tr('tours')) + '</span></div></div>' +
        Object.keys(res.tallies).map(function (k) { return '<div class="history-row"><div><strong>' + E.EX[k].icon + ' ' + esc(tr(E.EX[k].short)) + '</strong></div><div><strong style="font-size:22px">' + res.tallies[k] + '</strong></div></div>'; }).join('') +
        (res.intervals.length ? '<p class="small muted">' + tr('Intervalles : {x}', { x: res.intervals.map(function (x) { return (x.i + 1) + (x.ok ? '✓' : '✗'); }).join(' ') }) + '</p>' : '');
    }
    h += '<div class="actions"><button class="btn primary big" type="button" id="resSave">' + tr('Enregistrer dans le carnet') + '</button></div><div class="actions">' +
      (res.type === 'single' ? '<button class="btn" type="button" id="resAgain">' + tr('Encore une série') + '</button>' : '<button class="btn" type="button" id="resAgain">' + tr('Refaire ce WOD') + '</button>') +
      '<button class="btn" type="button" id="resShare">' + tr('Partager') + '</button><button class="btn ghost" type="button" id="resDrop">' + tr('Ne pas enregistrer') + '</button></div>';
    box.innerHTML = h; $('camTitle').textContent = tr('Résultat');
    $('resSave').onclick = function () { state.sessions.unshift(cleanSession(res)); state.sessions = state.sessions.slice(0, 300); save(); closeCam(); state.tab = 'book'; render(); toast(tr('Séance enregistrée dans le carnet.')); window.scrollTo(0, 0); };
    $('resDrop').onclick = function () { closeCam(); };
    $('resShare').onclick = function () { share(res); };
    $('resAgain').onclick = function () {
      var r = res; closeCam();
      if (r.type === 'single') { var x = state.exo; var prev = r.sets.slice(); launch(function () { var s = new SES.Single(env(), { key: r.k, target: r.target, sets: prev.length + 1, rest: x.rest, level: r.level, results: prev }); s.setIndex = prev.length; return s; }, {}); }
      else openWod(r.wod, {});
    };
  }
  async function share(res) {
    var txt = res.type === 'single' ? tr('{e} : {n} reps en {s} (compté avec REPS 💪)', { e: E.EX[res.k].icon + ' ' + tr(E.EX[res.k].short), n: res.total, s: trn(res.sets.length, '{n} série', '{n} séries') + ' (' + res.sets.map(function (s) { return s.n; }).join(' / ') + ')' })
      : tr('🏆 {name} : {score} · {n} reps — compté avec REPS 💪', { name: res.name, score: W.scoreText(res), n: res.total });
    try { if (navigator.share) await navigator.share({ title: 'REPS', text: txt }); else { await navigator.clipboard.writeText(txt); toast(tr('Texte copié : colle-le dans un message.')); } }
    catch (err) { if (err && err.name !== 'AbortError') toast(tr('Partage indisponible sur cet appareil.')); }
  }

  /* ------------------------------------------------------------ démarrage */
  bindEvents(); bindCam(); syncLangButtons(); render();
  window.__reps = { state: function () { return state; }, renderCam: renderCam, showCam: showCam, onDone: onDone, setLanguage: setLanguage, launchWodVideo: function (wod, url) { return launch(function () { return new SES.Wod(env(), { wod: W.normalize(wod), level: state.settings.level }); }, { file: url }); }, launchSingleVideo: function (o, url) { state.exo = Object.assign(state.exo, o); return launch(function () { var x = state.exo; return new SES.Single(env(), { key: x.key, target: x.target, sets: x.sets, rest: x.rest, level: state.settings.level, results: [] }); }, { file: url }); }, ctl: function () { return ctl; } };
  /* En développement local, le service worker n'est activé qu'avec ?sw=1 (sinon il garderait d'anciens fichiers en cache). */
  var devLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw=1/.test(location.search);
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !devLocal) navigator.serviceWorker.register('./sw.js').catch(function () { /* hors-ligne indisponible ici */ });
})();
