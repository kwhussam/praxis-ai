import { supabase } from "@/lib/api/supabase";
import { AppConfig } from "@/lib/config/environment";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.token ?? (await getSupabaseAccessToken());
  const response = await fetch(`${AppConfig.apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const message = await errorMessageFromResponse(response);
    throw new Error(message);
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
