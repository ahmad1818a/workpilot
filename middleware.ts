import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const path = req.nextUrl.pathname;

  // Helper: redirect to login with next
  const redirectToLogin = (nextPath: string) => {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url);
  };

  // ✅ Get user
  const { data, error: userErr } = await supabase.auth.getUser();
  const user = data?.user;

  // لو صار خطأ في auth، اعتبره غير مسجل دخول للصفحات المحمية
  if (userErr) {
    if (path.startsWith("/dashboard") || path.startsWith("/onboarding")) {
      return redirectToLogin(path.startsWith("/onboarding") ? "/onboarding/company" : path);
    }
    return res;
  }

  // 🔒 Protect /dashboard
  if (path.startsWith("/dashboard")) {
    if (!user) return redirectToLogin(path);

    // ✅ membership: company_id
    const { data: membership, error: mErr } = await supabase
      .from("memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (mErr) {
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding/company";
      return NextResponse.redirect(url);
    }

    const company_id = membership?.company_id;

    // إذا ما عنده شركة → onboarding
    if (!company_id) {
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding/company";
      return NextResponse.redirect(url);
    }

    // ✅ Billing Gate:
    // اسمح دائمًا بدخول صفحة settings حتى يقدر يدفع
    const billingAllowedPaths = [
      "/dashboard/settings",
      "/dashboard/settings/",
    ];
    const isBillingAllowed = billingAllowedPaths.some((p) => path === p);

    if (!isBillingAllowed) {
      // تحقق من الاشتراك
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("company_id", company_id)
        .maybeSingle();

      // ✅ السماح فقط إذا status = active
      // trial في Stripe يعتبر subscription status = trialing غالبًا
      // فخلّينا نسمح trialing أيضًا
      const okStatus = sub?.status === "active" || sub?.status === "trialing";

      if (!okStatus) {
        const url = req.nextUrl.clone();
        url.pathname = "/dashboard/settings";
        url.searchParams.set("billing", "required");
        return NextResponse.redirect(url);
      }
    }
  }

  // 🔒 Protect /onboarding
  if (path.startsWith("/onboarding")) {
    if (!user) return redirectToLogin("/onboarding/company");

    // امنع loop: اسمح دائمًا بصفحة إنشاء الشركة
    if (path === "/onboarding/company") return res;

    // إذا عنده شركة بالفعل، رجعه للداشبورد
    const { data: membership } = await supabase
      .from("memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membership?.company_id) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*"],
};
