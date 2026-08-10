"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "로그인하지 못했습니다.");
      window.location.href = "/";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand"><span>B</span> BRANDYACTION ERP</div>
        <p className="login-kicker">INTERNAL MANAGEMENT</p>
        <h1>연월차 관리 대장</h1>
        <p className="login-copy">직원 정보를 안전하게 관리하기 위해 접근 비밀번호를 입력해주세요.</p>
        <form onSubmit={submit}>
          <label htmlFor="password">접근 비밀번호</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호 입력" />
          {error && <p className="login-error">{error}</p>}
          <button disabled={loading}>{loading ? "확인 중…" : "대장 열기"}</button>
        </form>
        <small>BRANDYACTION · Authorized personnel only</small>
      </section>
    </main>
  );
}
