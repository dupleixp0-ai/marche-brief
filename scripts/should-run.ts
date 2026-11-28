// Garde-fou du job quotidien : GitHub Actions travaille en UTC.
// Deux cron (07:15 et 08:15 UTC = 9h15 à Berlin en été / en hiver, après l'ouverture de Xetra à 9h00) ;
// on ne lance la collecte que s'il est entre 9h et 11h à Berlin (tolère les retards de GitHub),
// du lundi au vendredi, et qu'aucun snapshot n'a déjà été produit depuis 9h ce jour-là.
// FORCE=true (lancement manuel) contourne le garde-fou.
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { localDate, localHour } from "@marche-brief/core";

/** Heure de Berlin à partir de laquelle la collecte du jour est lancée (cron à 9h15). */
const START_HOUR = 9;
const now = new Date();
const hour = localHour(now, "Europe/Berlin");
const today = localDate(now, "Europe/Berlin");
const file = new URL("../data/snapshot.json", import.meta.url);
let doneToday = false;
if (existsSync(file)) {
  const g = new Date(JSON.parse(readFileSync(file, "utf8")).generatedAt);
  doneToday = localDate(g, "Europe/Berlin") === today && localHour(g, "Europe/Berlin") >= START_HOUR;
}
const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = dimanche, 6 = samedi
const workday = weekday >= 1 && weekday <= 5;
const force = process.env.FORCE === "true";
const run = force || (workday && hour >= START_HOUR && hour < START_HOUR + 2 && !doneToday);
console.log(`Berlin ${today} ${hour}h · jour ouvrable : ${workday} · déjà fait ce matin : ${doneToday} · forcé : ${force} → ${run ? "lancement" : "ignoré"}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
