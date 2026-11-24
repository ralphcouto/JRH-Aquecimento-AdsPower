#!/bin/bash
# Mantém o painel + rodízio de pé: se o processo cair, reinicia sozinho e retoma o rodízio.
cd "$(dirname "$0")/.."
while true; do
  AUTOSTART=1 node src/server.js >> data/server.log 2>&1
  echo "[$(date '+%d/%m %H:%M:%S')] servidor caiu, reiniciando em 10s" >> data/server.log
  sleep 10
done
