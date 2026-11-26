// Copie data/snapshot.json et data/backtest.json dans public/data (servis par le site).
import { cpSync, mkdirSync, existsSync } from "node:fs";
const out = new URL("../public/data/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of ["snapshot.json", "backtest.json", "track-record.json"]) {
  const src = new URL(`../../../data/${f}`, import.meta.url);
  if (existsSync(src)) cpSync(src, new URL(f, out));
}
