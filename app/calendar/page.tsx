import Pokedoko from "../pokedoko-client";
import { PAGE_SEO, pageMetadata } from "@/lib/site-metadata";

export const metadata = pageMetadata(PAGE_SEO.calendar);

export default function Page() {
  return <Pokedoko initialView="calendar" />;
}
