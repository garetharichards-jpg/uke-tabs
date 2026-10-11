// Google Drive access (read-only) using Google Identity Services tokens + Drive REST v3.
const Drive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
  const API = 'https://www.googleapis.com/drive/v3/';
  const MIME = {
    doc: 'application/vnd.google-apps.document',
    sheet: 'application/vnd.google-apps.spreadsheet',
    pdf: 'application/pdf',
    text: 'text/plain',
  };
  const TOKEN_KEY = 'uke.token';

  class AuthError extends Error {}

  let tokenClient = null;
  let clientIdInUse = null;
  let token = null;
  let pending = null;

  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    if (saved && saved.expires > Date.now() + 60000) token = saved;
  } catch (e) {}

  function clientId() {
    try { return localStorage.getItem('uke.clientId') || window.UKE_CONFIG?.googleClientId || ''; }
    catch (e) { return window.UKE_CONFIG?.googleClientId || ''; }
  }

  function configured() { return !!clientId(); }
  function connected() { return !!token && token.expires > Date.now(); }
  function everConnected() { try { return localStorage.getItem('uke.connected') === '1'; } catch (e) { return false; } }

  function ensureClient() {
    const id = clientId();
    if (!id) throw new AuthError('Add your Google Client ID in Settings first.');
    if (!window.google?.accounts?.oauth2) throw new AuthError('Google sign-in is still loading. Try again in a second.');
    if (!tokenClient || clientIdInUse !== id) {
      clientIdInUse = id;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: SCOPE,
        callback: (resp) => {
          const p = pending; pending = null;
          if (!p) return;
          if (resp.error) return p.reject(new AuthError(resp.error_description || resp.error));
          token = { value: resp.access_token, expires: Date.now() + (resp.expires_in - 60) * 1000 };
          try {
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
            localStorage.setItem('uke.connected', '1');
          } catch (e) {}
          p.resolve(token.value);
        },
        error_callback: (err) => {
          const p = pending; pending = null;
          if (p) p.reject(new AuthError(err?.message || 'Sign-in window was closed.'));
        },
      });
    }
  }

  // Must be called from a tap the first time (opens Google's sign-in popup).
  function connect() {
    ensureClient();
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      tokenClient.requestAccessToken({ prompt: everConnected() ? '' : 'consent' });
    });
  }

  function disconnect() {
    if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.value, () => {});
    token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem('uke.connected'); } catch (e) {}
  }

  async function getToken() {
    if (connected()) return token.value;
    return connect();
  }

  async function request(path, params = {}, as = 'json') {
    const t = await getToken();
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(API + path + (qs ? '?' + qs : ''), { headers: { Authorization: 'Bearer ' + t } });
    if (res.status === 401) {
      token = null;
      try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
      throw new AuthError('Your Google session expired. Tap Connect to sign in again.');
    }
    if (!res.ok) {
      let msg = res.status + ' ' + res.statusText;
      try { msg = (await res.json()).error.message || msg; } catch (e) {}
      throw new Error(msg);
    }
    if (as === 'json') return res.json();
    if (as === 'text') return res.text();
    return res.blob();
  }

  const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const FIELDS = 'files(id,name,mimeType,modifiedTime)';
  const COMMON = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', pageSize: '40', fields: FIELDS };
  const TAB_TYPES = `(mimeType='${MIME.doc}' or mimeType='${MIME.pdf}' or mimeType='${MIME.text}' or mimeType contains 'image/')`;

  function rank(files, term) {
    const t = term.toLowerCase();
    const score = (f) => {
      const n = f.name.toLowerCase();
      if (n === t) return 0;
      if (n.startsWith(t)) return 1;
      if (n.includes(t)) return 2;
      return 3;
    };
    return files.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
  }

  async function searchTabs(term) {
    const s = q(term.trim());
    const byName = request('files', { ...COMMON, q: `trashed=false and name contains '${s}' and ${TAB_TYPES}` });
    const byText = request('files', { ...COMMON, q: `trashed=false and fullText contains '${s}' and ${TAB_TYPES}` }).catch(() => ({ files: [] }));
    const [a, b] = await Promise.all([byName, byText]);
    const seen = new Set();
    const all = [...a.files, ...b.files].filter((f) => !seen.has(f.id) && seen.add(f.id));
    return rank(all, term);
  }

  async function searchLists(term) {
    const types = `(mimeType='${MIME.doc}' or mimeType='${MIME.sheet}')`;
    const clause = term.trim()
      ? `name contains '${q(term.trim())}'`
      : `(name contains 'song' or name contains 'songs' or name contains 'set' or name contains 'setlist' or name contains 'list')`;
    const r = await request('files', { ...COMMON, q: `trashed=false and ${clause} and ${types}`, orderBy: 'modifiedTime desc' });
    return r.files;
  }

  function exportText(id, mime = 'text/plain') { return request('files/' + id + '/export', { mimeType: mime }, 'text'); }
  function mediaText(id) { return request('files/' + id, { alt: 'media', supportsAllDrives: 'true' }, 'text'); }
  function mediaBlob(id) { return request('files/' + id, { alt: 'media', supportsAllDrives: 'true' }, 'blob'); }

  function kind(mime) {
    if (mime === MIME.doc || mime === MIME.text) return 'doc';
    if (mime === MIME.pdf) return 'pdf';
    if (mime === MIME.sheet) return 'sheet';
    if (mime && mime.startsWith('image/')) return 'img';
    return 'other';
  }

  return { configured, connected, everConnected, connect, disconnect, searchTabs, searchLists, exportText, mediaText, mediaBlob, kind, MIME, AuthError };
})();
