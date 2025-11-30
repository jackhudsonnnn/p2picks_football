const test = require('node:test');
const assert = require('node:assert/strict');

const chooseEvaluator = require('../dist/modes/modules/chooseTheirFate/evaluator.js');

test('determineChooseFateOutcome returns touchdown when offense increases touchdowns', () => {
  const baseline = {
    gameId: '123456789',
    possessionTeamId: '1',
    capturedAt: new Date().toISOString(),
    teams: {
      1: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
      2: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
    },
  };
  const doc = {
    teams: [
      { teamId: '1', stats: { scoring: { touchdowns: 1, fieldGoals: 0, safeties: 0 }, punting: { punts: 0 } }, possession: true },
      { teamId: '2', stats: { scoring: { touchdowns: 0, fieldGoals: 0, safeties: 0 }, punting: { punts: 0 } }, possession: false },
    ],
  };
  const currentScores = chooseEvaluator.collectTeamScores(doc);
  const outcome = chooseEvaluator.determineChooseFateOutcome(baseline, currentScores, '1');
  assert.equal(outcome?.outcome, 'Touchdown');
  assert.equal(outcome?.scoringTeamId, '1');
});

test('determineChooseFateOutcome returns field goal when offense increases field goals', () => {
  const baseline = {
    gameId: '123456789',
    possessionTeamId: '1',
    capturedAt: new Date().toISOString(),
    teams: {
      1: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
      2: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
    },
  };
  const doc = {
    teams: [
      { teamId: '1', stats: { scoring: { touchdowns: 0, fieldGoals: 1, safeties: 0 }, punting: { punts: 0 } }, possession: false },
      { teamId: '2', stats: { scoring: { touchdowns: 0, fieldGoals: 0, safeties: 0 }, punting: { punts: 0 } }, possession: false },
    ],
  };
  const currentScores = chooseEvaluator.collectTeamScores(doc);
  const outcome = chooseEvaluator.determineChooseFateOutcome(baseline, currentScores, '1');
  assert.equal(outcome?.outcome, 'Field Goal');
  assert.equal(outcome?.scoringTeamId, '1');
});

test('determineChooseFateOutcome returns safety when defense increases safeties', () => {
  const baseline = {
    gameId: '123456789',
    possessionTeamId: '1',
    capturedAt: new Date().toISOString(),
    teams: {
      1: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
      2: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
    },
  };
  const doc = {
    teams: [
      { teamId: '1', stats: { scoring: { touchdowns: 0, fieldGoals: 0, safeties: 0 }, punting: { punts: 0 } }, possession: false },
      { teamId: '2', stats: { scoring: { touchdowns: 0, fieldGoals: 0, safeties: 1 }, punting: { punts: 0 } }, possession: false },
    ],
  };
  const currentScores = chooseEvaluator.collectTeamScores(doc);
  const outcome = chooseEvaluator.determineChooseFateOutcome(baseline, currentScores, '1');
  assert.equal(outcome?.outcome, 'Safety');
  assert.equal(outcome?.scoringTeamId, '1');
});

test('determineChooseFateOutcome returns punt when offense increases punts', () => {
  const baseline = {
    gameId: '123456789',
    possessionTeamId: '1',
    capturedAt: new Date().toISOString(),
    teams: {
      1: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
      2: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
    },
  };
  const doc = {
    teams: [
      { teamId: '1', stats: { scoring: { touchdowns: 0, fieldGoals: 0, safeties: 0 }, punting: { punts: 1 } }, possession: false },
      { teamId: '2', stats: { scoring: { touchdowns: 0, fieldGoals: 0, safeties: 0 }, punting: { punts: 0 } }, possession: false },
    ],
  };
  const currentScores = chooseEvaluator.collectTeamScores(doc);
  const outcome = chooseEvaluator.determineChooseFateOutcome(baseline, currentScores, '1');
  assert.equal(outcome?.outcome, 'Punt');
  assert.equal(outcome?.scoringTeamId, '1');
});

test('determineChooseFateOutcome returns turnover when team loses possession without scoring/punting', () => {
  const baseline = {
    gameId: '123456789',
    possessionTeamId: '1',
    capturedAt: new Date().toISOString(),
    teams: {
      1: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
      2: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
    },
  };
  const doc = {
    teams: [
      { teamId: '1', stats: { scoring: { touchdowns: 0, fieldGoals: 0, safeties: 0 }, punting: { punts: 0 } }, possession: false },
      { teamId: '2', stats: { scoring: { touchdowns: 0, fieldGoals: 0, safeties: 0 }, punting: { punts: 0 } }, possession: false },
    ],
  };
  const currentScores = chooseEvaluator.collectTeamScores(doc);
  const outcome = chooseEvaluator.determineChooseFateOutcome(baseline, currentScores, '1');
  assert.equal(outcome?.outcome, 'Turnover');
  assert.equal(outcome?.scoringTeamId, '1');
});

test('determineChooseFateOutcome returns turnover when team throws pick 6', () => {
  const baseline = {
    gameId: '123456789',
    possessionTeamId: '1',
    capturedAt: new Date().toISOString(),
    teams: {
      1: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
      2: { touchdowns: 0, fieldGoals: 0, safeties: 0, punts: 0 },
    },
  };
  const doc = {
    teams: [
      { teamId: '1', stats: { scoring: { touchdowns: 0, fieldGoals: 0, safeties: 0 }, punting: { punts: 0 } }, possession: false },
      { teamId: '2', stats: { scoring: { touchdowns: 1, fieldGoals: 0, safeties: 0 }, punting: { punts: 0 } }, possession: false },
    ],
  };
  const currentScores = chooseEvaluator.collectTeamScores(doc);
  const outcome = chooseEvaluator.determineChooseFateOutcome(baseline, currentScores, '1');
  assert.equal(outcome?.outcome, 'Turnover');
  assert.equal(outcome?.scoringTeamId, '1');
});

