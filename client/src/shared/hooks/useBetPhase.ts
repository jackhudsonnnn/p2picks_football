import { useEffect, useState } from 'react';

export type BetPhase = 'active' | 'pending' | 'resolved' | 'washed';

interface UseBetPhaseArgs {
  /** ISO date string or Date for when the bet locks */
  closeTime?: string | Date | null;
  /** Raw backend status (may lag closeTime) */
  rawStatus?: string | null;
  /** Poll / recompute interval in ms */
  intervalMs?: number;
  /** Optional flag to pause timer */
  paused?: boolean;
  /** If true, avoid frequent ticks while active; no timeLeft updates, flip to pending at lock time with a one-shot timeout */
  suppressTicks?: boolean;
}

interface UseBetPhaseResult {
  phase: BetPhase;
  timeLeft: number | null;
}

export function useBetPhase({ closeTime, rawStatus, intervalMs = 100, paused = false, suppressTicks = false }: UseBetPhaseArgs): UseBetPhaseResult {
  const [phase, setPhase] = useState<BetPhase>('active');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (paused) return;

    const closeAt = closeTime ? new Date(closeTime).getTime() : null;

    const normalizeStatus = (s?: string | null): BetPhase | undefined => {
      switch (s) {
        case 'resolved':
          return 'resolved';
        case 'washed':
          return 'washed';
        case 'pending':
          return 'pending';
        case 'active':
        default:
          return undefined;
      }
    };

    const finalStatus = normalizeStatus(rawStatus);

    // If backend already finalized, reflect immediately.
    if (finalStatus === 'resolved' || finalStatus === 'washed') {
      setPhase(finalStatus);
      setTimeLeft(0);
      return;
    }

    // No close time -> rely on status only
    if (!closeAt) {
      if (finalStatus === 'pending') {
        setPhase('pending');
        setTimeLeft(0);
      } else {
        setPhase(finalStatus || 'active');
        setTimeLeft(null);
      }
      return;
    }

    const now = Date.now();
    const remainingMs = closeAt - now;

    if (remainingMs > 0) {
      // Active window
      setPhase('active');

      if (suppressTicks) {
        // Do not update timeLeft frequently; rely on a one-shot timeout to flip to pending.
        setTimeLeft(null);
        const toId = setTimeout(() => {
          // After lock, move to pending unless backend already finalized.
          const postFinal = normalizeStatus(rawStatus);
          if (postFinal === 'resolved' || postFinal === 'washed') {
            setPhase(postFinal);
          } else {
            setPhase('pending');
          }
          setTimeLeft(0);
        }, remainingMs);
        return () => clearTimeout(toId);
      } else {
        // Existing ticking behavior
        const compute = () => {
          const n = Date.now();
          const rem = closeAt - n;
          if (rem > 0) {
            setPhase('active');
            setTimeLeft(rem / 1000);
          } else {
            setPhase('pending');
            setTimeLeft(0);
          }
        };
        compute();
        const id = setInterval(compute, intervalMs);
        return () => clearInterval(id);
      }
    } else {
      // Already locked but not finalized -> pending
      setPhase('pending');
      setTimeLeft(0);
      return;
    }
  }, [closeTime, rawStatus, intervalMs, paused, suppressTicks]);

  return { phase, timeLeft };
}
