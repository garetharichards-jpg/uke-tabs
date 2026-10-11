// Song viewer with auto-scroll that can listen and pause when you stop playing.
const Viewer = (() => {
  const MIN_SPEED = 4, MAX_SPEED = 240;
  const HOLD_MS = 2200;        // keep scrolling this long after the last sound
  const LIFT_DB = 12;          // how far above the room noise counts as playing

  let els, song = null, prefs = {}, urls = [];
  let running = false, listen = false, dragging = false, pos = 0, lastT = 0, raf = 0;
  let analyser = null, levelBuf = null, floorDb = -70, lastSound = 0, startedAt = 0;
  let pdfRenderToken = 0, widest = 0;

  function init() {
    els = {
      root: document.getElementById('viewer'),
      title: document.getElementById('v-title'),
      scroll: document.getElementById('v-scroll'),
      content: document.getElementById('v-content'),
      play: document.getElementById('v-play'),
      playIco: document.getElementById('play-ico'),
      speed: document.getElementById('v-speed'),
      listen: document.getElementById('v-listen'),
      dot: document.getElementById('mic-dot'),
      follow: document.getElementById('follow-state'),
    };
    if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    document.getElementById('v-back').addEventListener('click', () => history.back());
    document.getElementById('v-slower').addEventListener('click', () => setSpeed(prefs.speed / 1.15));
    document.getElementById('v-faster').addEventListener('click', () => setSpeed(prefs.speed * 1.15));
    document.getElementById('v-smaller').addEventListener('click', () => setSize(-1));
    document.getElementById('v-bigger').addEventListener('click', () => setSize(1));
    els.play.addEventListener('click', () => (running ? pause() : play()));
    els.listen.addEventListener('click', toggleListen);

    // Manual scrolling moves the play position.
    const sync = () => { pos = els.scroll.scrollTop; };
    els.scroll.addEventListener('touchstart', () => { dragging = true; }, { passive: true });
    els.scroll.addEventListener('touchend', () => { dragging = false; setTimeout(sync, 300); }, { passive: true });
    els.scroll.addEventListener('touchmove', sync, { passive: true });
    els.scroll.addEventListener('wheel', sync, { passive: true });
    els.scroll.addEventListener('scroll', () => { if (!running) sync(); }, { passive: true });

    // Tap the sheet (without dragging) to start/stop.
    let down = null;
    els.scroll.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    els.scroll.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 8 && Date.now() - down.t < 350) running ? pause() : play();
      down = null;
    });

    window.addEventListener('resize', () => { if (song && song.kind === 'doc' && !prefs.size) applySize(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && running) Audio2.keepAwake(true);
    });
    window.addEventListener('keydown', (e) => {
      if (els.root.hidden) return;
      // Bluetooth page-turner pedals usually send arrow / page keys.
      if (['PageDown', 'ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); nudge(1); }
      if (['PageUp', 'ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); nudge(-1); }
      if (e.key === ' ') { e.preventDefault(); running ? pause() : play(); }
    });
  }

  function nudge(dir) {
    els.scroll.scrollBy({ top: dir * els.scroll.clientHeight * 0.8, behavior: 'smooth' });
    setTimeout(() => { pos = els.scroll.scrollTop; }, 400);
  }

  function loadPrefs(id) {
    try { return JSON.parse(localStorage.getItem('uke.song.' + id) || 'null') || {}; } catch (e) { return {}; }
  }
  function savePrefs() {
    if (!song) return;
    try { localStorage.setItem('uke.song.' + song.id, JSON.stringify(prefs)); } catch (e) {}
  }

  function setSpeed(v) {
    prefs.speed = Math.round(Math.max(MIN_SPEED, Math.min(MAX_SPEED, v)));
    els.speed.textContent = prefs.speed;
    savePrefs();
  }

  function setSize(step) {
    if (song.kind === 'doc') {
      prefs.size = Math.max(9, Math.min(32, (prefs.size || fitSize()) + step));
      applySize();
    } else {
      prefs.zoom = Math.max(1, Math.min(3, +((prefs.zoom || 1) + step * 0.25).toFixed(2)));
      applyZoom();
    }
    savePrefs();
  }

  // Largest text size (up to 20px) at which the widest chord/tab line fits the screen.
  function fitSize() {
    const avail = (els.content.clientWidth || window.innerWidth - 32) - 2;
    return Math.max(10, Math.min(20, Math.floor(avail / (Math.max(widest, 20) * 0.61))));
  }
  function applySize() {
    els.content.style.setProperty('--tab-size', (prefs.size || fitSize()) + 'px');
  }

  function applyZoom() {
    const pages = els.content.querySelector('.pages');
    if (!pages) return;
    pages.style.setProperty('--zoom', prefs.zoom || 1);
    pages.classList.toggle('fit', (prefs.zoom || 1) === 1);
  }

  // song: {id, name, kind: 'doc'|'pdf'|'img', text?, load?: () => Promise}
  async function open(s) {
    close(true);
    song = s;
    prefs = { speed: 20, size: 0, zoom: 1, ...loadPrefs(s.id) }; // size 0 = fit to screen
    els.title.textContent = s.name;
    els.speed.textContent = prefs.speed;
    els.root.hidden = false;
    els.scroll.scrollTop = 0;
    pos = 0;
    els.content.innerHTML = '<div class="loading">Loading…</div>';
    try {
      if (s.kind === 'doc') {
        const text = s.text != null ? s.text : await s.load();
        if (song !== s) return;
        const pre = document.createElement('div');
        pre.className = 'tabtext';
        pre.innerHTML = TabText.renderTabHtml(text);
        els.content.replaceChildren(pre);
        widest = TabText.widestLine(text);
        applySize();
        App.cacheText(s, text);
      } else if (s.kind === 'img') {
        const blob = await s.load();
        if (song !== s) return;
        const url = URL.createObjectURL(blob); urls.push(url);
        const wrap = document.createElement('div');
        wrap.className = 'pages fit';
        const img = new Image(); img.src = url; img.alt = s.name;
        wrap.appendChild(img);
        els.content.replaceChildren(wrap);
        applyZoom();
      } else if (s.kind === 'pdf') {
        const blob = await s.load();
        if (song !== s) return;
        await renderPdf(blob, s);
      }
    } catch (e) {
      if (song !== s) return;
      els.content.innerHTML = '';
      const p = document.createElement('div');
      p.className = 'loading';
      p.textContent = 'Could not open this song: ' + e.message;
      els.content.appendChild(p);
      App.handleError(e);
    }
  }

  async function renderPdf(blob, s) {
    if (!window.pdfjsLib) throw new Error('PDF viewer did not load. Check your connection.');
    const token = ++pdfRenderToken;
    const pdf = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
    const wrap = document.createElement('div');
    wrap.className = 'pages fit';
    els.content.replaceChildren(wrap);
    applyZoom();
    const cssWidth = Math.min(els.content.clientWidth || window.innerWidth, 900);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let i = 1; i <= pdf.numPages; i++) {
      if (token !== pdfRenderToken || song !== s) return;
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = (cssWidth * dpr * 1.5) / base.width; // headroom for zooming in
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      canvas.setAttribute('aria-label', `${s.name}, page ${i}`);
      wrap.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }
  }

  function close(keepOpen) {
    pause();
    if (listen) toggleListen();
    pdfRenderToken++;
    urls.forEach((u) => URL.revokeObjectURL(u)); urls = [];
    if (!keepOpen) { els.root.hidden = true; song = null; }
  }

  function play() {
    if (els.scroll.scrollTop + els.scroll.clientHeight >= els.scroll.scrollHeight - 2) {
      els.scroll.scrollTop = 0; // at the end: start again from the top
    }
    running = true;
    pos = els.scroll.scrollTop;
    startedAt = performance.now();
    lastT = 0;
    els.playIco.innerHTML = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';
    els.play.setAttribute('aria-label', 'Stop scrolling');
    Audio2.keepAwake(true);
    tick();
  }

  function pause() {
    running = false;
    els.playIco.innerHTML = '<path d="M8 5v14l11-7z"/>';
    els.play.setAttribute('aria-label', 'Start scrolling');
    if (!listen) cancelAnimationFrame(raf);
    Audio2.keepAwake(false);
    updateFollow(false);
  }

  async function toggleListen() {
    if (listen) {
      listen = false;
      Audio2.closeMic('follow', analyser);
      analyser = null;
      els.listen.setAttribute('aria-pressed', 'false');
      els.dot.style.transform = '';
      els.follow.hidden = true;
      if (!running) cancelAnimationFrame(raf);
      return;
    }
    try {
      analyser = await Audio2.openMic('follow', 1024);
    } catch (e) {
      App.toast('Microphone blocked. Allow mic access to use Listen.');
      return;
    }
    levelBuf = new Float32Array(analyser.fftSize);
    floorDb = -70;
    lastSound = 0;
    listen = true;
    els.listen.setAttribute('aria-pressed', 'true');
    App.toast('Listening: scrolling pauses when you stop playing');
    if (!running) { cancelAnimationFrame(raf); lastT = 0; tick(); }
  }

  function levelDb() {
    analyser.getFloatTimeDomainData(levelBuf);
    let s = 0;
    for (let i = 0; i < levelBuf.length; i++) s += levelBuf[i] * levelBuf[i];
    return 20 * Math.log10(Math.sqrt(s / levelBuf.length) + 1e-9);
  }

  function updateFollow(playing) {
    if (!listen || !running) { els.follow.hidden = true; return; }
    els.follow.hidden = false;
    els.follow.className = 'follow ' + (playing ? 'on' : 'wait');
    els.follow.textContent = playing ? 'Following you' : (lastSound ? 'Paused, waiting for you to play' : 'Start playing and I’ll scroll');
  }

  function tick(t) {
    raf = requestAnimationFrame(tick);
    if (t === undefined) return;
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
    lastT = t;

    let playing = true;
    if (listen && analyser) {
      const db = levelDb();
      // Track the room's noise floor: drop fast, rise slowly.
      if (db < floorDb) floorDb = db;
      else floorDb += (db - floorDb) * 0.0015;
      const threshold = Math.max(floorDb + LIFT_DB, -58);
      if (db > threshold) lastSound = t;
      playing = lastSound > 0 && t - lastSound < HOLD_MS;
      const lvl = Math.max(0, Math.min(1, (db - floorDb) / 30));
      els.dot.style.transform = `scale(${1 + lvl * 1.4})`;
      updateFollow(playing);
    }

    if (running && playing && dt && !dragging) {
      pos += prefs.speed * dt;
      const max = els.scroll.scrollHeight - els.scroll.clientHeight;
      if (pos >= max) { pos = max; els.scroll.scrollTop = pos; pause(); App.toast('End of song'); return; }
      els.scroll.scrollTop = pos;
    }
    if (!running && !listen) cancelAnimationFrame(raf);
  }

  function isOpen() { return !els.root.hidden; }

  return { init, open, close, isOpen };
})();
