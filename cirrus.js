// cirrus.js - Minimal WebRTC Signalling Server for Pixel Streaming

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const yargs = require('yargs');

const argv = yargs.argv;
const configPath = argv.configFile || './config.json';
const config = JSON.parse(fs.readFileSync(configPath));

const app = express();

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

const server = http.createServer(app);

// ✅ FIXED: attach WebSocket server to HTTP server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', async (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (err) {
      console.error('Invalid JSON:', message);
      return;
    }

    console.log('Received:', msg);

    // Forwarding or signaling logic goes here
  });
});

server.listen(config.HttpPort, () => {
  console.log(`HTTP server listening on port ${config.HttpPort}`);
});
