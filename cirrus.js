// cirrus.js - Signaling server for Unreal Pixel Streaming
const fs = require('fs');
const path = require('path');
const express = require('express');
const yargs = require('yargs');
const WebSocket = require('ws');

const argv = yargs.argv;
const configPath = argv.configFile || './config.json';
const config = JSON.parse(fs.readFileSync(configPath));

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

// Create HTTP or HTTPS server
let server;
if (config.UseHTTPS) {
  const options = {
    key: fs.readFileSync(config.HTTPSKeyFile),
    cert: fs.readFileSync(config.HTTPSCertFile),
  };
  server = require('https').createServer(options, app);
} else {
  server = require('http').createServer(app);
}

// WebSocket Server
const wss = new WebSocket.Server({ server });

let streamer = null;
const players = new Set();

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      console.error('Invalid JSON:', message);
      return;
    }

    if (msg.type === 'identify') {
      console.log('Streamer identified');
      streamer = ws;

      streamer.on('message', (data) => {
        for (const player of players) {
          if (player.readyState === WebSocket.OPEN) {
            player.send(data);
          }
        }
      });

      streamer.on('close', () => {
        console.log('Streamer disconnected');
        streamer = null;
      });

      return;
    }

    // Viewer
    if (!players.has(ws)) {
      players.add(ws);
      console.log(`Viewer connected (${players.size} total)`);

      ws.on('close', () => {
        players.delete(ws);
        console.log(`Viewer disconnected (${players.size} remaining)`);
      });
    }

    if (streamer && streamer.readyState === WebSocket.OPEN) {
      streamer.send(message);
    }
  });
});

// Start server
server.listen(config.HttpsPort || config.HttpPort, () => {
  console.log(`🚀 Server running on port ${config.HttpsPort || config.HttpPort}`);
});
