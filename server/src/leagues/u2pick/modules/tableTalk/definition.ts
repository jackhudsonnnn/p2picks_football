import type { ModeContext, LeagueModeModule } from '../../../types';
import { tableTalkOverview } from './overview';
import { getTableTalkLiveInfo, TableTalkConfig } from './liveInfo';
import {
  TABLE_TALK_MODE_KEY,
  TABLE_TALK_LABEL,
  TABLE_TALK_CONDITION_MIN_LENGTH,
  TABLE_TALK_CONDITION_MAX_LENGTH,
  TABLE_TALK_OPTION_MIN_LENGTH,
  TABLE_TALK_OPTION_MAX_LENGTH,
  TABLE_TALK_OPTIONS_MIN_COUNT,
  TABLE_TALK_OPTIONS_MAX_COUNT,
} from './constants';

function computeWinningCondition({ config }: ModeContext): string {
  const typedConfig = config as TableTalkConfig;
  return typedConfig.winning_condition || 'Custom bet';
}

function computeOptions({ config }: ModeContext): string[] {
  const typedConfig = config as TableTalkConfig;
  const userOptions = typedConfig.options || [];
  // Always include "No Entry" as the first option
  return ['No Entry', ...userOptions];
}

function validateConfig({ config }: ModeContext): string[] {
  const errors: string[] = [];
  const typedConfig = config as TableTalkConfig;

  const condition = typedConfig.winning_condition;
  if (!condition || typeof condition !== 'string') {
    errors.push('Winning condition is required');
  } else {
    const trimmed = condition.trim();
    if (trimmed.length < TABLE_TALK_CONDITION_MIN_LENGTH) {
      errors.push(`Winning condition must be at least ${TABLE_TALK_CONDITION_MIN_LENGTH} characters`);
    }
    if (trimmed.length > TABLE_TALK_CONDITION_MAX_LENGTH) {
      errors.push(`Winning condition must be at most ${TABLE_TALK_CONDITION_MAX_LENGTH} characters`);
    }
  }

  const options = typedConfig.options;
  if (!options || !Array.isArray(options)) {
    errors.push('Options are required');
  } else {
    if (options.length < TABLE_TALK_OPTIONS_MIN_COUNT) {
      errors.push(`At least ${TABLE_TALK_OPTIONS_MIN_COUNT} options are required`);
    }
    if (options.length > TABLE_TALK_OPTIONS_MAX_COUNT) {
      errors.push(`At most ${TABLE_TALK_OPTIONS_MAX_COUNT} options are allowed`);
    }
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (!opt || typeof opt !== 'string') {
        errors.push(`Option ${i + 1} is invalid`);
        continue;
      }
      const trimmed = opt.trim();
      if (trimmed.length < TABLE_TALK_OPTION_MIN_LENGTH) {
        errors.push(`Option ${i + 1} must be at least ${TABLE_TALK_OPTION_MIN_LENGTH} character`);
      }
      if (trimmed.length > TABLE_TALK_OPTION_MAX_LENGTH) {
        errors.push(`Option ${i + 1} must be at most ${TABLE_TALK_OPTION_MAX_LENGTH} characters`);
      }
    }
  }

  return errors;
}

export const tableTalkModule: LeagueModeModule = {
  key: TABLE_TALK_MODE_KEY,
  label: TABLE_TALK_LABEL,
  supportedLeagues: ['U2Pick'],
  definition: {
    key: TABLE_TALK_MODE_KEY,
    label: TABLE_TALK_LABEL,
    computeWinningCondition,
    computeOptions,
    validateConfig,
    configSteps: [], // No interactive config steps - all set during bet creation
    metadata: {
      conditionMinLength: TABLE_TALK_CONDITION_MIN_LENGTH,
      conditionMaxLength: TABLE_TALK_CONDITION_MAX_LENGTH,
      optionMinLength: TABLE_TALK_OPTION_MIN_LENGTH,
      optionMaxLength: TABLE_TALK_OPTION_MAX_LENGTH,
      optionsMinCount: TABLE_TALK_OPTIONS_MIN_COUNT,
      optionsMaxCount: TABLE_TALK_OPTIONS_MAX_COUNT,
      manualResolution: true, // Flag to indicate this mode requires manual validation
    },
  },
  overview: tableTalkOverview,
  getLiveInfo: getTableTalkLiveInfo,
  // No prepareConfig, buildUserConfig, validateProposal needed for Table Talk
  // Resolution is handled manually via the validate endpoint
};
