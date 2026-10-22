#!/data/data/com.termux/files/usr/bin/bash
exec > /sdcard/eari-tls.log 2>&1
set -x
date
pkg install -y openssl-tool

cd "$HOME/eari-sync"
git pull --ff-only
npm run build -w shared
npm run build -w server

CERTS="$HOME/eari-sync-data/certs"
mkdir -p "$CERTS"
cd "$CERTS"

# CA (reuse if exists)
if [ ! -f ca.crt ]; then
  openssl genrsa -out ca.key 4096
  openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt -subj "/CN=eari-sync CA"
fi

# Leaf cert with SANs
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "/CN=eari.iptime.org"
cat > san.cnf <<EOF
subjectAltName=DNS:eari.iptime.org,DNS:localhost,IP:192.168.0.17,IP:127.0.0.1
extendedKeyUsage=serverAuth
EOF
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 825 -sha256 -extfile san.cnf
openssl x509 -in server.crt -noout -subject -dates -ext subjectAltName

# write server config
cat > "$HOME/eari-sync-data/config/server.json" <<EOF
{
  "port": 8443,
  "host": "0.0.0.0",
  "httpsMode": "selfsigned",
  "certPath": "$CERTS/server.crt",
  "keyPath": "$CERTS/server.key",
  "caCertPath": "$CERTS/ca.crt",
  "logLevel": "info"
}
EOF

# restart
pkill -f "node server/dist/main.js" 2>/dev/null || true
sleep 1
nohup node "$HOME/eari-sync/server/dist/main.js" > "$HOME/eari-sync-server.log" 2>&1 &
sleep 3
echo "--- https health ---"
curl -s -m 5 -k https://127.0.0.1:8443/health || echo "https health failed"
echo ""
echo "--- server log ---"
tail -3 "$HOME/eari-sync-server.log"
echo "TLSDONE"
