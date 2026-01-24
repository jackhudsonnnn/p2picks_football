/**
 * Shared Game Feed Types
 *
 * Generic types for game feed events across all leagues.
 * Each league's game feed service produces events conforming to this interface.
 */

/**
 * Generic game feed event emitted when a game's data changes.
 * The `doc` field contains league-specific game document data.
 */
export interface GameFeedEvent<TDoc = unknown> {
  gameId: string;
  doc: TDoc;
  signature: string;
  updatedAt: string;
}

/**
 * Listener function for game feed events.
 */
export type GameFeedListener<TDoc = unknown> = (event: GameFeedEvent<TDoc>) => void | Promise<void>;

/**
 * Subscribe function signature for game feed services.
 */
export type GameFeedSubscriber<TDoc = unknown> = (
  listener: GameFeedListener<TDoc>,
  emitReplay?: boolean,
) => () => void;
