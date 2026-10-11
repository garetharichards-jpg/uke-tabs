// node tests/run.js
const assert = require('assert');
const P = require('../js/pitch.js');
const T = require('../js/tabtext.js');

function tone(f, sr = 48000, n = 2048, noise = 0.02) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // plucked-string-ish: fundamental + harmonics
    b[i] = 0.5 * Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) + 0.15 * Math.sin(6 * Math.PI * f * t) + noise * (Math.random() - 0.5);
  }
  return b;
}

let fails = 0;
const test = (name, fn) => { try { fn(); console.log('ok  ', name); } catch (e) { fails++; console.log('FAIL', name, '-', e.message); } };

for (const note of ['D3', 'G3', 'B3', 'C4', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4']) {
  for (const sr of [44100, 48000]) {
    test(`detects ${note} @${sr}`, () => {
      const f = P.midiToFreq(P.noteToMidi(note));
      const got = P.detectPitch(tone(f, sr), sr, 70, 1200);
      const c = P.cents(got, f);
      assert(Math.abs(c) < 3, `got ${got.toFixed(2)} Hz (${c.toFixed(1)} cents) for ${f.toFixed(2)}`);
    });
  }
}
test('detects a slightly flat A4', () => {
  const f = 440 * Math.pow(2, -20 / 1200);
  const c = P.cents(P.detectPitch(tone(f), 48000), 440);
  assert(Math.abs(c + 20) < 2, c);
});
test('silence returns -1', () => assert.strictEqual(P.detectPitch(new Float32Array(2048), 48000), -1));
test('noise returns -1 or something', () => {
  const b = new Float32Array(2048).map(() => (Math.random() - 0.5) * 0.3);
  const r = P.detectPitch(b, 48000);
  assert(r === -1 || r > 0);
});
test('nearest string', () => {
  const strings = ['G4', 'C4', 'E4', 'A4'].map((n) => ({ n, midi: P.noteToMidi(n) }));
  assert.strictEqual(P.nearestString(262, strings).string.n, 'C4');
  assert.strictEqual(P.nearestString(395, strings).string.n, 'G4');
});

test('chord line detection', () => {
  assert(T.isChordLine('  C   G   Am   F'));
  assert(T.isChordLine('C7  F/C  Gsus4  Bbmaj7'));
  assert(!T.isChordLine('Amazing grace how sweet the sound'));
  assert(!T.isChordLine('A man walks in'));
});
test('renders chords and tab lines', () => {
  const h = T.renderTabHtml('[Chorus]\nC   G\nHello [Am]world <b>\nA|--3--0--|');
  assert(h.includes('<div class="ln sect">[Chorus]</div>'));
  assert(h.includes('<span class="ch">G</span>'));
  assert(h.includes('<span class="ch">Am</span>'));
  assert(h.includes('&lt;b&gt;'));
  assert(h.includes('<div class="ln tabline">A|--3--0--|</div>'));
  assert(T.widestLine('C   G\n' + 'x'.repeat(100)) === 5, 'long prose ignored for sizing');
});
test('songs from doc text', () => {
  const s = T.songsFromText('Setlist:\n1. Riptide\n2) Somewhere Over the Rainbow\n- Hey Soul Sister\n\n• Banana Pancakes\n');
  assert.deepStrictEqual(s, ['Riptide', 'Somewhere Over the Rainbow', 'Hey Soul Sister', 'Banana Pancakes']);
});
test('songs from sheet with header', () => {
  const s = T.songsFromCsv('#,Song,Artist,Key\n1,Riptide,Vance Joy,C\n2,"Stand By Me, live",Ben E. King,G\n3,,,\n');
  assert.deepStrictEqual(s, ['Riptide - Vance Joy', 'Stand By Me, live - Ben E. King']);
});
test('songs from sheet without header', () => {
  assert.deepStrictEqual(T.songsFromCsv('Riptide\nI\'m Yours\r\n'), ['Riptide', "I'm Yours"]);
});

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
