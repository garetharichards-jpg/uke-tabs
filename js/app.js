// App shell: tabs, Drive search, recent songs, song lists, settings.
const App = (() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  const SAMPLE = {
    id: 'sample-amazing-grace',
    name: 'Amazing Grace (sample)',
    kind: 'doc',
    text: `Amazing Grace
Traditional · 3/4 · Key of C

[Intro]
C   F   C   G

[Verse 1]
        C           C7        F         C
Amazing grace, how sweet the sound
                       Am       G
That saved a wretch like me
      C          C7          F        C
I once was lost, but now am found
        Am      G         C
Was blind, but now I see

[Verse 2]
       C          C7         F         C
'Twas grace that taught my heart to fear
                       Am          G
And grace my fears relieved
      C           C7         F        C
How precious did that grace appear
     Am        G         C
The hour I first believed

[Verse 3]
        C             C7          F          C
Through many dangers, toils and snares
                          Am       G
I have already come
       C            C7           F         C
'Tis grace hath brought me safe thus far
       Am          G           C
And grace will lead me home

[Verse 4]
         C          C7           F          C
When we've been there ten thousand years
                         Am      G
Bright shining as the sun
       C             C7            F        C
We've no less days to sing God's praise
         Am         G         C
Than when we'd first begun

[Outro]
C   F   C   G   C

Ukulele chord shapes (G C E A strings)
C   0003     F   2010     G   0232
C7  0001     Am  2000

A|-----0-----3-----0-----|
E|---0---0-----0-----0---|
C|-0-----------------0---|
G|-----------------------|

Tip: tap Listen, then tap play. Scrolling waits until you start playing
and pauses when you stop. Use − and + to set the speed for this song.`,
  };

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function handleError(e) {
    console.error(e);
    if (e instanceof Drive.AuthError) { renderDriveStatus(); toast(e.message); }
    else toast(e.message || 'Something went wrong.');
  }

  // ---------- tabs ----------
  function showTab(name) {
    ['songs', 'lists', 'tuner'].forEach((n) => { $('screen-' + n).hidden = n !== name; });
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    if (name !== 'tuner') Tuner.hide();
    store.set('uke.tab', name);
  }

  // ---------- list items ----------
  const KIND_LABEL = { doc: 'TAB', pdf: 'PDF', img: 'IMG', sheet: 'SHEET', other: 'FILE' };
  function item({ name, sub, kind, onClick, onRemove }) {
    const b = document.createElement('button');
    b.className = 'item';
    b.type = 'button';
    const k = document.createElement('span');
    k.className = 'kind ' + (kind || '');
    k.textContent = KIND_LABEL[kind] || '';
    const meta = document.createElement('span');
    meta.className = 'meta';
    const n = document.createElement('div'); n.className = 'name'; n.textContent = name;
    meta.appendChild(n);
    if (sub) { const s = document.createElement('div'); s.className = 'sub'; s.textContent = sub; meta.appendChild(s); }
    if (kind) b.appendChild(k);
    b.appendChild(meta);
    if (onRemove) {
      const x = document.createElement('span');
      x.className = 'x'; x.textContent = '×'; x.setAttribute('role', 'button'); x.setAttribute('aria-label', 'Remove ' + name);
      x.addEventListener('click', (e) => { e.stopPropagation(); onRemove(); });
      b.appendChild(x);
    }
    b.addEventListener('click', onClick);
    return b;
  }
  function empty(el, msg) { el.innerHTML = ''; const d = document.createElement('div'); d.className = 'empty'; d.textContent = msg; el.appendChild(d); }

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  // ---------- Drive status ----------
  function renderDriveStatus() {
    const el = $('drive-status');
    el.innerHTML = '';
    if (Drive.connected()) return;
    const card = document.createElement('div');
    card.className = 'card';
    if (!Drive.configured()) {
      card.innerHTML = '<h3>Connect your Google Drive</h3><p class="muted">One-time setup: paste your Google Client ID in Settings so the app can read your tabs and song lists. Until then, try the sample song below.</p>';
      const b = document.createElement('button');
      b.className = 'btn primary'; b.textContent = 'Open settings';
      b.addEventListener('click', openSettings);
      card.appendChild(b);
    } else {
      card.innerHTML = `<h3>${Drive.everConnected() ? 'Reconnect' : 'Connect'} Google Drive</h3><p class="muted">Read-only access to find your Docs, PDFs and photos of tabs.</p>`;
      const b = document.createElement('button');
      b.className = 'btn primary'; b.textContent = 'Connect Google Drive';
      b.addEventListener('click', async () => {
        try { await Drive.connect(); renderDriveStatus(); toast('Drive connected'); } catch (e) { handleError(e); }
      });
      card.appendChild(b);
    }
    el.appendChild(card);
  }

  // ---------- songs ----------
  function songFromFile(f) {
    const kind = Drive.kind(f.mimeType);
    return {
      id: f.id, name: f.name, kind, mimeType: f.mimeType,
      load: kind === 'doc' ? () => loadText(f) : () => Drive.mediaBlob(f.id),
    };
  }

  async function loadText(f) {
    try {
      return f.mimeType === Drive.MIME.doc ? await Drive.exportText(f.id) : await Drive.mediaText(f.id);
    } catch (e) {
      const cached = store.get('uke.text.' + f.id, null);
      if (cached != null) { toast('Offline: showing your saved copy'); return cached; }
      throw e;
    }
  }

  function cacheText(song, text) {
    if (song.id === SAMPLE.id) return;
    store.set('uke.text.' + song.id, text);
  }

  function openSong(s) {
    if (s.id !== SAMPLE.id) addRecent(s);
    history.pushState({ viewer: true }, '');
    Viewer.open(s);
  }

  function addRecent(s) {
    const r = store.get('uke.recent', []).filter((x) => x.id !== s.id);
    r.unshift({ id: s.id, name: s.name, mimeType: s.mimeType });
    const dropped = r.splice(25);
    dropped.forEach((d) => { try { localStorage.removeItem('uke.text.' + d.id); } catch (e) {} });
    store.set('uke.recent', r);
    renderRecent();
  }

  function renderRecent() {
    const el = $('recent');
    el.innerHTML = '';
    const r = store.get('uke.recent', []);
    r.forEach((f) => el.appendChild(item({
      name: f.name, kind: Drive.kind(f.mimeType), sub: KIND_LABEL[Drive.kind(f.mimeType)] === 'TAB' ? 'Google Doc' : '',
      onClick: () => openSong(songFromFile(f)),
      onRemove: () => { store.set('uke.recent', store.get('uke.recent', []).filter((x) => x.id !== f.id)); renderRecent(); },
    })));
    el.appendChild(item({ name: SAMPLE.name, kind: 'doc', sub: 'Built-in example to try scrolling', onClick: () => openSong(SAMPLE) }));
  }

  function showResults(el, files, term) {
    el.innerHTML = '';
    if (!files.length) {
      empty(el, `No tabs called “${term}” in your Drive.`);
      const a = document.createElement('a');
      a.className = 'btn ghost';
      a.href = 'https://www.ultimate-guitar.com/search.php?search_type=title&value=' + encodeURIComponent(term + ' ukulele');
      a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Search the web for “' + term + '” ukulele chords ↗';
      a.style.textAlign = 'center'; a.style.textDecoration = 'none';
      el.appendChild(a);
      return;
    }
    files.forEach((f) => el.appendChild(item({
      name: f.name, kind: Drive.kind(f.mimeType), sub: 'Edited ' + fmtDate(f.modifiedTime),
      onClick: () => openSong(songFromFile(f)),
    })));
  }

  async function searchSongs(term) {
    const el = $('song-results');
    if (!term.trim()) { el.innerHTML = ''; return; }
    const sample = SAMPLE.name.toLowerCase().includes(term.trim().toLowerCase());
    if (!Drive.configured()) {
      if (sample) { el.innerHTML = ''; el.appendChild(item({ name: SAMPLE.name, kind: 'doc', onClick: () => openSong(SAMPLE) })); }
      else empty(el, 'Connect Google Drive to search your tabs.');
      return;
    }
    empty(el, 'Searching your Drive…');
    try {
      const files = await Drive.searchTabs(term);
      renderDriveStatus();
      showResults(el, files, term);
    } catch (e) { el.innerHTML = ''; handleError(e); }
  }

  // Search a title from a song list. Opens directly if there's one clear match.
  async function findAndOpen(title) {
    try {
      let files = await Drive.searchTabs(title);
      const short = title.split(/\s+[-–—|]\s+|\s+\(/)[0].trim();
      if (!files.length && short && short !== title) files = await Drive.searchTabs(short);
      const exact = files.filter((f) => f.name.toLowerCase().replace(/\.[a-z0-9]+$/, '').trim() === short.toLowerCase());
      if (files.length === 1 || exact.length === 1) return openSong(songFromFile(exact[0] || files[0]));
      openSheet(`Tabs for “${title}”`, (body) => showResults(body, files, short || title));
    } catch (e) { handleError(e); }
  }

  // ---------- song lists ----------
  async function searchLists(term) {
    const el = $('list-results');
    if (!Drive.configured()) { empty(el, 'Connect Google Drive in Settings first.'); return; }
    empty(el, 'Searching…');
    try {
      const files = await Drive.searchLists(term);
      el.innerHTML = '';
      if (!files.length) return empty(el, term ? `No Docs or Sheets called “${term}”.` : 'Type the name of your song list above.');
      files.forEach((f) => el.appendChild(item({
        name: f.name, kind: Drive.kind(f.mimeType), sub: (f.mimeType === Drive.MIME.sheet ? 'Google Sheet' : 'Google Doc') + ' · ' + fmtDate(f.modifiedTime),
        onClick: () => openList(f),
      })));
    } catch (e) { el.innerHTML = ''; handleError(e); }
  }

  function renderSavedLists() {
    const el = $('saved-lists');
    el.innerHTML = '';
    const lists = store.get('uke.lists', []);
    if (!lists.length) return empty(el, 'Lists you open are kept here.');
    lists.forEach((f) => el.appendChild(item({
      name: f.name, kind: Drive.kind(f.mimeType), sub: f.count ? f.count + ' songs' : '',
      onClick: () => openList(f),
      onRemove: () => { store.set('uke.lists', store.get('uke.lists', []).filter((x) => x.id !== f.id)); renderSavedLists(); },
    })));
  }

  async function openList(f) {
    $('lists-home').hidden = true;
    $('list-view').hidden = false;
    $('list-title').textContent = f.name;
    $('list-count').textContent = '';
    const ol = $('list-songs');
    ol.innerHTML = '<li class="empty">Loading…</li>';
    let songs;
    try {
      songs = f.mimeType === Drive.MIME.sheet
        ? TabText.songsFromCsv(await Drive.exportText(f.id, 'text/csv'))
        : TabText.songsFromText(await Drive.exportText(f.id));
      store.set('uke.listsongs.' + f.id, songs);
    } catch (e) {
      songs = store.get('uke.listsongs.' + f.id, null);
      if (!songs) { ol.innerHTML = ''; handleError(e); return; }
      toast('Offline: showing your saved copy');
    }
    // the first line of a Doc is often its title
    if (songs.length && songs[0].toLowerCase() === f.name.toLowerCase()) songs.shift();
    const lists = store.get('uke.lists', []).filter((x) => x.id !== f.id);
    lists.unshift({ id: f.id, name: f.name, mimeType: f.mimeType, count: songs.length });
    store.set('uke.lists', lists.slice(0, 20));
    renderSavedLists();

    $('list-count').textContent = songs.length + ' songs';
    ol.innerHTML = '';
    if (!songs.length) { ol.innerHTML = '<li class="empty">This list looks empty. Put one song per line.</li>'; return; }
    songs.forEach((title) => {
      const li = document.createElement('li');
      li.appendChild(item({ name: title, onClick: () => findAndOpen(title) }));
      ol.appendChild(li);
    });
  }

  // ---------- sheets ----------
  function openSheet(title, fill) {
    $('sheet-title').textContent = title;
    const body = $('sheet-body');
    body.innerHTML = '';
    fill(body);
    $('sheet').hidden = false;
    body.addEventListener('click', closeSheetOnPick, { once: true });
  }
  function closeSheetOnPick(e) { if (e.target.closest('.item')) $('sheet').hidden = true; }

  function openSettings() {
    let v = '';
    try { v = localStorage.getItem('uke.clientId') || window.UKE_CONFIG?.googleClientId || ''; } catch (e) {}
    $('client-id').value = v;
    $('settings').hidden = false;
  }

  // ---------- boot ----------
  function init() {
    Tuner.init();
    Viewer.init();

    document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    showTab(store.get('uke.tab', 'songs'));

    $('song-search').addEventListener('submit', (e) => { e.preventDefault(); $('song-q').blur(); searchSongs($('song-q').value); });
    $('list-search').addEventListener('submit', (e) => { e.preventDefault(); $('list-q').blur(); searchLists($('list-q').value); });
    $('list-back').addEventListener('click', () => { $('list-view').hidden = true; $('lists-home').hidden = false; });

    $('open-settings').addEventListener('click', openSettings);
    $('settings-close').addEventListener('click', () => { $('settings').hidden = true; });
    $('save-settings').addEventListener('click', () => {
      const v = $('client-id').value.trim();
      try { v ? localStorage.setItem('uke.clientId', v) : localStorage.removeItem('uke.clientId'); } catch (e) {}
      $('settings').hidden = true;
      renderDriveStatus();
      toast(v ? 'Saved. Tap Connect Google Drive.' : 'Client ID removed');
    });
    $('disconnect').addEventListener('click', () => { Drive.disconnect(); renderDriveStatus(); $('settings').hidden = true; toast('Drive disconnected'); });
    $('sheet-close').addEventListener('click', () => { $('sheet').hidden = true; });
    ['sheet', 'settings'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target.id === id) $(id).hidden = true; }));

    window.addEventListener('popstate', () => { if (Viewer.isOpen()) Viewer.close(); });

    renderDriveStatus();
    renderRecent();
    renderSavedLists();

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  return { init, toast, handleError, cacheText };
})();

document.addEventListener('DOMContentLoaded', App.init);
