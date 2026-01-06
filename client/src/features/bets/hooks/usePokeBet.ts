import { useCallback, useState } from 'react';
import { pokeBet } from '../service';
import { HttpError } from '@data/clients/restClient';

export type UsePokeBetResult = {
  poke: (betId: string) => Promise<void>;
  isPoking: boolean;
  getErrorMessage: (error: unknown) => string;
};

export function usePokeBet(): UsePokeBetResult {
  const [isPoking, setIsPoking] = useState(false);

  const getErrorMessage = useCallback((error: unknown): string => {
    if (error instanceof HttpError) {
      const preview = error.bodyPreview;
      if (preview) {
        try {
          const parsed = JSON.parse(preview);
          if (parsed && typeof parsed.error === 'string' && parsed.error.trim().length) {
            return parsed.error;
          }
        } catch {
          // fall through
        }
      }
      return error.message || 'Failed to poke bet.';
    }
    if (error instanceof Error) {
      return error.message || 'Failed to poke bet.';
    }
    return 'Failed to poke bet.';
  }, []);

  const poke = useCallback(async (betId: string) => {
    if (!betId) {
      throw new Error('Missing bet id');
    }
    if (isPoking) return;

    setIsPoking(true);
    try {
      await pokeBet(betId);
    } finally {
      setIsPoking(false);
    }
  }, [isPoking]);

  return { poke, isPoking, getErrorMessage };
}
