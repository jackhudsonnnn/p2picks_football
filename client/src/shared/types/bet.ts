import type { Database } from '@data/types/database.types';

export type League = Database['public']['Enums']['league'];
export type BetModeKey = string & { _brand?: 'BetModeKey' };
export type BetStatus = 'active' | 'pending' | 'resolved' | 'washed';