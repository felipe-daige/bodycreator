const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // Sem isto o cookie de sessão não viaja e tudo responde 401.
    credentials: 'include',
    headers: init.body instanceof FormData
      ? (init.headers ?? {})
      : { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (body as { error?: string }).error ?? 'Algo deu errado. Tente de novo.');
  }
  return body as T;
}
