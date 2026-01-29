// Domain types for tables feature
export interface Table {
  table_id: string;
  table_name: string;
  host_user_id: string;
  created_at: string;
  last_activity_at: string | null;
}

export type BalanceType = 'bust' | 'push' | 'sweep';

export interface TableMember {
  user_id: string;
  username: string;
  bust_balance: number;
  push_balance: number;
  sweep_balance: number;
}

export interface TableListItem {
  table_id: string;
  table_name: string;
  host_user_id: string;
  created_at: string;
  last_activity_at: string;
  host_username?: string | null;
  memberCount?: number;
}

export interface TableRelationMember {
  user_id: string;
  bust_balance: number | null;
  push_balance: number | null;
  sweep_balance: number | null;
  users?: {
    username?: string | null;
  } | null;
}

export interface TableWithMembers extends Table {
  table_members: TableRelationMember[];
}
