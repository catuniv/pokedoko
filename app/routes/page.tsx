import type { Metadata } from "next";
import { PAGE_SEO, pageMetadata } from "@/lib/site-metadata";
import CellRoutePlanner from "@/components/pokedoko/CellRoutePlanner";

export const metadata: Metadata = pageMetadata(PAGE_SEO.routes);
export default function RoutesPage() { return <CellRoutePlanner />; }
