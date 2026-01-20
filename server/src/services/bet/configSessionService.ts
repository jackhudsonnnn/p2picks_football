import { randomUUID } from 'crypto';
import { getModeDefinition } from '../../modes/registry';
import type { ModeDefinitionDTO, ModeUserConfigChoice, ModeUserConfigStep } from '../../modes/shared/types';
import { normalizeToHundredth } from '../../utils/number';
import {
  buildModePreview,
  getModeUserConfigSteps,
  type ModePreviewResult,
} from './modeRuntimeService';
import {
  SESSION_TTL_MS,
  WAGER_MIN,
  WAGER_MAX,
  WAGER_STEP,
  DEFAULT_WAGER,
  TIME_LIMIT_MIN,
  TIME_LIMIT_MAX,
  TIME_LIMIT_STEP,
  DEFAULT_TIME_LIMIT,
} from '../../constants/betting';
import { normalizeLeague, type League } from '../../types/league';

export type ModeConfigSessionStatus = 'mode_config' | 'general' | 'summary';

export interface GeneralConfigFieldSchema {
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
  choices: number[];
}

export interface GeneralConfigSchema {
  wager_amount: GeneralConfigFieldSchema;
  time_limit_seconds: GeneralConfigFieldSchema;
}

export interface GeneralConfigValues {
  wager_amount: number;
  time_limit_seconds: number;
}

const WAGER_CHOICES: number[] = [];
for (let value = WAGER_MIN; value <= WAGER_MAX + 1e-9; value += WAGER_STEP) {
  WAGER_CHOICES.push(Number(normalizeToHundredth(value).toFixed(2)));
}

const TIME_LIMIT_CHOICES: number[] = [];
for (let value = TIME_LIMIT_MIN; value <= TIME_LIMIT_MAX; value += TIME_LIMIT_STEP) {
  TIME_LIMIT_CHOICES.push(value);
}

export const GENERAL_CONFIG_SCHEMA: GeneralConfigSchema = {
  wager_amount: {
    min: WAGER_MIN,
    max: WAGER_MAX,
    step: WAGER_STEP,
    unit: '$$$',
    defaultValue: DEFAULT_WAGER,
    choices: WAGER_CHOICES,
  },
  time_limit_seconds: {
    min: TIME_LIMIT_MIN,
    max: TIME_LIMIT_MAX,
    step: TIME_LIMIT_STEP,
    unit: 'seconds',
    defaultValue: DEFAULT_TIME_LIMIT,
    choices: TIME_LIMIT_CHOICES,
  },
};

interface ModeConfigSession {
  id: string;
  modeKey: string;
  leagueGameId: string;
  league: League;
  config: Record<string, unknown>;
  selections: Record<string, string | null>;
  status: ModeConfigSessionStatus;
  general: GeneralConfigValues;
  preview: ModePreviewResult | null;
  createdAt: number;
  updatedAt: number;
  consumed: boolean;
}

export interface ModeConfigSessionDTO {
  session_id: string;
  mode_key: string;
  league_game_id: string;
  league: League;
  status: ModeConfigSessionStatus;
  steps: ModeUserConfigStep[];
  next_step: ModeUserConfigStep | null;
  general: GeneralConfigValues;
  general_schema: GeneralConfigSchema;
  preview: ModePreviewResult | null;
}

export interface ConsumedModeConfigSession {
  id: string;
  modeKey: string;
  leagueGameId: string;
  league: League;
  config: Record<string, unknown>;
  general: GeneralConfigValues;
  preview: ModePreviewResult;
}

const sessions = new Map<string, ModeConfigSession>();

export function normalizeWagerAmount(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_WAGER;
  }
  const clamped = Math.min(Math.max(value, WAGER_MIN), WAGER_MAX);
  const scaled = Math.round(clamped / WAGER_STEP) * WAGER_STEP;
  return Number(normalizeToHundredth(scaled).toFixed(2));
}

export function normalizeTimeLimitSeconds(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TIME_LIMIT;
  }
  const clamped = Math.min(Math.max(Math.round(value / TIME_LIMIT_STEP) * TIME_LIMIT_STEP, TIME_LIMIT_MIN), TIME_LIMIT_MAX);
  return clamped;
}

export async function createModeConfigSession(params: {
  modeKey: string;
  leagueGameId: string;
  league?: League;
}): Promise<ModeConfigSessionDTO> {
  pruneSessions();
  const id = randomUUID();
  const league = normalizeLeague(params.league ?? 'NFL');
  const session: ModeConfigSession = {
    id,
    modeKey: params.modeKey,
    leagueGameId: params.leagueGameId,
    league,
    config: {
      league,
      league_game_id: params.leagueGameId,
      ...(league === 'NFL' ? { nfl_game_id: params.leagueGameId } : {}),
    },
    selections: {},
    status: 'mode_config',
    general: {
      wager_amount: DEFAULT_WAGER,
      time_limit_seconds: DEFAULT_TIME_LIMIT,
    },
    preview: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    consumed: false,
  };
  sessions.set(id, session);
  return hydrateSessionDTO(session);
}

export async function applyModeConfigChoice(sessionId: string, payload: {
  stepKey: string;
  choiceId: string;
}): Promise<ModeConfigSessionDTO> {
  const session = requireSession(sessionId);
  const view = await computeSteps(session);
  const targetStep = view.steps.find((step) => step.key === payload.stepKey);
  if (!targetStep) {
    throw new Error('Requested step is not available');
  }
  const choice = targetStep.choices.find((option) => option.id === payload.choiceId);
  if (!choice) {
    throw new Error('Requested choice is not available');
  }
  applyChoice(session, targetStep, choice);
  session.selections[targetStep.key] = choice.id ?? choice.value;
  session.preview = null;
  session.status = 'mode_config';
  session.updatedAt = Date.now();
  return hydrateSessionDTO(session);
}

