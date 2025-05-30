const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const helmet = require('helmet');
const hsts = require('hsts');
const RateLimit = require('express-rate-limit');
const { parse } = require('url');

// Load config
const configPath = process.argv.find(arg => arg.includes('--configFile='))?.split('=')[1] || './config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const app = express();

// Security middleware
app.use(helmet());
app.use(hsts({ maxAge: 15552000 }));

// Rate limiting
app.use(RateLimit({ windowMs: 1 * 60 * 1000, max: 100 }));

// Serve static files
if (config.EnableWebserver) {
  for (const route in config.AdditionalRoutes) {
    const localPath = path.join(__dirname, config.AdditionalRoutes[route]);
    app.use(route, express.static(localPath));
  }

  app.use(express.static(path.join(__dirname, '/Public')));
  app.use('/images', express.static(path.join(__dirname, './images')));
  app.use('/scripts', express.static(path.join(__dirname, '/scripts')));
  app.use('/', express.static(path.join(__dirname, '/custom_html')));

  // Serve player.html or homepage file
  app.get('/', (req, res) => {
    const homepagePath = path.join(__dirname, config.HomepageFile);
    if (fs.existsSync(homepagePath)) {
      res.sendFile(homepagePath);
    } else {
      res.status(404).send('Homepage file not found');
    }
  });
}

// Create HTTPS or HTTP server
const server = config.UseHTTPS
  ? https.createServer({
      key: fs.readFileSync(config.HTTPSKeyFile),
      cert: fs.readFileSync(config.HTTPSCertFile),
    }, app)
  : http.createServer(app);

// WebSocket servers
const streamerWSS = new WebSocket.Server({ noServer: true });
const playerWSS = new WebSocket.Server({ noServer: true });
const sfuWSS = new WebSocket.Server({ port: config.SFUPort });

// Handle WebSocket upgrade requests
server.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url);

  if (pathname === '/stream') {
    streamerWSS.handleUpgrade(req, socket, head, (ws) => {
      streamerWSS.emit('connection', ws, req);
    });
  } else if (pathname === '/player') {
    playerWSS.handleUpgrade(req, socket, head, (ws) => {
      playerWSS.emit('connection', ws, req);
    });
  } else {
    socket.write('HTTP/1.1 426 Upgrade Required\r\n\r\n');
    socket.destroy();
  }
});

// WebSocket logic
streamerWSS.on('connection', (ws, req) => {
  console.log(`Streamer connected from ${req.socket.remoteAddress}`);
  ws.on('message', (msg) => console.log(`Streamer: ${msg}`));
  ws.on('close', () => console.log('Streamer disconnected'));
});

let nextPlayerId = 1;
playerWSS.on('connection', (ws, req) => {
  const playerId = nextPlayerId++;
  console.log(`Player ${playerId} connected from ${req.socket.remoteAddress}`);
  ws.on('message', (msg) => console.log(`Player ${playerId}: ${msg}`));
  ws.on('close', () => console.log(`Player ${playerId} disconnected`));
});

sfuWSS.on('connection', (ws, req) => {
  console.log(`SFU connected from ${req.socket.remoteAddress}`);
  ws.on('message', (msg) => console.log(`SFU: ${msg}`));
  ws.on('close', () => console.log('SFU disconnected'));
});

// Start main server
const port = config.UseHTTPS ? config.HttpsPort : config.HttpPort;
server.listen(port, () => {
  console.log(`${config.UseHTTPS ? 'HTTPS' : 'HTTP'} server listening on port ${port}`);
});
