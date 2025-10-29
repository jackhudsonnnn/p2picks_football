// Centralized datetime formatting utilities
// Provides a small, parameterized wrapper around Intl / toLocaleString

export type FormatDateTimeOptions = {
  locale?: string;
  includeTime?: boolean; // include hour:minute
  includeSeconds?: boolean;
  hour12?: boolean;
  timeZone?: string;
};

// Internal: attempt to coerce a string/Date into Date or return null
export function toDate(input?: string | Date | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(input?: string | Date | null, opts?: FormatDateTimeOptions): string | null {
  const date = toDate(input);
  if (!date) return null;

  const locale = opts?.locale ?? 'en-US';
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  if (opts?.includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    if (opts?.includeSeconds) options.second = '2-digit';
    if (typeof opts?.hour12 === 'boolean') options.hour12 = opts.hour12;
  }
  if (opts?.timeZone) options.timeZone = opts.timeZone;
  try {
    return date.toLocaleString(locale, options);
  } catch {
    return null;
  }
}

// Time-only HH:MM (optionally with seconds) helper
export function formatTimeOfDay(input?: string | Date | null, opts?: { includeSeconds?: boolean; hour12?: boolean; locale?: string; timeZone?: string }): string | null {
  const date = toDate(input);
  if (!date) return null;
  const locale = opts?.locale ?? 'en-US';
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  if (opts?.includeSeconds) options.second = '2-digit';
  if (typeof opts?.hour12 === 'boolean') options.hour12 = opts.hour12;
  if (opts?.timeZone) options.timeZone = opts.timeZone;
  try {
    return date.toLocaleTimeString(locale, options);
  } catch {
    return null;
  }
}

// Relative label for chat sections: Today / Yesterday / Mon, Jan 5
export function formatRelativeDateLabel(input?: string | Date | null, opts?: { locale?: string }): string {
  const date = toDate(input);
  if (!date) return 'Unknown';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(opts?.locale ?? 'en-US', { month: 'short', day: 'numeric' });
}

// Helper to group timestamps (e.g., chat messages) by date label
export function groupByDateLabel<T extends { timestamp: string | Date }>(items: T[]): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const label = formatRelativeDateLabel(item.timestamp);
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {});
}
