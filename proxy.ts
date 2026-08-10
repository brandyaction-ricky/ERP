import { NextRequest, NextResponse } from "next/server";
import { accessToken, AUTH_COOKIE } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/login" || path.startsWith("/api/auth") || path.startsWith("/_next") || path === "/favicon.svg") {
    return NextResponse.next();
  }

  const expected = await accessToken();
  const actual = request.cookies.get(AUTH_COOKIE)?.value;
  if (expected && actual === expected) return NextResponse.next();

  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: expected ? "로그인이 필요합니다." : "접근 비밀번호 설정이 필요합니다." }, { status: expected ? 401 : 503 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
