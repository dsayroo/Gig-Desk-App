'use strict';
const matching = typeof require === 'function'
  ? require('../song-matching.js')
  : globalThis.GigDeskSongMatching;
const {parseRule, parseRules, assessRequest} = matching;
const cases = [];
const test = (name, run) => cases.push({name, run});
const equal = (actual, expected, message) => {
  if (actual !== expected) throw new Error(message + ': expected ' + expected + ', got ' + actual);
};
const includes = (values, value, message) => {
  if (!values.includes(value)) throw new Error(message + ': missing ' + value);
};

test('matches only the exact normalized title and artist pair', () => {
  const rules = parseRules('September — Earth, Wind & Fire');
  equal(assessRequest('September', 'Earth Wind and Fire', rules).matches.length, 1, 'exact pair');
  equal(assessRequest('September', 'Green Day', rules).matches.length, 0, 'different artist');
});

test('a same-title song by another artist is not a match', () => {
  const result = assessRequest('Halo', 'A different artist', parseRules('Halo — Beyoncé'));
  equal(result.matches.length, 0, 'same title with different artist');
  equal(result.issues.length, 0, 'complete, nonmatching request');
});

test('partial title overlap never triggers a song rule', () => {
  equal(assessRequest('You Are', 'The Beatles', parseRules('You — The Beatles')).matches.length, 0, 'partial title');
});

test('a version suffix remains distinct', () => {
  equal(assessRequest('Hallelujah (Live)', 'Jeff Buckley', parseRules('Hallelujah — Jeff Buckley')).matches.length, 0, 'live version');
});

test('artist-only rules require an explicit label and match the artist field', () => {
  const artistRule = parseRule('Artist: Pitbull');
  equal(assessRequest('Give Me Everything', 'Pitbull', [artistRule]).matches.length, 1, 'artist field');
  equal(assessRequest('Give Me Everything', 'Other Artist', [artistRule]).matches.length, 0, 'different artist');
  const possibleTitle = assessRequest('Pitbull', '', [artistRule]);
  equal(possibleTitle.matches.length, 0, 'artist name in title field');
  includes(possibleTitle.issues, 'artist_may_be_title', 'possible role confusion');
});

test('an unlabeled single entry is sent for review, not treated as an artist', () => {
  const rule = parseRule('Pitbull');
  equal(rule.kind, 'review', 'ambiguous line classification');
  const result = assessRequest('Give Me Everything', 'Pitbull', [rule]);
  equal(result.matches.length, 0, 'ambiguous rule match');
  equal(result.invalidRules.length, 1, 'rule flagged for review');
});

test('missing artist is flagged and cannot match a song rule', () => {
  const result = assessRequest('Halo', '', parseRules('Halo — Beyoncé'));
  equal(result.matches.length, 0, 'incomplete request match');
  includes(result.issues, 'missing_artist', 'incomplete request review');
});

test('reversed title and artist fields are flagged rather than matched', () => {
  const result = assessRequest('Beyoncé', 'Halo', parseRules('Halo — Beyoncé'));
  equal(result.matches.length, 0, 'reversed pair match');
  includes(result.issues, 'swapped_title_artist', 'reversed pair review');
});

let failures = 0;
for (const item of cases) {
  try {
    item.run();
    if (typeof console !== 'undefined') console.log('PASS ' + item.name);
  } catch (error) {
    failures++;
    if (typeof console !== 'undefined') console.log('FAIL ' + item.name + ': ' + error.message);
  }
}
if (failures) throw new Error(failures + ' of ' + cases.length + ' tests failed');
if (typeof console !== 'undefined') console.log(cases.length + '/' + cases.length + ' matching tests passed');
