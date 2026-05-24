# Development Build & Install

## Environment

SignalK runs in Docker (`signalk-server` container, Node.js v22).  
The SignalK data/plugin directory is bind-mounted:

```
/home/kw/src/signalk-server/docker/signalk_conf/  ←→  /home/node/.signalk  (inside container)
```

Node.js is not installed directly on the host — use `docker exec` for all `node`/`npm` commands.

## Install / full rebuild

npm v10 installs a local path as a symlink, not a copy. Use `npm pack` to produce a
tarball, then install from that.

```bash
# 1. Copy source into the bind-mounted volume so the container can see it
cp -r /home/kw/src/weather-routing \
      /home/kw/src/signalk-server/docker/signalk_conf/_weather-routing-src

# 2. Install dev deps, compile TypeScript, pack
docker exec signalk-server sh -c \
  "cd /home/node/.signalk/_weather-routing-src && \
   npm install --ignore-scripts && \
   npm run build && \
   npm pack --ignore-scripts"

# 3. Install from the tarball (real copy, not symlink)
docker exec signalk-server sh -c \
  "cd /home/node/.signalk && \
   npm install --ignore-scripts ./_weather-routing-src/signalk-weather-routing-0.1.0.tgz"

# 4. Clean up
docker exec signalk-server sh -c "rm -rf /home/node/.signalk/_weather-routing-src"
rm -rf /home/kw/src/signalk-server/docker/signalk_conf/_weather-routing-src

# 5. Restart SignalK to load the plugin
docker restart signalk-server
```

The plugin appears under **Server → Plugin Config → Weather Routing** in the admin UI.  
The webapp is at `http://<host>:3000/signalk-weather-routing/`.

## Rebuilding after TypeScript changes

Recompile in-place inside the installed package, then reload via the SignalK API:

```bash
docker exec signalk-server sh -c \
  "cd /home/node/.signalk/node_modules/signalk-weather-routing && npm run build"

curl -X PUT http://localhost:3000/skServer/plugins/signalk-weather-routing/restart
```

## Deploying static-only changes (public/)

Changes to `public/index.html` or other static assets take effect immediately — no
recompile or restart needed. Copy directly into the installed package:

```bash
cp /home/kw/src/weather-routing/public/index.html \
   /home/kw/src/signalk-server/docker/signalk_conf/node_modules/signalk-weather-routing/public/index.html
```

Hard-refresh the browser.

## Running tests

```bash
docker exec signalk-server sh -c \
  "cd /home/node/.signalk/node_modules/signalk-weather-routing && npm test"
```

## Uninstalling

```bash
docker exec signalk-server sh -c \
  "cd /home/node/.signalk && npm uninstall signalk-weather-routing"
docker restart signalk-server
```
