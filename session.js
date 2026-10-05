/* REPS - séances : exercice seul (séries + repos) et WOD (ordre imposé ou libre avec détection automatique).
   Un contrôleur reçoit les images de la caméra, fait tourner le moteur de comptage et publie un « état à afficher » (view). */
(function (root) {
  'use strict';
  var E = root.RepEngine, W = root.RepWod, S = root.RepSound;
  var now = function () { return performance.now(); };
  var clock = W.fmtClock;

  function Base(env) {
    this.env = env;                         /* { vision, render(view), onDone(result), settings } */
    this.vision = env.vision; this.settings = env.settings || {};
    this.tracker = typeof E.Tracker === 'function' ? new E.Tracker() : null;
    this.phase = 'framing';                 /* framing -> countdown -> running -> (rest) -> done */
    this.paused = false; this.msg = ''; this.msgSmall = false; this.status = ''; this.warn = false;
    this.framed = false; this.framedSince = 0; this.sigFrame = 0; this.timer = 0; this.lastTick = now();
    this.cdTimer = 0; this.token = 0; this.destroyed = false; this.lastLabel = '';
  }
  Base.prototype.emit = function () { if (!this.destroyed) this.env.render(this.view()); };
  Base.prototype.setStatus = function (t, warn) { this.status = t || ''; this.warn = !!warn; };

  /* Décompte avant un départ (3-2-1) puis rappel. */
  Base.prototype.countdown = function (seconds, then) {
    var self = this, tok = ++this.token, n = seconds; clearInterval(this.cdTimer);
    this.phase = 'countdown'; this.paused = false;
    if (this.tracker) this.tracker.reset();
    if (n <= 0) { this.msg = ''; then(); return; }   /* pas de décompte (vidéo importée) : départ immédiat, une seule fois */
    var tick = function () {
      if (tok !== self.token || self.destroyed) { clearInterval(self.cdTimer); return; }
      if (n <= 0) { clearInterval(self.cdTimer); self.msg = ''; self.msgSmall = false; then(); return; }
      self.msg = String(n); self.msgSmall = false; self.setStatus(self.cdHint(), false);
      S.say(n); S.count(); n--; self.emit();
    };
    tick(); this.cdTimer = setInterval(tick, 1000);
  };
  Base.prototype.cdHint = function () { return this.tracker && this.tracker.others > 0 ? 'Plusieurs personnes : je te suis (squelette rouge), les autres sont ignorées.' : 'Place-toi de profil, corps entier dans le cadre.'; };

  /* Image de la caméra : suivi de la personne, puis traitement propre à la séance. */
  Base.prototype.onFrame = function (d) {
    var tr = this.tracker, poses = d.poses, worlds = d.worlds, aspect = d.aspect, t = d.t, sigs = [], sel = -1;
    var tl = tr && tr.lock, needSig = poses.length > 1 || this.phase !== 'running' || !tr || tr.state !== 'tracked' || !(tl && tl.sig) || ((this.sigFrame = (this.sigFrame || 0) + 1) % 10 === 0);
    if (needSig && this.vision && this.vision.signatures) sigs = this.vision.signatures(poses);
    if (this.phase !== 'running' || this.paused) {
      /* Aperçu : on verrouille la personne la plus grande et on vérifie le cadrage. */
      if (tr) { tr.reset(); sel = tr.lockOn(poses, aspect, sigs, t); } else sel = poses.length ? 0 : -1;
      var frame0 = sel >= 0 ? { img: poses[sel], world: worlds[sel], aspect: aspect } : null;
      this.preview(frame0, t);
      return { sel: sel };
    }
    var u = tr ? tr.update(poses, aspect, sigs, t) : { idx: poses.length ? 0 : -1, state: 'tracked', others: Math.max(0, poses.length - 1) };
    sel = u.idx;
    var frame = sel >= 0 ? { img: poses[sel], world: worlds[sel], aspect: aspect } : null;
    this.process(frame, t, u);
    return { sel: sel };
  };
  /* Aperçu (avant départ, repos) : mesure du cadrage et départ automatique. */
  Base.prototype.preview = function (frame, t) {
    var keys = this.armedKeys(), ok = !!frame && keys.every(function (k) { return E.measure(E.EX[k], frame) != null; });
    var was = this.framed; this.framed = ok;
    if (ok && !was) this.framedSince = t; if (!ok) this.framedSince = 0;
    var missing = !frame ? 'Je ne te vois pas : entre dans le cadre.' : ok ? '' : 'Montre-toi en entier (' + this.needText() + ').';
    if (this.phase === 'framing' || this.phase === 'rest') this.setStatus(ok ? 'Cadrage correct. Tu peux démarrer.' : missing, !ok);
    if (this.phase === 'framing' && ok && this.settings.autoStart && t - this.framedSince > 1500 && !this.autoFired) { this.autoFired = true; this.start(); }
    this.emit();
  };
  Base.prototype.needText = function () {
    var need = {}; this.armedKeys().forEach(function (k) { need[E.EX[k].req || 'body'] = 1; });
    return need.legs ? 'jambes comprises' : need.arms && !need.body ? 'bras et épaules' : 'tête aux pieds';
  };
  Base.prototype.pause = function (on) {
    if (this.phase !== 'running') return; this.paused = on == null ? !this.paused : !!on;
    if (this.vision) this.vision.setPaused(this.paused);
    this.setStatus(this.paused ? 'En pause' : '', false); this.emit();
  };
  Base.prototype.destroy = function () { this.destroyed = true; this.token++; clearInterval(this.cdTimer); clearInterval(this.timer); S.silence(); };
  Base.prototype.sheet = function () { return { frame: { ok: this.framed, show: this.phase === 'framing' || this.phase === 'rest' } }; };

  /* ================================================================ exercice seul */
  function Single(env, o) {
    Base.call(this, env);
    this.key = E.EX[o.key] ? o.key : 'squat'; this.def = E.EX[this.key];
    this.target = Math.max(0, o.target | 0); this.sets = Math.max(1, Math.min(30, o.sets | 0 || 1)); this.rest = Math.max(0, Math.min(600, o.rest | 0));
    this.level = o.level || 'normal'; this.setIndex = 0; this.results = o.results || []; this.t0 = Date.now();
    this.counter = null; this.reps = []; this.elapsed = 0; this.reached = false; this.restLeft = 0; this.partials = 0; this.log = [];
    this.kind = 'single'; this.settings.autoStart = !!(env.settings && env.settings.autoStart);
  }
  Single.prototype = Object.create(Base.prototype);
  Single.prototype.armedKeys = function () { return [this.key]; };
  Single.prototype.start = function () { this.beginSet(this.settings.countdown == null ? 5 : this.settings.countdown); };
  Single.prototype.beginSet = function (cd) {
    var self = this; this.reached = false; this.reps = []; this.elapsed = 0; this.partials = 0; this.log = [];
    this.counter = E.create(this.key, { level: this.level }); this.autoFired = true;
    var go = function () {
      self.phase = 'running'; self.paused = false; self.lastTick = now(); self.msg = ''; self.setStatus('', false);
      S.say('C’est parti'); S.go(); self.counter.reset(); self.startClock(); self.emit();
      if (self.vision) self.vision.begin();
    };
    if (cd > 0) { if (this.vision) this.vision.begin(); this.countdown(cd, go); this.emit(); } else go();
  };
  Single.prototype.startClock = function () {
    var self = this; clearInterval(this.timer); this.lastTick = now();
    this.timer = setInterval(function () {
      var t = now(), dt = t - self.lastTick; self.lastTick = t;
      if (self.phase === 'running' && !self.paused) self.elapsed += dt;
      else if (self.phase === 'rest') {
        self.restLeft -= dt / 1000;
        if (self.restLeft <= 3 && !self.restCounting) { self.restCounting = true; self.beginSet(Math.max(2, Math.ceil(self.restLeft))); return; }
        self.msg = 'Repos ' + Math.max(0, Math.ceil(self.restLeft)); self.msgSmall = false;
      }
      self.emit();
    }, 200);
  };
  Single.prototype.process = function (frame, t, u) {
    var r = this.counter.update(frame, t); r.track = u;
    if (r.rep) { this.reps.push(this.elapsed); if (r.info) { this.log.push(r.info); if (this.log.length > 100) this.log.shift(); } this.onRep(); }
    this.partials = this.counter.machine.partials; this.last = r;
    if (u && (u.state === 'lost' || u.state === 'search')) this.setStatus(u.others > 0 ? 'Je ne te vois plus. Quelqu’un d’autre est dans le cadre : je l’ignore.' : 'Je ne te vois plus : reviens dans le cadre.', true);
    else if (!r.ready) this.setStatus('Montre-toi en entier dans le cadre.', true);
    else if (r.hint) this.setStatus(r.hint, /Amplitude|non détecté/.test(r.hint));
    else this.setStatus(this.def.short + ' · position ' + r.phase + (r.value != null && this.key !== 'burpee' && this.key !== 'row' ? ' · ' + Math.round(r.value) + '°' : '') + (u && u.others > 0 ? ' · autre personne ignorée' : ''), false);
    this.emit();
  };
  Single.prototype.onRep = function () {
    var n = this.counter.count;
    if (this.settings.voice !== false && S.cfg.voice) S.say(n); else S.tick();
    S.vibrate(40);
    if (this.target && n >= this.target && !this.reached) {
      this.reached = true; this.setStatus('Objectif atteint : ' + n + ' reps !', false);
      var self = this, tok = this.token;
      setTimeout(function () { if (tok === self.token && self.phase === 'running') { S.alarm(); S.vibrate([200, 100, 200]); self.finishSet('objectif'); } }, S.cfg.voice ? 1100 : 400);
    }
  };
  Single.prototype.adjust = function (d) { if (this.counter) { this.counter.adjust(d); this.emit(); } };
  Single.prototype.zero = function () { if (this.counter) { this.counter.reset(); this.reached = false; this.reps = []; this.emit(); } };
  /* Fin de la série en cours (bouton, objectif atteint). */
  Single.prototype.finishSet = function (reason) {
    if (this.phase !== 'running') return;
    var n = this.counter ? this.counter.count : 0, sec = Math.round(this.elapsed / 1000);
    this.results.push({ n: n, sec: sec, target: this.target, reps: this.reps.slice(), partials: this.partials, reason: reason || 'manuel', amp: this.amp() });
    this.token++; clearInterval(this.timer);
    S.say(n + ' répétition' + (n > 1 ? 's' : ''));
    this.setIndex++;
    if (this.setIndex >= this.sets) { this.finish(); return; }
    this.phase = 'rest'; this.restLeft = this.rest; this.restCounting = false; this.framed = false; this.autoFired = true;
    this.setStatus('Série ' + this.setIndex + '/' + this.sets + ' terminée : ' + n + ' reps.', false);
    var self = this;
    this.startClock(); this.emit();
    if (this.rest <= 3) { this.restCounting = true; self.beginSet(Math.max(2, this.rest || 3)); }
  };
  Single.prototype.amp = function () {
    var l = this.log; if (!l.length) return null;
    return { lo: l.reduce(function (s, x) { return s + x.min; }, 0) / l.length, hi: l.reduce(function (s, x) { return s + x.max; }, 0) / l.length };
  };
  Single.prototype.skipRest = function () { if (this.phase === 'rest') this.restLeft = Math.min(this.restLeft, 3); };
  Single.prototype.addRest = function (s) { if (this.phase === 'rest') { this.restLeft += s; this.restCounting = false; } };
  Single.prototype.finish = function () {
    clearInterval(this.timer); this.token++; this.phase = 'done';
    var tot = this.results.reduce(function (s, r) { return s + r.n; }, 0), sec = this.results.reduce(function (s, r) { return s + r.sec; }, 0);
    this.result = { type: 'single', t: Date.now(), k: this.key, level: this.level, sets: this.results, total: tot, sec: sec, target: this.target };
    if (this.vision) this.vision.stop(); this.emit(); this.env.onDone(this.result);
  };
  Single.prototype.end = function () {   /* bouton « Terminer » */
    if (this.phase === 'running') { if (this.counter && this.counter.count === 0) { if (this.results.length) this.finish(); else this.env.onDone(null); return; } this.finishSet('manuel'); }
    else if (this.phase === 'rest' || this.phase === 'countdown' || this.phase === 'framing') { if (this.results.length) this.finish(); else this.env.onDone(null); }
  };
  Single.prototype.view = function () {
    var c = this.counter ? this.counter.count : 0, r = this.last, setTxt = this.sets > 1 ? 'Série ' + Math.min(this.setIndex + 1, this.sets) + '/' + this.sets + ' · ' : '';
    var tempo = '', now2 = '';
    if (this.reps.length >= 2) { var gaps = []; for (var i = 1; i < this.reps.length; i++) gaps.push((this.reps[i] - this.reps[i - 1]) / 1000); var avg = gaps.reduce(function (s, x) { return s + x; }, 0) / gaps.length; tempo = 'moy. ' + avg.toFixed(1).replace('.', ',') + ' s / rep'; }
    if (this.phase === 'running') now2 = clock(this.elapsed / 1000);
    var hud = null;
    if (this.sets > 1 || this.phase === 'rest') hud = { title: setTxt + this.def.short, clock: this.phase === 'rest' ? clock(Math.max(0, this.restLeft)) : clock(this.elapsed / 1000), sub: this.phase === 'rest' ? 'Repos · prochaine série : ' + (this.setIndex + 1) + '/' + this.sets + (this.target ? ' · ' + this.target + ' reps' : '') : (this.target ? 'Objectif : ' + this.target + ' reps' : 'Série libre : touche « Terminer » quand tu as fini'), pct: this.phase === 'rest' ? 0 : this.target ? c / this.target : 0 };
    return { kind: 'single', phase: this.phase, title: this.def.icon + ' ' + this.def.label, count: c, target: this.target, now: now2, tempo: tempo, status: this.status, warn: this.warn, msg: this.msg, msgSmall: this.msgSmall, hud: hud, chips: null, paused: this.paused, frame: this.sheet().frame, track: r && r.track, diag: this.diag(), key: this.key };
  };
  Single.prototype.diag = function () {
    var r = this.last, m = this.counter && this.counter.machine; if (!m) return '';
    var u = this.key === 'burpee' || this.key === 'row' ? '' : '°';
    return ['Mesure : ' + (r && r.value != null ? Math.round(r.value * 10) / 10 + u : '—'), 'Seuils : bas ≤ ' + m.low + u + ' · haut ≥ ' + m.high + u, 'État : ' + m.state + ' · corps ' + (r && r.ready ? 'exploitable' : 'non exploitable'),
      'Détection : ' + (this.vision ? this.vision.delegate() + ' · ' + Math.round(this.vision.fps || 0) + ' images/s' : '—'), 'Reps : ' + m.count + ' · partielles ' + m.partials].join('\n');
  };

  /* ================================================================ WOD */
  function Wod(env, o) {
    Base.call(this, env);
    this.kind = 'wod'; this.wod = W.normalize(o.wod); this.level = o.level || 'normal';
    this.free = this.wod.order === 'free'; this.stepIndex = 0; this.stepCount = 0; this.tallies = {}; this.elapsed = 0; this.finished = false;
    this.intervals = []; this.intervalTally = {}; this.subIndex = 0; this.workLeft = 0; this.restLeft = 0; this.sub = 'work'; this.roundRest = 0; this.t0 = Date.now();
    this.counter = null; this.multi = null; this.last = null; this.current = null; this.moveTimes = [];
    this.wod.moves.forEach(function (m) { this.tallies[m.k] = 0; }, this);
  }
  Wod.prototype = Object.create(Base.prototype);
  Wod.prototype.step = function () { return W.stepAt(this.wod, this.stepIndex); };
  Wod.prototype.intervalMoves = function () {
    var w = this.wod, s = this.step(); if (!s) return [];
    return s.all ? s.moves : [{ k: s.k, n: s.n, target: s.target }];
  };
  Wod.prototype.armedKeys = function () {
    var w = this.wod, keys = [];
    if (this.free && w.format !== 'interval') w.moves.forEach(function (m) { if (keys.indexOf(m.k) < 0) keys.push(m.k); });
    else if (w.format === 'interval') { var list = this.intervalMoves(); if (this.free) list.forEach(function (m) { if (keys.indexOf(m.k) < 0) keys.push(m.k); }); else if (list.length) keys.push(list[Math.min(this.subIndex, list.length - 1)].k); }
    else { var s = this.step() || { k: w.moves[0].k }; keys.push(s.k); }
    return keys.length ? keys : [w.moves[0].k];
  };
  /* Prépare le moteur de comptage selon l'étape (ordre imposé) ou l'ensemble des exercices (ordre libre). */
  Wod.prototype.arm = function () {
    var keys = this.armedKeys(), self = this;
    if (this.free && keys.length > 1) { this.multi = E.createMulti(keys, { level: this.level }); this.counter = null; }
    else { this.multi = null; this.counter = E.create(keys[0], { level: this.level }); }
    this.currentKeys = keys; this.stepCount = 0; this.autoFired = true;
    if (this.tracker) { /* le verrouillage sur la personne est conservé d'une étape à l'autre */ }
  };
  Wod.prototype.start = function () {
    var w = this.wod, self = this;
    this.stepIndex = 0; this.elapsed = 0; this.finished = false; this.arm();
    this.countdown(this.settings.countdown == null ? 5 : this.settings.countdown, function () { self.go(); });
    if (this.vision) this.vision.begin(); this.emit();
  };
  Wod.prototype.go = function () {
    var self = this, w = this.wod;
    this.phase = 'running'; this.paused = false; this.msg = ''; this.setStatus('', false); this.arm();
    this.lastTick = now(); S.go(); S.vibrate(80);
    var s = this.step();
    if (w.format === 'interval') { this.workLeft = w.work; this.sub = 'work'; this.subIndex = 0; this.intervalTally = {}; this.announceInterval(); }
    else S.say(this.announceStep(s));
    this.timer = setInterval(function () { self.tick(); }, 200); this.emit();
  };
  Wod.prototype.announceStep = function (s) { if (!s) return ''; var lab = W.label({ k: s.k, n: s.n }); return (this.free ? 'C’est parti' : (s.target ? s.target + ' ' : '') + lab); };
  Wod.prototype.announceInterval = function () {
    var s = this.step(); if (!s) return;
    var list = s.all ? s.moves : [s], txt = list.map(function (m) { return (m.target ? m.target + ' ' : '') + W.label({ k: m.k, n: m.n }); }).join(', ');
    S.say((this.stepIndex + 1) + ' sur ' + this.wod.rounds + ' : ' + txt);
  };
  Wod.prototype.tick = function () {
    var t = now(), dt = t - this.lastTick, w = this.wod; this.lastTick = t;
    if (this.phase === 'running' && !this.paused) {
      this.elapsed += dt;
      if (w.format === 'amrap' && this.elapsed >= w.cap * 1000) { this.endWod(false); return; }
      if (w.format === 'time' && w.cap && this.elapsed >= w.cap * 1000) { this.endWod(false); return; }
      if (w.format === 'interval') {
        if (this.sub === 'work') { this.workLeft -= dt / 1000; if (this.workLeft <= 0) this.endInterval(); else if (this.workLeft <= 3.2 && Math.abs(this.workLeft - Math.round(this.workLeft)) < .11 && Math.ceil(this.workLeft) !== this.lastBeep) { this.lastBeep = Math.ceil(this.workLeft); S.count(); } }
        else { this.restLeft -= dt / 1000; this.msg = 'Repos ' + Math.max(0, Math.ceil(this.restLeft)); this.msgSmall = false; if (this.restLeft <= 0) this.nextInterval(); }
      }
      if (w.format === 'time' && this.roundRest > 0) { this.roundRest -= dt / 1000; this.msg = 'Repos ' + Math.max(0, Math.ceil(this.roundRest)); if (this.roundRest <= 0) { this.msg = ''; S.go(); S.say(this.announceStep(this.step())); } }
    }
    this.emit();
  };
  /* Image analysée pendant le WOD. */
  Wod.prototype.process = function (frame, t, u) {
    var w = this.wod; if (this.sub === 'rest' || this.roundRest > 0) { this.last = { track: u, ready: !!frame }; this.emit(); return; }
    var events = [], r;
    if (this.multi) { r = this.multi.update(frame, t); events = r.events; this.current = r.current; }
    else { r = this.counter.update(frame, t); if (r.rep) events = [{ k: this.currentKeys[0] }]; this.current = this.currentKeys[0]; }
    r.track = u; this.last = r;
    for (var i = 0; i < events.length; i++) this.onRep(events[i].k);
    if (u && (u.state === 'lost' || u.state === 'search')) this.setStatus(u.others > 0 ? 'Je ne te vois plus. Quelqu’un d’autre est dans le cadre : je l’ignore.' : 'Je ne te vois plus : reviens dans le cadre.', true);
    else if (!r.ready) this.setStatus('Montre-toi en entier dans le cadre.', true);
    else if (this.multi) this.setStatus(this.current ? 'Détecté : ' + E.EX[this.current].short : 'Mouvement non reconnu : continue, je regarde.', false);
    else this.setStatus(r.hint || (E.EX[this.currentKeys[0]].short + ' · position ' + r.phase), !!r.hint && /Amplitude|non détecté/.test(r.hint));
    this.emit();
  };
  Wod.prototype.onRep = function (k) {
    var w = this.wod; this.tallies[k] = (this.tallies[k] || 0) + 1; this.intervalTally[k] = (this.intervalTally[k] || 0) + 1; this.stepCount++;
    var n = this.free ? this.tallies[k] : this.stepCount;
    if (S.cfg.voice) S.say(n); else S.tick(); S.vibrate(40);
    if (this.free) { this.checkFree(); return; }
    var s = this.step(); if (!s) return;
    if (w.format === 'interval') { this.nextSubMove(); this.checkIntervalDone(); return; }
    if (s.target && this.stepCount >= s.target) this.advance();
  };
  /* Intervalle avec plusieurs exercices en ordre imposé : on passe à l'exercice suivant de l'intervalle quand l'objectif est atteint. */
  Wod.prototype.nextSubMove = function () {
    if (this.free) return;
    var list = this.intervalMoves(), m = list[this.subIndex];
    if (m && m.target && this.stepCount >= m.target && this.subIndex < list.length - 1) {
      this.subIndex++; this.arm(); S.alarm();
      var nx = list[this.subIndex]; this.setStatus('Suivant : ' + (nx.target ? nx.target + ' ' : '') + W.label(nx), false);
    }
  };
  /* Ordre imposé : exercice suivant. */
  Wod.prototype.advance = function () {
    var w = this.wod, s = this.step(), lastOfRound = s.mi === w.moves.length - 1;
    this.moveTimes.push({ k: s.k, round: s.round, sec: Math.round(this.elapsed / 1000), n: this.stepCount });
    this.stepIndex++; var nxt = this.step();
    if (!nxt) { this.endWod(true); return; }
    S.alarm(); S.vibrate([120, 60, 120]);
    var self = this;
    if (lastOfRound && w.format === 'time' && w.restRound > 0) { this.roundRest = w.restRound; this.arm(); S.say('Tour terminé. Repos ' + W.fmtDur(w.restRound)); this.emit(); return; }
    this.arm();
    setTimeout(function () { if (!self.destroyed && self.phase === 'running') S.say('Suivant : ' + self.announceStep(nxt)); }, S.cfg.voice ? 700 : 0);
    this.setStatus('Suivant : ' + (nxt.target ? nxt.target + ' ' : '') + W.label({ k: nxt.k, n: nxt.n }), false);
  };
  /* Ordre libre : tout est suivi par exercice ; le WOD se termine quand tous les totaux sont atteints. */
  Wod.prototype.checkFree = function () {
    var w = this.wod;
    if (w.format === 'time') { var p = W.freeProgress(w, this.tallies); if (p.done) this.endWod(true); }
    if (w.format === 'interval') this.checkIntervalDone();
  };
  Wod.prototype.checkIntervalDone = function () {
    if (this.sub !== 'work') return;
    var s = this.step(), list = this.intervalMoves(), self = this;
    var ok = list.every(function (m) { return !m.target || (self.intervalTally[m.k] || 0) >= m.target; }) && list.some(function (m) { return m.target; });
    if (ok && !this.intervalOk) { this.intervalOk = true; S.alarm(); this.setStatus('Intervalle réussi ! Repos jusqu’au prochain départ.', false); }
  };
  Wod.prototype.endInterval = function () {
    var s = this.step(), list = this.intervalMoves(), self = this, w = this.wod;
    var ok = list.every(function (m) { return !m.target || (self.intervalTally[m.k] || 0) >= m.target; }) && list.some(function (m) { return m.target; });
    this.intervals.push({ i: this.stepIndex, moves: list.map(function (m) { return { k: m.k, target: m.target, n: self.intervalTally[m.k] || 0 }; }), ok: ok });
    if (this.stepIndex + 1 >= w.rounds) { this.endWod(true); return; }
    if (w.rest > 0) { this.sub = 'rest'; this.restLeft = w.rest; S.alarm(); S.say('Repos'); this.arm(); }
    else this.nextInterval();
  };
  Wod.prototype.nextInterval = function () {
    this.stepIndex++; this.sub = 'work'; this.subIndex = 0; this.workLeft = this.wod.work; this.intervalTally = {}; this.intervalOk = false; this.msg = ''; this.lastBeep = 0;
    this.arm(); S.go(); this.announceInterval(); this.setStatus('', false);
  };
  Wod.prototype.adjust = function (d) {
    var k = this.current || this.currentKeys[0]; if (!k) return;
    if (this.free || !this.counter) { this.tallies[k] = Math.max(0, (this.tallies[k] || 0) + d); this.intervalTally[k] = Math.max(0, (this.intervalTally[k] || 0) + d); if (this.free && d > 0) this.checkFree(); }
    else { this.counter.adjust(d); this.tallies[k] = Math.max(0, (this.tallies[k] || 0) + d); this.intervalTally[k] = Math.max(0, (this.intervalTally[k] || 0) + d); this.stepCount = this.counter.count; var s = this.step(); if (this.wod.format === 'interval') this.nextSubMove(); else if (s && s.target && this.stepCount >= s.target) this.advance(); }
    this.emit();
  };
  /* Passer à l'exercice suivant sans atteindre l'objectif (ordre imposé). */
  Wod.prototype.skip = function () { if (this.phase === 'running' && !this.free && this.wod.format !== 'interval') this.advance(); };
  Wod.prototype.zero = function () { if (this.counter) this.counter.reset(); this.stepCount = 0; this.emit(); };
  Wod.prototype.endWod = function (finished) {
    if (this.phase === 'done') return;
    clearInterval(this.timer); this.token++; this.phase = 'done'; this.finished = !!finished;
    S.alarm(); S.vibrate([300, 120, 300]);
    var w = this.wod, rounds = 0, extra = 0;
    if (w.format === 'amrap') {
      if (this.free) { var p = W.freeProgress(w, this.tallies); rounds = p.roundsDone; extra = p.extra; }
      else { var n = w.moves.length; rounds = Math.floor(this.stepIndex / n); for (var i = rounds * n; i < this.stepIndex; i++) extra += W.targetFor(w, Math.floor(i / n), w.moves[i % n]); extra += this.stepCount; }
    } else if (w.format === 'time') rounds = this.free ? W.freeProgress(w, this.tallies).roundsDone : Math.floor(this.stepIndex / w.moves.length);
    var ok = this.intervals.filter(function (x) { return x.ok; }).length;
    this.result = { type: 'wod', t: Date.now(), name: w.name || 'WOD', format: w.format, order: w.order, wod: w, sec: Math.round(this.elapsed / 1000), finished: !!finished, tallies: this.tallies, total: W.totalOf(this.tallies), rounds: rounds, extra: extra, intervals: this.intervals, okIntervals: ok, moveTimes: this.moveTimes };
    S.say(W.scoreText(this.result)); if (this.vision) this.vision.stop(); this.emit(); this.env.onDone(this.result);
  };
  Wod.prototype.end = function () { if (this.phase === 'running' || this.phase === 'countdown' || this.phase === 'framing') { if (this.phase === 'running') this.endWod(false); else this.env.onDone(null); } };
  Wod.prototype.view = function () {
    var w = this.wod, s = this.step(), self = this, hud = { title: (w.name ? w.name + ' · ' : '') + W.FORMATS[w.format].split(' (')[0], clock: '', sub: '', pct: 0 }, chips = [];
    var cur = this.free || !s ? null : s.k;
    var req = w.format === 'time' ? W.requiredTotals(w) : {};
    if (w.format === 'interval') {
      var list = this.intervalMoves(), left = Math.max(0, Math.ceil(this.sub === 'work' ? this.workLeft : this.restLeft));
      hud.clock = clock(left); hud.title = 'Intervalle ' + Math.min(this.stepIndex + 1, w.rounds) + '/' + w.rounds; hud.sub = this.sub === 'work' ? (this.intervalOk ? 'Réussi ✓ · repos jusqu’au prochain départ' : 'Effort : ' + W.describe({ format: 'interval', moves: list.map(function (m) { return { k: m.k, reps: m.target, n: m.n }; }), work: w.work, rest: 0, rounds: 1, each: 'all' }).replace(/^.*? · /, '').replace(/ \(tous.*$/, '')) : 'Repos';
      hud.pct = this.sub === 'work' ? 1 - Math.max(0, this.workLeft) / w.work : 1 - Math.max(0, this.restLeft) / Math.max(1, w.rest);
      list.forEach(function (m) { var n = self.intervalTally[m.k] || 0; chips.push({ k: m.k, icon: E.EX[m.k].icon, label: W.label(m), n: n, of: m.target || 0, active: self.free ? (self.current ? self.current === m.k : true) : list[Math.min(self.subIndex, list.length - 1)].k === m.k, done: !!m.target && n >= m.target }); });
    } else {
      var seen = {};
      w.moves.forEach(function (m) { if (seen[m.k]) return; seen[m.k] = 1; var n = self.tallies[m.k] || 0, of = w.format === 'time' ? req[m.k] : 0; chips.push({ k: m.k, icon: E.EX[m.k].icon, label: W.label(m), n: n, of: of, active: self.free ? self.current === m.k : cur === m.k, done: !!of && n >= of }); });
      if (w.format === 'amrap') {
        var rd, ex; if (this.free) { var p = W.freeProgress(w, this.tallies); rd = p.roundsDone; ex = p.extra; } else { var nn = w.moves.length; rd = Math.floor(this.stepIndex / nn); ex = 0; for (var i = rd * nn; i < this.stepIndex; i++) ex += W.targetFor(w, Math.floor(i / nn), w.moves[i % nn]); ex += this.stepCount; }
        hud.clock = clock(Math.max(0, w.cap - this.elapsed / 1000)); hud.sub = rd + ' tour' + (rd > 1 ? 's' : '') + ' + ' + ex + ' rep' + (ex > 1 ? 's' : '') + (!this.free && s ? ' · ' + (s.target ? s.target + ' ' : '') + W.label({ k: s.k, n: s.n }) : ''); hud.pct = Math.min(1, this.elapsed / (w.cap * 1000));
      } else {
        var p2 = this.free ? W.freeProgress(w, this.tallies) : null, rdone = this.free ? p2.roundsDone : Math.floor(this.stepIndex / w.moves.length);
        var totalReq = 0, doneReq = 0; for (var kk in req) { totalReq += req[kk]; doneReq += Math.min(req[kk], this.tallies[kk] || 0); }
        hud.clock = clock(this.elapsed / 1000); hud.pct = totalReq ? doneReq / totalReq : 0;
        hud.sub = (w.rounds > 1 ? 'Tour ' + Math.min(rdone + 1, w.rounds) + '/' + w.rounds : 'Tour 1') + (!this.free && s ? ' · ' + (s.target ? s.target + ' ' : '') + W.label({ k: s.k, n: s.n }) : ' · ordre libre') + (w.cap ? ' · cap ' + W.fmtDur(w.cap) : '');
      }
    }
    var count = this.free ? (this.current ? this.tallies[this.current] || 0 : W.totalOf(this.tallies)) : (w.format === 'interval' && !s ? 0 : this.stepCount);
    var target = !this.free && s && !s.all && s.target ? s.target : 0;
    var title = this.free ? '🏆 ' + (w.name || 'WOD') + ' · libre' : (s ? (s.all ? '🏆 ' + (w.name || 'WOD') : E.EX[s.k].icon + ' ' + W.label({ k: s.k, n: s.n })) : '🏆 ' + (w.name || 'WOD'));
    return { kind: 'wod', phase: this.phase, title: title, count: count, target: target, now: this.phase === 'running' ? clock(this.elapsed / 1000) : '', tempo: this.free && this.current ? E.EX[this.current].short : '', status: this.status, warn: this.warn, msg: this.msg, msgSmall: this.msgSmall, hud: hud, chips: chips, paused: this.paused, frame: this.sheet().frame, track: this.last && this.last.track, diag: '', free: this.free, canSkip: !this.free && w.format !== 'interval' };
  };

  root.RepSession = { Single: Single, Wod: Wod };
})(window);
