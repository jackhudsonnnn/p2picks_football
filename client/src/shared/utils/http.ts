// Lightweight shared HTTP helpers for stats-server interactions
// Provides consistent JSON validation and clearer diagnostics when an endpoint
// accidentally returns HTML (dev fallback) or non-JSON content.

import { supabase } from '@shared/api/supabaseClient';

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

let cachedAccessToken: string | null = null;

supabase.auth.getSession().then(({ data }) => {
  cachedAccessToken = data.session?.access_token ?? null;
}).catch(() => {
  cachedAccessToken = null;
});

supabase.auth.onAuthStateChange((_event, session) => {
  cachedAccessToken = session?.access_token ?? null;
});

async function resolveAccessToken(): Promise<string | null> {
  if (cachedAccessToken) return cachedAccessToken;
  try {
    const { data } = await supabase.auth.getSession();
    cachedAccessToken = data.session?.access_token ?? null;
    return cachedAccessToken;
  } catch {
    return null;
  }
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      result[key] = value;
    }
  } else {
    Object.assign(result, headers as Record<string, string>);
  }
  return result;
}

async function performAuthorizedFetch(
  url: string,
  options: RequestInit,
  attempt = 0,
): Promise<Response> {
  const originalHeaders = options.headers;
  const headerMap = normalizeHeaders(originalHeaders);
  const hasAuthHeader = Object.keys(headerMap).some((key) => key.toLowerCase() === 'authorization');
  if (!hasAuthHeader) {
    const token = await resolveAccessToken();
    if (token) {
      headerMap.Authorization = `Bearer ${token}`;
    }
  }
  const acceptValue = headerMap.Accept ?? headerMap.accept;
  headerMap.Accept = acceptValue ?? 'application/json';
  if ('accept' in headerMap) {
    delete (headerMap as any).accept;
  }

  const response = await fetch(url, {
    ...options,
    headers: headerMap,
  });

  if (response.status === 401 && attempt === 0 && !hasAuthHeader) {
    try {
      const { data } = await supabase.auth.refreshSession();
      cachedAccessToken = data.session?.access_token ?? null;
      if (cachedAccessToken) {
        return performAuthorizedFetch(url, { ...options, headers: originalHeaders }, attempt + 1);
      }
    } catch (refreshError) {
      console.warn('[fetchJSON] refreshSession failed', refreshError);
    }
    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      console.warn('[fetchJSON] signOut after unauthorized failed', signOutError);
    }
  }

  return response;
}

export async function fetchJSON<T = any>(url: string, opts: FetchJSONOptions = {}): Promise<T> {
  const { allowNonJSON = false, previewBytes = 120, softFail = false, ...rest } = opts;
  const res = await performAuthorizedFetch(url, rest);
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
