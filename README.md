# Mon Budget — Nuxt 4

Suivi de comptes bancaires et budget prévisionnel : comptes courants et d'épargne
(avec wallets), catégories regroupées, budget mensuel, opérations jour par jour,
opérations récurrentes et synthèse prévu / réel.

Projet **Nuxt 4** (Vue 3, TypeScript) en mode SPA : tout tourne dans le navigateur,
les données sont stockées dans le `localStorage`, et peuvent être **synchronisées entre
plusieurs appareils, chiffrées de bout en bout**, via un petit serveur Node sans dépendance
(`sync-server/`) qui ne voit jamais les données en clair.

## Démarrer

Prérequis : Node.js 22.18 ou plus récent.

```bash
npm install
# terminal 1 : serveur de synchronisation (coffres chiffrés dans ./data)
npm run server
# terminal 2 : application (http://localhost:3000, /api est redirigé vers le serveur)
npm run dev
```

Autres commandes :

```bash
npm test           # logique métier, chiffrement, fusion, serveur (node --test, sans dépendance)
npm run test:e2e   # deux appareils simulés qui se synchronisent via le vrai serveur
npm run start      # production : génère l'application puis la sert avec l'API sur le port 3001
npm run generate   # application statique seule, dans .output/public
```

## Synchronisation chiffrée entre appareils

### Principe

```
 Appareil A                         Serveur Node                        Appareil B
 ──────────                         ────────────                        ──────────
 clé maîtresse (256 bits, locale)                                       même clé (QR code)
   │ HKDF                                                                  │ HKDF
   ├─ id du coffre ─────────────►  data/<id>.json  ◄────────────────────  ├─ id du coffre
   ├─ jeton d'accès ────────────►  empreinte SHA-256 du jeton  ◄───────── ├─ jeton d'accès
   └─ clé AES-GCM                  { rev, iv, ct } : chiffré illisible     └─ clé AES-GCM
      chiffre le budget ─────────►  (aucune clé, aucun contenu)  ────────►  déchiffre
```

1. **Activer** (menu « Synchronisation ») : le navigateur crée une clé maîtresse aléatoire et
   envoie le budget chiffré (AES-GCM 256).
2. **Ajouter un appareil** : scannez le QR code avec l'appareil photo du nouvel appareil.
   Il ouvre `https://…/lier#cle=…` ; la partie après `#` n'est **jamais envoyée au serveur**,
   et la page l'efface aussitôt de l'adresse. On peut aussi copier le lien ou la clé.
3. Ensuite chaque appareil se synchronise tout seul : peu après chaque modification, au retour
   sur l'onglet, au retour du réseau et toutes les 30 secondes.
4. **Modifications simultanées** : chaque version porte un numéro. Si deux appareils écrivent
   en même temps, le serveur refuse la seconde écriture (409), l'appareil récupère la version
   gagnante, **fusionne élément par élément** (comptes, opérations, budgets…) et renvoie.
   Si le même élément a été modifié des deux côtés, la version de l'appareil qui fusionne l'emporte.
   Rien n'est perdu sinon. Hors ligne, les modifications partent au retour du réseau.

### Ce que voit le serveur