export async function setModeConfigGeneral(sessionId: string, input: Partial<GeneralConfigValues>): Promise<ModeConfigSessionDTO> {
  const session = requireSession(sessionId);
  if (session.status === 'mode_config') {
    throw new Error('Complete mode configuration before setting wager or time limit');
  }
  const wager = normalizeWagerAmount(Number(input.wager_amount ?? session.general.wager_amount));
  const timeLimit = normalizeTimeLimitSeconds(Number(input.time_limit_seconds ?? session.general.time_limit_seconds));
  session.general = {
    wager_amount: wager,
    time_limit_seconds: timeLimit,
  };
  session.preview = await buildModePreview(session.modeKey, session.config, null);
  session.status = 'summary';
  session.updatedAt = Date.now();
  return hydrateSessionDTO(session);
}

export async function getModeConfigSession(sessionId: string): Promise<ModeConfigSessionDTO> {
  const session = requireSession(sessionId);
  return hydrateSessionDTO(session);
}

export function consumeModeConfigSession(sessionId: string): ConsumedModeConfigSession {
  pruneSessions();
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Configuration session not found');
  }
  if (session.consumed) {
    throw new Error('Configuration session already used');
  }
  if (session.status !== 'summary') {
    throw new Error('Configuration session is not ready for submission');
  }
  if (!session.preview || (session.preview.errors?.length ?? 0) > 0) {
    throw new Error('Configuration preview must be error free before submission');
  }
  session.consumed = true;
  sessions.delete(sessionId);
  return {
    id: session.id,
    modeKey: session.modeKey,
    leagueGameId: session.leagueGameId,
    league: session.league,
    config: { ...session.config },
    general: { ...session.general },
    preview: session.preview,
  };
}

async function hydrateSessionDTO(session: ModeConfigSession): Promise<ModeConfigSessionDTO> {
  const view = await computeSteps(session);
  return {
    session_id: session.id,
    mode_key: session.modeKey,
    league_game_id: session.leagueGameId,
    league: session.league,
    status: session.status,
    steps: view.steps,
    next_step: view.nextStep,
    general: { ...session.general },
    general_schema: GENERAL_CONFIG_SCHEMA,
    preview: session.preview,
  };
}

async function computeSteps(session: ModeConfigSession): Promise<{ steps: ModeUserConfigStep[]; nextStep: ModeUserConfigStep | null }> {
  pruneSessions();
  const definition = requireModeDefinition(session.modeKey);
  const rawSteps = await getModeUserConfigSteps(session.modeKey, {
    nflGameId: session.league === 'NFL' ? session.leagueGameId : undefined,
    config: session.config,
  });
  reconcileSelections(session, rawSteps);
  const annotatedSteps = annotateSteps(rawSteps, session, definition);
  const nextStep = annotatedSteps.find((step) => !step.completed) || null;
  if (!nextStep && annotatedSteps.length === 0) {
    session.status = session.status === 'summary' ? session.status : 'general';
  } else if (!nextStep) {
    session.status = session.status === 'summary' ? session.status : 'general';
  } else {
    session.status = 'mode_config';
  }
  return { steps: annotatedSteps, nextStep };
}

function annotateSteps(
  steps: ModeUserConfigStep[],
  session: ModeConfigSession,
  definition: ModeDefinitionDTO,
): ModeUserConfigStep[] {
  const metaByKey = new Map(definition.configSteps.map((meta) => [meta.key, meta]));
  return steps.map((step) => {
    const meta = metaByKey.get(step.key);
    const validationErrors = meta?.validate ? meta.validate({ config: session.config, bet: null }) : [];
    const selectedChoiceId = session.selections[step.key] ?? null;
    const completed = Boolean(selectedChoiceId) && validationErrors.length === 0;
    return {
      ...step,
      validationErrors,
      selectedChoiceId,
      completed,
    };
  });
}

function reconcileSelections(session: ModeConfigSession, steps: ModeUserConfigStep[]): void {
  const validKeys = new Set(steps.map((step) => step.key));
  Object.keys(session.selections).forEach((key) => {
    if (!validKeys.has(key)) {
      delete session.selections[key];
    }
  });
  steps.forEach((step) => {
    const selected = session.selections[step.key];
    if (!selected) return;
    const hasChoice = step.choices.some((choice) => choice.id === selected);
    if (!hasChoice) {
      delete session.selections[step.key];
    }
  });
}

function applyChoice(session: ModeConfigSession, step: ModeUserConfigStep, choice: ModeUserConfigChoice): void {
  if (Array.isArray(choice.clears)) {
    choice.clears.forEach((field) => {
      if (typeof field !== 'string' || !field.length) return;
      session.config[field] = null;
    });
  }
  if (Array.isArray(choice.clearSteps)) {
    choice.clearSteps.forEach((key) => {
      if (!key) return;
      delete session.selections[key];
    });
  }
  if (choice.patch && typeof choice.patch === 'object') {
    Object.assign(session.config, choice.patch);
  }
}

function requireModeDefinition(modeKey: string): ModeDefinitionDTO {
  const definition = getModeDefinition(modeKey);
  if (!definition) {
    throw new Error(`mode ${modeKey} not found`);
  }
  return definition;
}

function requireSession(sessionId: string): ModeConfigSession {
  pruneSessions();
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Configuration session not found');
  }
  const expired = Date.now() - session.updatedAt > SESSION_TTL_MS;
  if (expired) {
    sessions.delete(sessionId);
    throw new Error('Configuration session expired');
  }
  return session;
}

function pruneSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS || session.consumed) {
      sessions.delete(id);
    }
  }
}
