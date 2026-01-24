/**
 * @deprecated Use `../../sharedUtils/baseValidatorService` directly.
 * NFL BaseValidatorService - Re-exports from shared utilities with NFL defaults.
 *
 * This file remains only for backward compatibility; new validators should
 * import from the shared implementation and pass `league: 'NFL'` in config.
 */

import {
  BaseValidatorService as SharedBaseValidatorService,
  type BaseValidatorConfig as SharedBaseValidatorConfig,
} from '../../sharedUtils/baseValidatorService';

/**
 * NFL-specific BaseValidatorConfig that defaults league to 'NFL'.
 */
export interface BaseValidatorConfig extends Omit<SharedBaseValidatorConfig, 'league'> {
  /** Optional league override (defaults to 'NFL') */
  league?: SharedBaseValidatorConfig['league'];
}

/**
 * NFL BaseValidatorService - Wraps the shared service with NFL as default league.
 */
export abstract class BaseValidatorService<TConfig, TStore> extends SharedBaseValidatorService<TConfig, TStore> {
  constructor(config: BaseValidatorConfig) {
    super({
      ...config,
      league: config.league ?? 'NFL',
    });
  }
}
