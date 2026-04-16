#!/bin/bash

# Cleanup function
cleanup() {
  echo "Arrêt des services..."
  kill $BACKEND_PID 2>/dev/null
  wait $BACKEND_PID 2>/dev/null
}
trap cleanup EXIT INT TERM

# Tuer les instances précédentes
pkill -f "dist/server/index.js" 2>/dev/null || true
sleep 1

echo "Build du frontend web Expo..."
npx expo export --platform web --output-dir web-dist --clear 2>&1 | tail -5

echo "Compilation du serveur TypeScript..."
./node_modules/.bin/tsc -p tsconfig.server.json

echo "Démarrage du serveur QuartierPlus (port 5000)..."
node dist/server/index.js &
BACKEND_PID=$!

echo "✅ QuartierPlus disponible sur le port 5000"
echo "📦 Build web statique servi depuis web-dist/"
echo "🔗 API: http://localhost:5000/api/health"

wait $BACKEND_PID
