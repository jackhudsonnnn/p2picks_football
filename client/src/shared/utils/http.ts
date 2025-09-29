// Lightweight shared HTTP helpers for stats-server interactions
// Provides consistent JSON validation and clearer diagnostics when an endpoint
// accidentally returns HTML (dev fallback) or non-JSON content.

export class HttpError extends Error {
  status: number;
  url: string;
  bodyPreview?: string;
  constructor(msg: string, opts: { status: number; url: string; bodyPreview?: string }) {
    super(msg);
    this.status = opts.status;
    this.url = opts.url;
    this.bodyPreview = opts.bodyPreview;
  }
}

export interface FetchJSONOptions extends RequestInit {
  /** If true, will not throw when content-type is not JSON; instead returns raw text */
  allowNonJSON?: boolean;
  /** How many chars of the body to retain in thrown error previews */
  previewBytes?: number;
  /** Treat non-ok status as soft failure returning null instead of throwing */
  softFail?: boolean;
}

export async function fetchJSON<T = any>(url: string, opts: FetchJSONOptions = {}): Promise<T> {
  const { allowNonJSON = false, previewBytes = 120, softFail = false, headers, ...rest } = opts;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...(headers || {}) },
    ...rest,
  });
  const status = res.status;
  let raw: string | undefined;
  try {
    raw = await res.text();
  } catch {
    raw = undefined;
  }

  if (!res.ok) {
    if (softFail) return null as unknown as T;
    throw new HttpError(`Request failed (${status}) for ${url}`, {
      status,
      url,
      bodyPreview: raw?.slice(0, previewBytes),
    });
  }

  const ct = res.headers.get('content-type') || '';
  const trimmed = raw?.trim() || '';
  if (!allowNonJSON) {
    if (!ct.includes('application/json') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      if (softFail) return null as unknown as T;
      throw new HttpError(`Non-JSON response for ${url}`, {
        status,
        url,
        bodyPreview: trimmed.slice(0, previewBytes),
      });
    }
  }
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch (e: any) {
    if (softFail) return null as unknown as T;
    throw new HttpError(`JSON parse error for ${url}: ${e?.message}`, {
      status,
      url,
      bodyPreview: raw?.slice(0, previewBytes),
    });
  }
}

export async function safeFetchJSON<T = any>(url: string, opts: FetchJSONOptions = {}): Promise<T | null> {
  try {
    return await fetchJSON<T>(url, { softFail: true, ...opts });
  } catch (e) {
    // Should not reach here because softFail true prevents throws, but just in case
    console.warn('[safeFetchJSON] unexpected throw', { url, error: (e as any)?.message });
    return null;
  }
}
