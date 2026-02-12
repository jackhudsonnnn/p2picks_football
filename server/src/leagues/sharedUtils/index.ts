/**
 * Shared Utils barrel export
 *
 * Cross-cutting utilities shared across all leagues (NFL, NBA, etc.)
 */

// Base classes and types
export { BaseValidatorService, type BaseValidatorConfig } from './baseValidatorService';
export { BetRepository, type HistoryEventType, type WashResult } from './betRepository';
export type { ModeContext, ModeDefinitionDTO, ModeModule, ModeUserConfigStep } from './types';
export type { GameFeedEvent, GameFeedSubscriber } from './gameFeedTypes';

// Evaluation and resolution
export {
  evaluateSpread,
  normalizeSpread,
  describeSpread,
  resolveTeams,
  type SpreadConfig,
  type SpreadEvaluationResult,
} from './spreadEvaluator';
export {
  shouldSkipResolveStep,
  normalizeResolveAt,
  ALLOWED_RESOLVE_AT,
  DEFAULT_RESOLVE_AT,
} from './resolveUtils';

// Runtime infrastructure
export { ModeRuntimeKernel, type KernelOptions } from './modeRuntimeKernel';
export {
  startResolutionQueue,
  stopResolutionQueue,
  enqueueSetWinningChoice,
  enqueueWashBet,
  enqueueRecordHistory,
  getQueueStatus,
  type ResolutionJob,
  type QueueStatus,
} from './resolutionQueue';

// Services
export { washBetWithHistory, type WashOptions } from './washService';

// Utilities
export { computeModeOptions, computeWinningCondition } from './utils';
export { RedisJsonStore } from './redisJsonStore';
