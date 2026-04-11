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

echo "Démarrage du serveur backend..."
node dist/server/index.js &
BACKEND_PID=$!

echo "Démarrage Expo Web..."
CI=1 npx expo start --web &
EXPO_PID=$!

wait $BACKEND_PID $EXPO_PID
