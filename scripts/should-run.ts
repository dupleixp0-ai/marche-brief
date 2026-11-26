// Garde-fou du job quotidien : GitHub Actions travaille en UTC.
// Deux cron (04:00 et 05:00 UTC) ; on ne lance la collecte que s'il est entre 6h et 8h à Berlin
// (tolère les retards de GitHub) et qu'aucun snapshot n'a déjà été produit ce matin.
// FORCE=true (lancement manuel) contourne le garde-fou.
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { localDate, localHour } from "@marche-brief/core";

const now = new Date();
const hour = localHour(now, "Europe/Berlin");
const today = localDate(now, "Europe/Berlin");
const file = new URL("../data/snapshot.json", import.meta.url);
let doneToday = false;
if (existsSync(file)) {
  const g = new Date(JSON.parse(readFileSync(file, "utf8")).generatedAt);
  doneToday = localDate(g, "Europe/Berlin") === today && localHour(g, "Europe/Berlin") >= 6;
}
const force = process.env.FORCE === "true";
const run = force || (hour >= 6 && hour < 8 && !doneToday);
console.log(`Berlin ${today} ${hour}h · déjà fait ce matin : ${doneToday} · forcé : ${force} → ${run ? "lancement" : "ignoré"}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
