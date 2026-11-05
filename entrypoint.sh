#!/bin/bash
set -e

echo "[*] Preparing directories..."
chown -R www-data:www-data /app

# this spins up everything in the app container (nginx & backend)
echo "[*] Starting supervisord..."
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf