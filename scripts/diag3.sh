#!/data/data/com.termux/files/usr/bin/bash
OUT=/sdcard/diag3.log
echo "=== port candidates ===" > $OUT
for port in 8888 18080 8081 9080; do
  r=$(timeout 3 node -e "try{const s=require('net').createServer();s.listen($port,'0.0.0.0',()=>{console.log('FREE');s.close(()=>process.exit(0))});s.on('error',e=>{console.log('BUSY',e.code);process.exit(0)})}catch(e){console.log('ERR')}" 2>&1)
  echo "$port -> $r" >> $OUT
done
echo DONE >> $OUT
