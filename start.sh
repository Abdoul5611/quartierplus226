#!/bin/bash

fuser -k 5000/tcp 2>/dev/null
fuser -k 8081/tcp 2>/dev/null

echo "Installation des dépendances..."
npm install --silent 2>/dev/null || true

echo "Démarrage d'Expo Web sur le port 8081..."
npx expo start --web --port 8081 &
EXPO_PID=$!

sleep 3

echo "Démarrage du serveur backend sur le port 5000..."
npx ts-node --project tsconfig.server.json server/index.ts

kill $EXPO_PID 2>/dev/null
