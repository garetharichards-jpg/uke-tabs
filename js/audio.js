// Shared microphone + audio context. The mic is opened on demand and released when nothing needs it.
const Audio2 = (() => {
  let ctx = null;
  let stream = null;
  let source = null;
  const users = new Set();

  function context() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Call from a tap. Returns an AnalyserNode fed by the mic.
  async function openMic(user, fftSize = 2048) {
    const c = context();
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      source = c.createMediaStreamSource(stream);
    }
    users.add(user);
    const analyser = c.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    return analyser;
  }

  function closeMic(user, analyser) {
    users.delete(user);
    if (analyser && source) { try { source.disconnect(analyser); } catch (e) {} }
    if (!users.size && stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      source = null;
    }
  }

  // Play a plucked-ish reference tone.
  function playTone(freq, seconds = 1.6) {
    const c = context();
    const t = c.currentTime;
    const osc = c.createOscillator();
    const osc2 = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain);
    osc2.connect(g2).connect(gain);
    gain.connect(c.destination);
    osc.start(t); osc2.start(t);
    osc.stop(t + seconds); osc2.stop(t + seconds);
  }

  // Keep the screen awake while playing.
  let lock = null;
  async function keepAwake(on) {
    try {
      if (on && !lock && 'wakeLock' in navigator) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      } else if (!on && lock) {
        await lock.release();
        lock = null;
      }
    } catch (e) { /* not supported or refused */ }
  }

  return { context, openMic, closeMic, playTone, keepAwake };
})();
