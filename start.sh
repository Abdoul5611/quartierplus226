#!/bin/bash

# Libérer les ports utilisés
fuser -k 5000/tcp 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || true
sleep 1

echo "Installation des dépendances..."
npm install --silent 2>/dev/null || true

# Configurer le token ngrok
if [ -n "$NGROK_AUTHTOKEN" ]; then
  echo "Configuration du token ngrok..."
  node_modules/@expo/ngrok-bin-linux-x64/ngrok authtoken "$NGROK_AUTHTOKEN" 2>/dev/null
  echo "Token ngrok configuré."
fi

echo "Démarrage du serveur backend API sur le port 5000..."
npx ts-node --project tsconfig.server.json server/index.ts &
BACKEND_PID=$!

echo "Démarrage Expo en mode tunnel..."
CI=1 npx expo start --tunnel 2>&1 | tee /tmp/expo_tunnel.log &
EXPO_PID=$!

wait $BACKEND_PID $EXPO_PID
