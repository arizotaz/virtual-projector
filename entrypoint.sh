#!/bin/bash
set -e

CERT=/etc/letsencrypt/live/app/fullchain.pem

if [ ! -f "$CERT" ]; then
  # if the DOMAIN env var is "localhost" we use openssl to make a self-signed
  # cert, this will show as untrusted by browsers
  if [ "$DOMAIN" = "localhost" ]; then
    echo "[*] DOMAIN=localhost, generating self-signed certificate..."
    mkdir -p /etc/letsencrypt/live/app
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
      -subj "/CN=localhost" \
      -keyout /etc/letsencrypt/live/app/privkey.pem \
      -out "$CERT"
  else
    # for production domains like "example.com" we create a new certificate
    # through cert-box and letsencrypt
    echo "[*] No certificate found, requesting one for $DOMAIN..."
    certbot certonly --standalone --non-interactive --agree-tos \
      --cert-name app \
      -d "$DOMAIN" \
      -m "$LETSENCRYPT_EMAIL" \
      ${LE_STAGING:+--staging} || {
        echo "[!] certbot failed, backing off before exit"
        sleep 300
        exit 1
      }
  fi
fi

echo "[*] Preparing directories..."
chown -R www-data:www-data /app

# this spins up everything in the app container (nginx & backend)
echo "[*] Starting supervisord..."
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf