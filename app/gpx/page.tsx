import type { Metadata } from "next";
import { PAGE_SEO, pageMetadata } from "@/lib/site-metadata";
import HuntingRoutesPage from "@/components/pokedoko/HuntingRoutesPage";

export const metadata: Metadata = pageMetadata(PAGE_SEO.gpx);
export default function GpxPage() { return <HuntingRoutesPage />; }
