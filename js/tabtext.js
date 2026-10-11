// Turning plain text into readable tab/chord sheets, and parsing song lists.
(function (root) {
  const CHORD = /^\(?[A-G](?:#|b)?(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+)?\d{0,2}(?:(?:sus|add|maj|b|#)\d{1,2})*(?:\/[A-G](?:#|b)?)?\)?$/;
  const TABLINE = /^\s*[A-Ga-g]?\s*[|:][-0-9hpbrsx/\\~|:.()\s]{4,}$/;
  const SECTION = /^\s*[\[(]?(intro|verse|chorus|pre-chorus|prechorus|bridge|outro|solo|instrumental|interlude|refrain|tag|coda|ending)\b[^\n]*$/i;

  const WRAP_AT = 64;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function isChordLine(line) {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return false;
    const chords = tokens.filter((t) => CHORD.test(t) || /^[|/x%-]+$/.test(t) || /^x\d$/i.test(t));
    return chords.length / tokens.length >= 0.75 && tokens.some((t) => CHORD.test(t));
  }

  // Inline chords like "[C]You are my [F]sunshine"
  function inlineChords(line) {
    return esc(line).replace(/\[([A-G][^\]\s]{0,8})\]/g, (m, c) => (CHORD.test(c) ? `<span class="ch">${c}</span>` : m));
  }

  // Each line becomes its own row so chord lines never wrap away from their lyrics.
  // Long prose lines (not chords or tab) are allowed to wrap.
  function renderTabHtml(text) {
    const lines = text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/^\ufeff/, '').replace(/\t/g, '    ').split('\n');
    return lines.map((line) => {
      let cls = 'ln', html;
      if (TABLINE.test(line)) { cls += ' tabline'; html = esc(line); }
      else if (SECTION.test(line) && line.trim().length < 40) { cls += ' sect'; html = esc(line); }
      else if (isChordLine(line)) { cls += ' chords'; html = esc(line).replace(/(\S+)/g, (t) => (CHORD.test(t) ? `<span class="ch">${t}</span>` : t)); }
      else { html = inlineChords(line); if (line.length > WRAP_AT) cls += ' prose'; }
      return `<div class="${cls}">${html || ' '}</div>`;
    }).join('');
  }

  // Longest line that must not wrap, used to size the text to the screen.
  function widestLine(text) {
    let max = 0;
    for (const line of text.replace(/\t/g, '    ').split(/\r?\n/)) {
      const keep = TABLINE.test(line) || isChordLine(line) || line.length <= WRAP_AT;
      if (keep) max = Math.max(max, line.replace(/\s+$/, '').length);
    }
    return max;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function cleanTitle(s) {
    return s.replace(/^\s*(?:\d+[.)\]:-]?|[-*•·–—]|\[[ x]\])\s+/, '').replace(/\s+/g, ' ').trim();
  }

  // Google Doc text -> song titles
  function songsFromText(text) {
    return text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n')
      .map(cleanTitle)
      .filter((s) => s && s.length < 120 && !/^(set ?list|song ?list|songs)\s*:?$/i.test(s));
  }

  // Google Sheet CSV -> song titles (uses a "Song"/"Title" column if there's a header, else column A)
  function songsFromCsv(csv) {
    const rows = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
    if (!rows.length) return [];
    let col = 0, start = 0, artistCol = -1;
    const header = rows[0].map((c) => c.trim().toLowerCase());
    const titleIdx = header.findIndex((h) => /^(song|songs|title|song title|song name|name|track)$/.test(h));
    if (titleIdx >= 0) {
      col = titleIdx; start = 1;
      artistCol = header.findIndex((h) => /^(artist|band|by)$/.test(h));
    }
    return rows.slice(start)
      .map((r) => {
        const title = cleanTitle(r[col] || '');
        const artist = artistCol >= 0 ? (r[artistCol] || '').trim() : '';
        return title ? (artist ? `${title} - ${artist}` : title) : '';
      })
      .filter(Boolean);
  }

  const api = { renderTabHtml, widestLine, isChordLine, songsFromText, songsFromCsv, parseCsv, cleanTitle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TabText = api;
})(typeof self !== 'undefined' ? self : this);
