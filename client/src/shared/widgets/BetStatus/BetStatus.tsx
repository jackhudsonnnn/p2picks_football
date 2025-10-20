import React, { useRef } from 'react';
import './BetStatus.css';
import { useDomTimer } from '@shared/hooks/useDomTimer';

type Phase = 'active' | 'pending' | 'resolved' | 'washed';
type ResolvedOutcome = 'win' | 'loss' | 'washed';

interface BetStatusProps {
  phase: Phase;
  /** previous numeric countdown (seconds). If provided and not using closeTime fallback, still displayed for non-active states */
  timeLeft?: number | null;
  /** Optional absolute lock/close time; when provided and phase is active we render an imperative DOM timer (no re-renders) */
  closeTime?: string | Date | null;
  className?: string;
  outcome?: ResolvedOutcome | null;
}

const BetStatus: React.FC<BetStatusProps> = ({ phase, timeLeft = null, className, closeTime, outcome }) => {
  const spanRef = useRef<HTMLSpanElement | null>(null);

  // Use DOM timer only while active and we have a closeTime.
  if (phase === 'active' && closeTime) {
    useDomTimer(spanRef, closeTime);
  }

  const statusLabel = (() => {
    if (phase === 'active') {
      if (closeTime) return ''; // will be filled by DOM timer imperatively
      if (timeLeft !== null) return `${timeLeft.toFixed(1)}s`;
      return 'active';
    }
    if (phase === 'pending') return 'pending';
    if (phase === 'washed') return 'washed';
    return 'resolved';
  })();

  const normalizedOutcome: ResolvedOutcome | null = (() => {
    if (phase === 'washed') return 'washed';
    if (phase === 'resolved') {
      if (outcome === 'win' || outcome === 'loss') {
        return outcome;
      }
    }
    return null;
  })();

  const classes = [
    'bet-status',
    'widget-bet-status',
    `status-${phase}`,
    normalizedOutcome ? `outcome-${normalizedOutcome}` : '',
    className || ''
  ].filter(Boolean).join(' ');

  return <span ref={spanRef} className={classes} aria-live="polite">{statusLabel}</span>;
};

export default BetStatus;
