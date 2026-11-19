/* Conservative song/artist matching shared by the DJ board and focused tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GigDeskSongMatching = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalize(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseRule(raw) {
    const source = String(raw == null ? '' : raw).trim().replace(/[“”"]/g, '');
    if (!source) return {kind: 'empty', raw: source};

    const artistOnly = source.match(/^artist\s*:\s*(.+)$/i);
    if (artistOnly) {
      const artist = normalize(artistOnly[1]);
      return artist
        ? {kind: 'artist', artist, raw: source}
        : {kind: 'review', reason: 'missing_artist', raw: source};
    }

    const pair = source.match(/^(.+?)\s+[—–-]\s+(.+)$/u);
    if (pair) {
      const title = normalize(pair[1]);
      const artist = normalize(pair[2]);
      return title && artist
        ? {kind: 'song', title, artist, raw: source}
        : {kind: 'review', reason: 'incomplete_pair', raw: source};
    }

    // A bare line could be a song title or an artist; never guess its role.
    return {kind: 'review', reason: 'label_rule', raw: source};
  }

  function parseRules(text) {
    return String(text == null ? '' : text)
      .split(/\n|;/)
      .map(line => line.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '').trim())
      .filter(Boolean)
      .map(parseRule);
  }

  function assessRequest(song, artist, rules) {
    const title = normalize(song);
    const performer = normalize(artist);
    const parsed = (Array.isArray(rules) ? rules : []).map(rule =>
      typeof rule === 'string' ? parseRule(rule) : rule
    );
    const matches = [];
    const issues = [];
    const invalidRules = parsed.filter(rule => rule.kind === 'review');

    if (!title) issues.push('missing_title');
    if (!performer) issues.push('missing_artist');

    parsed.forEach(rule => {
      if (!rule || rule.kind === 'empty' || rule.kind === 'review') return;
      if (!title || !performer) {
        if (!performer && rule.kind === 'artist' && title && title === rule.artist) {
          issues.push('artist_may_be_title');
        }
        return;
      }
      if (rule.kind === 'artist') {
        if (performer === rule.artist) matches.push(rule);
        return;
      }
      if (rule.kind !== 'song') return;
      if (title === rule.title && performer === rule.artist) {
        matches.push(rule);
      } else if (title === rule.artist && performer === rule.title) {
        issues.push('swapped_title_artist');
      }
    });

    return {matches, issues: Array.from(new Set(issues)), invalidRules};
  }

  return {normalize, parseRule, parseRules, assessRequest};
});
