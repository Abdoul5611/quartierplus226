#!/bin/bash

# Libérer les ports utilisés
fuser -k 5000/tcp 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || true
sleep 1

echo "Installation des dépendances..."
npm install --silent 2>/dev/null || true

echo "Démarrage du serveur backend API sur le port 5000..."
npx ts-node --project tsconfig.server.json server/index.ts &
BACKEND_PID=$!

echo "Démarrage Expo en mode tunnel..."
npx expo start --tunnel &
EXPO_PID=$!

wait $BACKEND_PID $EXPO_PID
