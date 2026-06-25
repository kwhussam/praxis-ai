declare const process: {
  env: {
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_APP_ENV?: string;
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    SUPABASE_SERVICE_KEY?: string;
    TEST_PRACTICE_A_EMAIL?: string;
    TEST_PRACTICE_A_PASSWORD?: string;
    TEST_PRACTICE_B_ID?: string;
  };
};

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

declare module "https://deno.land/std@0.224.0/http/server.ts" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare const describe: {
  (name: string, fn: () => void): void;
  skip(name: string, fn: () => void): void;
};

declare const it: (name: string, fn: () => void | Promise<void>) => void;

declare function expect(value: unknown): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeNull(): void;
  toBeDefined(): void;
  toHaveLength(length: number): void;
  toMatch(pattern: RegExp): void;
  toMatchObject(expected: Record<string, unknown>): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
};
