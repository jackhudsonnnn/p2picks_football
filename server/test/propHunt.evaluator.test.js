const test = require('node:test');
const assert = require('node:assert/strict');

const propEvaluator = require('../dist/modes/modules/propHunt/evaluator.js');

function buildDoc(statValue) {
  return {
    teams: [
      {
        teamId: 'home',
        players: [
          {
            athleteId: '1234567',
            fullName: 'Player One',
            stats: {
              receiving: { receivingYards: statValue },
            },
          },
        ],
      },
    ],
  };
}

const baseConfig = {
  player_id: '1234567',
  player_name: 'Player One',
  stat: 'receivingYards',
};

test('normalizePropHuntProgressMode defaults to starting_now unless cumulative is provided', () => {
  assert.equal(propEvaluator.normalizePropHuntProgressMode('cumulative'), 'cumulative');
  assert.equal(propEvaluator.normalizePropHuntProgressMode('starting_now'), 'starting_now');
  assert.equal(propEvaluator.normalizePropHuntProgressMode(undefined), 'starting_now');
});

test('normalizePropHuntLine prefers numeric value before parsing string', () => {
  assert.equal(propEvaluator.normalizePropHuntLine({ line_value: 47.5 }), 47.5);
  assert.equal(propEvaluator.normalizePropHuntLine({ line: '38.5' }), 38.5);
  assert.equal(propEvaluator.normalizePropHuntLine({ line: 'not-a-number' }), null);
});

test('evaluateLineCrossed reports cumulative progress crossing over the line', () => {
  const doc = buildDoc(55);
  const check = propEvaluator.evaluateLineCrossed(doc, baseConfig, 50, 'cumulative');
  assert.deepEqual(check, { crossed: true, currentValue: 55 });
});

test('evaluateLineCrossed stays false for starting_now until baseline is captured', () => {
  const check = propEvaluator.evaluateLineCrossed(buildDoc(40), baseConfig, 30, 'starting_now');
  assert.deepEqual(check, { crossed: false, currentValue: 0 });
});

test('evaluatePropHunt cumulative mode returns metric equal to final stat', () => {
  const doc = buildDoc(60);
  const result = propEvaluator.evaluatePropHunt(doc, baseConfig, 50, 'cumulative');
  assert.equal(result?.finalValue, 60);
  assert.equal(result?.baselineValue, null);
  assert.equal(result?.metricValue, 60);
});

test('evaluatePropHunt starting_now mode subtracts baseline when provided', () => {
  const doc = buildDoc(90);
  const baseline = { statKey: 'receivingYards', capturedAt: 'ts', gameId: '123456789', player: { id: '1234567' }, value: 30 };
  const result = propEvaluator.evaluatePropHunt(doc, baseConfig, 50, 'starting_now', baseline);
  assert.equal(result?.baselineValue, 30);
  assert.equal(result?.metricValue, 60);
});

test('evaluatePropHunt returns null for starting_now without baseline', () => {
  const result = propEvaluator.evaluatePropHunt(buildDoc(10), baseConfig, 5, 'starting_now');
  assert.equal(result, null);
});

test('evaluatePropHunt returns null for invalid stat key', () => {
  const doc = buildDoc(25);
  const config = { ...baseConfig, stat: 'unknown' };
  const result = propEvaluator.evaluatePropHunt(doc, config, 10, 'cumulative');
  assert.equal(result, null);
});
