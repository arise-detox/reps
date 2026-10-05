/* REPS - vision : caméra (ou vidéo), modèle de pose MediaPipe, boucle d'analyse et dessin du squelette.
   Tout se passe sur le téléphone : les images ne sont ni enregistrées ni envoyées. Seuls la bibliothèque et le modèle
   (environ 15 Mo) sont téléchargés la première fois, puis gardés en cache par le service worker pour le hors-ligne. */
(function (root) {
  'use strict';

  var MP_VERSION = '0.10.21', MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION;
  var MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  var LINKS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
  var JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  var STEP_MS = 60; /* une analyse toutes les 60 ms au plus (environ 16 images/s) */

  var shared = { landmarker: null, loading: null, forceCpu: false, delegate: '', ts: 0 };

  function loadModel() {
    if (shared.landmarker) return Promise.resolve(shared.landmarker);
    if (shared.loading) return shared.loading;
    shared.loading = (async function () {
      var mp = await import(MP_BASE + '/vision_bundle.mjs');
      var files = await mp.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
      var make = function (delegate) { return mp.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MP_MODEL, delegate: delegate }, runningMode: 'VIDEO', numPoses: 3 }); };
      if (shared.forceCpu) { shared.landmarker = await make('CPU'); shared.delegate = 'CPU'; }
      else { try { shared.landmarker = await make('GPU'); shared.delegate = 'GPU'; } catch (e) { shared.landmarker = await make('CPU'); shared.delegate = 'CPU'; } }
      return shared.landmarker;
    })();
    return shared.loading.finally(function () { shared.loading = null; });
  }

  function Vision(opts) {
    this.video = opts.video; this.canvas = opts.canvas; this.view = opts.view;
    this.onFrame = opts.onFrame || function () {}; this.onStatus = opts.onStatus || function () {};
    this.onEnded = opts.onEnded || function () {};
    this.mode = 'camera'; this.facing = 'user'; this.stream = null; this.fileUrl = null; this.wake = null;
    this.running = false; this.paused = false; this.raf = 0; this.lastInfer = 0; this.fps = 0; this.fpsCount = 0; this.fpsStart = 0; this.token = 0;
    this.snapCtx = null; this.snapOk = false;
  }
  Vision.prototype.delegate = function () { return shared.delegate; };
  Vision.prototype.load = function () { return loadModel(); };

  Vision.prototype.size = function () {
    var v = this.video, vw = v.videoWidth || 640, vh = v.videoHeight || 480;
    var w = Math.min(root.innerWidth - 24, Math.max(200, 0.52 * root.innerHeight * vw / vh));
    this.view.style.width = w + 'px'; this.view.style.aspectRatio = vw + ' / ' + vh;
    this.view.classList.toggle('mirror', this.mode === 'camera' && this.facing === 'user');
  };

  /* Ouvre la caméra. Renvoie { ok:true } ou { ok:false, message }. */
  Vision.prototype.startCamera = async function (facing) {
    this.stopStream(); var token = ++this.token;
    if (facing) this.facing = facing; this.mode = 'camera';
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return { ok: false, message: 'Ce navigateur ne donne pas accès à la caméra. Utilise « Analyser une vidéo ».' };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (e) {
      return { ok: false, message: e && e.name === 'NotAllowedError' ? 'Caméra refusée. Autorise-la dans Réglages > Safari > Caméra, puis réessaie.' : 'Caméra introuvable ou déjà utilisée.' };
    }
    if (token !== this.token) { this.stopStream(); return { ok: false, message: '' }; }
    var v = this.video; v.srcObject = this.stream; v.muted = true;
    try { await v.play(); } catch (e) { /* lecture automatique parfois refusée : la boucle redémarre à la première image */ }
    if (!v.videoWidth) await new Promise(function (r) { v.onloadedmetadata = r; setTimeout(r, 2000); });
    this.size();
    try { if (navigator.wakeLock) this.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* facultatif */ }
    return { ok: true };
  };

  /* Analyse une vidéo (fichier du téléphone ou adresse) au lieu de la caméra. */
  Vision.prototype.startFile = async function (src) {
    this.stopStream(); var token = ++this.token, self = this; this.mode = 'file';
    var v = this.video; v.srcObject = null; v.muted = true; v.loop = false;
    if (typeof src === 'string') { v.crossOrigin = 'anonymous'; v.src = src; } else { v.removeAttribute('crossorigin'); this.fileUrl = URL.createObjectURL(src); v.src = this.fileUrl; }
    await new Promise(function (r) { v.onloadeddata = r; v.onerror = r; });
    if (token !== this.token) return { ok: false, message: '' };
    if (!v.videoWidth) return { ok: false, message: 'Vidéo illisible sur ce téléphone.' };
    this.size(); v.onended = function () { if (token === self.token) self.onEnded(); };
    return { ok: true };
  };

  Vision.prototype.begin = function () {
    var self = this; this.running = true; this.paused = false; cancelAnimationFrame(this.raf);
    if (this.mode === 'file') { try { this.video.play(); } catch (e) { /* ignoré */ } }
    var loop = function () { if (!self.running) return; self.raf = requestAnimationFrame(loop); self.step(); };
    this.raf = requestAnimationFrame(loop);
  };
  Vision.prototype.setPaused = function (on) {
    this.paused = !!on;
    if (this.mode === 'file') { if (on) this.video.pause(); else { try { this.video.play(); } catch (e) { /* ignoré */ } } }
  };

  Vision.prototype.step = function () {
    var v = this.video, now = performance.now(), self = this;
    if (this.paused || !v || v.readyState < 2 || now - this.lastInfer < STEP_MS || v.ended) return;
    this.lastInfer = now;
    var ts = Math.max(shared.ts + 1, Math.round(now)); shared.ts = ts;
    var res;
    try { res = shared.landmarker.detectForVideo(v, ts); }
    catch (e) {
      this.running = false; cancelAnimationFrame(this.raf);
      if (!shared.forceCpu) {
        shared.forceCpu = true; shared.landmarker = null; this.onStatus('Passage en mode compatible…'); var tk = this.token;
        loadModel().then(function () { if (tk === self.token) self.begin(); }).catch(function () { self.onStatus('Erreur de détection : relance le compteur.', true); });
      } else this.onStatus('Erreur de détection : relance le compteur.', true);
      return;
    }
    this.fpsCount++; if (!this.fpsStart) this.fpsStart = now;
    if (now - this.fpsStart >= 1000) { this.fps = this.fpsCount * 1000 / (now - this.fpsStart); this.fpsCount = 0; this.fpsStart = now; }
    var out = this.onFrame({
      poses: res.landmarks || [], worlds: res.worldLandmarks || [], aspect: v.videoWidth / v.videoHeight,
      t: this.mode === 'file' ? v.currentTime * 1000 : now, vision: this
    }) || {};
    this.draw(res.landmarks || [], out.sel == null ? -1 : out.sel, out.color);
  };

  Vision.prototype.draw = function (poses, sel, color) {
    var cv = this.canvas, v = this.video; if (!cv) return;
    if (cv.width !== v.videoWidth || cv.height !== v.videoHeight) { cv.width = v.videoWidth; cv.height = v.videoHeight; }
    var g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    var self = this;
    poses.forEach(function (L, i) { if (i !== sel) self.pose(g, L, cv, 'rgba(255,255,255,.45)', Math.max(2, cv.width / 260), false); });
    if (sel >= 0 && poses[sel]) this.pose(g, poses[sel], cv, color || '#ff2d3a', Math.max(3, cv.width / 150), true);
  };
  Vision.prototype.clear = function () { var cv = this.canvas; if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); };
  Vision.prototype.pose = function (g, lm, cv, color, lw, dots) {
    g.lineWidth = lw; g.lineCap = 'round'; g.strokeStyle = color;
    LINKS.forEach(function (l) {
      var p = lm[l[0]], q = lm[l[1]]; if (!p || !q || (p.visibility || 0) < .4 || (q.visibility || 0) < .4) return;
      g.beginPath(); g.moveTo(p.x * cv.width, p.y * cv.height); g.lineTo(q.x * cv.width, q.y * cv.height); g.stroke();
    });
    if (dots) { g.fillStyle = '#fff'; JOINTS.forEach(function (i) { var p = lm[i]; if (!p || (p.visibility || 0) < .4) return; g.beginPath(); g.arc(p.x * cv.width, p.y * cv.height, lw * 1.2, 0, 6.283); g.fill(); }); }
  };

  /* Couleur moyenne du haut du corps : aide à ne pas confondre deux personnes (calculée sur le téléphone, jamais conservée). */
  Vision.prototype.snap = function () {
    try {
      if (!this.snapCtx) { var c = document.createElement('canvas'); c.width = 96; c.height = 72; this.snapCtx = c.getContext('2d', { willReadFrequently: true }); }
      this.snapCtx.drawImage(this.video, 0, 0, 96, 72); this.snapOk = true;
    } catch (e) { this.snapOk = false; }
  };
  Vision.prototype.signature = function (L) {
    if (!this.snapOk || !L) return null;
    try {
      var q = [11, 12, 23, 24].map(function (i) { return L[i]; }); if (q.some(function (p) { return !p || (p.visibility || 0) < .4; })) return null;
      var cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4, sx = (q[0].x + q[1].x) / 2, sy = (q[0].y + q[1].y) / 2, hx = (q[2].x + q[3].x) / 2, hy = (q[2].y + q[3].y) / 2;
      var r = 0, g = 0, b = 0, n = 0, spots = [[cx, cy], [(cx + sx) / 2, (cy + sy) / 2], [(cx + hx) / 2, (cy + hy) / 2]];
      for (var s = 0; s < spots.length; s++) {
        var px = Math.min(93, Math.max(0, Math.round(spots[s][0] * 96) - 1)), py = Math.min(69, Math.max(0, Math.round(spots[s][1] * 72) - 1));
        var d = this.snapCtx.getImageData(px, py, 3, 3).data; for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      }
      return n ? [r / n, g / n, b / n] : null;
    } catch (e) { return null; }
  };
  Vision.prototype.signatures = function (poses) { var self = this; this.snap(); return poses.map(function (L) { return self.signature(L); }); };

  Vision.prototype.stopStream = function () {
    this.running = false; cancelAnimationFrame(this.raf);
    if (this.stream) { this.stream.getTracks().forEach(function (t) { t.stop(); }); this.stream = null; }
    if (this.fileUrl) { URL.revokeObjectURL(this.fileUrl); this.fileUrl = null; }
    if (this.wake) { this.wake.release().catch(function () {}); this.wake = null; }
  };
  Vision.prototype.stop = function () {
    this.token++; this.stopStream(); this.paused = false;
    var v = this.video; if (v) { try { v.pause(); } catch (e) { /* ignoré */ } v.srcObject = null; v.removeAttribute('src'); try { v.load(); } catch (e) { /* ignoré */ } }
    this.clear();
  };

  root.RepVision = { Vision: Vision, loadModel: loadModel, MP_BASE: MP_BASE, MP_MODEL: MP_MODEL };
})(window);
