import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ✅ Alias: لو أي مكان يستدعي الاسم القديم، ما يصير Error
export const createBrowserSupabaseClient = createClient;
