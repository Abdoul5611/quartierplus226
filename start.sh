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

echo "Démarrage Expo Web (port 8081)..."
npx expo start --web --port 8081 &
EXPO_PID=$!

# Attendre qu'Expo soit prêt sur le port 8081
echo "En attente d'Expo sur le port 8081..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/ 2>/dev/null | grep -q "200"; then
    echo "✅ Expo prêt sur le port 8081"
    break
  fi
  sleep 2
done

echo "Démarrage du serveur backend (port 5000)..."
node dist/server/index.js &
BACKEND_PID=$!

echo "✅ QuartierPlus opérationnel sur le port 5000"

wait $BACKEND_PID $EXPO_PID
