export interface ModePersistContext {
  config: any;
  bet: any;
  tableId: string;
  proposerUserId: string;
}

export interface ModeDefinition {
  key: string;
  label: string;
  summary: (ctx: { bet?: any; config?: any }) => string;
  options: (ctx: { bet?: any; config?: any }) => string[];
  buildDescription?: (config: any) => string;
  buildSecondaryDescription?: (config: any) => string | undefined;
  validateConfig?: (config: any) => void | string[];
  persistConfig?: (ctx: ModePersistContext) => Promise<void>;
  winningConditionText?: (config: any) => string;
  FormSteps?: Array<{
    key: string;
    render: ModeStepRenderer;
    validate?: (config: any) => void | string[];
  }>;
}

export function mergeConfig<T extends object>(prev: T, patch: Partial<T>): T {
  return { ...(prev as any), ...(patch as any) } as T;
}

/** Props passed to each mode step renderer */
export type ModeStepRendererProps = {
  value: any;
  onChange: (patch: any) => void;
  players?: any[];
  game?: any;
  allowedResolveAfter?: string[];
};

/** Function type a mode can use to render a single step */
export type ModeStepRenderer = (props: ModeStepRendererProps) => any;
