#!/bin/sh
avail_kb=$(df -k /System/Volumes/Data | awk 'NR==2 {print $4}')
avail_gb=$(awk -v k="$avail_kb" 'BEGIN { printf "%.1f", k * 1024 / 1e9 }')
if [ "$avail_kb" -lt 9765625 ]; then
  echo "DISK-GUARD STOP: ${avail_gb} GB free, below the 10 GB floor"
  exit 3
fi
echo "disk-guard ok: ${avail_gb} GB free"
