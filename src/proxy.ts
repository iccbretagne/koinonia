import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!sessionToken) {
    // Allow cron routes to pass through (authenticated by bearer token in route handler)
    if (request.nextUrl.pathname.startsWith("/api/cron")) {
      return NextResponse.next();
    }
    // Allow public media token routes (validate, gallery, download — token-based auth)
    if (request.nextUrl.pathname.startsWith("/api/media/validate/") ||
        request.nextUrl.pathname.startsWith("/api/media/gallery/") ||
        request.nextUrl.pathname.startsWith("/api/media/download/")) {
      return NextResponse.next();
    }
    // Allow MRBS SSO endpoints (authenticated by Bearer secret, not session cookie)
    if (request.nextUrl.pathname.startsWith("/api/auth/mrbs/")) {
      return NextResponse.next();
    }
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/((?!auth).*)"],
};
