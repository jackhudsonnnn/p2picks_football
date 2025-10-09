import { fetchJSON } from '@shared/utils/http';

export interface ModeConfigRecord {
  mode_key: string;
  data: Record<string, unknown>;
}

function getStatsServerBase(): string {
  const raw = (import.meta.env.VITE_STATS_SERVER_URL as string | undefined) || 'http://localhost:5001';
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('VITE_STATS_SERVER_URL is required to persist mode configs');
  }
  return trimmed.replace(/\/$/, '');
}

export async function storeModeConfig(
  betId: string,
  modeKey: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!betId) throw new Error('betId required to store mode config');
  if (!modeKey) throw new Error('modeKey required to store mode config');
  const base = getStatsServerBase();
  const url = `${base}/api/bets/${encodeURIComponent(betId)}/mode-config`;
  await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode_key: modeKey, data }),
  });
}

export async function fetchModeConfigs(betIds: string[]): Promise<Record<string, ModeConfigRecord>> {
  if (!betIds.length) return {};
  const base = getStatsServerBase();
  const url = `${base}/api/mode-config/batch`;
  return await fetchJSON<Record<string, ModeConfigRecord>>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ betIds }),
  });
}
