/**
 * Live Info Snapshot Tests
 *
 * Unit tests for the captureLiveInfoSnapshot utility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — must be declared before imports
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../src/leagues/registry', () => ({
  getModeLiveInfo: vi.fn(),
}));

vi.mock('../../../src/leagues/sharedUtils/betRepository', () => {
  const recordHistory = vi.fn().mockResolvedValue(undefined);
  return {
    betRepository: { recordHistory },
    BetRepository: vi.fn(),
  };
});

vi.mock('../../../src/utils/modeConfig', () => ({
  fetchModeConfig: vi.fn(),
}));

vi.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import {
  captureLiveInfoSnapshot,
  LIVE_INFO_SNAPSHOT_EVENT,
  type CaptureSnapshotInput,
} from '../../../src/leagues/sharedUtils/liveInfoSnapshot';
import { getModeLiveInfo } from '../../../src/leagues/registry';
import { betRepository } from '../../../src/leagues/sharedUtils/betRepository';
import { fetchModeConfig } from '../../../src/utils/modeConfig';

const mockGetModeLiveInfo = getModeLiveInfo as ReturnType<typeof vi.fn>;
const mockFetchModeConfig = fetchModeConfig as ReturnType<typeof vi.fn>;
const mockRecordHistory = betRepository.recordHistory as ReturnType<typeof vi.fn>;

// ─────────────────────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────────────────────

const BASE_INPUT: CaptureSnapshotInput = {
  betId: 'bet-001',
  modeKey: 'either_or',
  leagueGameId: 'game-123',
  league: 'NFL',
  trigger: 'resolved',
  outcomeDetail: 'Player 1',
};

const MOCK_LIVE_INFO = {
  modeKey: 'either_or',
  modeLabel: 'Either Or',
  fields: [
    { label: 'Matchup', value: 'KC vs BUF' },
    { label: 'Player 1', value: '25 pts' },
    { label: 'Player 2', value: '18 pts' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('captureLiveInfoSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchModeConfig.mockResolvedValue({ mode_key: 'either_or', data: { stat: 'points' } });
    mockGetModeLiveInfo.mockResolvedValue(MOCK_LIVE_INFO);
  });

  it('should capture and persist a live-info snapshot on resolve', async () => {
    await captureLiveInfoSnapshot(BASE_INPUT);

    // Should fetch mode config
    expect(mockFetchModeConfig).toHaveBeenCalledWith('bet-001');

    // Should call getModeLiveInfo with correct args
    expect(mockGetModeLiveInfo).toHaveBeenCalledWith('either_or', {
      betId: 'bet-001',
      config: { stat: 'points' },
      leagueGameId: 'game-123',
      league: 'NFL',
    });

    // Should write to resolution_history
    expect(mockRecordHistory).toHaveBeenCalledOnce();
    const [betId, eventType, payload] = mockRecordHistory.mock.calls[0];
    expect(betId).toBe('bet-001');
    expect(eventType).toBe(LIVE_INFO_SNAPSHOT_EVENT);
    expect(payload.modeKey).toBe('either_or');
    expect(payload.modeLabel).toBe('Either Or');
    expect(payload.fields).toEqual([
      ...MOCK_LIVE_INFO.fields,
      { label: 'Winning Choice', value: 'Player 1' },
    ]);
    expect(payload.trigger).toBe('resolved');
    expect(payload.outcomeDetail).toBe('Player 1');
    expect(payload.capturedAt).toBeTruthy();
  });

  it('should capture and persist a live-info snapshot on wash', async () => {
    const washInput: CaptureSnapshotInput = {
      ...BASE_INPUT,
      trigger: 'washed',
      outcomeDetail: 'Game already final',
    };

    await captureLiveInfoSnapshot(washInput);

    expect(mockRecordHistory).toHaveBeenCalledOnce();
    const [, , payload] = mockRecordHistory.mock.calls[0];
    expect(payload.trigger).toBe('washed');
    expect(payload.outcomeDetail).toBe('Game already final');
    expect(payload.fields).toEqual([
      ...MOCK_LIVE_INFO.fields,
      { label: 'Wash Reason', value: 'Game already final' },
    ]);
  });

  it('should use fallback values when getModeLiveInfo returns null', async () => {
    mockGetModeLiveInfo.mockResolvedValue(null);

    await captureLiveInfoSnapshot(BASE_INPUT);

    expect(mockRecordHistory).toHaveBeenCalledOnce();
    const [, , payload] = mockRecordHistory.mock.calls[0];
    expect(payload.modeKey).toBe('either_or');
    expect(payload.modeLabel).toBe('either_or');
    expect(payload.fields).toEqual([
      { label: 'Winning Choice', value: 'Player 1' },
    ]);
    expect(payload.unavailableReason).toBeNull();
  });

  it('should use empty config when fetchModeConfig returns null', async () => {
    mockFetchModeConfig.mockResolvedValue(null);

    await captureLiveInfoSnapshot(BASE_INPUT);

    expect(mockGetModeLiveInfo).toHaveBeenCalledWith('either_or', expect.objectContaining({
      config: {},
    }));
    expect(mockRecordHistory).toHaveBeenCalledOnce();
  });

  it('should NOT throw when getModeLiveInfo throws', async () => {
    mockGetModeLiveInfo.mockRejectedValue(new Error('Redis connection failed'));

    // Should not throw — errors are swallowed
    await expect(captureLiveInfoSnapshot(BASE_INPUT)).resolves.toBeUndefined();

    // Should NOT have recorded history (error happened before that point)
    expect(mockRecordHistory).not.toHaveBeenCalled();
  });

  it('should NOT throw when recordHistory throws', async () => {
    mockRecordHistory.mockRejectedValue(new Error('DB write failed'));

    await expect(captureLiveInfoSnapshot(BASE_INPUT)).resolves.toBeUndefined();
  });

  it('should NOT throw when fetchModeConfig throws', async () => {
    mockFetchModeConfig.mockRejectedValue(new Error('Config fetch failed'));

    await expect(captureLiveInfoSnapshot(BASE_INPUT)).resolves.toBeUndefined();
    expect(mockRecordHistory).not.toHaveBeenCalled();
  });

  it('should set outcomeDetail to null when not provided', async () => {
    const input: CaptureSnapshotInput = {
      betId: 'bet-002',
      modeKey: 'total_disaster',
      leagueGameId: null,
      league: 'NFL',
      trigger: 'resolved',
    };

    await captureLiveInfoSnapshot(input);

    const [, , payload] = mockRecordHistory.mock.calls[0];
    expect(payload.outcomeDetail).toBeNull();
  });

  it('should use the correct event type constant', () => {
    expect(LIVE_INFO_SNAPSHOT_EVENT).toBe('resolve_or_wash_live_info');
  });

  it('should include unavailableReason when live info has one', async () => {
    mockGetModeLiveInfo.mockResolvedValue({
      ...MOCK_LIVE_INFO,
      unavailableReason: 'Game data unavailable',
    });

    await captureLiveInfoSnapshot(BASE_INPUT);

    const [, , payload] = mockRecordHistory.mock.calls[0];
    expect(payload.unavailableReason).toBe('Game data unavailable');
  });
});
