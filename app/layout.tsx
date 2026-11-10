import type { Metadata } from "next";
import { PAGE_SEO, pageMetadata } from "@/lib/site-metadata";
import GrowthTools from "@/components/pokedoko/GrowthTools";
import "./globals.css";

export const metadata: Metadata = {
  ...pageMetadata(PAGE_SEO.home),
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
      <body className="antialiased">{children}<GrowthTools /></body>
    </html>
  );
}
