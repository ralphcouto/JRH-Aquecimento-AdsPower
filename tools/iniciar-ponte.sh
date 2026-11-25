#!/bin/bash
# Inicia a ponte do AdsPower neste Mac (para o app do NAS controlar os perfis).
# Uso:  bash tools/iniciar-ponte.sh      (precisa do Node 18+: https://nodejs.org ou "brew install node")
# Na primeira vez gera um token e guarda em tools/bridge-token.txt; depois reaproveita o mesmo.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node não encontrado. Instale em https://nodejs.org (ou: brew install node) e rode de novo."; exit 1
fi

[ -f bridge-token.txt ] || LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 28 > bridge-token.txt
TOKEN="$(tr -d '[:space:]' < bridge-token.txt)"
PORT="${BRIDGE_PORT:-50326}"

# IP da placa que sai para a rede
IFACE="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
IP="$(ipconfig getifaddr "${IFACE:-en0}" 2>/dev/null || true)"

echo
echo "No app do NAS (Configurações > Conexões), preencha:"
echo "  AdsPower · URL ............ http://${IP:-IP-DESTE-MAC}:${PORT}"
echo "  AdsPower · token da ponte . ${TOKEN}"
echo "  AdsPower · API key ........ (a deste Mac: AdsPower > Configurações > API; vazio se a Verificação de API estiver desligada)"
echo
echo "Se o macOS perguntar sobre conexões de rede para o \"node\", clique em Permitir."
echo

BRIDGE_TOKEN="$TOKEN" BRIDGE_PORT="$PORT" exec node pc-bridge.js
