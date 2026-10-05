/* REPS - sons, voix et vibrations. Rien n'est enregistré : l'appli produit seulement des bips et lit des nombres à voix haute. */
(function (root) {
  'use strict';
  var ctx = null;
  var Sound = {
    cfg: { voice: true, beep: true, vibrate: true },

    /* À appeler dans un geste de l'utilisateur (toucher) : iOS n'autorise le son qu'après. */
    unlock: function () {
      try {
        var A = root.AudioContext || root.webkitAudioContext; if (!A) return;
        if (!ctx) ctx = new A();
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) { /* son indisponible */ }
      try { if ('speechSynthesis' in root) root.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* voix indisponible */ }
    },
    ready: function () { return !!ctx && ctx.state === 'running'; },

    tone: function (freq, dur, vol, delay) {
      if (!ctx || ctx.state !== 'running') return;
      try {
        var t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || .25, t + .01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t); o.stop(t + dur + .02);
      } catch (e) { /* ignoré */ }
    },
    /* Bip court à chaque répétition (quand la voix est coupée). */
    tick: function () { if (Sound.cfg.beep) Sound.tone(1000, .09, .25); },
    /* Décompte 3-2-1 et départ. */
    count: function () { if (Sound.cfg.beep) Sound.tone(660, .12, .25); },
    go: function () { if (Sound.cfg.beep) Sound.tone(1175, .35, .28); },
    /* Alarme : trois bips puis une note tenue (objectif atteint, fin de série ou de WOD). */
    alarm: function () {
      if (!Sound.cfg.beep) return;
      [0, .22, .44].forEach(function (d) { Sound.tone(880, .16, .3, d); });
      Sound.tone(1175, 1.1, .3, .72);
    },
    say: function (text) {
      if (!Sound.cfg.voice || !('speechSynthesis' in root)) return;
      try { root.speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(String(text)); u.lang = 'fr-FR'; u.rate = 1.1; root.speechSynthesis.speak(u); } catch (e) { /* ignoré */ }
    },
    silence: function () { try { root.speechSynthesis.cancel(); } catch (e) { /* ignoré */ } },
    vibrate: function (p) { if (Sound.cfg.vibrate) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignoré */ } } }
  };
  root.RepSound = Sound;
})(window);
