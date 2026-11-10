import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Original vector composition. No Pokémon character artwork is transformed. */
export function openGraphSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#102442"/><stop offset="1" stop-color="#244d8e"/></linearGradient><linearGradient id="card" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#edf3ff"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g opacity=".10" fill="none" stroke="#8faed9"><circle cx="1010" cy="270" r="270"/><circle cx="1010" cy="270" r="198"/><circle cx="1010" cy="270" r="125"/><path d="M0 540H1200M0 570H1200M0 600H1200"/></g>
  <rect x="64" y="61" width="166" height="30" rx="15" fill="#ffffff16"/><circle cx="83" cy="76" r="4" fill="#f5d75d"/>
  <text x="96" y="81" fill="#cad9ee" font-family="Arial,sans-serif" font-weight="700" font-size="12" letter-spacing="1.5">GLOBAL PLANNER</text>
  <text x="60" y="234" fill="#fff" font-family="Arial,sans-serif" font-weight="900" font-size="113" letter-spacing="-6">poke<tspan fill="#ffdb55">doko</tspan><tspan fill="#ee5a60">.</tspan></text>
  <text x="66" y="308" fill="#fff" font-family="Arial,Apple SD Gothic Neo,sans-serif" font-weight="700" font-size="34">포켓몬 GO 일정과 전 세계 레이드</text>
  <text x="67" y="357" fill="#b8cee9" font-family="Arial,Apple SD Gothic Neo,sans-serif" font-size="22">한국시간 · 도시별 현지 시각 · 체육관 좌표</text>
  <g font-family="Arial,Apple SD Gothic Neo,sans-serif" font-size="17" font-weight="700"><rect x="66" y="412" width="153" height="46" rx="8" fill="#ffffff12" stroke="#ffffff28"/><text x="88" y="442" fill="#d9e5f7">이벤트 캘린더</text><rect x="231" y="412" width="139" height="46" rx="8" fill="#ffffff12" stroke="#ffffff28"/><text x="252" y="442" fill="#d9e5f7">레이드 시간표</text><rect x="382" y="412" width="147" height="46" rx="8" fill="#f4d35b"/><text x="404" y="442" fill="#183357">실시간 레이드</text></g>
  <g transform="translate(806 138)"><rect x="0" y="0" width="292" height="312" rx="24" fill="#091a3266"/><rect x="-13" y="-13" width="292" height="312" rx="24" fill="url(#card)"/><path d="M-13 45h292" stroke="#dce5f2"/><circle cx="12" cy="17" r="5" fill="#e33d45"/><circle cx="30" cy="17" r="5" fill="#f1c945"/><circle cx="48" cy="17" r="5" fill="#72af91"/><text x="9" y="81" fill="#567293" font-family="Arial,sans-serif" font-size="13" font-weight="700">SEOUL / ASIA</text><text x="9" y="130" fill="#244d8e" font-family="Arial,sans-serif" font-size="44" font-weight="800">18:00</text><rect x="9" y="155" width="246" height="52" rx="10" fill="#e7effc"/><circle cx="32" cy="181" r="7" fill="#e33d45"/><text x="49" y="187" fill="#244d8e" font-family="Arial,Apple SD Gothic Neo,sans-serif" font-size="15" font-weight="700">도시별로 시간 비교</text><rect x="9" y="224" width="144" height="11" rx="5" fill="#cfdbec"/><rect x="9" y="247" width="204" height="9" rx="4" fill="#e0e7f2"/></g>
  <path d="M66 530h1068" stroke="#ffffff1f"/><text x="67" y="569" fill="#8eabd0" font-family="Arial,sans-serif" font-size="17">pokedoko.catuniv.workers.dev</text><text x="1132" y="569" text-anchor="end" fill="#8eabd0" font-family="Arial,sans-serif" font-size="12">UNOFFICIAL FAN PLANNER</text></svg>`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // sharp already ships in this project's locked dependency tree. No install or
  // network access is needed; this runs only when regenerating the committed PNG.
  const { default: sharp } = await import("sharp");
  const output = fileURLToPath(new URL("../public/og.png", import.meta.url));
  await writeFile(output, await sharp(Buffer.from(openGraphSvg())).png().toBuffer());
  console.log(`Generated ${output} (${OG_WIDTH}×${OG_HEIGHT}).`);
}
