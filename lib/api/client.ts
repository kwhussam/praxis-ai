import { supabase } from "@/lib/api/supabase";
import { AppConfig } from "@/lib/config/environment";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Anfrage nach ${Math.round(timeoutMs / 1000)}s ohne Antwort abgebrochen.`);
    this.name = "ApiTimeoutError";
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.token ?? (await getSupabaseAccessToken());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${AppConfig.apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const message = await errorMessageFromResponse(response);
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

async function errorMessageFromResponse(response: Response) {
  const fallback = response.statusText || `Request failed with ${response.status}`;
  const text = await response.text();
  if (!text) return fallback;

  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    if (typeof data.message === "string" && data.message.trim().length > 0) return data.message;
    if (typeof data.error === "string" && data.error.trim().length > 0) return data.error;
  } catch {
    return text;
  }

  return fallback;
}

async function getSupabaseAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}
