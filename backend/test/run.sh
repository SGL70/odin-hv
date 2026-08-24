#!/bin/bash
# Startar en disponibel Postgres/PostGIS-testdatabas (samma db/init.sql som produktion), kör
# testsviten mot den, och river den sedan — oavsett om testerna gick igenom eller inte.
#
# Föredrar `docker compose` (samma verktyg som docker-compose.yml i produktion). Om inget Docker
# finns i miljön (t.ex. ett sandbox-skal med bara Podman) faller den tillbaka på ett rått
# `podman run`/`docker run` mot samma image, utan compose.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER_NAME="ledning-test-db"
DB_PORT=5433

cleanup() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    docker compose -f test/docker-compose.test.yml down -v >/dev/null 2>&1 || true
  else
    "${RUNTIME:-podman}" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "Startar testdatabasen (docker compose)..."
  docker compose -f test/docker-compose.test.yml up -d
  until docker compose -f test/docker-compose.test.yml exec -T db pg_isready -U ledning >/dev/null 2>&1; do sleep 1; done
else
  RUNTIME=$(command -v docker || command -v podman)
  echo "Ingen docker compose hittad, startar testdatabasen direkt via ${RUNTIME}..."
  "$RUNTIME" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  "$RUNTIME" run -d --name "$CONTAINER_NAME" \
    -e POSTGRES_DB=ledning_test -e POSTGRES_USER=ledning -e POSTGRES_PASSWORD=test \
    -p "${DB_PORT}:5432" \
    -v "$(pwd)/../db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
    postgis/postgis:16-3.4 >/dev/null
  echo "Väntar på testdatabasen..."
  # postgres-imagens entrypoint startar en TILLFÄLLIG server (bara Unix-socket) för att köra
  # docker-entrypoint-initdb.d, stänger ner den, och startar sedan om den RIKTIGA servern på TCP.
  # pg_isready svarar "ready" under båda faserna, så ett enda lyckat svar räcker inte — vänta på
  # tre lyckade svar i rad för att med marginal landa efter omstarten till den riktiga servern.
  consecutive=0
  until [ "$consecutive" -ge 3 ]; do
    if "$RUNTIME" exec "$CONTAINER_NAME" pg_isready -U ledning >/dev/null 2>&1; then
      consecutive=$((consecutive + 1))
    else
      consecutive=0
    fi
    sleep 1
  done
fi

export DATABASE_URL="postgresql://ledning:test@localhost:${DB_PORT}/ledning_test"
export JWT_SECRET="test-secret-do-not-use-in-prod"
export ADMIN_PASSWORD="test-admin-pw"
export PLATFORM_ADMIN_JWT_SECRET="test-platform-admin-secret-do-not-use-in-prod"
export PLATFORM_ADMIN_PASSWORD="test-platform-admin-pw"
export UPLOAD_DIR="/tmp/ledning-test-uploads"

echo "Kör schemat (en gång, innan testfilerna startar parallellt)..."
node test/migrate.js

# --test-concurrency=1: testfilerna delar en enda levande databas (ingen per-fil-isolering av
# schema/data), så att köra dem samtidigt (node --test:s standardbeteende) är en kapplöpning —
# en fils resetData()/TRUNCATE kan tömma rader en annan fil fortfarande använder mitt i ett test.
node --test --test-concurrency=1 --test-timeout=20000 test/*.test.js
