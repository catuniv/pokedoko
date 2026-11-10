import type { Metadata } from "next";
import { PAGE_SEO, pageMetadata } from "@/lib/site-metadata";
import TradeBoard from "@/components/pokedoko/TradeBoard";

export const metadata: Metadata = pageMetadata(PAGE_SEO.trades);
export default function TradesPage() { return <TradeBoard />; }
