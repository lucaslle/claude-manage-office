# claude-manage-office

[![CI](https://github.com/lucaslle/claude-manage-office/actions/workflows/ci.yml/badge.svg)](https://github.com/lucaslle/claude-manage-office/actions/workflows/ci.yml)

Un tableau de bord en 3D pour savoir, d'un coup d'œil, quelles conversations Claude Code attendent une réponse et quelles merge requests GitLab sont à relire ou à merger.

L'entreprise est un petit immeuble vu du dessus. Chaque pièce correspond à un état, et chaque conversation ou merge request est un personnage qui marche d'une pièce à l'autre quand son état change.

## Les pièces

| Pièce | Ce qui s'y trouve |
| --- | --- |
| Accueil | Une session Claude attend votre réponse (question en fin de message ou demande de permission). Le personnage fait signe, avec une bulle « ! » |
| Open space | Claude travaille |
| Salle des bugs | Claude travaille sur un correctif : même chose que l'open space, mais pour les discussions qui corrigent un bug (voir ci-dessous). Elle occupe la place de l'ancienne salle des brouillons, devant l'atelier. Il n'y a plus de salle des brouillons ni d'attente |
| Relecture | MR ouverte, en attente de relecture ou d'approbation, MR marquée Draft ou qui dépend d'une autre MR encore ouverte (la raison est indiquée sur sa fiche), et conversation où vous faites une review (voir ci-dessous) |
| Merge | MR mergeable, sans blocage |
| Atelier | Pipeline en échec, conflit ou rebase nécessaire |
| Pause | Session terminée depuis moins de 2 h, sans question ni MR ouverte : salle à part, sur parquet, avec neuf canapés (9 places, une par canapé, les plus récentes d'abord ; voir `EDDY_REST_MINUTES`), des petites tables et un bar à café au fond. Elle est devant la salle de merge, à droite |
| Archives | Session terminée depuis plus longtemps, ou qui n'a plus de place en Pause |
| Salle de réunion | Une session a lancé plusieurs agents : elle s'y installe avec eux |

Une discussion est un fix de bug quand son titre ou le nom de sa branche parle de bug, fix, hotfix, correctif, « corriger », erreur, crash, régression, anomalie ou plantage (sans tenir compte des accents ni de la casse ; `fix/login` et `bugfix_PRJ-12` comptent). Tant que Claude travaille dessus, elle va dans la salle des bugs au lieu de l'open space, avec son agent s'il n'en a qu'un. Les autres règles restent prioritaires : une question va à l'accueil, plusieurs agents en salle de réunion, une MR liée dans la pièce de la MR, une discussion terminée en Pause puis aux archives.

Quand une session lance des agents, chacun apparaît comme un petit robot. À partir de deux agents actifs, la session et ses agents se retrouvent en salle de réunion ; avec un seul agent, ils restent à l'open space. Tant qu'un agent travaille, la session ne retourne jamais aux archives, même si son tour de parole est terminé. Elle ne rejoint les archives (ou sa MR) qu'une fois tous ses agents terminés. Si elle attend une réponse de votre part, elle va à l'accueil, et ses agents restent en réunion.

Les robots sont des conversations Claude. Les silhouettes bleutées translucides sont des merge requests sans conversation liée. Une session est reliée à sa MR par le nom de branche. Une MR mergée sort par le portique de la salle de merge. Une conversation que vous videz avec `/clear` trépigne un instant, puis quitte les bureaux par la porte d'entrée de l'accueil, en la claquant. Une conversation que vous compactez avec `/compact` (ou que Claude Code compacte tout seul quand le contexte est plein) se fait tasser sur place le temps du résumé, puis reprend sa forme dans un petit nuage de poussière.

Quand une session attend une réponse, elle reste à l'accueil même si sa MR est prête : c'est vous qui bloquez.

Une conversation où vous demandez une review va en Relecture, avec ses agents, et y reste jusqu'à votre prochain message qui n'en est pas une (sauf si elle vous pose une question : elle passe alors à l'accueil). Le hook la détecte à votre message : une commande `/review`, `/code-review`, `/security-review` (avec ou sans préfixe de plugin), ou un message qui commence par une demande de review (« Relis la MR !12 », « Fais une review de cette branche », « review this merge request »). Un message qui parle seulement de review plus loin dans la phrase n'est pas pris en compte.

## Fonctionnement

```
Claude Code ──hooks──▶ ~/.claude/eddy-office/sessions/*.json ─┐
                                                              ├─▶ serveur local ──SSE──▶ scène 3D
GitLab (API, jeton personnel) ────────────────────────────────┘
```

- **Hooks** (`hooks/`) : à chaque message, fin de réponse, notification, lancement ou fin d'un agent, début ou fin de compactage du contexte, ou fin de session, un petit script écrit l'état de la session dans un fichier JSON, avec la liste de ses agents actifs. Il n'affiche rien et ne fait jamais échouer Claude Code.
- **Serveur** (`server/`) : il lit ces fichiers toutes les 2 secondes, interroge GitLab toutes les 60 secondes (MR créées par vous, assignées à vous ou dont vous êtes relecteur), calcule la pièce de chaque personnage et pousse les changements à la scène en direct. Il n'écoute que sur `127.0.0.1`.
- **Scène** (`src/`) : Three.js, modèles glTF, éclairage et post-traitement à qualité réglable (la qualité baisse toute seule si l'animation devient saccadée). Sans serveur, elle passe en mode démo avec des données d'exemple.

## Démarrage rapide

Prérequis : Node.js 22 ou plus.

```bash
npm install
npm run dev
```

Cela ouvre le **mode démo** sur http://localhost:5173 : des données d'exemple et une douzaine de changements d'état à déclencher ou à regarder défiler.

## Données en direct

1. Copiez `.env.example` en `.env` et renseignez `GITLAB_URL` et `GITLAB_TOKEN` (jeton personnel avec la portée `read_api`).
2. Installez les hooks dans les réglages Claude Code :
   ```bash
   npm run hooks:install
   ```
   L'installeur sauvegarde votre `settings.json`, conserve vos autres hooks et peut être annulé avec `npm run hooks:remove`. Les hooks s'appliquent aux sessions lancées après l'installation. Relancez la commande après une mise à jour qui ajoute des hooks (le compactage, par exemple) : les anciens sont remplacés.
3. Lancez le serveur :
   ```bash
   npm run live
   ```
   puis ouvrez http://localhost:5174.

Le fichier `.env` n'est jamais commité. Le jeton ne quitte pas votre machine.

### Score, niveaux et badges

La carte « Score » en haut de la colonne de droite transforme votre réactivité en jeu. Chaque changement d'état que le tableau de bord observe rapporte des points, et les personnages concernés le fêtent dans la scène (confettis, étiquette « +25 » qui s'envole, message en bas de la scène).

| Action observée | Points |
| --- | --- |
| Une conversation quitte l'accueil (vous avez répondu) | 10 |
| … en moins de cinq minutes : réponse éclair | 25 |
| Une MR sort de l'atelier (pipeline réparé, conflit résolu) | 20 |
| Une MR passe de la relecture à la salle de merge | 15 |
| Un brouillon devient prêt à relire (la MR n'est plus marquée Draft) | 5 |
| Une MR est mergée | 40 |
| Plus personne n'attend à l'accueil | 30 |

- **Enchaînement** : des actions à moins de trois minutes d'intervalle se multiplient (×1,25, ×1,5, … jusqu'à ×2).
- **Niveaux** : Stagiaire, Junior (100 XP), Confirmé (300), Senior (700), Lead (1 500), Architecte (3 000), Directeur (6 000), Légende (12 000).
- **Série** : nombre de jours consécutifs avec au moins une action. Elle tombe à zéro après un jour sans rien.
- **Badges** : premier merge, dix merges, cinq réponses éclair, cinq réparations, accueil vide, séries de cinq et vingt jours, cent points dans la journée, enchaînement de quatre actions.

Le score est calculé par le serveur et enregistré dans `~/.claude/eddy-office/score.json` : il survit aux redémarrages et ne dépend pas du navigateur. En mode démo, il est calculé dans la page à partir d'un exemple et repart de zéro à chaque réinitialisation. Le serveur ne compte qu'un changement d'état qu'il a vu : un merge fait pendant qu'il est arrêté ne rapporte rien.

### Modale d'une conversation

Un clic sur un robot ouvre une modale réduite à l'essentiel pour comprendre de quoi parle la conversation : son titre, l'action attendue, votre dernière demande, la dernière réponse de Claude (raccourcie, avec « Voir tout »), le pourcentage de contexte utilisé, et le moyen de la reprendre. Un clic sur une merge request ou sur un agent affiche ses informations et le lien GitLab.

- **Contexte** : calculé depuis le dernier échange du transcript (entrée, cache lu et cache créé). La fenêtre est de 1 M de tokens pour les modèles Claude 5 et de 200 k sinon, ou la valeur de `EDDY_CONTEXT_WINDOW`. Sur une session de l'app, l'écart avec l'indicateur de l'app est de quelques tokens.
- **Messages** : lus dans le transcript local de la session, sans rien envoyer.
- **Reprise** : la modale est en lecture seule, elle n'envoie rien à Claude. Pour une session lancée dans un terminal, elle affiche la commande `claude --resume <id>` à copier. Pour une session de l'app Claude, le bouton « Ouvrir dans l'app Claude » ouvre directement la conversation (lien `claude://code/continue?session=…`) : reprendre une telle session depuis un terminal créerait un conflit dans la conversation.
- **Lien vers l'app** : l'app range, pour chaque session, son propre identifiant à côté de celui des hooks (dossier `claude-code-sessions` de ses données). Le serveur lit uniquement cette correspondance, sous Windows comme depuis WSL (y compris pour l'app installée depuis le Microsoft Store, dont les données sont redirigées vers `Packages\Claude_*\LocalCache`). Si la correspondance est introuvable, la modale le dit au lieu d'afficher un bouton cassé. Le navigateur peut demander une confirmation la première fois qu'il ouvre `claude://`.
- **Sécurité** : le serveur n'écoute que sur `127.0.0.1`, n'accepte que des requêtes de lecture sur les sessions, refuse un en-tête `Host` qui n'est pas local, et ne lit que les transcripts situés dans un dossier `.claude/projects`.

### Toutes les discussions

L'onglet « Discussions » de la barre du haut (ou l'adresse `/#discussions`) liste toutes vos conversations Claude, pas seulement celles de la scène : celles de l'app Claude et celles des terminaux, sous Windows comme sous WSL. Le serveur les lit dans les transcripts (`~/.claude/projects`) et dans les données de l'app (titre, archivage, date). Rien n'est modifié.

- **Recherche** : un ou plusieurs mots, sans tenir compte des accents ni de la casse, dans le titre, le projet, la branche, la première demande et le dernier message.
- **Regroupement** : par projet (les dossiers de travail temporaires sont rattachés à leur projet, les conversations sans dossier sont à part), par date ou par état. Chaque groupe se replie.
- **Filtres** : toutes, à répondre, en cours, app, terminal, archivées, avec le nombre de discussions de chaque catégorie.
- **Épingles** : l'étoile d'une discussion la place en tête de la liste. Le choix est mémorisé dans le navigateur.
- **Actions** : un clic ouvre la modale (contexte utilisé, dernière demande, dernière réponse). Le bouton « Ouvrir dans l'app » rouvre la conversation dans l'app Claude ; pour une conversation de terminal, « Copier la commande » copie `claude --resume`.
- **Volume** : les 300 plus récentes sont chargées (`/api/library?limit=…` pour en demander plus, 2000 au maximum). La liste se met à jour toutes les 30 secondes.

### Limites d'usage et connecteurs

La colonne de droite affiche vos limites Claude (session de 5 heures, semaine tous modèles, et un détail par modèle quand il est connu) et l'état des connecteurs que vous choisissez avec le bouton « Choisir » (le choix est mémorisé dans le navigateur). Ces deux informations ne sont pas accessibles à un programme local : elles viennent de deux fichiers lus par le serveur dans `~/.claude/eddy-office` (`usage.json` et `connectors.json`).

- **Limites, en continu** : `npm run statusline:install` ajoute une ligne d'état Claude Code qui reçoit les limites après chaque message et les écrit dans `usage.json`. Elle n'écrase jamais une ligne d'état existante. Elle fonctionne dans les sessions Claude Code en terminal.
- **Limites et connecteurs, à la demande** : la commande `/eddy-snapshot` (dossier `.claude/commands`) demande à une session Claude de lire ses connecteurs et ses limites, puis de les écrire dans les deux fichiers. Les données affichent leur ancienneté, et passent en orange quand elles sont trop vieilles.
- **Limites et connecteurs, toutes les 10 minutes** : une tâche planifiée de l'app Claude (`eddy-refresh-usage-connecteurs`, section « Planifié » de la barre latérale) refait la même mise à jour toutes les 10 minutes. Elle ne tourne que lorsque l'app est ouverte. Chaque exécution est une petite session qui consomme un peu de votre usage ; son message commence par `[eddy-refresh]`, ce qui la fait masquer par le tableau de bord. Pour l'arrêter ou changer la fréquence, modifiez ou désactivez la tâche dans l'app. Elle contient le chemin du projet : si vous le déplacez, mettez-le à jour.

### Thèmes d'entreprise

Le bouton rond à côté de la lune, dans la barre du haut, change les couleurs de toute l'application : interface, murs, sols et éclairage de la scène 3D. Certains thèmes changent aussi l'univers de la scène (textures, mobilier, décor) : le bâtiment est alors reconstruit et les robots changent d'apparence sur place, sans bouger de pièce : équipiers dans Among Us, Steve dans Minecraft, minifigs dans Lego, robots cuisiniers avec toque dans Chef, robots chromés à néons dans Cyberpunk (les silhouettes de MR restent les mêmes). Le choix est mémorisé dans le navigateur.

| Thème | Style |
| --- | --- |
| Eddy (défaut) | Bleu, clair ou sombre |
| Noir et rouge | Toujours sombre, accent rouge, plinthe rouge |
| Marine et or | Toujours sombre, accent doré, cadres dorés |
| Terracotta | Orange chaud, clair ou sombre |
| Vert forêt | Vert, clair ou sombre |
| Xefi | Aux couleurs de l'entreprise (rouge #E10600, noir et blanc, relevées sur xefi.fr) : liserés rouges dans toutes les pièces, enseigne « XEFI » à l'accueil avec un logo en X qui tourne, signature « La proximité informatique » en salle de réunion, robots rouges au X blanc sur la poitrine. Clair ou sombre |
| Minecraft | Univers : tout est cube et texturé en pixels (planches, pierre, herbe, émeraude, netherrack), casiers en coffres, canapés en lits, plantes en pousses et cactus, torches, creepers et TNT dans la salle des bugs, moutons et portail du Nether dans la cour. Clair ou sombre |
| Among Us | Univers : vaisseau spatial, plaques de coque, bandes de danger, bouches d'aération, équipiers à la place des plantes, bouton d'urgence sur la table de réunion, étoiles et planète. Toujours sombre |
| Chef | Univers : cuisine de restaurant, carrelage blanc, damiers et carreaux de terre cuite, inox, frigos, piano de cuisson et four à pizza, citronniers et aromates, potager et parasol dans la cour. Clair ou sombre |
| Cyberpunk | Univers : tour de bureaux de nuit, murs sombres cernés de néon, sols quadrillés lumineux, hologramme sur la table de réunion, ville et fenêtres allumées derrière. Toujours sombre |
| Lego | Univers : plastique brillant, sols en plaques à tenons, murs en briques, arbres en briques empilées, minifigs et tas de briques. Clair ou sombre |

Les thèmes « toujours sombres » désactivent la lune, qui sert aux autres à basculer entre clair et sombre. Pour ajouter un thème de couleurs, ajoutez ses couleurs de scène dans `src/brands.js` et ses variables dans `src/style.css` (bloc `:root[data-brand="…"]`). Pour ajouter un univers, créez son fichier dans `src/styles/` (textures, matériaux, sols par pièce, mobilier à remplacer, décor), déclarez-le dans `src/styles/index.js` et donnez son identifiant au champ `style` du thème ; `src/styles/minecraft.js` sert d'exemple.

### Variables d'environnement

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `GITLAB_URL` | (vide) | Adresse de votre GitLab |
| `GITLAB_TOKEN` | (vide) | Jeton personnel, portée `read_api` |
| `GITLAB_POLL_SECONDS` | `60` | Fréquence d'interrogation de GitLab |
| `EDDY_PORT` | `5174` | Port du serveur local |
| `EDDY_SESSION_MAX_AGE_HOURS` | `36` | Les sessions plus anciennes sont masquées |
| `EDDY_AGENT_MAX_AGE_MINUTES` | `30` | Un agent sans nouvelle de fin au bout de ce délai est considéré comme terminé |
| `EDDY_REST_MINUTES` | `120` | Durée pendant laquelle une discussion terminée (sans question ni MR) fait une pause en zone Pause avant les archives ; `0` pour l'envoyer tout de suite aux archives |
| `EDDY_CONTEXT_WINDOW` | (auto) | Force la taille de la fenêtre de contexte, en tokens |
| `EDDY_SESSION_DIRS` | (vide) | Dossiers de sessions supplémentaires, séparés par `;` |
| `EDDY_DETECT_WSL` | `true` | Détecter automatiquement les sessions de l'autre système (Windows et WSL) |

### Windows et WSL

Les hooks écrivent dans le dossier personnel du système où tourne Claude Code. Installez-les dans chaque système que vous utilisez (`npm run hooks:install` depuis Windows, puis depuis WSL, avec Node installé dans WSL). Le serveur détecte l'autre système tout seul et lit les deux dossiers de sessions.

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev` | Mode démo (Vite seul) |
| `npm run live` | Serveur local, scène et données en direct |
| `npm start` | Construit la scène puis sert la version de production |
| `npm test` | Tests du serveur, des hooks, du moteur de score et des utilitaires de la scène |
| `npm run hooks:install` | Installe les hooks dans les réglages Claude Code |
| `npm run hooks:remove` | Retire les hooks (et la ligne d'état si elle a été installée) |
| `npm run statusline:install` | Ajoute la ligne d'état qui alimente les limites d'usage |

## Intégration continue

Deux workflows GitHub Actions, dans `.github/workflows/` :

- **CI** (`ci.yml`) : à chaque pull request et à chaque push sur `main`, les tests tournent sur Ubuntu et Windows avec Node 22 et 24, puis la scène est construite avec Vite et le dossier `dist` est conservé sept jours comme artefact. Un nouveau push sur la même branche annule l'exécution précédente.
- **Release** (`release.yml`) : un tag `v*` (par exemple `git tag v0.3.0 && git push --tags`) relance les tests, construit la scène et publie une release GitHub avec une archive zip prête à lancer (`dist`, `server`, `shared`, `hooks`, `package.json`, `README.md`, `.env.example`). Après `npm ci --omit=dev` dans l'archive, `node server/index.js --production` sert la version construite.

Il n'y a pas de déploiement automatique sur un site public : le modèle `Xbot.glb` n'est pas redistribuable (voir plus bas), et le tableau de bord lit vos sessions locales, il n'a de sens que sur votre machine.

## Limites

- Le titre affiché dans l'app Claude n'est pas accessible aux hooks : le titre vient du transcript, sinon du premier message de la session.
- L'état des connecteurs claude.ai n'est lisible que depuis une session Claude : il est actualisé à la demande, pas en continu.
- La détection « attend une réponse » est une heuristique : dernier message terminé par une question, ou demande de permission.
- Les dépendances entre MR ne sont reconnues que si la description les écrit (`Depends on repo!N`, `Merge before repo!N`, « Dépend de… », « À merger avant… »).
- Les trajets des personnages n'évitent pas les meubles.

## Modèles 3D et licences

- Les robots et leurs variantes d'univers sont construits en code à partir de primitives three.js (`src/robot-model.js` et `src/character-models.js`), sans fichier externe. Tous partagent le même squelette, donc les mêmes animations.
- `Xbot.glb` : mannequin Mixamo, soumis aux conditions d'Adobe. Il n'est pas redistribuable tel quel : gardez ce dépôt privé ou remplacez ce modèle.
- Mobilier et décor : construits en code (`src/props.js` et `src/styles/`), sans modèle externe. Les textures (sols, murs, pixels de Minecraft) sont dessinées à la volée (`src/textures.js`), sans fichier image.
