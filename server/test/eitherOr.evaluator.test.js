const test = require('node:test');
const assert = require('node:assert/strict');

const eitherOrEvaluator = require('../dist/modes/modules/eitherOr/evaluator.js');

function createDoc(player1Stats, player2Stats) {
  return {
    teams: [
      {
        teamId: '1',
        players: [
          {
            athleteId: '1234567',
            fullName: 'Player One',
            stats: player1Stats,
          },
        ],
      },
      {
        teamId: '2',
        players: [
          {
            athleteId: '7654321',
            fullName: 'Player Two',
            stats: player2Stats,
          },
        ],
      },
    ],
  };
}

const baseConfig = {
  player1_id: '1234567',
  player1_name: 'Player One',
  player2_id: '7654321',
  player2_name: 'Player Two',
  stat: 'receivingYards',
  stat_label: 'Receiving Yards',
  nfl_game_id: '123456789',
};

test('evaluateEitherOr picks player1 with higher cumulative stat', () => {
  const doc = createDoc(
    { receiving: { receivingYards: 80 } },
    { receiving: { receivingYards: 60 } },
  );
  const result = eitherOrEvaluator.evaluateEitherOr(doc, baseConfig, 'cumulative');
  assert.equal(result?.outcome, 'player1');
  assert.equal(result?.player1.metric, 80);
  assert.equal(result?.player2.metric, 60);
});

test('evaluateEitherOr uses baseline deltas for starting_now mode', () => {
  const initialDoc = createDoc(
    { receiving: { receivingYards: 40 } },
    { receiving: { receivingYards: 20 } },
  );
  const baseline = eitherOrEvaluator.buildEitherOrBaseline(initialDoc, baseConfig, '123456789');
  const updatedDoc = createDoc(
    { receiving: { receivingYards: 55 } },
    { receiving: { receivingYards: 90 } },
  );
  const result = eitherOrEvaluator.evaluateEitherOr(updatedDoc, baseConfig, 'starting_now', baseline);
  assert.equal(result?.outcome, 'player2');
  assert.equal(result?.player1.metric, 15);
  assert.equal(result?.player2.metric, 70);
});

test('evaluateEitherOr returns tie when metrics are equal', () => {
  const doc = createDoc(
    { receiving: { receivingYards: 75 } },
    { receiving: { receivingYards: 75 } },
  );
  const result = eitherOrEvaluator.evaluateEitherOr(doc, baseConfig, 'cumulative');
  assert.equal(result?.outcome, 'tie');
});

test('evaluateEitherOr returns tie for starting_now mode when the increase in metrics are equal', () => {
  const initialDoc = createDoc(
    { receiving: { receivingYards: 40 } },
    { receiving: { receivingYards: 20 } },
  );
  const baseline = eitherOrEvaluator.buildEitherOrBaseline(initialDoc, baseConfig, '123456789');
  const updatedDoc = createDoc(
    { receiving: { receivingYards: 60 } },
    { receiving: { receivingYards: 40 } },
  );
  const result = eitherOrEvaluator.evaluateEitherOr(updatedDoc, baseConfig, 'starting_now', baseline);
  assert.equal(result?.outcome, 'tie');
  assert.equal(result?.player1.metric, 20);
  assert.equal(result?.player2.metric, 20);
});

test('evaluateEitherOr returns null when stat key is invalid', () => {
  const config = { ...baseConfig, stat: 'notARealStat' };
  const doc = createDoc(
    { receiving: { receivingYards: 10 } },
    { receiving: { receivingYards: 5 } },
  );
  const result = eitherOrEvaluator.evaluateEitherOr(doc, config, 'cumulative');
  assert.equal(result, null);
});

test('evaluateEitherOr returns null for starting_now without baseline', () => {
  const doc = createDoc(
    { receiving: { receivingYards: 30 } },
    { receiving: { receivingYards: 25 } },
  );
  const result = eitherOrEvaluator.evaluateEitherOr(doc, baseConfig, 'starting_now');
  assert.equal(result, null);
});
