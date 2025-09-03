// Domain types for tables feature
export interface Table {
  table_id: string;
  table_name: string;
  host_user_id: string;
  created_at: string;
  last_activity_at: string | null;
}

export interface TableMember {
  user_id: string;
  username: string;
  balance?: number; // future: include balance when available
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
