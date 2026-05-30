import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const publicPaths = ["/login", "/api/auth"];

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
