const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const helmet = require('helmet');
const hsts = require('hsts');
const RateLimit = require('express-rate-limit');

const configPath = process.argv.find(arg => arg.includes('--configFile='))?.split('=')[1] || './config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const app = express();

// Security middleware
app.use(helmet());
app.use(hsts({ maxAge: 15552000 }));

// Rate limiting
app.use(RateLimit({ windowMs: 1 * 60 * 1000, max: 100 }));

// Static routes
if (config.EnableWebserver) {
  for (const route in config.AdditionalRoutes) {
    const localPath = path.join(__dirname, config.AdditionalRoutes[route]);
    app.use(route, express.static(localPath));
  }

  app.use(express.static(path.join(__dirname, '/Public')));
  app.use('/images', express.static(path.join(__dirname, './images')));
  app.use('/scripts', express.static(path.join(__dirname, '/scripts')));
  app.use('/', express.static(path.join(__dirname, '/custom_html')));

  app.get('/', (req, res) => {
    const homepagePath = path.join(__dirname, config.HomepageFile);
    if (fs.existsSync(homepagePath)) {
      res.sendFile(homepagePath);
    } else {
      res.status(404).send('Homepage file not found');
    }
  });
}

// Create HTTP/HTTPS server
const server = config.UseHTTPS
  ? https.createServer({
      key: fs.readFileSync(config.HTTPSKeyFile),
      cert: fs.readFileSync(config.HTTPSCertFile),
    }, app)
  : http.createServer(app);

// Attach WebSocket servers to the existing server
const streamerWSS = new WebSocket.Server({ noServer: true });
const playerWSS = new WebSocket.Server({ noServer: true });
const sfuWSS = new WebSocket.Server({ port: config.SFUPort }); // SFU on a separate port

// Handle upgrade requests for WebSockets
server.on('upgrade', (request, socket, head) => {
  const { pathname } = require('url').parse(request.url);

  if (pathname === '/stream') {
    streamerWSS.handleUpgrade(request, socket, head, (ws) => {
      streamerWSS.emit('connection', ws, request);
    });
  } else if (pathname === '/player') {
    playerWSS.handleUpgrade(request, socket, head, (ws) => {
      playerWSS.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Handle streamer WebSocket connections
streamerWSS.on('connection', (ws, req) => {
  console.log(`Streamer connected from ${req.socket.remoteAddress}`);
  ws.on('message', (msg) => console.log(`Streamer: ${msg}`));
  ws.on('close', () => console.log('Streamer disconnected'));
});

// Handle player WebSocket connections
let nextPlayerId = 1;
playerWSS.on('connection', (ws, req) => {
  const playerId = nextPlayerId++;
  console.log(`Player ${playerId} connected from ${req.socket.remoteAddress}`);
  ws.on('message', (msg) => console.log(`Player ${playerId}: ${msg}`));
  ws.on('close', () => console.log(`Player ${playerId} disconnected`));
});

// Handle SFU WebSocket connections
sfuWSS.on('connection', (ws, req) => {
  console.log(`SFU connected from ${req.socket.remoteAddress}`);
  ws.on('message', (msg) => console.log(`SFU: ${msg}`));
  ws.on('close', () => console.log('SFU disconnected'));
});

// Start the server
const port = config.UseHTTPS ? config.HttpsPort : config.HttpPort;
server.listen(port, () => {
  console.log(`${config.UseHTTPS ? 'HTTPS' : 'HTTP'} server listening on port ${port}`);
});
