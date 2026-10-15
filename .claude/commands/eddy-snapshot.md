---
description: Met à jour les limites d'usage et l'état des connecteurs affichés par le tableau de bord
---

Mets à jour les deux instantanés lus par le tableau de bord (dossier `~/.claude/eddy-office`).

1. Appelle l'outil `session_connectors_status` (serveur `ccd_connectors`) et garde sa sortie JSON brute.
2. Appelle l'outil `get_usage` (serveur `ccd_session_mgmt`) et garde sa sortie JSON brute.
3. Depuis la racine du projet, envoie chaque sortie telle quelle sur l'entrée standard du script correspondant :
   - connecteurs : `node hooks/write-snapshot.mjs connectors`
   - limites : `node hooks/write-snapshot.mjs usage`
4. Confirme en une ligne ce qui a été écrit. N'affiche pas les JSON complets.

Si un outil n'est pas disponible, dis lequel et n'écris rien pour celui-là.
