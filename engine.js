/* REPS - moteur de comptage de répétitions (issu du compteur de ROAD TO GI, devenu autonome).
   Logique pure : points du corps (MediaPipe Pose, 33 points) -> angles -> répétitions.
   Aucune image n'est stockée ni envoyée : ce fichier ne manipule que des coordonnées. */
(function (root) {
  'use strict';

  var IDX = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28 };
  var MIN_VIS = 0.45;

  /* Définition de chaque exercice : angle mesuré, seuils (en degrés), et règle de comptage.
     low  = position « basse » (angle fermé), high = position « haute » (angle ouvert).
     countOn 'return' : la répétition compte au retour en position de départ (squat, pompe, traction).
     countOn 'peak'   : la répétition compte à l'arrivée en haut (développé, épaulé). */
  var EX = {
    squat:    { label: 'Squats',            metric: 'knee',  agg: 'mean', low: 105, high: 150, minRepMs: 700,  tip: 'Place le téléphone de profil ou de trois-quarts, corps entier visible. Descends cuisses à l’horizontale.' },
    lunge:    { label: 'Fentes',            metric: 'knee',  agg: 'min',  low: 108, high: 140, minRepMs: 700,  tip: 'Téléphone de profil, corps entier visible. Chaque fente (un côté) compte pour 1.' },
    pushup:   { label: 'Pompes',            metric: 'elbow', agg: 'mean', low: 100, high: 140, minRepMs: 500,  gate: 'horizontal', tip: 'Téléphone au sol, de profil, à 2 m. Corps entier visible. Descends poitrine près du sol.' },
    pullup:   { label: 'Tractions',         metric: 'elbow', agg: 'mean', low: 105, high: 140, minRepMs: 900,  gate: 'handsUp', tip: 'Face à la caméra ou de profil, de la tête aux hanches visible. Pars bras tendus, menton au-dessus de la barre.' },
    dips:     { label: 'Dips',              metric: 'elbow', agg: 'mean', low: 105, high: 140, minRepMs: 700,  gate: 'handsDown', tip: 'Téléphone de profil, tronc et bras visibles. Descends coudes à 90°.' },
    situp:    { label: 'Sit ups / V ups',   metric: 'hip',   agg: 'mean', low: 80,  high: 105, minRepMs: 600,  tip: 'Téléphone de profil, au niveau du sol, corps entier visible. Allonge-toi puis relève le buste.' },
    hinge:    { label: 'Soulevés / swings', metric: 'hip',   agg: 'mean', low: 120, high: 152, minRepMs: 600,  countOn: 'peak', tip: 'Téléphone de profil, corps entier visible. La répétition compte quand tu te redresses, hanches ouvertes.' },
    press:    { label: 'Développés / épaulés', metric: 'press', agg: 'mean', low: 105, high: 145, minRepMs: 700, countOn: 'peak', tip: 'Téléphone de face ou de profil, tête et bras visibles. La répétition compte bras tendus au-dessus de la tête.' },
    hangRaise:{ label: 'Toes / knees to bar', metric: 'hip', agg: 'mean', low: 100, high: 145, minRepMs: 700, gate: 'handsUp', tip: 'Téléphone de profil, corps entier visible. Pars suspendu, jambes tendues.' },
    bench:    { label: 'Développés couchés / inclinés', metric: 'elbow', agg: 'mean', low: 105, high: 140, minRepMs: 800, countOn: 'peak', gate: 'reclined', tip: 'Téléphone de profil (ou côté pieds), bras et épaules visibles. La répétition compte bras tendus en haut.' },
    row:      { label: 'Tirages / rowing',  metric: 'pull',  agg: 'mean', low: 80,  high: 115, minRepMs: 700,  countOn: 'peak', tip: 'Téléphone de profil, bras et buste visibles. La répétition compte quand la barre ou la poignée arrive au corps.' },
    legpress: { label: 'Presse à cuisses',  metric: 'knee',  agg: 'mean', low: 105, high: 150, minRepMs: 800,  tip: 'Téléphone de profil, jambes visibles. Descends jusqu’à environ 90° aux genoux.' },
    burpee:   { label: 'Burpees',           metric: 'burpee', agg: 'mean', low: 0.55, high: 1.15, minRepMs: 1500, tip: 'Téléphone de profil, à 2,5 m, corps entier visible y compris au sol.' }
  };

  /* Habillage : pictogramme, nom court et parties du corps qui doivent être visibles (cadrage). */
  var META = {
    squat:    { icon: '🦵', short: 'Squats',      req: 'legs'  },
    lunge:    { icon: '🚶', short: 'Fentes',      req: 'legs'  },
    pushup:   { icon: '💪', short: 'Pompes',      req: 'body'  },
    pullup:   { icon: '🧗', short: 'Tractions',   req: 'arms'  },
    dips:     { icon: '🤸', short: 'Dips',        req: 'arms'  },
    situp:    { icon: '🧘', short: 'Sit-ups',     req: 'body'  },
    hinge:    { icon: '🏋️', short: 'Soulevés',    req: 'body'  },
    press:    { icon: '🙌', short: 'Développés',  req: 'arms'  },
    hangRaise:{ icon: '🪝', short: 'Toes to bar', req: 'body'  },
    bench:    { icon: '🛋️', short: 'Couchés',     req: 'arms'  },
    row:      { icon: '🚣', short: 'Tirages',     req: 'arms'  },
    legpress: { icon: '🦿', short: 'Presse',      req: 'legs'  },
    burpee:   { icon: '🔥', short: 'Burpees',     req: 'body'  }
  };
  Object.keys(META).forEach(function (k) { for (var f in META[k]) EX[k][f] = META[k][f]; EX[k].key = k; });
  var GROUPS = { squat: 'Jambes', lunge: 'Jambes', pushup: 'Poussée · pectoraux', pullup: 'Tirage · dos', dips: 'Poussée · triceps', situp: 'Abdominaux', hinge: 'Hanches · chaîne arrière', press: 'Épaules', hangRaise: 'Abdos · en suspension', bench: 'Pectoraux · au banc', row: 'Dos · tirage', legpress: 'Jambes · à la machine', burpee: 'Corps entier' };
  Object.keys(GROUPS).forEach(function (k) { EX[k].group = GROUPS[k]; });

  /* Niveaux de sensibilité : souple (accepte moins d’amplitude), normal, strict. */
  var LEVELS = { souple: { low: 12, high: -8 }, normal: { low: 0, high: 0 }, strict: { low: -10, high: 5 } };

  /* Reconnaissance de l’exercice à partir du texte d’une consigne (« 15 Tractions », « Thrusters avec un disque »...). */
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var RULES = [
    ['burpee',    /burpee|navy ?seal/],
    ['hangRaise', /toes?[- ]?to[- ]?bar|knees?[- ]?to[- ]?elbow|\bt2b\b|\bk2e\b/],
    ['lunge',     /fentes?|lunges?/],
    ['pullup',    /traction(?!s? horizontale)|pull[- ]?ups?/],
    ['dips',      /\bdips?\b/],
    ['pushup',    /\bpompes?\b|push[- ]?ups?/],
    ['press',     /(shoulders?|military|overhead|push) ?press|developpe (devant|militaire|epaules)|ground to overhead|\bgto\b|\bgao\b/],
    ['bench',     /developpe (couche|incline|decline)|bench|incline press|decline press/],
    ['row',       /tirage|bent[- ]?over row|pendlay|rowing|\brow\b|t[- ]?bar/],
    ['legpress',  /\bpresse\b|leg ?press/],
    ['squat',     /squat|thruster|wall ?balls?|air squat/],
    ['hinge',     /swing|deadlift|souleve de terre/],
    ['situp',     /sit[- ]?ups?|\bv[- ]?ups?\b|crunch/]
  ];
  function detect(text) {
    var t = norm(text);
    for (var i = 0; i < RULES.length; i++) if (RULES[i][1].test(t)) return RULES[i][0];
    return null;
  }
  /* Nombre de répétitions visé, lu au début de la consigne (« 15 Tractions »). */
  function targetFrom(text) {
    var m = String(text || '').match(/^\s*(\d{1,3})\b(?!\s*['’"”’]|\s*(?:min|s)\b)/);
    return m ? Number(m[1]) : 0;
  }

  /* ---------- géométrie ---------- */
  function pt(frame, i) {
    var w = frame.world && frame.world[i];
    if (w) return { x: w.x, y: w.y, z: w.z || 0 };
    var p = frame.img[i], a = frame.aspect || 1;
    return { x: p.x * a, y: p.y, z: (p.z || 0) * a };
  }
  function visOf(frame, i) { var p = frame.img[i]; return p && typeof p.visibility === 'number' ? p.visibility : 1; }
  function angle3(a, b, c) {
    var ux = a.x - b.x, uy = a.y - b.y, uz = a.z - b.z, vx = c.x - b.x, vy = c.y - b.y, vz = c.z - b.z;
    var nu = Math.sqrt(ux * ux + uy * uy + uz * uz), nv = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (nu < 1e-6 || nv < 1e-6) return null;
    var c2 = (ux * vx + uy * vy + uz * vz) / (nu * nv);
    return Math.acos(Math.max(-1, Math.min(1, c2))) * 180 / Math.PI;
  }
  function sideAngles(frame, a, b, c) {
    var out = [], sides = [[a[0], b[0], c[0]], [a[1], b[1], c[1]]];
    for (var s = 0; s < 2; s++) {
      var t = sides[s];
      if (Math.min(visOf(frame, t[0]), visOf(frame, t[1]), visOf(frame, t[2])) < MIN_VIS) continue;
      var v = angle3(pt(frame, t[0]), pt(frame, t[1]), pt(frame, t[2]));
      if (v != null) out.push(v);
    }
    return out;
  }
  function agg(list, mode) {
    if (!list.length) return null;
    if (mode === 'min') return Math.min.apply(null, list);
    var s = 0; for (var i = 0; i < list.length; i++) s += list[i];
    return s / list.length;
  }
  function avg3(frame, ids) { var x = 0, y = 0, z = 0; ids.forEach(function (i) { var p = pt(frame, i); x += p.x; y += p.y; z += p.z; }); return { x: x / ids.length, y: y / ids.length, z: z / ids.length }; }
  function meanY(frame, ids) { var s = 0, n = 0; ids.forEach(function (i) { if (visOf(frame, i) >= MIN_VIS) { s += frame.img[i].y; n++; } }); return n ? s / n : null; }
  function meanPt(frame, ids) { var x = 0, y = 0, n = 0; ids.forEach(function (i) { if (visOf(frame, i) >= MIN_VIS) { x += frame.img[i].x; y += frame.img[i].y; n++; } }); return n ? { x: x / n, y: y / n } : null; }

  /* Portes : on ne mesure que si la posture correspond à l’exercice (évite les faux comptages). */
  function gateOk(def, frame) {
    if (!def.gate) return true;
    var sh = meanY(frame, [IDX.lSh, IDX.rSh]), wr = meanY(frame, [IDX.lWr, IDX.rWr]), hip = meanY(frame, [IDX.lHip, IDX.rHip]);
    if (def.gate === 'handsUp') return sh != null && wr != null && wr < sh + 0.08;
    if (def.gate === 'handsDown') return sh != null && wr != null && wr > sh;
    if (def.gate === 'horizontal' || def.gate === 'reclined') {
      /* Corps allongé : l'axe épaules -> hanches (ou, à défaut, épaules -> chevilles) doit être proche de l'horizontale. */
      var far = [[IDX.lHip, IDX.rHip], [IDX.lKn, IDX.rKn], [IDX.lAn, IDX.rAn]];
      var sIds = [IDX.lSh, IDX.rSh];
      var sv = sIds.filter(function (i) { return visOf(frame, i) >= MIN_VIS; });
      if (!sv.length) return false;
      for (var k = 0; k < far.length; k++) {
        var fv = far[k].filter(function (i) { return visOf(frame, i) >= MIN_VIS; });
        if (!fv.length) continue;
        var A = avg3(frame, sv), B = avg3(frame, fv);
        var dy = Math.abs(A.y - B.y), len = Math.sqrt(Math.pow(A.x - B.x, 2) + dy * dy + Math.pow(A.z - B.z, 2));
        return len > 1e-6 && dy / len < (def.gate === 'reclined' ? 0.87 : 0.6);
      }
      return false;
    }
    return true;
  }

  /* Valeur mesurée pour une image : un angle en degrés (ou un indice pour le burpee). */
  function measure(def, frame) {
    if (!gateOk(def, frame)) return null;
    var L = IDX;
    switch (def.metric) {
      case 'knee':  return agg(sideAngles(frame, [L.lHip, L.rHip], [L.lKn, L.rKn], [L.lAn, L.rAn]), def.agg);
      case 'elbow': return agg(sideAngles(frame, [L.lSh, L.rSh], [L.lEl, L.rEl], [L.lWr, L.rWr]), def.agg);
      case 'hip':   return agg(sideAngles(frame, [L.lSh, L.rSh], [L.lHip, L.rHip], [L.lKn, L.rKn]), def.agg);
      case 'press': {
        var e = agg(sideAngles(frame, [L.lSh, L.rSh], [L.lEl, L.rEl], [L.lWr, L.rWr]), 'mean');
        if (e == null) return null;
        var nose = visOf(frame, L.nose) >= MIN_VIS ? frame.img[L.nose].y : meanY(frame, [L.lSh, L.rSh]);
        var wr = meanY(frame, [L.lWr, L.rWr]);
        if (nose == null || wr == null) return null;
        return wr < nose ? e : Math.min(e, def.low - 5); /* bras tendus mais sous la tête : pas un développé */
      }
      case 'pull': {
        var sides = [[L.lWr, L.lSh, L.lHip], [L.rWr, L.rSh, L.rHip]], sum = 0, cnt = 0, asp = frame.aspect || 1;
        sides.forEach(function (t) {
          if (Math.min(visOf(frame, t[0]), visOf(frame, t[1]), visOf(frame, t[2])) < MIN_VIS) return;
          var w = frame.img[t[0]], s = frame.img[t[1]], hp = frame.img[t[2]];
          var arm = Math.sqrt(Math.pow((w.x - s.x) * asp, 2) + Math.pow(w.y - s.y, 2)), tor = Math.sqrt(Math.pow((s.x - hp.x) * asp, 2) + Math.pow(s.y - hp.y, 2));
          if (tor < 0.02) return; sum += arm / tor; cnt++;
        });
        return cnt ? 200 - 100 * sum / cnt : null; /* bras étirés ~ 60, bras tirés ~ 125 */
      }
      case 'burpee': {
        var sh = meanPt(frame, [L.lSh, L.rSh]), hp = meanPt(frame, [L.lHip, L.rHip]), an = meanPt(frame, [L.lAn, L.rAn]) || meanPt(frame, [L.lKn, L.rKn]);
        if (!sh || !hp || !an) return null;
        var torso = Math.sqrt(Math.pow((sh.x - hp.x) * (frame.aspect || 1), 2) + Math.pow(sh.y - hp.y, 2));
        if (torso < 0.02) return null;
        return (an.y - hp.y) / torso;
      }
    }
    return null;
  }

  /* Caractéristiques de posture d'une image (indépendantes de l'exercice) : elles servent à reconnaître le mouvement en cours
     quand plusieurs exercices sont possibles. Distances normalisées par la longueur du torse. */
  function features(frame) {
    var L = IDX, a = frame.aspect || 1;
    var sh = meanPt(frame, [L.lSh, L.rSh]), hp = meanPt(frame, [L.lHip, L.rHip]);
    if (!sh || !hp) return null;
    var dx = (sh.x - hp.x) * a, dy = sh.y - hp.y, torso = Math.sqrt(dx * dx + dy * dy);
    if (torso < 0.02) return null;
    var f = { torso: torso, trunk: Math.atan2(Math.abs(dx), Math.abs(dy)) * 180 / Math.PI, shY: sh.y / torso, hpY: hp.y / torso, shYa: sh.y, hpYa: hp.y };
    var knees = sideAngles(frame, [L.lHip, L.rHip], [L.lKn, L.rKn], [L.lAn, L.rAn]);
    if (knees.length) { f.knee = agg(knees, 'mean'); f.kneeMin = Math.min.apply(null, knees); f.kneeMax = Math.max.apply(null, knees); f.kneeDiff = knees.length === 2 ? Math.abs(knees[0] - knees[1]) : 0; }
    var hips = sideAngles(frame, [L.lSh, L.rSh], [L.lHip, L.rHip], [L.lKn, L.rKn]); if (hips.length) f.hip = agg(hips, 'mean');
    var elb = sideAngles(frame, [L.lSh, L.rSh], [L.lEl, L.rEl], [L.lWr, L.rWr]); if (elb.length) f.elbow = agg(elb, 'mean');
    var wr = meanY(frame, [L.lWr, L.rWr]), nose = visOf(frame, L.nose) >= MIN_VIS ? frame.img[L.nose].y : null, an = meanPt(frame, [L.lAn, L.rAn]) || meanPt(frame, [L.lKn, L.rKn]);
    if (wr != null) { f.wrY = wr / torso; f.wrYa = wr; f.wrSh = (sh.y - wr) / torso; if (nose != null) f.wrNose = (nose - wr) / torso; }
    if (an) f.ankHip = (an.y - hp.y) / torso;
    return f;
  }

  /* ---------- machine à états ---------- */
  function Machine(def, level) {
    var adj = LEVELS[level] || LEVELS.normal;
    this.low = def.low + (def.metric === 'burpee' ? 0 : adj.low);
    this.high = def.high + (def.metric === 'burpee' ? 0 : adj.high);
    this.peak = def.countOn === 'peak';
    this.minRepMs = def.minRepMs || 600;
    this.minPhaseMs = 120;
    this.reset();
  }
  Machine.prototype.reset = function () {
    this.count = 0; this.partials = 0; this.state = 'wait'; this.s = null; this.tState = 0; this.tRep = -1e9;
    this.trough = null; this.lastValid = 0; this.hint = '';
    this.cMin = 1e9; this.cMax = -1e9; /* amplitude mesurée depuis la dernière répétition */
  };
  /* value : mesure lissée (angle) ou null si le corps n’est pas exploitable ; t en ms. */
  Machine.prototype.push = function (value, t) {
    var out = { rep: false, partial: false };
    if (value == null) {
      if (t - this.lastValid > 1500) { this.state = 'wait'; this.s = null; this.trough = null; } /* corps perdu : on repart de zéro, y compris la valeur lissée */
      this.hint = 'Corps non détecté';
      return this.pack(out, null);
    }
    this.lastValid = t;
    this.s = this.s == null ? value : this.s + 0.5 * (value - this.s);
    if (this.s < this.cMin) this.cMin = this.s;
    if (this.s > this.cMax) this.cMax = this.s;
    var s = this.s, low = this.low, high = this.high, held = t - this.tState;
    this.hint = '';
    if (!this.peak) {
      /* départ en haut -> bas -> retour en haut */
      if (this.state === 'wait') { if (s >= high) { this.state = 'start'; this.tState = t; this.trough = s; } else this.hint = 'Place-toi en position de départ'; }
      else if (this.state === 'start') {
        if (s < this.trough) this.trough = s;
        if (s <= low) { this.state = 'bottom'; this.tState = t; }
        else if (s >= high) { if (this.trough < high - 0.35 * (high - low) && this.trough > low) { out.partial = true; this.partials++; this.hint = 'Amplitude insuffisante : va plus bas'; } this.trough = s; }
      } else if (this.state === 'bottom') {
        if (s >= high && held >= this.minPhaseMs) {
          this.state = 'start'; this.tState = t; this.trough = s;
          if (t - this.tRep >= this.minRepMs) { this.count++; this.tRep = t; out.rep = true; out.info = { min: this.cMin, max: this.cMax }; this.cMin = 1e9; this.cMax = -1e9; }
        }
      }
    } else {
      /* départ en bas -> haut (la répétition compte en haut) -> retour en bas */
      if (this.state === 'wait') { if (s <= low) { this.state = 'start'; this.tState = t; } else this.hint = 'Place-toi en position de départ'; }
      else if (this.state === 'start') {
        if (s >= high && held >= this.minPhaseMs) {
          this.state = 'top'; this.tState = t;
          if (t - this.tRep >= this.minRepMs) { this.count++; this.tRep = t; out.rep = true; out.info = { min: this.cMin, max: this.cMax }; this.cMin = 1e9; this.cMax = -1e9; }
        }
      } else if (this.state === 'top') { if (s <= low) { this.state = 'start'; this.tState = t; } }
    }
    return this.pack(out, s);
  };
  Machine.prototype.pack = function (out, s) {
    out.count = this.count; out.partials = this.partials; out.value = s; out.state = this.state; out.hint = this.hint;
    out.phase = this.state === 'bottom' ? 'bas' : this.state === 'top' ? 'haut' : this.state === 'start' ? (this.peak ? 'bas' : 'haut') : 'attente';
    return out;
  };

  /* ---------- compteur complet (points du corps -> répétitions) ---------- */
  function create(key, opts) {
    var def = EX[key];
    if (!def) throw new Error('Exercice inconnu : ' + key);
    var m = new Machine(def, opts && opts.level);
    return {
      def: def, machine: m,
      update: function (frame, t) {
        var v = frame && frame.img ? measure(def, frame) : null;
        var r = m.push(v, t); r.ready = v != null; return r;
      },
      reset: function () { m.reset(); },
      adjust: function (delta) { m.count = Math.max(0, m.count + delta); return m.count; },
      get count() { return m.count; }
    };
  }

  /* ---------- reconnaissance de l'exercice en cours (WOD en ordre libre) ---------- */
  /* Sur une fenêtre glissante d'images, on mesure les amplitudes de posture (angles, hauteurs absolues dans l'image) et on note,
     pour chaque exercice, à quel point ce mouvement ressemble à sa « signature » (tronc vertical/horizontal, quelle partie du corps
     se déplace : hanches, épaules ou poignets, mains au-dessus de la tête…). Chaque terme vaut 0 à 1 ; la note est leur moyenne
     géométrique, donc un critère absolument faux élimine l'exercice. */
  function up(x, a, b) { return x == null ? 0.5 : Math.max(0, Math.min(1, (x - a) / (b - a))); }
  function dn(x, a, b) { return x == null ? 0.5 : Math.max(0, Math.min(1, (b - x) / (b - a))); }
  function stats(list, keys) {
    var s = { n: list.length }, i, k;
    keys.forEach(function (key) {
      var mn = Infinity, mx = -Infinity;
      for (i = 0; i < list.length; i++) { var v = list[i][key]; if (v != null) { if (v < mn) mn = v; if (v > mx) mx = v; } }
      s[key] = mn === Infinity ? null : { min: mn, max: mx, r: mx - mn };
    });
    return s;
  }
  var STAT_KEYS = ['trunk', 'knee', 'hip', 'elbow', 'wrNose', 'wrSh', 'shYa', 'hpYa', 'wrYa', 'ankHip'];
  function g(s, k, p) { return s[k] ? s[k][p] : null; }
  /* Chaque exercice : liste de termes évalués sur les statistiques de la fenêtre (3,5 s ; 7 s pour le burpee). */
  var SIGN = {
    squat:    function (s) { return [dn(g(s, 'knee', 'min'), 105, 130), dn(g(s, 'trunk', 'max'), 40, 70), up(g(s, 'hpYa', 'r'), 0.08, 0.2), up(g(s, 'hip', 'r'), 40, 70)]; },
    lunge:    function (s) { return [dn(g(s, 'knee', 'min'), 105, 130), dn(g(s, 'trunk', 'max'), 40, 70), up(g(s, 'hpYa', 'r'), 0.03, 0.1), dn(g(s, 'hip', 'r'), 40, 75)]; },
    hinge:    function (s) { return [dn(g(s, 'hip', 'min'), 100, 130), up(g(s, 'hip', 'r'), 40, 70), up(g(s, 'knee', 'min'), 55, 80), dn(g(s, 'hpYa', 'r'), 0.1, 0.18), up(g(s, 'trunk', 'max'), 30, 55)]; },
    situp:    function (s) { return [up(g(s, 'trunk', 'max'), 65, 80), up(g(s, 'trunk', 'r'), 30, 55), dn(g(s, 'hpYa', 'r'), 0.14, 0.24), dn(g(s, 'elbow', 'min'), 100, 130), dn(g(s, 'ankHip', 'max'), 0.8, 1.3)]; },
    pushup:   function (s) { return [up(g(s, 'trunk', 'min'), 45, 65), up(g(s, 'elbow', 'r'), 35, 60), dn(g(s, 'wrSh', 'max'), 0.3, 0.6)]; },
    bench:    function (s) { return [up(g(s, 'trunk', 'min'), 15, 30), up(g(s, 'wrSh', 'max'), 0.2, 0.5), up(g(s, 'elbow', 'r'), 40, 60), dn(g(s, 'hpYa', 'r'), 0.08, 0.16), dn(g(s, 'shYa', 'r'), 0.1, 0.18)]; },
    press:    function (s) { return [up(g(s, 'wrNose', 'max'), 0, 0.3), dn(g(s, 'trunk', 'max'), 15, 30), up(g(s, 'elbow', 'r'), 40, 70), up(g(s, 'wrYa', 'r'), 0.15, 0.25), dn(g(s, 'shYa', 'r'), 0.1, 0.2)]; },
    pullup:   function (s) { return [up(g(s, 'wrSh', 'min'), -0.1, 0.1), dn(g(s, 'wrYa', 'r'), 0.08, 0.15), up(g(s, 'shYa', 'r'), 0.1, 0.2), up(g(s, 'elbow', 'r'), 35, 60), dn(g(s, 'trunk', 'max'), 35, 60)]; },
    hangRaise:function (s) { return [up(g(s, 'wrSh', 'min'), -0.1, 0.1), dn(g(s, 'wrYa', 'r'), 0.05, 0.1), dn(g(s, 'elbow', 'r'), 25, 45), up(g(s, 'hip', 'r'), 40, 70)]; },
    row:      function (s) { return [up(g(s, 'trunk', 'min'), 12, 22), dn(g(s, 'trunk', 'max'), 60, 75), up(g(s, 'elbow', 'r'), 25, 45), dn(g(s, 'wrSh', 'max'), -0.2, 0.2), dn(g(s, 'shYa', 'r'), 0.08, 0.15)]; },
    dips:     function (s) { return [dn(g(s, 'wrSh', 'max'), 0, 0.3), up(g(s, 'shYa', 'r'), 0.08, 0.15), up(g(s, 'elbow', 'r'), 40, 60), dn(g(s, 'trunk', 'max'), 25, 45), dn(g(s, 'wrYa', 'r'), 0.1, 0.2)]; },
    legpress: function (s) { return [up(g(s, 'knee', 'r'), 50, 80), up(g(s, 'trunk', 'min'), 20, 35), dn(g(s, 'shYa', 'r'), 0.06, 0.12), dn(g(s, 'wrYa', 'r'), 0.12, 0.2)]; },
    burpee:   function (s) { return [up(g(s, 'trunk', 'max'), 65, 80), dn(g(s, 'trunk', 'min'), 20, 35), up(g(s, 'hpYa', 'r'), 0.16, 0.28), up(g(s, 'shYa', 'r'), 0.25, 0.35), up(g(s, 'ankHip', 'max'), 0.9, 1.3), s.recentH ? 1 : 0, s.standNow ? 1 : 0]; }
  };
  function geo(terms) { var p = 1; for (var i = 0; i < terms.length; i++) p *= terms[i]; return Math.pow(p, 1 / terms.length); }
  /* hist : [{t, f}] des caractéristiques récentes ; renvoie { exercice: note 0..1 } pour les exercices demandés. */
  function recognize(hist, t, keys) {
    var out = {}, win = hist.filter(function (h) { return h.t > t - 3500 && h.t <= t; }).map(function (h) { return h.f; });
    var long = keys.indexOf('burpee') >= 0 ? hist.filter(function (h) { return h.t > t - 7000 && h.t <= t; }).map(function (h) { return h.f; }) : null;
    var s = stats(win, STAT_KEYS), sl = long ? stats(long, STAT_KEYS) : null;
    if (sl) { /* burpee : tronc au sol dans les 2,5 dernières secondes ET chevilles déjà loin sous les hanches (debout) à l'instant présent */
      sl.recentH = hist.some(function (h) { return h.t > t - 2500 && h.t <= t && h.f.trunk >= 65; }) ? 1 : 0;
      sl.standNow = hist.some(function (h) { return h.t > t - 600 && h.t <= t && h.f.ankHip != null && h.f.ankHip >= 0.95; }) ? 1 : 0;
    }
    keys.forEach(function (k) {
      if (!SIGN[k]) { out[k] = 0.5; return; }
      var st = k === 'burpee' ? sl : s; if (!st || st.n < 6) { out[k] = 0; return; }
      out[k] = geo(SIGN[k](st));
    });
    return out;
  }

  /* Note d'un seul exercice (aide au réglage). */
  recognize.one = function (hist, t, key) { return recognize(hist, t, [key])[key]; };

  /* Compteur multi-exercices : tous les exercices demandés sont « armés » en même temps. Une répétition détectée par la machine
     d'un exercice n'est comptée que si la reconnaissance confirme que c'est bien ce mouvement (note suffisante et proche de la
     meilleure) ; les autres machines, qui réagissent au même geste, sont écartées. */
  var BURPEE_PARTS = ['squat', 'lunge', 'hinge', 'situp', 'pushup', 'bench', 'legpress', 'dips'];
  function createMulti(keys, opts) {
    var uniq = []; (keys || []).forEach(function (k) { if (EX[k] && uniq.indexOf(k) < 0) uniq.push(k); });
    if (!uniq.length) throw new Error('Aucun exercice.');
    var counters = {}, tallies = {}, hist = [], lastAcc = { k: null, t: -1e9 }, scores = {}, current = null, curT = -1e9, tick = 0, rejected = 0, debugLog = [];
    uniq.forEach(function (k) { counters[k] = create(k, opts); tallies[k] = 0; });
    var MIN = 0.35, REL = 0.8;
    return {
      keys: uniq, tallies: tallies, debugLog: debugLog,
      update: function (frame, t) {
        var f = frame && frame.img ? features(frame) : null, cand = [], ready = false, per = {}, events = [], i;
        /* La personne est restée plus d'une seconde hors cadre : l'historique du mouvement précédent n'a plus de sens. */
        if (f && hist.length && t - hist[hist.length - 1].t > 1200) hist = [];
        if (f) { hist.push({ t: t, f: f }); while (hist.length && hist[0].t < t - 8000) hist.shift(); }
        uniq.forEach(function (k) { var r = counters[k].update(frame, t); per[k] = r; if (r.ready) ready = true; if (r.rep) cand.push(k); });
        if (cand.length || (++tick % 3) === 0) {
          scores = hist.length ? recognize(hist, t, uniq) : {};
          var best = null, bs = 0; uniq.forEach(function (k) { if ((scores[k] || 0) > bs) { bs = scores[k]; best = k; } });
          if (best && bs >= MIN) { current = best; curT = t; } else if (t - curT > 3000) current = null;
        }
        if (cand.length) {
          var top = 0; uniq.forEach(function (k) { if ((scores[k] || 0) > top) top = scores[k]; });
          cand.sort(function (a, b) { return (scores[b] || 0) - (scores[a] || 0); });
          for (i = 0; i < cand.length; i++) {
            var k = cand[i], sc = scores[k] || 0, ok = sc >= MIN && sc >= REL * top;
            /* un burpee contient une descente, un gainage et un redressement : tant qu'il est en cours, ses composantes ne comptent pas */
            if (ok && k !== 'burpee' && (scores.burpee || 0) >= 0.6 && BURPEE_PARTS.indexOf(k) >= 0) ok = false;
            /* un même geste ne compte qu'une fois : si un autre exercice vient d'être validé, on ne garde que celui qui a la meilleure note */
            if (ok && lastAcc.k && lastAcc.k !== k && t - lastAcc.t < 900 && sc < (scores[lastAcc.k] || 0) * 1.05) ok = false;
            if (opts && opts.debug) (debugLog.length < 400) && debugLog.push({ t: Math.round(t), k: k, sc: Math.round(sc * 100) / 100, top: Math.round(top * 100) / 100, ok: ok, s: Object.keys(scores).filter(function (x) { return scores[x] > 0.2; }).map(function (x) { return x + ':' + scores[x].toFixed(2); }).join(' ') });
            if (ok) { tallies[k]++; lastAcc = { k: k, t: t }; events.push({ k: k, t: t }); } else rejected++;
          }
        }
        var cur = current && per[current] ? per[current] : null;
        return { ready: ready, events: events, tallies: tallies, current: current, scores: scores, per: per, hint: cur ? cur.hint : '', phase: cur ? cur.phase : 'attente', value: cur ? cur.value : null, rejected: rejected };
      },
      adjust: function (k, d) { if (tallies[k] != null) tallies[k] = Math.max(0, tallies[k] + d); return tallies[k]; },
      reset: function () { uniq.forEach(function (k) { tallies[k] = 0; counters[k].reset(); }); hist = []; scores = {}; current = null; }
    };
  }

  /* ---------- verrouillage sur une personne ---------- */
  /* Le modèle peut détecter plusieurs personnes. Le Tracker choisit « la bonne » et s'y tient : il compare la position,
     la taille du corps et (si disponible) la couleur du haut avec la personne suivie. Une personne qui passe devant,
     ou qui s'entraîne derrière, est ignorée. Si la personne suivie disparaît, rien n'est compté jusqu'à son retour. */
  function describe(L, aspect) {
    if (!L) return null;
    function ok(i) { var p = L[i]; return p && (typeof p.visibility === 'number' ? p.visibility : 1) >= 0.3 ? p : null; }
    function mid(a, b) { return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : (a || b || null); }
    var ls = ok(IDX.lSh), rs = ok(IDX.rSh), lh = ok(IDX.lHip), rh = ok(IDX.rHip);
    var sh = mid(ls, rs), hp = mid(lh, rh), a = aspect || 1;
    if (!sh || !hp) return null;
    var torso = Math.sqrt(Math.pow((sh.x - hp.x) * a, 2) + Math.pow(sh.y - hp.y, 2));
    if (torso < 0.03) return null;
    var sw = ls && rs ? Math.sqrt(Math.pow((ls.x - rs.x) * a, 2) + Math.pow(ls.y - rs.y, 2)) : 0;
    torso = Math.max(torso, 1.25 * sw); /* « taille » du corps : le torse raccourcit quand on se penche vers la caméra, pas la largeur d'épaules */
    return { cx: (sh.x + hp.x) / 2, cy: (sh.y + hp.y) / 2, torso: torso };
  }
  function colorDist(a, b) { return a && b ? (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 765 : 0; }

  function Tracker() { this.reset(); }
  Tracker.prototype.reset = function () { this.lock = null; this.state = 'idle'; this.lostSince = 0; this.lastT = 0; this.others = 0; this.count = 0; this.oth = []; };
  /* Mémoire des autres personnes vues : un passant qu'on a vu arriver ne peut pas être pris pour l'utilisateur. */
  Tracker.prototype.matchOther = function (d, a, t, sig, confirmedOnly) {
    var tracks = this.oth || [];
    for (var j = 0; j < tracks.length; j++) {
      var o = tracks[j], dt = Math.max(0, t - o.t) / 1000;
      if (confirmedOnly && !o.confirmed) continue;
      var pos = Math.sqrt(Math.pow((d.cx - o.cx) * a, 2) + Math.pow(d.cy - o.cy, 2)) / Math.max(o.torso, d.torso);
      var ratio = d.torso / o.torso;
      if (pos < 1.2 + 3 * dt && ratio > 0.6 && ratio < 1.7 && colorDist(sig, o.sig) <= 0.3) return j;
    }
    return -1;
  };
  Tracker.prototype.trackOthers = function (ds, selected, a, t, sigs, userVisible) {
    var tracks = this.oth = (this.oth || []).filter(function (o) { return t - o.t < 2500; });
    for (var i = 0; i < ds.length; i++) {
      if (i === selected || !ds[i]) continue;
      var d = ds[i], sg = sigs && sigs[i] ? sigs[i].slice() : null, j = this.matchOther(d, a, t, sg);
      /* « Autre personne confirmée » : vue à l'écart de l'utilisateur (au moins un torse de distance), pas un double posé sur lui. */
      var u = userVisible && ds[selected], far = !!u && Math.sqrt(Math.pow((d.cx - u.cx) * a, 2) + Math.pow(d.cy - u.cy, 2)) / u.torso >= 1.0;
      if (j >= 0) { tracks[j].cx = d.cx; tracks[j].cy = d.cy; tracks[j].torso = d.torso; tracks[j].t = t; if (sg) tracks[j].sig = sg; if (far) tracks[j].confirmed = true; }
      else tracks.push({ cx: d.cx, cy: d.cy, torso: d.torso, t: t, sig: sg, confirmed: far });
    }
  };
  /* Choix initial : la personne la plus grande à l'image parmi celles qui sont près du centre. */
  Tracker.prototype.lockOn = function (poses, aspect, sigs, t) {
    var ds = poses.map(function (L) { return describe(L, aspect); }), best = -1, bestScore = -1, maxTorso = 0, i;
    for (i = 0; i < ds.length; i++) if (ds[i] && ds[i].torso > maxTorso) maxTorso = ds[i].torso;
    for (i = 0; i < ds.length; i++) {
      var d = ds[i]; if (!d || d.torso < 0.5 * maxTorso) continue;
      var off = Math.sqrt(Math.pow((d.cx - 0.5) * (aspect || 1), 2) + Math.pow(d.cy - 0.5, 2));
      var score = d.torso * (1.2 - Math.min(1, off));
      if (score > bestScore) { bestScore = score; best = i; }
    }
    this.count = ds.filter(Boolean).length;
    if (best < 0) { this.lock = null; this.state = 'idle'; this.others = 0; return -1; }
    this.lock = { cx: ds[best].cx, cy: ds[best].cy, torso: ds[best].torso, sig: sigs && sigs[best] ? sigs[best].slice() : null };
    this.state = 'tracked'; this.lostSince = 0; this.lastT = t || 0; this.others = this.count - 1;
    return best;
  };
  /* Image suivante : renvoie l'indice de la personne suivie (ou -1), son état et le nombre d'autres personnes. */
  Tracker.prototype.update = function (poses, aspect, sigs, t) {
    if (!this.lock) { var first = this.lockOn(poses, aspect, sigs, t); return { idx: first, state: this.state, others: this.others }; }
    var ds = poses.map(function (L) { return describe(L, aspect); }), lock = this.lock, a = aspect || 1;
    var searching = this.lostSince > 0 && t - this.lostSince > 1500, continuous = this.state === 'tracked';
    var dt = Math.max(0, t - this.lastT) / 1000, best = -1, bestCost = Infinity, i;
    for (i = 0; i < ds.length; i++) {
      var d = ds[i]; if (!d) continue;
      var ratio = d.torso / lock.torso; if (ratio < (continuous ? 0.45 : 0.5) || ratio > (continuous ? 2.2 : 2.0)) continue;
      var pos = Math.sqrt(Math.pow((d.cx - lock.cx) * a, 2) + Math.pow(d.cy - lock.cy, 2)) / lock.torso;
      var cd = colorDist(sigs && sigs[i], lock.sig);
      if (!searching && pos > (continuous ? 2.2 : 1.5) + 4 * dt) continue;
      if (cd > (searching ? 0.25 : 0.32)) continue;
      /* Pendant une perte de suivi, une personne déjà vue ailleurs n'est pas toi (sauf couleur du haut très proche). */
      /* Une personne déjà vue ailleurs (un passant) n'est pas toi, sauf si elle est à ta dernière position avec ta taille et ta couleur. */
      if (!searching && this.matchOther(d, a, t, sigs && sigs[i], true) >= 0) {
        var strong = pos < 0.3 && ratio > 0.8 && ratio < 1.25 && cd < 0.15;
        if (!strong) continue;
      }
      var cost = pos + 1.5 * Math.abs(Math.log(ratio)) + 2 * cd;
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    this.count = ds.filter(Boolean).length;
    if (best >= 0 || this.count >= 2) this.trackOthers(ds, best, a, t, sigs, best >= 0);
    if (best >= 0) {
      var s = ds[best];
      lock.cx = s.cx; lock.cy = s.cy; lock.torso += 0.25 * (s.torso - lock.torso);
      var sg = sigs && sigs[best];
      if (sg) { if (lock.sig) for (var k = 0; k < 3; k++) lock.sig[k] += 0.1 * (sg[k] - lock.sig[k]); else lock.sig = sg.slice(); }
      this.lastT = t; this.lostSince = 0; this.state = 'tracked'; this.others = this.count - 1;
    } else {
      if (!this.lostSince) this.lostSince = t;
      this.state = t - this.lostSince > 1500 ? 'search' : 'lost';
      this.others = this.count;
    }
    return { idx: best, state: this.state, others: this.others };
  };

  var api = { EX: EX, LEVELS: LEVELS, IDX: IDX, detect: detect, targetFrom: targetFrom, create: create, createMulti: createMulti, Machine: Machine, measure: measure, features: features, recognize: recognize, norm: norm, Tracker: Tracker, describe: describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RepEngine = api;
})(typeof window !== 'undefined' ? window : this);
