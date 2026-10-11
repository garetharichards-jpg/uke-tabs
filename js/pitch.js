// Pitch detection (YIN) and note helpers. Pure functions so they can be tested in Node.
(function (root) {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // Returns the fundamental frequency in Hz, or -1 when there is no clear pitch.
  function detectPitch(buf, sampleRate, minHz = 70, maxHz = 1200) {
    const n = buf.length;
    let rms = 0;
    for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / n);
    if (rms < 0.008) return -1;

    const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
    const tauMax = Math.min(Math.floor(n / 2), Math.ceil(sampleRate / minHz));
    const w = n - tauMax;
    const d = new Float32Array(tauMax + 1);

    // difference function
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let i = 0; i < w; i++) {
        const delta = buf[i] - buf[i + tau];
        sum += delta * delta;
      }
      d[tau] = sum;
    }
    // cumulative mean normalised difference
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      d[tau] = running ? (d[tau] * tau) / running : 1;
    }

    const threshold = 0.12;
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < threshold) {
        while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) {
      // fall back to the global minimum if it is reasonably periodic
      let best = tauMin;
      for (let t = tauMin + 1; t <= tauMax; t++) if (d[t] < d[best]) best = t;
      if (d[best] > 0.3) return -1;
      tau = best;
    }

    // parabolic interpolation for sub-sample accuracy
    let better = tau;
    if (tau > 1 && tau < tauMax) {
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const denom = a - 2 * b + c;
      if (denom) better = tau + (a - c) / (2 * denom);
    }
    return sampleRate / better;
  }

  function freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function midiName(m) { return NOTE_NAMES[((m % 12) + 12) % 12]; }
  function midiOctave(m) { return Math.floor(m / 12) - 1; }
  function cents(f, target) { return 1200 * Math.log2(f / target); }

  // "G4" -> 67
  function noteToMidi(s) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    if (!m) throw new Error('Bad note ' + s);
    let i = NOTE_NAMES.indexOf(m[1]);
    if (m[2] === '#') i++;
    if (m[2] === 'b') i--;
    return (parseInt(m[3], 10) + 1) * 12 + i;
  }

  // Nearest string (by cents) among targets [{midi}]
  function nearestString(f, strings) {
    let best = null, bestAbs = Infinity;
    for (const s of strings) {
      const c = cents(f, midiToFreq(s.midi));
      if (Math.abs(c) < bestAbs) { bestAbs = Math.abs(c); best = { string: s, cents: c }; }
    }
    return best;
  }

  const api = { detectPitch, freqToMidi, midiToFreq, midiName, midiOctave, cents, noteToMidi, nearestString, NOTE_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Pitch = api;
})(typeof self !== 'undefined' ? self : this);
