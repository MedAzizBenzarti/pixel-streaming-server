const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const yargs = require('yargs');

const argv = yargs.argv;
const configPath = argv.configFile || './config.json';
const config = JSON.parse(fs.readFileSync(configPath));

const app = express();
const players = new Set();
let streamer = null;

// Serve static files
if (config.EnableWebserver) {
  for (const route in config.AdditionalRoutes) {
    app.use(route, express.static(path.join(__dirname, config.AdditionalRoutes[route])));
  }
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, config.HomepageFile));
  });
}

// Create HTTP or HTTPS server
let server;
if (config.UseHTTPS) {
  const options = {
    cert: fs.readFileSync(config.HTTPSCertFile),
    key: fs.readFileSync(config.HTTPSKeyFile),
  };
  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('[Server] WebSocket client connected');

  ws.isStreamer = false;

  ws.on('message', (msg) => {
    let message;
    try {
      message = JSON.parse(msg);
    } catch (err) {
      console.error('[Server] Invalid JSON:', msg);
      return;
    }

    // Identify if this client is a streamer
    if (message.type === 'identify' && message.role === 'streamer') {
      ws.isStreamer = true;
      streamer = ws;
      console.log('[Server] Streamer registered');
      // Send config to all existing players
      players.forEach((player) => {
        player.send(JSON.stringify({ type: 'config', peerConnectionOptions: { iceServers: [] } }));
      });
      return;
    }

    // Forward from player to streamer
    if (!ws.isStreamer && streamer) {
      streamer.send(msg);
    }

    // Forward from streamer to all players
    if (ws.isStreamer) {
      players.forEach((player) => {
        if (player.readyState === WebSocket.OPEN) {
          player.send(msg);
        }
      });
    }
  });

  ws.on('close', () => {
    if (ws.isStreamer) {
      console.log('[Server] Streamer disconnected');
      streamer = null;
    } else {
      players.delete(ws);
      console.log('[Server] Player disconnected');
    }
  });

  // By default treat all clients as players
  if (!ws.isStreamer) {
    players.add(ws);
    console.log('[Server] Player connected');

    // Send initial config if streamer is already connected
    if (streamer) {
      ws.send(JSON.stringify({ type: 'config', peerConnectionOptions: { iceServers: [] } }));
    }
  }
});

// Start the server
server.listen(config.HttpsPort || config.HttpPort, () => {
  console.log(`🚀 Server running on port ${config.HttpsPort || config.HttpPort}`);
});
