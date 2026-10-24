#!/data/data/com.termux/files/usr/bin/bash
OUT=/sdcard/t8080b.log
echo "=== /proc/net/tcp port 8080 (hex 1F90) ===" > $OUT
grep -i ':1F90' /proc/net/tcp /proc/net/tcp6 2>/dev/null >> $OUT
INODES=$(grep -ih ':1F90' /proc/net/tcp /proc/net/tcp6 2>/dev/null | awk '{print $10}' | sort -u)
echo "inodes: $INODES" >> $OUT
for ino in $INODES; do
  for d in /proc/[0-9]*/fd; do
    tgt=$(readlink "$d/socket" 2>/dev/null)
    if [ "$tgt" = "socket:[$ino]" ]; then
      pid=$(echo $d | cut -d/ -f3)
      echo "PID $pid holds socket $ino" >> $OUT
      tr '\0' ' ' < /proc/$pid/cmdline >> $OUT
      echo "" >> $OUT
    fi
  done
done
echo "=== all LISTEN sockets ===" >> $OUT
grep -i ' 0A ' /proc/net/tcp /proc/net/tcp6 2>/dev/null | awk '{print $2}' >> $OUT
echo DONE >> $OUT
