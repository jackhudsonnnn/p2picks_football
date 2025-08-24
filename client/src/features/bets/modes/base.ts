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
  validateConfig?: (config: any) => void | string[];
  persistConfig?: (ctx: ModePersistContext) => Promise<void>;
  FormFields?: any; // React component signature: ({value,onChange,players,game})
  winningConditionText?: (config: any) => string;
}

export function mergeConfig<T extends object>(prev: T, patch: Partial<T>): T {
  return { ...(prev as any), ...(patch as any) } as T;
}
