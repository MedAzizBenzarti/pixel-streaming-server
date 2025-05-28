// cirrus.js - Fully Functional WebRTC Signalling Server for Pixel Streaming

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const yargs = require('yargs');

// Read config
const argv = yargs.argv;
const configPath = argv.configFile || './config.json';
const config = JSON.parse(fs.readFileSync(configPath));

// Create express app
const app = express();

// Serve static files
if (config.EnableWebserver) {
  for (const route in config.AdditionalRoutes) {
    const staticPath = path.join(__dirname, config.AdditionalRoutes[route]);
    app.use(route, express.static(staticPath));
  }

  app.get('/', (req, res) => {
    const homepagePath = path.join(__dirname, config.HomepageFile);
    if (fs.existsSync(homepagePath)) {
      res.sendFile(homepagePath);
    } else {
      res.status(404).send('Homepage not found');
    }
  });
}

// Start HTTP server
const server = http.createServer(app);

// WebSocket servers
const playerWSS = new WebSocket.Server({ server });
const streamerWSS = new WebSocket.Server({ port: config.StreamerPort });

// Track streamer connection
let streamer = null;

// Handle streamer connection
streamerWSS.on('connection', (ws) => {
  console.log('Streamer connected');
  streamer = ws;

  ws.on('message', (msg) => {
    if (player && player.readyState === WebSocket.OPEN) {
      player.send(msg);
    }
  });

  ws.on('close', () => {
    console.log('Streamer disconnected');
    streamer = null;
  });
});

// Track player connection
let player = null;

// Handle player connection
playerWSS.on('connection', (ws) => {
  console.log('Player connected');
  player = ws;

  ws.on('message', (msg) => {
    if (streamer && streamer.readyState === WebSocket.OPEN) {
      streamer.send(msg);
    }
  });

  ws.on('close', () => {
    console.log('Player disconnected');
    player = null;
  });

  // Optional: send config to streamer to trigger negotiation
  if (streamer && streamer.readyState === WebSocket.OPEN) {
    const configMsg = {
      type: 'config',
      peerConnectionOptions: JSON.parse(config.peerConnectionOptions || '{}')
    };
    ws.send(JSON.stringify(configMsg));
  }
});

// Start server
server.listen(config.HttpPort, () => {
  console.log(`HTTP Signaling server listening on port ${config.HttpPort}`);
});
