import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "pokedoko — 포켓몬 GO 글로벌 플래너",
  description:
    "한국시간으로 보는 포켓몬 GO 전 세계 레이드 일정, 체육관 부화 타이머, 이벤트 캘린더와 등장 포켓몬.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
