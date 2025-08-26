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

export function formatDateOrFallback(input?: string | Date | null, opts?: FormatDateTimeOptions, fallback = 'N/A') {
  const v = formatDateTime(input, opts);
  return v ?? fallback;
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

// Compact time-ago (e.g., 5m, 2h, 3d)
export function timeAgo(input?: string | Date | null): string | null {
  const date = toDate(input);
  if (!date) return null;
  const diff = Date.now() - date.getTime();
  if (diff < 0) return '0s';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return sec + 's';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm';
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs + 'h';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd';
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return weeks + 'w';
  const months = Math.floor(days / 30);
  if (months < 12) return months + 'mo';
  const years = Math.floor(days / 365);
  return years + 'y';
}

// Format duration (ms or seconds) into human friendly text
export function formatDuration(duration: number, opts?: { as?: 'ms' | 's'; style?: 'compact' | 'full' }): string {
  const baseSeconds = opts?.as === 'ms' ? duration / 1000 : duration;
  if (!isFinite(baseSeconds) || baseSeconds < 0) return '0s';
  const s = Math.floor(baseSeconds % 60);
  const m = Math.floor((baseSeconds / 60) % 60);
  const h = Math.floor(baseSeconds / 3600);
  if (opts?.style === 'full') {
    const parts: string[] = [];
    if (h) parts.push(h + 'h');
    if (m) parts.push(m + 'm');
    if (s || parts.length === 0) parts.push(s + 's');
    return parts.join(' ');
  }
  if (h) return `${h}h${m.toString().padStart(2, '0')}m`;
  if (m) return `${m}m${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
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

// Compose a range (start - end) using existing formatter
export function formatDateTimeRange(start?: string | Date | null, end?: string | Date | null, opts?: FormatDateTimeOptions & { separator?: string }): string | null {
  const a = formatDateTime(start, opts);
  const b = formatDateTime(end, opts);
  if (!a && !b) return null;
  if (a && !b) return a;
  if (!a && b) return b;
  return `${a}${opts?.separator ?? ' – '}${b}`;
}
