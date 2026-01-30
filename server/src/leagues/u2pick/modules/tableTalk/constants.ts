/**
 * Table Talk Mode Constants
 * 
 * U2Pick's Table Talk is a user-defined bet mode where participants
 * manually validate the outcome.
 */

export const TABLE_TALK_MODE_KEY = 'table_talk';
export const TABLE_TALK_LABEL = 'Table Talk';

// Validation constraints (also enforced on client)
export const TABLE_TALK_CONDITION_MIN_LENGTH = 4;
export const TABLE_TALK_CONDITION_MAX_LENGTH = 70;
export const TABLE_TALK_OPTION_MIN_LENGTH = 1;
export const TABLE_TALK_OPTION_MAX_LENGTH = 40;
export const TABLE_TALK_OPTIONS_MIN_COUNT = 2;
export const TABLE_TALK_OPTIONS_MAX_COUNT = 6;
