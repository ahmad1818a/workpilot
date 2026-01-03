"use client";

import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const supabase = createClient();

  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        window.location.href = "/login";
      }}
      className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-900/50"
    >
      Logout
    </button>
  );
}
