import type { Friend, FriendRelation, UserProfile } from './types';
import {
  getAuthUserProfile as getAuthUserProfileRepo,
  updateUsername as updateUsernameRepo,
  isUsernameTaken as isUsernameTakenRepo,
  listFriendRelations as listFriendRelationsRepo,
  listFriends as listFriendsRepo,
  addFriend as addFriendRepo,
  removeFriend as removeFriendRepo,
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

export async function addFriend(currentUserId: string, targetUsername: string): Promise<Friend> {
  return addFriendRepo(currentUserId, targetUsername);
}

export async function removeFriend(currentUserId: string, friendUserId: string): Promise<void> {
  return removeFriendRepo(currentUserId, friendUserId);
}
