// Simple in-memory store for POC. Resets on refresh.
// In prod this would be driven by backend/webhooks.

type BetResolution = {
  bet_id: string;
  table_id: string;
  resolve_at: number; // epoch ms
  winning_choice: string | null;
};

const scheduled: Record<string, BetResolution> = {};

export function putResolution(r: BetResolution) {
  scheduled[r.bet_id] = r;
}

export function getResolution(bet_id: string): BetResolution | undefined {
  return scheduled[bet_id];
}

export function allResolutions(): BetResolution[] {
  return Object.values(scheduled);
}
