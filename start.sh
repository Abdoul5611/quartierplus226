#!/bin/bash

# Cleanup function - tue tous les processus enfants à la sortie
cleanup() {
  echo "Arrêt des services..."
  kill $BACKEND_PID $EXPO_PID 2>/dev/null
  wait $BACKEND_PID $EXPO_PID 2>/dev/null
}
trap cleanup EXIT INT TERM

# Tuer les instances précédentes qui pourraient bloquer les ports
pkill -f "dist/server/index.js" 2>/dev/null || true
pkill -f "expo start" 2>/dev/null || true
sleep 1

echo "Compilation du serveur TypeScript..."
npx tsc -p tsconfig.server.json

echo "Démarrage du serveur backend (port 5000)..."
node dist/server/index.js &
BACKEND_PID=$!

echo "Démarrage Expo Web (port 8081)..."
CI=1 npx expo start --web --port 8081 &
EXPO_PID=$!

wait $BACKEND_PID $EXPO_PID
