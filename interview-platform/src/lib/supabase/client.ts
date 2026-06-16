import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Browser-side Supabase client (singleton).
 * Uses the anon key — all queries go through RLS.
 */
export function createClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";

  client = createBrowserClient<Database>(
    url,
    anonKey,
    {
      auth: {
        // Bypass navigator.locks to prevent AbortError on public pages
        lock: <R,>(
          _name: string,
          _acquireTimeout: number,
          fn: () => Promise<R>,
        ): Promise<R> => fn(),
      },
    },
  );

  return client;
}
