import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ✅ هذا السطر هو اللي يحل المشكلة (يعمل export بالاسم المطلوب)
export const createBrowserSupabaseClient = createClient;
