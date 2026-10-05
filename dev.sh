#!/usr/bin/env bash
# Start everything for local testing: Android emulator, then the Expo app.
# Usage: ./dev.sh
# Ctrl+C stops it all. Emulator log: /tmp/scrawl-emulator.log
set -euo pipefail
root=$(cd "$(dirname "$0")" && pwd)
sdk=${ANDROID_HOME:-$HOME/Android/Sdk}
adb=$sdk/platform-tools/adb

started_emulator=
cleanup() {
  [ -n "$started_emulator" ] && "$adb" emu kill > /dev/null 2>&1 || true
}
trap cleanup EXIT

if ! "$adb" devices | grep -q '^emulator-'; then
  echo "Starting Android emulator…"
  "$sdk/emulator/emulator" -avd pixel -no-audio > /tmp/scrawl-emulator.log 2>&1 &
  started_emulator=1
fi
"$adb" wait-for-device
until [ "$("$adb" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
# Boot finishes before the network is up; Expo Go fails ("Something went wrong") if it opens without DNS
until "$adb" shell ping -c1 -W2 expo.dev > /dev/null 2>&1; do sleep 2; done

cd "$root"
[ -d node_modules ] || npm install
npx expo start --android
