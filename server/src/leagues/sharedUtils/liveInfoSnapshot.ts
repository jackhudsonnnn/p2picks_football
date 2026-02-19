/**
 * Live Info Snapshot
 *
 * Captures a frozen snapshot of ModeLiveInfo at the moment a bet is resolved
 * or washed and persists it as a `resolve_or_wash_live_info` event in
 * `resolution_history`. This allows the client Information Modal to display
 * meaningful data for historical bets even after Redis baselines expire and
 * game feeds go offline.
 *
 * All calls are fire-and-forget — failures are logged but never block
 * resolution or wash operations.
 */

import { getModeLiveInfo } from '../registry';
import { betRepository } from './betRepository';
import { fetchModeConfig } from '../../utils/modeConfig';
import { createLogger } from '../../utils/logger';
import type { ModeLiveInfo } from '../../types/modes';
import type { League } from '../../types/league';

const logger = createLogger('liveInfoSnapshot');

export const LIVE_INFO_SNAPSHOT_EVENT = 'resolve_or_wash_live_info';

export interface CaptureSnapshotInput {
  betId: string;
  modeKey: string;
  leagueGameId: string | null;
  league: League;
  trigger: 'resolved' | 'washed';
  outcomeDetail?: string | null;
}

/**
 * Capture the current live-info for a bet and persist it to resolution_history.
 * This is fire-and-forget — failures are logged but never block resolution.
 */
export async function captureLiveInfoSnapshot(input: CaptureSnapshotInput): Promise<void> {
  try {
    const modeConfig = await fetchModeConfig(input.betId);
    const config = modeConfig?.data ?? {};

    const liveInfo: ModeLiveInfo | null = await getModeLiveInfo(input.modeKey, {
      betId: input.betId,
      config,
      leagueGameId: input.leagueGameId,
      league: input.league,
    });

    const fields = liveInfo?.fields ? [...liveInfo.fields] : [];

    // Surface the resolved outcome or wash reason directly in the fields list
    // so the Information Modal can display it alongside other live info rows.
    if (input.outcomeDetail && input.trigger !== 'washed') {
      fields.push({ label: 'Winning Choice', value: input.outcomeDetail });
    }

    const payload: Record<string, unknown> = {
      modeKey: liveInfo?.modeKey ?? input.modeKey,
      modeLabel: liveInfo?.modeLabel ?? input.modeKey,
      fields,
      unavailableReason: liveInfo?.unavailableReason ?? null,
      capturedAt: new Date().toISOString(),
      trigger: input.trigger,
      outcomeDetail: input.outcomeDetail ?? null,
    };

    await betRepository.recordHistory(input.betId, LIVE_INFO_SNAPSHOT_EVENT, payload);
  } catch (err) {
    // Never block resolution/wash on snapshot failure
    logger.warn(
      { betId: input.betId, error: err instanceof Error ? err.message : String(err) },
      'failed to capture live info snapshot',
    );
  }
}
