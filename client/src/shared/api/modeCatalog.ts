import type { ModeOverview } from '@features/bets/types';
import { fetchJSON } from '@shared/utils/http';

let cachedOverviews: ModeOverview[] | null = null;
let inflight: Promise<ModeOverview[]> | null = null;

export async function fetchModeOverviews(force = false): Promise<ModeOverview[]> {
  if (!force && cachedOverviews) {
    return cachedOverviews;
  }
  if (!force && inflight) {
    return inflight;
  }
  inflight = fetchJSON<ModeOverview[]>('/api/bet-modes/overviews')
    .then((data) => {
      cachedOverviews = data ?? [];
      return cachedOverviews;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
