import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createServer() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // 👇 حل مشاكل types
          return (cookieStore as any).getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              (cookieStore as any).set(name, value, options);
            });
          } catch {
            // ignored (Server Components)
          }
        },
      },
    }
  );
}
