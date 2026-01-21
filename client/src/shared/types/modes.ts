export interface ModeOverviewExample {
  title?: string;
  description: string;
}

export interface ModeOverview {
  key: string;
  label: string;
  tagline: string;
  description: string;
  proposerConfiguration: string[];
  participantChoices: string[];
  winningCondition: string;
  notes?: string[];
  example?: ModeOverviewExample;
}

export interface ModeConfigRecord {
  mode_key: string;
  data: Record<string, unknown>;
}

export type ModePreviewPayload = {
  summary?: string;
  description?: string;
  winningCondition?: string;
  options?: string[];
  fields?: Array<{ label: string; value: string }>;
  rows?: Array<Record<string, string | number | null>>;
};
