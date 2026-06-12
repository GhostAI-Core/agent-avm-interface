import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// In-memory auth lock. Supabase's default browser lock uses the Web Locks API,
// whose steal-on-refresh path logs `Lock "sb-…-auth-token" was released because
// another request stole it` whenever a token refresh/recovery overlaps another
// auth call (e.g. onAuthStateChange awaiting a profile query). With a single
// client per tab, serialising auth calls through an in-process promise chain is
// enough and the "stolen" message can never be emitted.
let authChain: Promise<unknown> = Promise.resolve();
const inMemoryLock = <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  const result = authChain.then(fn, fn);
  // Keep the chain alive regardless of this call's outcome; the caller still
  // sees the real result/rejection via `result`.
  authChain = result.then(() => undefined, () => undefined);
  return result;
};

// One browser client for the whole app. (@supabase/ssr also caches internally in
// the browser, but memoising here keeps it explicit and stable.)
const build = () =>
  createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
    {
      auth: {
        lock: inMemoryLock,
      },
      global: {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      },
    }
  );

let client: ReturnType<typeof build> | undefined;

export const createClient = () => (client ??= build());
