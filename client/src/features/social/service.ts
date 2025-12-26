import type { Friend, FriendRelation, FriendRequest, FriendRequestStatus, UserProfile } from './types';
import {
  getAuthUserProfile as getAuthUserProfileRepo,
  updateUsername as updateUsernameRepo,
  isUsernameTaken as isUsernameTakenRepo,
  listFriendRelations as listFriendRelationsRepo,
  listFriends as listFriendsRepo,
  addFriend as addFriendRepo,
  removeFriend as removeFriendRepo,
  listFriendRequests as listFriendRequestsRepo,
  respondToFriendRequest as respondToFriendRequestRepo,
} from '@data/repositories/socialRepository';

export async function getAuthUserProfile(): Promise<UserProfile | null> {
  return getAuthUserProfileRepo();
}

export async function updateUsername(userId: string, username: string): Promise<UserProfile> {
  return updateUsernameRepo(userId, username);
}

export async function isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
  return isUsernameTakenRepo(username, excludeUserId);
}

export async function listFriendRelations(currentUserId: string): Promise<FriendRelation[]> {
  return listFriendRelationsRepo(currentUserId);
}

export async function listFriends(currentUserId: string): Promise<Friend[]> {
  return listFriendsRepo(currentUserId);
}

export async function addFriend(
  currentUserId: string,
  targetUsername: string,
): Promise<{ status: FriendRequestStatus; friend?: Friend; request?: FriendRequest }> {
  const result = await addFriendRepo(currentUserId, targetUsername);
  return result;
}

export async function removeFriend(currentUserId: string, friendUserId: string): Promise<void> {
  return removeFriendRepo(currentUserId, friendUserId);
}

export async function listFriendRequests(): Promise<FriendRequest[]> {
  return listFriendRequestsRepo();
}

export async function respondToFriendRequest(
  requestId: string,
  action: 'accept' | 'decline' | 'cancel',
): Promise<{ request: FriendRequest; status: FriendRequestStatus }> {
  return respondToFriendRequestRepo(requestId, action);
}
