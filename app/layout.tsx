import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "연월차 관리 대장 | BRANDYACTION ERP",
  description: "직원별 연월차 발생, 사용, 잔여 현황을 한눈에 관리합니다.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
