import { extractModeConfig } from '../mappers';
import type { Ticket } from '../types';
import type { ModePreviewPayload } from '../service';

export function getModeKeyString(ticket: Ticket): string {
  return ticket.modeKey ? String(ticket.modeKey) : '';
}

export function getModeConfig(ticket: Ticket): Record<string, unknown> | undefined {
  return extractModeConfig(ticket.betRecord ?? undefined);
}

export function buildTicketTexts(
  ticket: Ticket,
  preview: ModePreviewPayload | null,
  previewError: string | null,
) {
  const modeKey = getModeKeyString(ticket);

  const summaryText = (() => {
    if (preview?.summary && preview.summary.trim().length) return preview.summary;
    if (modeKey) return modeKey.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    return 'Bet';
  })();

  const descriptionText = (() => {
    if (preview?.description && preview.description.trim().length) return preview.description;
    return '--';
  })();

  const winningConditionText = (() => {
    if (preview?.winningCondition && preview.winningCondition.trim().length) return preview.winningCondition;
    if (previewError) return 'Mode preview unavailable';
    return null;
  })();

  const optionList = (() => {
    if (preview?.options && preview.options.length) {
      return preview.options
        .map((option) => (typeof option === 'string' ? option.trim() : ''))
        .filter((option): option is string => Boolean(option && option.length));
    }
    return ['No Entry'];
  })();

  return { summaryText, descriptionText, winningConditionText, optionList };
}

export function computeTicketOutcome(ticket: Ticket, phase?: string | null) {
  const normalizedTicketState = (ticket.state ?? '').toLowerCase();
  const normalizedPhase = (phase ?? '').toLowerCase();
  const isWashed = normalizedTicketState === 'washed' || normalizedPhase === 'washed';
  const isResolved = !isWashed && (normalizedTicketState === 'resolved' || normalizedPhase === 'resolved');
  const normalizedResult = (ticket.result ?? '').toLowerCase();
  const normalizedWinningChoice = ticket.winningChoice != null ? String(ticket.winningChoice).trim().toLowerCase() : null;
  const normalizedGuess = ticket.myGuess != null ? String(ticket.myGuess).trim().toLowerCase() : null;
  const hasGuess = Boolean(normalizedGuess && normalizedGuess.length > 0 && normalizedGuess !== 'No Entry');
  const isCorrectGuess = Boolean(isResolved && hasGuess && normalizedWinningChoice && normalizedGuess === normalizedWinningChoice);
  const isIncorrectGuess = Boolean(isResolved && hasGuess && normalizedWinningChoice && normalizedGuess !== normalizedWinningChoice);

  const resolvedOutcome: 'win' | 'loss' | null = (() => {
    if (!isResolved) return null;
    if (normalizedResult === 'win') return 'win';
    if (normalizedResult === 'loss') return 'loss';
    if (isCorrectGuess) return 'win';
    if (isIncorrectGuess) return 'loss';
    return null;
  })();

  const outcomeClass = (() => {
    if (isWashed || normalizedResult === 'washed') return 'outcome-washed';
    if (resolvedOutcome === 'win') return 'outcome-win';
    if (resolvedOutcome === 'loss') return 'outcome-loss';
    return '';
  })();

  const resolutionClass = isCorrectGuess ? 'guess-correct' : isIncorrectGuess ? 'guess-incorrect' : '';

  return { isWashed, isResolved, resolvedOutcome, outcomeClass, resolutionClass };
}
