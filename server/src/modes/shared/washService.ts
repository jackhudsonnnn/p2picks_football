import { betRepository } from './betRepository';
import { createWashSystemMessage } from './messageUtils';

export interface WashOptions {
  betId: string;
  payload: Record<string, unknown>;
  explanation: string;
  eventType: string;
  modeLabel: string;
}

export async function washBetWithHistory({ betId, payload, explanation, eventType, modeLabel }: WashOptions): Promise<void> {
  try {
    const washed = await betRepository.washBet(betId);
    if (!washed) {
      console.warn('[washService] wash skipped; bet not pending', { betId });
      return;
    }
    await betRepository.recordHistory(betId, eventType, { outcome: 'wash', mode: modeLabel, ...payload });
    if (washed.table_id) {
      await createWashSystemMessage(washed.table_id, betId, explanation);
    }
  } catch (err) {
    console.error('[washService] wash bet error', { betId }, err);
  }
}
