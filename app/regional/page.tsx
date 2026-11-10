import type { Metadata } from "next";
import { PAGE_SEO, pageMetadata } from "@/lib/site-metadata";
import RegionalEvents from "@/components/pokedoko/RegionalEvents";

export const metadata: Metadata = pageMetadata(PAGE_SEO.regional);
export default function RegionalEventsPage() { return <RegionalEvents />; }
