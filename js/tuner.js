// Ukulele tuner screen.
const Tuner = (() => {
  const TUNINGS = {
    standard: { label: 'Standard  G C E A', notes: ['G4', 'C4', 'E4', 'A4'] },
    lowg: { label: 'Low G  G C E A', notes: ['G3', 'C4', 'E4', 'A4'] },
    d: { label: 'D tuning  A D F# B', notes: ['A4', 'D4', 'F#4', 'B4'] },
    baritone: { label: 'Baritone  D G B E', notes: ['D3', 'G3', 'B3', 'E4'] },
  };
  const IN_TUNE = 5; // cents

  let els, tuningKey = 'standard', strings = [], locked = null;
  let analyser = null, raf = 0, buf = null, history = [], lastHeard = 0;

  function init() {
    els = {
      tuning: document.getElementById('tuning'),
      strings: document.getElementById('strings'),
      needle: document.getElementById('needle'),
      gauge: document.getElementById('gauge'),
      note: document.getElementById('t-note'),
      cents: document.getElementById('t-cents'),
      hz: document.getElementById('t-hz'),
      toggle: document.getElementById('tuner-toggle'),
      ticks: document.getElementById('ticks'),
    };
    try { tuningKey = localStorage.getItem('uke.tuning') || 'standard'; } catch (e) {}
    if (!TUNINGS[tuningKey]) tuningKey = 'standard';

    for (const [k, t] of Object.entries(TUNINGS)) {
      const o = document.createElement('option');
      o.value = k; o.textContent = t.label;
      els.tuning.appendChild(o);
    }
    els.tuning.value = tuningKey;
    els.tuning.addEventListener('change', () => {
      tuningKey = els.tuning.value;
      try { localStorage.setItem('uke.tuning', tuningKey); } catch (e) {}
      locked = null;
      buildStrings();
    });

    // gauge ticks: -50..+50 cents mapped to -60..+60 degrees
    let svg = '';
    for (let c = -50; c <= 50; c += 10) {
      const a = (c * 1.2 * Math.PI) / 180;
      const r1 = 130, r2 = c % 50 === 0 ? 112 : 120;
      const x1 = 150 + r1 * Math.sin(a), y1 = 160 - r1 * Math.cos(a);
      const x2 = 150 + r2 * Math.sin(a), y2 = 160 - r2 * Math.cos(a);
      svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }
    els.ticks.innerHTML = svg;

    buildStrings();
    els.toggle.addEventListener('click', () => (analyser ? stop() : start()));
  }

  function buildStrings() {
    strings = TUNINGS[tuningKey].notes.map((n, i) => ({ n, midi: Pitch.noteToMidi(n), i }));
    els.strings.innerHTML = '';
    const auto = document.createElement('button');
    auto.innerHTML = 'Auto<small>any</small>';
    auto.style.fontSize = '1rem';
    auto.className = locked === null ? 'on' : '';
    auto.addEventListener('click', () => { locked = null; markLocked(); });
    els.strings.appendChild(auto);
    strings.forEach((s) => {
      const b = document.createElement('button');
      b.innerHTML = `${s.n.replace(/-?\d$/, '')}<small>${s.n}</small>`;
      b.dataset.i = s.i;
      let pressTimer = null, longPressed = false;
      b.addEventListener('pointerdown', () => {
        longPressed = false;
        pressTimer = setTimeout(() => { longPressed = true; Audio2.playTone(Pitch.midiToFreq(s.midi)); }, 450);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => b.addEventListener(e, () => clearTimeout(pressTimer)));
      b.addEventListener('click', () => {
        if (longPressed) return;
        locked = locked === s.i ? null : s.i;
        markLocked();
      });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      els.strings.appendChild(b);
    });
  }

  function markLocked() {
    [...els.strings.children].forEach((b, idx) => {
      b.classList.toggle('on', idx === 0 ? locked === null : locked === idx - 1);
    });
  }

  async function start() {
    try {
      analyser = await Audio2.openMic('tuner', 2048);
    } catch (e) {
      App.toast('Microphone blocked. Allow mic access for this site in your browser settings.');
      return;
    }
    buf = new Float32Array(analyser.fftSize);
    els.toggle.textContent = 'Stop tuner';
    els.cents.textContent = 'Pluck a string';
    Audio2.keepAwake(true);
    loop();
  }

  function stop() {
    cancelAnimationFrame(raf);
    Audio2.closeMic('tuner', analyser);
    analyser = null;
    els.toggle.textContent = 'Start tuner';
    Audio2.keepAwake(false);
    reset('Tap Start and pluck a string');
  }

  function reset(msg) {
    els.note.textContent = '–';
    els.cents.textContent = msg;
    els.cents.className = 'cents';
    els.hz.innerHTML = '&nbsp;';
    els.needle.style.transform = 'rotate(0deg)';
    els.gauge.classList.remove('in-tune');
    [...els.strings.children].forEach((b) => b.classList.remove('hit'));
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    analyser.getFloatTimeDomainData(buf);
    const f = Pitch.detectPitch(buf, analyser.context.sampleRate, 70, 1200);
    const now = performance.now();
    if (f > 0) {
      history.push(f);
      if (history.length > 5) history.shift();
      lastHeard = now;
      const sorted = [...history].sort((a, b) => a - b);
      show(sorted[Math.floor(sorted.length / 2)]);
    } else if (now - lastHeard > 1500 && history.length) {
      history = [];
      reset('Pluck a string');
    }
  }

  function show(f) {
    let target, c;
    if (locked !== null) {
      target = strings[locked];
      c = Pitch.cents(f, Pitch.midiToFreq(target.midi));
      // allow octave errors when locked (e.g. low-G detected an octave up)
      if (Math.abs(c) > 600) {
        const oct = Math.round(c / 1200);
        c -= oct * 1200;
      }
    } else {
      const near = Pitch.nearestString(f, strings);
      if (Math.abs(near.cents) <= 150) { target = near.string; c = near.cents; }
    }

    if (!target) {
      // no string close: show the chromatic note
      const m = Math.round(Pitch.freqToMidi(f));
      c = Pitch.cents(f, Pitch.midiToFreq(m));
      els.note.innerHTML = `${Pitch.midiName(m)}<sub>${Pitch.midiOctave(m)}</sub>`;
    } else {
      els.note.innerHTML = `${target.n.replace(/-?\d$/, '')}<sub>${target.n.match(/-?\d$/)[0]}</sub>`;
    }

    const clamped = Math.max(-50, Math.min(50, c));
    els.needle.style.transform = `rotate(${(clamped * 1.2).toFixed(1)}deg)`;
    const ok = target && Math.abs(c) <= IN_TUNE;
    els.gauge.classList.toggle('in-tune', !!ok);
    els.hz.textContent = `${f.toFixed(1)} Hz · ${c > 0 ? '+' : ''}${c.toFixed(0)} cents`;
    if (!target) {
      els.cents.textContent = 'Not near a string in this tuning';
      els.cents.className = 'cents';
    } else if (ok) {
      els.cents.textContent = 'In tune';
      els.cents.className = 'cents ok';
    } else if (c < 0) {
      els.cents.textContent = Math.abs(c) > 50 ? 'Way flat — tighten' : 'Flat — tighten a little';
      els.cents.className = 'cents flat';
    } else {
      els.cents.textContent = c > 50 ? 'Way sharp — loosen' : 'Sharp — loosen a little';
      els.cents.className = 'cents sharp';
    }
    [...els.strings.children].forEach((b, idx) => b.classList.toggle('hit', !!ok && target && idx - 1 === target.i));
  }

  function hide() { if (analyser) stop(); }

  return { init, hide, TUNINGS };
})();