Un identifiant de coffre, l'empreinte du jeton d'accès, un numéro de version, une date, et
le chiffré. Ni la clé, ni le contenu, ni le nombre d'opérations. Sans le bon jeton, il répond
404 (même réponse qu'un coffre inexistant) et refuse toute écriture.

### Limites à connaître

- **HTTPS obligatoire** : le chiffrement du navigateur (`crypto.subtle`) n'existe qu'en HTTPS
  ou sur `http://localhost`. En `http://192.168.x.x`, la synchronisation est désactivée
  (le reste de l'app fonctionne).
- **Le QR code donne un accès complet** au budget : ne le montrez qu'à vos propres appareils.
- **Clé perdue = données du serveur perdues** (personne ne peut les déchiffrer). Les données
  restent sur chaque appareil lié ; gardez aussi des exports .json.
- **Retirer un appareil perdu** : sur un appareil de confiance, « Supprimer du serveur », puis
  réactiver la synchronisation (nouvelle clé) et relier les autres appareils.
- Comme toute application web chiffrée de bout en bout, la sécurité repose sur le code servi
  au navigateur : hébergez l'application vous-même (le serveur Node la sert) sur une machine
  de confiance.

### Mise en production (HTTPS)

```bash
npm install
npm run start            # génère l'application et lance le serveur (port 3001)
```

Derrière un reverse proxy HTTPS, par exemple **Caddy** (certificat automatique) :

```
budget.exemple.fr {
    reverse_proxy 127.0.0.1:3001
}
```

et lancez le serveur avec `TRUST_PROXY=1` (limitation de débit par IP réelle). Ou bien
directement en HTTPS : `TLS_CERT=cert.pem TLS_KEY=key.pem PORT=443 npm run server`.

Variables du serveur : `PORT` (3001), `HOST` (0.0.0.0), `DATA_DIR` (./data),
`STATIC_DIR` (./.output/public), `MAX_BODY_MB` (5), `RATE_LIMIT` (240/min/IP),
`TRUST_PROXY`, `ALLOWED_ORIGINS` (si l'application est servie depuis une autre adresse ;
dans ce cas indiquez l'adresse du serveur via `NUXT_PUBLIC_SYNC_URL` au moment du build).

Sauvegarde du serveur : copiez le dossier `data/` (fichiers chiffrés, inutilisables sans les clés).

**Tester sur le réseau local en développement** : `npm run server` puis
`npm run dev -- --https` (certificat auto-signé à accepter sur le téléphone), et ouvrez
`https://<IP-de-la-machine>:3000`.

## Organisation

```
app/
  app.vue                       racine (layout + page)
  layouts/default.vue           barre latérale, en-tête (titre, mois, + Opération), onglets mobiles
  pages/
    index.vue                   Synthèse prévu / réel
    operations/index.vue        Opérations du mois, groupées par jour, filtres compte / wallet
    operations/recurrences.vue  Séries récurrentes
    budget.vue                  Budget prévisionnel du mois
    comptes.vue                 Comptes courants et d'épargne, wallets
    categories.vue              Groupes et catégories
  components/                   éléments d'affichage (barres, lignes, cartes…)
  components/dialogs/           fenêtres : opération, compte, groupe, catégorie, sauvegarde
  composables/
    useBudget.ts                état partagé + accès aux calculs
    useUi.ts                    mois et filtres portés par l'URL
    useDialogs.ts               fenêtres portées par l'URL (?dialog=…)
    useChoice.ts                confirmations
    useToast.ts                 messages
    useSync.ts                  synchronisation chiffrée (récupérer, fusionner, envoyer)
  plugins/01.storage.client.ts  chargement / enregistrement localStorage, données d'exemple
  plugins/02.sync.client.ts     démarrage de la synchronisation
  pages/lier.vue                page ouverte par le QR code
  components/dialogs/SyncDialog.vue  activation, QR code, état, déconnexion
  utils/budget-core.ts          toute la logique métier (types, soldes, budget, récurrences)
  utils/sync-crypto.ts          clé maîtresse, HKDF, AES-GCM (WebCrypto)
  utils/merge.ts                fusion à trois voies de deux versions du budget
sync-server/server.mjs          serveur Node sans dépendance : coffres chiffrés + application
  assets/css/main.css           styles (thème clair / sombre)
tests/                         tests (logique, chiffrement, fusion, serveur, deux appareils)
```

## Navigation et bouton retour

- Chaque vue a sa route (`/`, `/operations`, `/budget`, `/comptes`, `/categories`).
- Le mois affiché et les filtres sont dans l'URL : `/operations?mois=2026-10&compte=…&wallet=…`.
- Les fenêtres d'édition aussi (`?dialog=txn:ID`) : le bouton retour du navigateur ferme la
  fenêtre ouverte, puis revient à la vue précédente.

## Données

- Stockées dans le navigateur (clé `mon-budget-data-v1`). Le premier lancement affiche des
  données d'exemple, effaçables depuis le bandeau.
- « Sauvegarde & données » : export / import d'un fichier `.json`, **compatible avec la version
  HTML** (exportez depuis l'une, importez dans l'autre).

## Où modifier quoi

- Une règle de calcul (solde, réel, échéances) : `app/utils/budget-core.ts`, puis `npm test`.
- Un écran : le fichier correspondant dans `app/pages/`.
- Le formulaire d'opération (récurrence, wallets) : `app/components/dialogs/TxnEditor.vue`.
