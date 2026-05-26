#!/usr/bin/env bash
set -euo pipefail

HOST="${SIGNALK_HOST:-http://localhost:3000}"
URL="$HOST/plugins/signalk-weather-routing/calculate"

echo "Posting test run to $URL ..."
curl -sf -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{
    "start":         { "lat": 60.027083, "lon": 19.857472 },
    "end":           { "lat": 58.410222, "lon": 19.105806 },
    "departureTime": "2026-05-25T04:00:00.000Z"
  }'
echo
echo "Route calculation started. Monitor progress in the webapp at $HOST."
