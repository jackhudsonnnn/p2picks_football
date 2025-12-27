const test = require('node:test');
const assert = require('node:assert/strict');

const sorcerer = require('../dist/modes/modules/scoreSorcerer/evaluator.js');

function createDoc(homeScore, awayScore, status = 'STATUS_IN_PROGRESS') {
  return {
    status,
    teams: [
      { homeAway: 'home', score: homeScore },
      { homeAway: 'away', score: awayScore },
    ],
  };
}

const config = {
  home_team_id: 'HOME',
  home_team_name: 'Home Team',
  away_team_id: 'AWAY',
  away_team_name: 'Away Team',
};

function baselineFromScores(home, away) {
  const doc = createDoc(home, away);
  return sorcerer.buildScoreSorcererBaseline(doc, config, 'game-1', new Date().toISOString());
}

test('home team scoring first wins', () => {
  const baseline = baselineFromScores(7, 3);
  const updated = createDoc(10, 3);
  const result = sorcerer.evaluateScoreSorcerer(updated, baseline);
  assert.equal(result?.decision, 'home');
  assert.equal(result?.deltaHome, 3);
  assert.equal(result?.deltaAway, 0);
});

test('away team scoring first wins', () => {
  const baseline = baselineFromScores(10, 7);
  const updated = createDoc(10, 10);
  const result = sorcerer.evaluateScoreSorcerer(updated, baseline);
  assert.equal(result?.decision, 'away');
  assert.equal(result?.deltaHome, 0);
  assert.equal(result?.deltaAway, 3);
});

test('simultaneous scoring washes', () => {
  const baseline = baselineFromScores(14, 10);
  const updated = createDoc(17, 13);
  const result = sorcerer.evaluateScoreSorcerer(updated, baseline);
  assert.equal(result?.decision, 'simultaneous');
});

test('no more scores wins when game ends without change', () => {
  const baseline = baselineFromScores(21, 17);
  const updated = createDoc(21, 17, 'STATUS_FINAL');
  const result = sorcerer.evaluateScoreSorcerer(updated, baseline);
  assert.equal(result?.decision, 'no_more_scores');
});
