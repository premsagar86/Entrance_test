export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T & { error?: string };
}

const NETWORK_ERROR = { error: "Network error. Check your connection." };

async function send<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "x-requested-with": "fetch", ...(init.headers as Record<string, string> | undefined) },
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: NETWORK_ERROR as T & { error?: string } };
  }
}

/** JSON request carrying the custom header the server requires for CSRF defence. */
export function api<T = unknown>(method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT", url: string, body?: unknown) {
  return send<T>(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const postJson = <T = unknown>(url: string, body: unknown) => api<T>("POST", url, body);

export function uploadFile<T = unknown>(url: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return send<T>(url, { method: "POST", body: form });
}

export function postText<T = unknown>(url: string, text: string) {
  return send<T>(url, { method: "POST", headers: { "content-type": "text/csv" }, body: text });
}

/** Friendly message for a failed result. */
export function errorMessage(res: ApiResult, fallback = "Something went wrong."): string {
  if (res.status === 0) return "Network error. Check your connection.";
  if (res.status === 401) return "Your session expired. Please sign in again.";
  if (res.status === 429) return "Too many requests. Please wait a moment.";
  if (res.status >= 500) return "Server error. Please try again.";
  return res.data.error ?? fallback;
}
