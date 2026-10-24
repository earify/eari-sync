#!/data/data/com.termux/files/usr/bin/bash
OUT=/sdcard/diag2.log
echo "=== processes ===" > $OUT
pgrep -af "" 2>/dev/null | grep -Ev "grep|ps$" | head -40 >> $OUT 2>&1
echo "=== v4 bind test 8080 ===" >> $OUT
timeout 3 node -e "try{const s=require('net').createServer();s.listen(8080,'0.0.0.0',()=>{console.log('V4 BIND OK');s.close(()=>process.exit(0))});s.on('error',e=>{console.log('V4 BIND FAIL',e.code);process.exit(0)})}catch(e){console.log('ERR',e.message)}" >> $OUT 2>&1
echo "=== v6 bind test 8080 ===" >> $OUT
timeout 3 node -e "try{const s=require('net').createServer();s.listen(8080,'::',()=>{console.log('V6 BIND OK');s.close(()=>process.exit(0))});s.on('error',e=>{console.log('V6 BIND FAIL',e.code);process.exit(0)})}catch(e){console.log('ERR',e.message)}" >> $OUT 2>&1
echo DONE >> $OUT
