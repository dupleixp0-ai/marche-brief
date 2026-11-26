// Copie data/snapshot.json, backtest.json et track-record.json dans public/data (servis par le site), minifiés.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
const out = new URL("../public/data/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of ["snapshot.json", "backtest.json", "track-record.json"]) {
  const src = new URL(`../../../data/${f}`, import.meta.url);
  if (existsSync(src)) writeFileSync(new URL(f, out), JSON.stringify(JSON.parse(readFileSync(src, "utf8"))));
}
