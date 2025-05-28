// cirrus.js - Pixel Streaming Signalling Server

const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const yargs = require('yargs');

const argv = yargs.argv;
const config = JSON.parse(fs.readFileSync(argv.configFile || './config.json'));

const app = express();

// Serve static files
if (config.EnableWebserver) {
  for (const route in config.AdditionalRoutes) {
    const routePath = path.join(__dirname, config.AdditionalRoutes[route]);
    app.use(route, express.static(routePath));
  }

  app.get('/', (req, res) => {
    const homepage = path.join(__dirname, config.HomepageFile);
    res.sendFile(fs.existsSync(homepage) ? homepage : '404 Not Found');
  });
}

// HTTPS or HTTP server
const server = config.UseHTTPS
  ? https.createServer(
      {
        cert: fs.readFileSync(config.HTTPSCertFile),
        key: fs.readFileSync(config.HTTPSKeyFile),
      },
      app
    )
  : http.createServer(app);

// WebSocket servers
const streamerWSS = new WebSocket.Server({ noServer: true });
const playerWSS = new WebSocket.Server({ noServer: true });

let streamer = null;
const players = new Set();

// Routing upgrade requests
server.on('upgrade', (req, socket, head) => {
  const pathname = req.url;

  if (pathname === '/streamer') {
    streamerWSS.handleUpgrade(req, socket, head, ws => {
      streamerWSS.emit('connection', ws, req);
    });
  } else {
    playerWSS.handleUpgrade(req, socket, head, ws => {
      playerWSS.emit('connection', ws, req);
    });
  }
});

// Handle streamer connection
streamerWSS.on('connection', ws => {
  console.log('[Streamer] connected');
  streamer = ws;

  ws.on('message', msg => {
    const data = JSON.parse(msg);
    console.log('[Streamer] ->', data.type);
    for (const player of players) {
      player.send(JSON.stringify(data));
    }
  });

  ws.on('close', () => {
    console.log('[Streamer] disconnected');
    streamer = null;
  });
});

// Handle player connection
playerWSS.on('connection', ws => {
  console.log('[Player] connected');
  players.add(ws);

  ws.on('message', msg => {
    const data = JSON.parse(msg);
    console.log('[Player] ->', data.type);
    if (streamer && streamer.readyState === WebSocket.OPEN) {
      streamer.send(JSON.stringify(data));
    }
  });

  ws.on('close', () => {
    console.log('[Player] disconnected');
    players.delete(ws);
  });
});

// Start server
server.listen(config.HttpsPort || config.HttpPort, () => {
  console.log(`[Server] Running on port ${config.HttpsPort || config.HttpPort}`);
});
