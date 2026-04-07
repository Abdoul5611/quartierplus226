#!/bin/bash

# Libérer les ports utilisés
fuser -k 5000/tcp 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || true
sleep 1

echo "Installation des dépendances..."
npm install --silent 2>/dev/null || true

echo "Démarrage d'Expo Web sur le port 8081..."
npx expo start --web --port 8081 --no-dev &
EXPO_PID=$!

sleep 5

echo "Démarrage du serveur backend sur le port 5000..."
npx ts-node --project tsconfig.server.json server/index.ts

kill $EXPO_PID 2>/dev/null || true
