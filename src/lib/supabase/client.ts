import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * 🔒 Alias للحماية من أي import قديم في build cache
 * لا تحذفه حتى بعد نجاح deploy
 */
export const createBrowserSupabaseClient = createClient;
// trigger deploy
