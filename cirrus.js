// Updated cirrus.js - Pixel Streaming Signalling Server

const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let streamer = null;

if (config.EnableWebserver) {
  for (const route in config.AdditionalRoutes) {
    const staticPath = path.join(__dirname, config.AdditionalRoutes[route]);
    app.use(route, express.static(staticPath));
  }

  app.get('/', (req, res) => {
    const homepage = path.join(__dirname, config.HomepageFile);
    if (fs.existsSync(homepage)) res.sendFile(homepage);
    else res.status(404).send('Homepage not found');
  });
}

wss.on('connection', (ws, req) => {
  console.log('WebSocket connected');

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (err) {
      console.error('Invalid JSON:', data);
      return;
    }

    if (msg.type === 'config') {
      // Sent by streamer on connect
      console.log('Streamer registered');
      streamer = ws;
      return;
    }

    if (msg.type === 'offer') {
      // Viewer sends offer → send to streamer
      if (streamer && streamer.readyState === WebSocket.OPEN) {
        streamer.send(JSON.stringify({ type: 'offer', sdp: msg.sdp }));
      }
    } else if (msg.type === 'answer') {
      // Streamer sends answer → send to viewer
      if (ws !== streamer) {
        streamer?.send(JSON.stringify({ type: 'answer', sdp: msg.sdp }));
      } else {
        // Broadcast to all viewers
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'answer', sdp: msg.sdp }));
          }
        });
      }
    } else if (msg.type === 'iceCandidate') {
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'iceCandidate', candidate: msg.candidate }));
        }
      });
    } else if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', time: msg.time }));
    }
  });

  ws.on('close', () => {
    if (ws === streamer) {
      console.log('Streamer disconnected');
      streamer = null;
    }
  });
});

server.listen(config.HttpPort, () => {
  console.log(`Server listening on port ${config.HttpPort}`);
});
