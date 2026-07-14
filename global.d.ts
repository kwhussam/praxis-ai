declare const process: {
  env: {
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_APP_ENV?: string;
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    TEST_PRACTICE_A_EMAIL?: string;
    TEST_PRACTICE_A_PASSWORD?: string;
    TEST_PRACTICE_B_ID?: string;
    CI?: string;
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

declare module "expo-secure-store" {
  export type SecureStoreOptions = {
    keychainService?: string;
  };

  export function isAvailableAsync(): Promise<boolean>;
  export function getItemAsync(key: string, options?: SecureStoreOptions): Promise<string | null>;
  export function setItemAsync(key: string, value: string, options?: SecureStoreOptions): Promise<void>;
  export function deleteItemAsync(key: string, options?: SecureStoreOptions): Promise<void>;
}

declare module "react-test-renderer" {
  import type { ReactElement } from "react";

  export type ReactTestInstance = {
    type: unknown;
    props: Record<string, unknown>;
    children: unknown[];
    parent: ReactTestInstance | null;
    find(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance;
    findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[];
  };

  export type ReactTestRenderer = {
    root: ReactTestInstance;
  };

  const renderer: {
    create(element: ReactElement): ReactTestRenderer;
  };
  export function act(callback: () => void | Promise<void>): void | Promise<void>;
  export default renderer;
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
