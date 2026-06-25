import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// `/api/export` is listed here so the middleware doesn't redirect to /login;
// that route enforces its own auth (a valid sync token OR a logged-in session),
// which lets Google Sheets =IMPORTDATA() read CSV with a token but no cookie.
const publicPaths = ["/login", "/api/auth", "/api/export"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (!req.auth && !isPublic) {
    const login = new URL("/login", req.nextUrl.origin);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  if (req.auth && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  const isTreasurerOnly =
    pathname.startsWith("/settings") ||
    (pathname.startsWith("/checks") && req.method !== "GET");

  if (
    isTreasurerOnly &&
    req.auth?.user?.role !== "TREASURER" &&
    pathname !== "/checks"
  ) {
    // Settings is treasurer-only; checks page viewable by all
    if (pathname.startsWith("/settings")) {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|.*\\..*).*)"],
};
