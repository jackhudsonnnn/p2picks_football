const test = require('node:test');
const assert = require('node:assert/strict');

const kthEvaluator = require('../dist/modes/modules/kingOfTheHill/evaluator.js');

function buildDoc(player1Stats, player2Stats) {
  return {
    teams: [
      {
        teamId: 'home',
        players: [
          {
            athleteId: '1234567',
            fullName: 'Player One',
            stats: player1Stats,
          },
        ],
      },
      {
        teamId: 'away',
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
  resolve_value: 80,
};

test('resolveStatKey validates provided stat key', () => {
  assert.equal(kthEvaluator.resolveStatKey(baseConfig), 'receivingYards');
  assert.equal(kthEvaluator.resolveStatKey({ ...baseConfig, stat: 'unknownStat' }), null);
});

test('buildProgressRecord captures baseline values for each player', () => {
  const doc = buildDoc(
    { receiving: { receivingYards: 35 } },
    { receiving: { receivingYards: 20 } },
  );
  const record = kthEvaluator.buildProgressRecord(
    doc,
    baseConfig,
    'receivingYards',
    80,
    'cumulative',
    '123456789',
    '2025-01-01T00:00:00.000Z',
  );
  assert.equal(record.player1.baselineValue, 35);
  assert.equal(record.player2.baselineValue, 20);
  assert.equal(record.threshold, 80);
  assert.equal(record.progressMode, 'cumulative');
});

test('applyProgressUpdate marks player reached when metric crosses threshold (starting_now)', () => {
  const doc = buildDoc(
    { receiving: { receivingYards: 20 } },
    { receiving: { receivingYards: 15 } },
  );
  const initial = kthEvaluator.buildProgressRecord(doc, baseConfig, 'receivingYards', 30, 'starting_now', '1213456789');
  const updated = kthEvaluator.applyProgressUpdate(
    initial,
    'starting_now',
    30,
    60,
    45,
    '2025-02-02T12:00:00.000Z',
  );
  assert.equal(updated.player1.reached, true);
  assert.equal(updated.player1.metricAtReach, 40);
  assert.equal(updated.player2.reached, true);
  assert.equal(updated.player2.metricAtReach, 30);
});

test('determineProgressOutcome returns player1 when only they reach', () => {
  const doc = buildDoc(
    { receiving: { receivingYards: 10 } },
    { receiving: { receivingYards: 10 } },
  );
  const progress = kthEvaluator.buildProgressRecord(doc, baseConfig, 'receivingYards', 25, 'starting_now', '123456789');
  const updated = kthEvaluator.applyProgressUpdate(
    progress,
    'starting_now',
    25,
    35,
    20,
    '2025-03-01T15:00:00.000Z',
  );
  assert.equal(kthEvaluator.determineProgressOutcome(updated), 'player1');
});

test('determineProgressOutcome returns tie when both reach simultaneously with same metrics', () => {
  const doc = buildDoc(
    { receiving: { receivingYards: 0 } },
    { receiving: { receivingYards: 0 } },
  );
  const progress = kthEvaluator.buildProgressRecord(doc, baseConfig, 'receivingYards', 10, 'cumulative', '123456789');
  const bothReached = {
    ...progress,
    player1: {
      ...progress.player1,
      reached: true,
      reachedAt: '2025-04-01T00:00:00.000Z',
      valueAtReach: 10,
      deltaAtReach: 10,
      metricAtReach: 10,
    },
    player2: {
      ...progress.player2,
      reached: true,
      reachedAt: '2025-04-01T00:00:00.000Z',
      valueAtReach: 10,
      deltaAtReach: 10,
      metricAtReach: 10,
    },
  };
  assert.equal(kthEvaluator.determineProgressOutcome(bothReached), 'tie');
});
