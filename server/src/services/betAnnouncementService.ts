import type { BetProposal } from '../supabaseClient';
import type { ModePreviewResult } from './modeRuntimeService';

const DEFAULT_WINNING_CONDITION = 'Winning condition available at kickoff.';

export interface BetAnnouncementInput {
  bet: BetProposal;
  preview: ModePreviewResult;
}

export interface BetAnnouncementResult {
  systemMessageId: string | null;
  generatedAt: string;
}

export async function createBetProposalAnnouncement(input: BetAnnouncementInput): Promise<BetAnnouncementResult> {
  const messageText = formatBetAnnouncement(input);
  const supabase = getAdminClient();
  const generatedAt =
    typeof input.bet.proposal_time === 'string' && input.bet.proposal_time.trim().length
      ? input.bet.proposal_time
      : new Date().toISOString();

  const { data, error } = await supabase
    .from('system_messages')
    .insert([
    {
      table_id: input.bet.table_id,
      message_text: messageText,
      generated_at: generatedAt,
    },
    ])
    .select('system_message_id, generated_at')
    .single();

  if (error) {
    throw error;
  }

  return {
    systemMessageId: data?.system_message_id ?? null,
    generatedAt: data?.generated_at ?? generatedAt,
  };
}

export function formatBetAnnouncement(input: BetAnnouncementInput): string {
  const bet = input.bet;
  const preview = input.preview;
  const betIdLabel = formatBetId(bet.bet_id);
  const wagerLabel = formatWager(bet.wager_amount);
  const timeLimitLabel = formatTimeLimit(bet.time_limit_seconds);
  const modeLabel = resolveModeLabel(bet.mode_key);
  const description = sanitizeLine(bet.description) || 'Bet';
  const winningCondition = sanitizeLine(preview.winningCondition ?? '') || DEFAULT_WINNING_CONDITION;

  return [
    `Bet #${betIdLabel} active`,
    ``,
    `${wagerLabel} | ${timeLimitLabel}`,
    modeLabel,
    description,
    winningCondition,
  ].join('\n');
}

function formatBetId(betId: string): string {
  if (!betId) return 'unknown';
  const trimmed = betId.trim();
  return trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed.toUpperCase();
}

function formatWager(amount: number): string {
  const value = Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${formatter.format(value)} pts`;
}

function formatTimeLimit(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '30s';
  }
  const totalSeconds = Math.round(seconds);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

function resolveModeLabel(modeKey: string): string {
  const cleanedKey = typeof modeKey === 'string' ? modeKey.trim() : '';
  if (!cleanedKey.length) {
    return 'Bet Mode';
  }
  const formatted = cleanedKey
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return formatted.length ? formatted : 'Bet Mode';
}

function sanitizeLine(value: string): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

function getAdminClient() {
  const { getSupabaseAdmin } = require('../supabaseClient') as typeof import('../supabaseClient');
  return getSupabaseAdmin();
}
