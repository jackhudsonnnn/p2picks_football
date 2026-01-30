import type { GetLiveInfoInput, ModeLiveInfo } from '../../../sharedUtils/types';
import { TABLE_TALK_MODE_KEY, TABLE_TALK_LABEL } from './constants';

export interface TableTalkConfig {
  winning_condition?: string | null;
  options?: string[] | null;
}

/**
 * Get live info for a Table Talk bet.
 * Shows the winning condition and available options.
 */
export async function getTableTalkLiveInfo(input: GetLiveInfoInput): Promise<ModeLiveInfo> {
  const { config } = input;
  const typedConfig = config as TableTalkConfig;

  const winningCondition = typedConfig.winning_condition || 'Custom bet';
  const options = typedConfig.options || [];

  const fields: { label: string; value: string | number }[] = [];

  // Add options as numbered fields
  options.forEach((option, index) => {
    fields.push({
      label: `Option ${index + 1}`,
      value: option,
    });
  });

  return {
    modeKey: TABLE_TALK_MODE_KEY,
    modeLabel: TABLE_TALK_LABEL,
    fields,
  };
}
