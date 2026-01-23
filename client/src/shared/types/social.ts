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

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface FriendRequest {
  request_id: string;
  sender_user_id: string;
  receiver_user_id: string;
  status: FriendRequestStatus;
  created_at: string;
  responded_at: string | null;
  sender: Friend | { user_id: string; username: string | null };
  receiver: Friend | { user_id: string; username: string | null };
}

export interface FriendRequestView extends FriendRequest {
  direction: 'incoming' | 'outgoing';
  other_user: Friend;
}
