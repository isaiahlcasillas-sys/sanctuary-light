import { useApp } from '../state/store';

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = useApp.getState().token;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => call<T>('GET', url),
  put: <T>(url: string, body: unknown) => call<T>('PUT', url, body),
  post: <T>(url: string, body: unknown) => call<T>('POST', url, body),
};

export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
