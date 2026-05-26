#!/usr/bin/env bash
set -euo pipefail

HOST="${SIGNALK_HOST:-http://localhost:3000}"
URL="$HOST/plugins/signalk-weather-routing/calculate"

echo "Posting test run to $URL ..."
curl -sf -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{
    "start":         { "lat": 60.3996, "lon": 18.3403 },
    "end":           { "lat": 58.6469, "lon": 16.3889 },
    "departureTime": "2026-05-24T08:30:00.000Z"
  }'
echo
echo "Route calculation started. Monitor progress in the webapp at $HOST."
