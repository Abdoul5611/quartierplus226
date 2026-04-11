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

echo "Lancement de Metro Bundler Expo..."
npx expo start --non-interactive &
EXPO_PID=$!

# Attendre que Metro soit prêt (port 8081)
echo "Attente du démarrage de Metro sur le port 8081..."
for i in $(seq 1 30); do
  if nc -z localhost 8081 2>/dev/null; then
    echo "Metro prêt !"
    break
  fi
  sleep 2
done

# Lancer le tunnel localtunnel et capturer l'URL
echo "Création du tunnel public..."
TUNNEL_LOG=/tmp/tunnel.log
npx localtunnel --port 8081 > "$TUNNEL_LOG" 2>&1 &

# Attendre l'URL du tunnel
for i in $(seq 1 15); do
  TUNNEL_URL=$(grep "your url is:" "$TUNNEL_LOG" 2>/dev/null | sed 's/your url is: //')
  if [ -n "$TUNNEL_URL" ]; then
    TUNNEL_HOST=$(echo "$TUNNEL_URL" | sed 's|https://||')
    echo ""
    echo "============================================"
    echo " Lien Expo Go prêt :"
    echo " exp://$TUNNEL_HOST"
    echo "============================================"
    echo ""
    break
  fi
  sleep 2
done

wait $BACKEND_PID $EXPO_PID
