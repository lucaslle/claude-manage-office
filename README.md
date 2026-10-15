# claude-manage-office

Un tableau de bord en 3D pour savoir, d'un coup d'œil, quelles conversations Claude Code attendent une réponse et quelles merge requests GitLab sont à relire ou à merger.

L'entreprise est un petit immeuble vu du dessus. Chaque pièce correspond à un état, et chaque conversation ou merge request est un personnage qui marche d'une pièce à l'autre quand son état change.

## Les pièces

| Pièce | Ce qui s'y trouve |
| --- | --- |
| Accueil | Une session Claude attend votre réponse (question en fin de message ou demande de permission). Le personnage fait signe, avec une bulle « ! » |
| Open space | Claude travaille |
| Relecture | MR ouverte, en attente de relecture ou d'approbation |
| Merge | MR mergeable, sans blocage |
| Attente | MR qui dépend d'une autre MR encore ouverte |
| Brouillons | MR marquée Draft |
| Atelier | Pipeline en échec, conflit ou rebase nécessaire |
| Archives | Session terminée, sans question ni MR ouverte |
| Salle de réunion | Une session a lancé plusieurs agents : elle s'y installe avec eux |

Quand une session lance des agents, chacun apparaît comme un petit robot. À partir de deux agents actifs, la session et ses agents se retrouvent en salle de réunion ; avec un seul agent, ils restent à l'open space. Tant qu'un agent travaille, la session ne retourne jamais aux archives, même si son tour de parole est terminé. Elle ne rejoint les archives (ou sa MR) qu'une fois tous ses agents terminés. Si elle attend une réponse de votre part, elle va à l'accueil, et ses agents restent en réunion.

Les robots sont des conversations Claude. Les silhouettes bleutées translucides sont des merge requests sans conversation liée. Une session est reliée à sa MR par le nom de branche. Une MR mergée sort par le portique de la salle de merge.

Quand une session attend une réponse, elle reste à l'accueil même si sa MR est prête : c'est vous qui bloquez.

## Fonctionnement

```
Claude Code ──hooks──▶ ~/.claude/eddy-office/sessions/*.json ─┐
                                                              ├─▶ serveur local ──SSE──▶ scène 3D
GitLab (API, jeton personnel) ────────────────────────────────┘
```

- **Hooks** (`hooks/`) : à chaque message, fin de réponse, notification, lancement ou fin d'un agent, ou fin de session, un petit script écrit l'état de la session dans un fichier JSON, avec la liste de ses agents actifs. Il n'affiche rien et ne fait jamais échouer Claude Code.
- **Serveur** (`server/`) : il lit ces fichiers toutes les 2 secondes, interroge GitLab toutes les 60 secondes (MR créées par vous, assignées à vous ou dont vous êtes relecteur), calcule la pièce de chaque personnage et pousse les changements à la scène en direct. Il n'écoute que sur `127.0.0.1`.
- **Scène** (`src/`) : Three.js, modèles glTF, éclairage et post-traitement à qualité réglable (la qualité baisse toute seule si l'animation devient saccadée). Sans serveur, elle passe en mode démo avec des données d'exemple.

## Démarrage rapide

Prérequis : Node.js 22 ou plus.

```bash
npm install
npm run dev
```

Cela ouvre le **mode démo** sur http://localhost:5173 : des données d'exemple et huit changements d'état à déclencher ou à regarder défiler.

## Données en direct

1. Copiez `.env.example` en `.env` et renseignez `GITLAB_URL` et `GITLAB_TOKEN` (jeton personnel avec la portée `read_api`).
2. Installez les hooks dans les réglages Claude Code :
   ```bash
   npm run hooks:install
   ```
   L'installeur sauvegarde votre `settings.json`, conserve vos autres hooks et peut être annulé avec `npm run hooks:remove`. Les hooks s'appliquent aux sessions lancées après l'installation.
3. Lancez le serveur :
   ```bash
   npm run live
   ```
   puis ouvrez http://localhost:5174.

Le fichier `.env` n'est jamais commité. Le jeton ne quitte pas votre machine.

### Variables d'environnement

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `GITLAB_URL` | (vide) | Adresse de votre GitLab |
| `GITLAB_TOKEN` | (vide) | Jeton personnel, portée `read_api` |
| `GITLAB_POLL_SECONDS` | `60` | Fréquence d'interrogation de GitLab |
| `EDDY_PORT` | `5174` | Port du serveur local |
| `EDDY_SESSION_MAX_AGE_HOURS` | `36` | Les sessions plus anciennes sont masquées |
| `EDDY_AGENT_MAX_AGE_MINUTES` | `30` | Un agent sans nouvelle de fin au bout de ce délai est considéré comme terminé |
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
| `npm test` | Tests du serveur et des hooks |
| `npm run hooks:install` | Installe les hooks dans les réglages Claude Code |
| `npm run hooks:remove` | Retire les hooks |

## Limites

- Le titre affiché dans l'app Claude n'est pas accessible aux hooks : le titre vient du transcript, sinon du premier message de la session.
- La détection « attend une réponse » est une heuristique : dernier message terminé par une question, ou demande de permission.
- Les dépendances entre MR ne sont reconnues que si la description les écrit (`Depends on repo!N`, `Merge before repo!N`, « Dépend de… », « À merger avant… »).
- Les trajets des personnages n'évitent pas les meubles.

## Modèles 3D et licences

- `RobotExpressive.glb` : Tomás Laulhé (Quaternius), CC0, tel que fourni par le dépôt three.js.
- `Xbot.glb` : mannequin Mixamo, soumis aux conditions d'Adobe. Il n'est pas redistribuable tel quel : gardez ce dépôt privé ou remplacez ce modèle.
- Mobilier : KayKit Furniture Bits, CC0 (licence dans `public/models/furniture/`).
