---
description: Consulte GitLab en lecture seule (merge requests, relectures, pipelines) avec le jeton de .env
argument-hint: <demande ou référence de MR>
---

Réponds à la demande suivante en consultant GitLab : $ARGUMENTS

Utilise uniquement `npm run gitlab -- <commande>` depuis la racine du projet (lecture seule, le jeton est lu dans `.env`). Commence par `npm run gitlab -- aide` si tu ne connais pas les commandes.

- Ne demande jamais le jeton et ne l'affiche jamais ; ne le copie dans aucun fichier du dépôt.
- Si la commande répond que `GITLAB_URL` ou `GITLAB_TOKEN` manquent, dis-le et indique où les renseigner (`.env` ou `~/.claude/eddy-office/.env`) sans les remplir toi-même.
- Pour un pipeline en échec : `mr`, puis `jobs`, puis `log` du job fautif ; pour une relecture : `discussions` puis `diff`.
- Ne modifie rien sur GitLab : cet accès ne le permet pas, et ne propose pas de contourner ce choix.
