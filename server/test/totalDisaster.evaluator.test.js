const test = require('node:test');
const assert = require('node:assert/strict');

const totalEvaluator = require('../dist/modes/modules/totalDisaster/evaluator.js');

function buildDoc(homeScore, awayScore) {
  return {
    teams: [
      { teamId: 'home', score: homeScore },
      { teamId: 'away', score: awayScore },
    ],
  };
}

test('normalizeLine favors numeric value before parsing string', () => {
  assert.equal(totalEvaluator.normalizeLine({ line_value: 47.5 }), 47.5);
  assert.equal(totalEvaluator.normalizeLine({ line: '38.5' }), 38.5);
  assert.equal(totalEvaluator.normalizeLine({ line: 'abc' }), null);
});

test('describeLine prioritizes label, then line string, then numeric fallback', () => {
  assert.equal(
    totalEvaluator.describeLine({ line_label: 'O/U 52.5', line: '52.5', line_value: 52.5 }),
    'O/U 52.5',
  );
  assert.equal(totalEvaluator.describeLine({ line: '44.5', line_value: 44.5 }), '44.5');
  assert.equal(totalEvaluator.describeLine({ line_value: 39.5 }), '39.5');
});

test('evaluateTotalDisaster picks over when total points exceed line', () => {
  const doc = buildDoc(28, 24);
  const result = totalEvaluator.evaluateTotalDisaster(doc, 50);
  assert.equal(result.decision, 'over');
  assert.equal(result.totalPoints, 52);
});

test('evaluateTotalDisaster picks under when total points below line', () => {
  const doc = buildDoc(13, 10);
  const result = totalEvaluator.evaluateTotalDisaster(doc, 28);
  assert.equal(result.decision, 'under');
  assert.equal(result.totalPoints, 23);
});

test('evaluateTotalDisaster declares push when total equals line within epsilon', () => {
  const doc = buildDoc(21, 14);
  const result = totalEvaluator.evaluateTotalDisaster(doc, 35);
  assert.equal(result.decision, 'push');
});
