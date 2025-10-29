// Social feature domain types

export interface UserProfile {
  user_id: string;
  username: string | null;
  email?: string | null;
  updated_at?: string | null;
}

export interface Friend {
  user_id: string;
  username: string;
}

export interface FriendRelation {
  user_id1: string;
  user_id2: string;
}
