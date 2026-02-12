/**
 * Centralised TanStack Query key factories.
 *
 * Convention (per TanStack docs):
 *   keys.all            → root scope (for mass invalidation)
 *   keys.lists()        → every list variant
 *   keys.list(filters)  → a specific filtered list
 *   keys.details()      → every detail variant
 *   keys.detail(id)     → a single entity
 */

export const tableKeys = {
  all: ['tables'] as const,
  lists: () => [...tableKeys.all, 'list'] as const,
  list: (userId: string) => [...tableKeys.lists(), userId] as const,
  details: () => [...tableKeys.all, 'detail'] as const,
  detail: (tableId: string) => [...tableKeys.details(), tableId] as const,
};

export const ticketKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (userId: string) => [...ticketKeys.lists(), userId] as const,
};

export const modeKeys = {
  all: ['modes'] as const,
  catalogs: () => [...modeKeys.all, 'catalog'] as const,
  catalog: (league: string) => [...modeKeys.catalogs(), league] as const,
  previews: () => [...modeKeys.all, 'preview'] as const,
  preview: (modeKey: string, configSig: string, gameId: string, league: string, betId?: string | null) =>
    [...modeKeys.previews(), modeKey, configSig, gameId, league, betId ?? ''] as const,
};

export const betKeys = {
  all: ['bets'] as const,
  liveInfos: () => [...betKeys.all, 'liveInfo'] as const,
  liveInfo: (betId: string) => [...betKeys.liveInfos(), betId] as const,
};

export const socialKeys = {
  all: ['social'] as const,
  profile: () => [...socialKeys.all, 'profile'] as const,
  friends: (userId: string) => [...socialKeys.all, 'friends', userId] as const,
  friendRequests: (userId: string) => [...socialKeys.all, 'friendRequests', userId] as const,
};
