#!/bin/bash

fuser -k 5000/tcp 2>/dev/null
fuser -k 8081/tcp 2>/dev/null

echo "Démarrage d'Expo Web sur le port 8081..."
./node_modules/.bin/expo start --web --port 8081 &
EXPO_PID=$!

echo "Démarrage du serveur proxy sur le port 5000..."
npx ts-node --project tsconfig.server.json server/index.ts

kill $EXPO_PID 2>/dev/null
