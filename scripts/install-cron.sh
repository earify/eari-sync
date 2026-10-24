#!/data/data/com.termux/files/usr/bin/bash
# install cron entry for the cloudflare ddns updater (every 5 minutes)
LINE="*/5 * * * * /data/data/com.termux/files/usr/bin/node /data/data/com.termux/files/home/eari-sync/scripts/cf-ddns.cjs >> /data/data/com.termux/files/home/eari-sync-data/ddns.log 2>&1"
( crontab -l 2>/dev/null | grep -v "cf-ddns.cjs" ; echo "$LINE" ) | crontab -
echo "=== crontab now ==="
crontab -l | tail -3
command -v crond >/dev/null 2>&1 && { pgrep -x crond >/dev/null 2>&1 || crond; }
echo "CRONOK"
