const test = require('node:test');
const assert = require('node:assert/strict');

const spreadEvaluator = require('../dist/modes/modules/spreadTheWealth/evaluator.js');

function buildDoc({ homeScore, awayScore }) {
  return {
    teams: [
      { teamId: '1', score: homeScore, homeAway: 'home', name: 'Home Team' },
      { teamId: '2', score: awayScore, homeAway: 'away', name: 'Away Team' },
    ],
  };
}

const baseConfig = {
  home_team_id: '1',
  away_team_id: '2',
};

test('evaluateSpreadTheWealth favors home team when negative adjusted score exceeds away score', () => {
  const doc = buildDoc({ homeScore: 21, awayScore: 17 });
  const result = spreadEvaluator.evaluateSpreadTheWealth(doc, baseConfig, -3.5);
  assert.equal(result.decision, 'home');
  assert.equal(result.adjustedHomeScore, 17.5);
});

test('evaluateSpreadTheWealth favors away team when negative adjusted score is lower', () => {
  const doc = buildDoc({ homeScore: 21, awayScore: 17 });
  const result = spreadEvaluator.evaluateSpreadTheWealth(doc, baseConfig, -4.5);
  assert.equal(result.decision, 'away');
  assert.equal(result.adjustedHomeScore, 16.5);
});

test('evaluateSpreadTheWealth favors home team when positive adjusted score exceeds away score', () => {
  const doc = buildDoc({ homeScore: 17, awayScore: 21 });
  const result = spreadEvaluator.evaluateSpreadTheWealth(doc, baseConfig, +3.5);
  assert.equal(result.decision, 'away');
  assert.equal(result.adjustedHomeScore, 20.5);
});

test('evaluateSpreadTheWealth favors away team when positive adjusted score is lower', () => {
  const doc = buildDoc({ homeScore: 17, awayScore: 21 });
  const result = spreadEvaluator.evaluateSpreadTheWealth(doc, baseConfig, +4.5);
  assert.equal(result.decision, 'home');
  assert.equal(result.adjustedHomeScore, 21.5);
});

test('evaluateSpreadTheWealth returns tie when adjusted score matches on whole-number spread', () => {
  const doc = buildDoc({ homeScore: 21, awayScore: 21 });
  const result = spreadEvaluator.evaluateSpreadTheWealth(doc, baseConfig, 0);
  assert.equal(result.decision, 'tie');
  assert.equal(result.adjustedHomeScore, 21);
});

test('normalizeSpread prefers numeric spread_value then parseable spread string', () => {
  assert.equal(spreadEvaluator.normalizeSpread({ spread_value: 3.5 }), 3.5);
  assert.equal(spreadEvaluator.normalizeSpread({ spread: '-2.5' }), -2.5);
  assert.equal(spreadEvaluator.normalizeSpread({ spread: 'abc' }), null);
});

test('describeSpread uses label, then spread string, then numeric fallback', () => {
  assert.equal(
    spreadEvaluator.describeSpread({ spread_label: 'Home -3.5', spread: '-3.5', spread_value: -3.5 }),
    'Home -3.5',
  );
  assert.equal(spreadEvaluator.describeSpread({ spread: '+4.5', spread_value: 4.5 }), '+4.5');
  assert.equal(spreadEvaluator.describeSpread({ spread_value: 6.5 }), '6.5');
});

test('resolveTeams falls back to roster order when config lacks identifiers', () => {
  const doc = buildDoc({ homeScore: 10, awayScore: 14 });
  const { homeTeam, awayTeam } = spreadEvaluator.resolveTeams(doc, {});
  assert.equal(homeTeam.teamId, '1');
  assert.equal(awayTeam.teamId, '2');
});
