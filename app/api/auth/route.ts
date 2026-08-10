import { NextResponse } from "next/server";
import { accessToken, AUTH_COOKIE, passwordMatches } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  const token = await accessToken();
  if (!token) return NextResponse.json({ error: "관리자에게 접근 비밀번호 설정을 요청해주세요." }, { status: 503 });
  if (!(await passwordMatches(body.password ?? ""))) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
