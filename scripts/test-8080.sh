#!/data/data/com.termux/files/usr/bin/bash
nohup node -e "require('http').createServer(function(q,s){s.end('HELLO8080')}).listen(8080)" > /sdcard/p8080.log 2>&1 &
echo "listener started"
