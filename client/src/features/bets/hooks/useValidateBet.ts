import { useCallback, useState } from 'react';
import { validateBet as validateBetApi, type ValidateBetResult } from '@data/repositories/betsRepository';
import { HttpError } from '@data/clients/restClient';

export type UseValidateBetResult = {
  validate: (betId: string, winningChoice: string) => Promise<ValidateBetResult>;
  isValidating: boolean;
  getErrorMessage: (error: unknown) => string;
};

export function useValidateBet(): UseValidateBetResult {
  const [isValidating, setIsValidating] = useState(false);

  const getErrorMessage = useCallback((error: unknown): string => {
    if (error instanceof HttpError) {
      const preview = error.bodyPreview;
      if (preview) {
        try {
          const parsed = JSON.parse(preview);
          if (parsed && typeof parsed.error === 'string' && parsed.error.trim().length) {
            return parsed.error;
          }
          if (parsed && typeof parsed.details === 'string' && parsed.details.trim().length) {
            return parsed.details;
          }
        } catch {
          // fall through
        }
      }
      return error.message || 'Failed to validate bet.';
    }
    if (error instanceof Error) {
      return error.message || 'Failed to validate bet.';
    }
    return 'Failed to validate bet.';
  }, []);

  const validate = useCallback(async (betId: string, winningChoice: string): Promise<ValidateBetResult> => {
    if (!betId) {
      throw new Error('Missing bet id');
    }
    if (!winningChoice) {
      throw new Error('Missing winning choice');
    }
    if (isValidating) {
      throw new Error('Validation already in progress');
    }

    setIsValidating(true);
    try {
      const result = await validateBetApi(betId, winningChoice);
      return result;
    } finally {
      setIsValidating(false);
    }
  }, [isValidating]);

  return { validate, isValidating, getErrorMessage };
}
