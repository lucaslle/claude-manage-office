#!/bin/sh
# Lance le tableau de bord : installe ce qu'il faut, démarre le serveur et ouvre le navigateur.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 22 ou plus est requis : https://nodejs.org"; exit 1; }
exec node scripts/start.mjs "$@"
