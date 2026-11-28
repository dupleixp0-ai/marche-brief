# Marché-Brief — Dashboard boursier quotidien

> Fichier de référence pour Claude Code. À lire en entier avant de coder.
> Langue du projet : français (code et identifiants en anglais, commentaires et UI en français).

## 1. Objectif

Un dashboard web, consultable sur téléphone, qui rassemble chaque jour :

- l'état du marché : VIX (volatilité), indice Fear & Greed, S&P 500 et ses moyennes mobiles ;
- les cours d'actions du S&P 500 et des ETF suivis, avec graphiques ;
- un résumé de l'actualité financière du jour ;
- une recommandation **Acheter / Attendre / Vendre** par valeur, **toujours accompagnée des raisons** ;
- une rubrique **Découvertes** : actions et ETF prometteurs du jour, avec explication.

Deux modes de mise à jour :

1. **Automatique** : du lundi au vendredi à 9h15 (heure de Berlin/Paris, heure d'été comprise), juste après l'ouverture de Xetra (9h00).
2. **Manuel** : un bouton « Actualiser » qui relance la collecte et les calculs à n'importe quel moment.

Un e-mail récapitulatif est envoyé chaque jour ouvrable à 9h15 avec le contenu essentiel du dashboard.

## 2. Principe directeur : un signal transparent, pas une prédiction

Personne ne prédit le marché de façon fiable. L'application produit donc un **score explicable** à partir de règles claires, et elle **prouve ou réfute sa valeur** par un backtest (test sur les données passées).

- Chaque recommandation affiche son score (0–100), son niveau de confiance et les 3 à 5 raisons principales.
- Un backtest compare la stratégie « suivre le score » à un simple achat-conservation. Les résultats sont visibles dans le dashboard (page « Fiabilité »). Si le score ne fait pas mieux, l'application le dit clairement.
- Un court avertissement permanent en pied de page suffit. Pas de mise en garde répétée à chaque écran.

## 3. Architecture

GitHub Pages ne sert que des fichiers statiques : il ne peut pas lancer de calcul à la demande. L'architecture a donc trois parties.

```
┌──────────────────────────┐        ┌────────────────────────────┐
│ GitHub Actions (cron)    │        │ Cloudflare Worker (gratuit) │
│ lun.–ven. à 9h15         │        │ API « Actualiser »          │
│ - collecte les données   │        │ - collecte à la demande     │
│ - calcule les scores     │        │ - calcule les scores        │
│ - résumé Claude          │        │ - cache 5 min               │
│ - écrit data/snapshot.json│       │ - clés API cachées ici      │
│ - envoie l'e-mail        │        └──────────────▲─────────────┘
│ - redéploie Pages        │                       │ fetch (bouton)
└────────────┬─────────────┘                       │
             │ snapshot.json                       │
             ▼                                     │
┌───────────────────────────────────────────────────┴──┐
│ GitHub Pages : dashboard Next.js (export statique)    │
│ - affiche snapshot.json au chargement (rapide, hors ligne)│
│ - bouton « Actualiser » → appelle le Worker           │
└───────────────────────────────────────────────────────┘
```

Pourquoi ce découpage :

- Le **snapshot du matin** garantit que le dashboard s'affiche toujours, même si une source de données est en panne.
- Le **Worker** permet l'actualisation à la demande **sans exposer de clé secrète** dans la page publique.
- La **logique de calcul** (score, indicateurs) est écrite **une seule fois** dans un package TypeScript partagé (`packages/core`), utilisé par l'Action et par le Worker. Les deux donnent ainsi les mêmes résultats.

### Stack

| Élément | Choix |
|---|---|
| Frontend | Next.js + TypeScript, export statique (`output: 'export'`), Tailwind CSS |
| Graphiques | `lightweight-charts` (cours) et Recharts (jauges, barres) |
| Calcul partagé | Package TypeScript `packages/core` (indicateurs, scoring, backtest) |
| API à la demande | Cloudflare Worker (offre gratuite) |
| Tâche quotidienne | GitHub Actions (cron) |
| Résumés et explications | API Claude, appelée côté Action/Worker uniquement |
| E-mail | Resend (ou SMTP Gmail avec mot de passe d'application) |
| Développement local | Docker ou Podman, VS Code |
| Tests | Vitest pour `packages/core`, avec jeux de données figés |

## 4. Sources de données

Aucune source n'est une API officielle garantie. Chaque source est donc isolée derrière un **adaptateur** avec une source de secours.

| Donnée | Source principale | Secours |
|---|---|---|
| Cours actions/ETF, VIX (`^VIX`), S&P 500 (`^GSPC`) | Yahoo Finance (endpoint non officiel) | Stooq, Finnhub (clé gratuite), FRED pour le VIX |
| Fear & Greed | Endpoint de données de CNN (non officiel, à vérifier : nécessite un en-tête `User-Agent`) | Calcul d'un indice maison simplifié (VIX, momentum, amplitude du marché) |
| Actualités | Flux RSS officiels (Fed, BCE) et API Finnhub / NewsAPI | Autres flux RSS publics |
| Calendrier économique | Sources officielles (Fed, BCE, BLS) ou API de calendrier | Saisie manuelle dans `config/events.json` |

Règles :

- **Pas de scraping** de Reuters, Bloomberg, FT, WSJ (bloqué et risqué juridiquement). On utilise des flux et API autorisés, et on affiche titre + lien, pas l'article copié.
- Chaque adaptateur renvoie `{ data, source, fetchedAt, status }`. Le dashboard affiche l'âge de chaque donnée et un voyant si elle est périmée ou en erreur.
- Si une source échoue, on utilise la source de secours, puis la dernière valeur connue marquée « périmée ». L'application ne plante jamais.

## 5. Valeurs suivies (`config/watchlist.json`)

La liste est dans un fichier de configuration, pas en dur dans le code.

**Actions du S&P 500 :**
- Semi-conducteurs : NVDA, AVGO, AMD, MU
- Tech : MSFT, GOOGL, AMZN, META
- Cybersécurité : PANW, CRWD
- Data centers : EQIX, DLR

**ETF standards (suivis chaque jour) :**
- MSCI World (proxy URTH)
- Semi-conducteurs VanEck (proxy SMH)
- Semi-conducteurs Nasdaq (proxy SOXX)
- Cybersécurité (proxy CIBR)
- Data centers (proxy SRVR)
- Or (proxy GLD)
- S&P 500 (proxy SPY, référence de comparaison)

Les ETF réellement détenus sont des versions UCITS cotées en euros (Trade Republic). Les proxys américains sont utilisés au départ car mieux couverts par les sources gratuites. Prévoir dans la config un champ `tickerEUR` par ETF (à vérifier, par exemple un symbole Xetra) pour afficher à terme la version en euros.

## 6. Moteur de score

Score de 0 à 100 par valeur, somme pondérée de facteurs, tous visibles dans le détail :

| Facteur | Exemples de calcul | Poids de départ |
|---|---|---|
| Tendance | Prix vs moyennes mobiles 50 / 125 / 200 jours, pente de la MM50 | 30 % |
| Momentum | Rendement 1 / 3 / 6 mois, RSI (14) | 25 % |
| Force relative | Performance vs S&P 500 sur 3 mois | 15 % |
| Risque | Volatilité récente, drawdown (baisse depuis le plus haut), VIX | 15 % |
| Actualité | Sentiment des dernières actualités (analysé par Claude, borné) | 10 % |
| Contexte de marché | Fear & Greed, tendance du S&P 500 | 5 % |

Les poids sont des valeurs de départ. Le backtest sert à les ajuster, sans sur-optimiser (risque de « surapprentissage » : une stratégie qui ne marche que sur le passé).

Décision :
- Score ≥ 65 → **Acheter**
- Score entre 40 et 65 → **Attendre**
- Score < 40 → **Vendre**

Garde-fous :
- **Hystérésis** : pour passer d'un état à l'autre, le score doit dépasser le seuil de quelques points (évite les allers-retours quotidiens).
- Le facteur « actualité » ne peut jamais, seul, faire changer la décision.
- Pour les ETF de long terme, l'interface rappelle que « Vendre » signifie « tendance dégradée », et propose aussi la lecture « Réduire / Renforcer ».
- Chaque recommandation est **horodatée et archivée** (`data/history/`) pour mesurer plus tard le vrai taux de réussite.

## 7. Rubrique « Découvertes »

Mise à jour chaque jour, avec une section **actions** (5 meilleures) et une section **ETF** (5 meilleurs).

**Les découvertes ne sont pas limitées au S&P 500.** Elles couvrent des actions et ETF du **monde entier** : Amérique du Nord et du Sud, Europe, Asie, Moyen-Orient, Afrique, Océanie.

- Univers (`config/universe.json`) : organisé **par région et par place boursière**, par exemple :
  - Amérique : S&P 500, Nasdaq 100, TSX (Canada), Bovespa (Brésil)
  - Europe : STOXX Europe 600 (dont DAX, CAC 40, AEX, FTSE 100, SMI)
  - Asie-Pacifique : Nikkei 225 (Japon), Hang Seng (Hong Kong), KOSPI (Corée du Sud), Nifty 50 (Inde), ASX 200 (Australie), actions de Taïwan (par exemple TSMC) et de Chine
  - Autres : Arabie saoudite, Afrique du Sud, etc. (ajoutés plus tard si les données gratuites sont fiables)
  - ETF thématiques et régionaux, y compris les ETF de marchés émergents.
- **Taille raisonnable de l'univers** : on ne scanne pas des dizaines de milliers de titres. On part des grands indices ci-dessus (quelques milliers de valeurs au maximum), filtrés par liquidité (volume d'échange minimum) pour éviter les titres illiquides ou manipulables. L'univers peut grandir par étapes.
- **Comparaison équitable entre régions** : la force relative est calculée par rapport à l'indice de la **région de la valeur** (par exemple Nikkei pour une action japonaise), puis aussi par rapport à un indice mondial.
- **Devises** : chaque carte affiche la devise de cotation et la performance **convertie en euros**, car le risque de change change le résultat réel pour un investisseur en euros.
- **Disponibilité sur ton courtier** : chaque carte indique si la valeur est cotée sur une place accessible (par exemple via Trade Republic). Option « n'afficher que les valeurs achetables » activable dans l'interface.
- **Fuseaux horaires** : l'état d'ouverture et la date du dernier cours sont indiqués par place boursière. Un titre japonais est clôturé bien avant 6h00 à Berlin, alors qu'un titre américain affiche la clôture de la veille.
- **Qualité des données** : pour les marchés moins couverts, les données gratuites sont plus fragiles. Une valeur dont les données sont incomplètes ou périmées est **exclue des découvertes** plutôt que classée sur des chiffres douteux.
- **Diversité du classement** : limiter le nombre de valeurs d'un même pays et d'un même secteur dans le top 5, pour que la liste ne soit pas dominée par un seul thème.
- Sélection : classement par score, filtré par des critères simples (force relative élevée, cassure d'un niveau avec hausse du volume, volatilité acceptable, catalyseur dans l'actualité).
- Chaque carte affiche : le pays et la place boursière, le score, un mini-graphique, **« Pourquoi cette valeur est prometteuse »** (rédigé par Claude à partir des chiffres) et **« Risques à connaître »**, y compris les risques propres au pays ou à la devise.
- Un filtre par région et par type (action / ETF) permet de parcourir les découvertes.
- Un bouton permet d'ajouter une découverte à la liste suivie.

## 8. Dashboard (mobile d'abord)

Écran d'accueil, de haut en bas :

1. **Bandeau d'état** : date et heure de la dernière mise à jour, état des sources, bouton **Actualiser**.
2. **Marché** : jauge Fear & Greed, courbe du VIX avec sa moyenne 50 jours, S&P 500 avec sa moyenne 125 jours, et une phrase d'explication.
3. **Brief du jour** : 5 à 8 puces de résumé de l'actualité, avec liens vers les sources, et les événements à venir (Fed, BCE, inflation, emploi).
4. **Mes ETF** : cartes avec cours, variation, mini-graphique, badge Acheter / Attendre / Vendre.
5. **Actions suivies** : même format, triables par score.
6. **Découvertes** : voir section 7.
7. **Fiabilité** : résultats du backtest et historique des recommandations passées.

Détail d'une valeur (tap sur une carte) : graphique complet (1M / 3M / 1A) avec moyennes mobiles, score décomposé par facteur, raisons, actualités liées.

Le bouton **Actualiser** :
- appelle le Worker, affiche un indicateur de chargement par section (squelettes) ;
- met à jour VIX, Fear & Greed, cours, scores et recommandations ;
- ne régénère le résumé de Claude que si de nouvelles actualités sont arrivées (économie de coût) ;
- affiche l'heure de la mise à jour et conserve l'ancien contenu en cas d'erreur.

## 9. Améliorations d'expérience utilisateur et techniques à intégrer

**UX**
- **PWA** (Progressive Web App) : installable sur l'écran d'accueil du téléphone, avec le dernier snapshot disponible hors ligne.
- **Mode sombre** automatique, interface à pouce unique, textes lisibles.
- **Infobulles pédagogiques** sur chaque indicateur (c'est quoi le VIX, le RSI, une moyenne mobile).
- **Indicateur d'ouverture des marchés** (heure de Paris : Europe, New York) pour savoir si les cours sont en direct ou de la veille.
- **Alertes** par e-mail quand une recommandation change (Attendre → Acheter, etc.) ou que le VIX dépasse un seuil.
- **Calendrier du jour** : annonces qui peuvent faire bouger le marché.
- **Affichage en euros** pour les ETF, avec note si le cours converti est approximatif.
- **Pull-to-refresh** (tirer pour actualiser) en plus du bouton.
- Interface multilingue (français d'abord, puis anglais et allemand) via un fichier de traductions dès le départ.

**Technique**
- **Cache** de 5 minutes sur le Worker : plusieurs « Actualiser » rapprochés ne multiplient pas les appels.
- **Protection du Worker** : la page GitHub Pages est publique, donc l'API doit l'être aussi. Prévoir un code d'accès personnel (saisi une fois, mémorisé sur le téléphone), une limite de requêtes par minute et une restriction d'origine (CORS) à ton domaine GitHub Pages. Sans cela, n'importe qui pourrait consommer le crédit de l'API Claude.
- **Confidentialité** : ne jamais mettre dans le dépôt public tes positions, montants ou adresse e-mail. Seuls les symboles suivis y figurent. Secrets uniquement dans GitHub Secrets et variables du Worker.
- **Heure de 9h15** : GitHub Actions travaille en UTC. Deux cron (07:15 et 08:15 UTC, du lundi au vendredi) et un garde-fou qui ne s'exécute que s'il est entre 9h et 11h à Berlin (gère l'heure d'été/hiver et les retards).
- **Retards GitHub** : les tâches planifiées peuvent démarrer avec quelques minutes de retard, c'est normal. L'e-mail indique l'heure réelle de la collecte.
- **Jours fériés et week-ends** : le job détecte que le marché est fermé et le dit (« cours du vendredi »).
- **Quotas** : surveiller les limites gratuites (Finnhub, Resend, Cloudflare, Claude) et afficher un message clair si une limite est atteinte.
- **Tests automatiques** sur les calculs (RSI, moyennes mobiles, score) avec des données figées, exécutés à chaque modification.
- **Journal d'erreurs** simple dans `data/logs/` pour comprendre une panne de source.

## 10. Structure du dépôt

```
marche-brief/
├─ CLAUDE.md                  # ce fichier
├─ config/
│  ├─ watchlist.json          # actions + ETF suivis
│  ├─ universe.json           # univers mondial des découvertes (par région et place boursière)
│  └─ events.json             # événements saisis à la main (secours)
├─ packages/
│  └─ core/                   # indicateurs, scoring, backtest (TypeScript pur, testé)
├─ apps/
│  ├─ web/                    # dashboard Next.js (export statique → GitHub Pages)
│  └─ worker/                 # Cloudflare Worker (API « Actualiser »)
├─ scripts/
│  └─ daily.ts                # collecte + scores + résumé + e-mail + snapshot
├─ data/
│  ├─ snapshot.json           # dernier état complet
│  └─ history/                # recommandations archivées par jour
├─ docker/                    # Dockerfile et compose pour le développement local
└─ .github/workflows/
   ├─ daily.yml               # cron 9h15 Europe/Berlin (lun.–ven.)
   └─ deploy.yml              # build + déploiement GitHub Pages
```

## 11. Plan de travail (une étape à la fois)

Méthode : petites étapes. À la fin de chaque étape, Claude Code explique comment compiler et tester, puis **attend la validation de Dupleix avant de passer à la suivante**.

0. **Fondations** : dépôt, Next.js, Docker, déploiement d'une page de test sur GitHub Pages.
1. **Données** : adaptateurs (cours, VIX, Fear & Greed) avec secours et tests ; affichage brut.
2. **Moteur de score + backtest** : package `core` testé ; premiers résultats de fiabilité. **Étape décisive** : on regarde les chiffres avant de continuer.
3. **Dashboard** : interface mobile complète à partir d'un snapshot de test.
4. **Job quotidien** : GitHub Actions, snapshot automatique à 9h15, redéploiement.
5. **Actualisation à la demande** : Cloudflare Worker, bouton, cache, code d'accès.
6. **Actualités + résumés Claude** : brief du jour, sentiment, explications.
7. **Découvertes** : sélection quotidienne d'actions et d'ETF du monde entier avec explications. Commencer par les États-Unis et l'Europe, puis ajouter l'Asie-Pacifique, puis les autres régions une fois les données vérifiées.
8. **E-mail de 9h15** : contenu essentiel et alertes de changement de recommandation.
9. **Finitions** : PWA, mode sombre, infobulles, traductions, suivi du taux de réussite réel.

## 12. Règles pour Claude Code

- Commence par l'étape 0 et ne passe à l'étape suivante qu'après validation explicite.
- Explique chaque commande de test en une ligne. Dupleix compile et teste lui-même.
- Aucune clé API dans le code ni dans le dépôt : variables d'environnement et secrets uniquement.
- Toute règle de calcul est écrite dans `packages/core`, avec ses tests, jamais dans l'interface.
- Chaque source de données a un adaptateur, une source de secours et un état d'erreur visible.
- Le dashboard n'affiche jamais une donnée sans sa date de mise à jour.
- L'application ne passe aucun ordre d'achat ou de vente : elle informe uniquement.
