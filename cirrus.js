const fs = require('fs');
const path = require('path');
const express = require('express');
const https = require('https');
const helmet = require('helmet');
const hsts = require('hsts');
const WebSocket = require('ws');
const RateLimit = require('express-rate-limit');
const yargs = require('yargs');

// Load configuration
const argv = yargs.argv;
const configPath = argv.configFile || './config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Initialize Express app
const app = express();
app.use(helmet());
app.use(hsts({ maxAge: 15552000 }));
app.use(RateLimit({ windowMs: 1 * 60 * 1000, max: 100 }));

// Serve static files if enabled
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

// Create HTTPS server
const server = https.createServer(
  {
    key: fs.readFileSync(config.HTTPSKeyFile),
    cert: fs.readFileSync(config.HTTPSCertFile),
  },
  app
);

// Initialize WebSocket servers
const streamerWSS = new WebSocket.Server({ noServer: true });
const playerWSS = new WebSocket.Server({ noServer: true });
const sfuWSS = new WebSocket.Server({ noServer: true });

// Handle WebSocket connections
let nextPlayerId = 1;

streamerWSS.on('connection', (ws, req) => {
  console.log(`Streamer connected from ${req.socket.remoteAddress}`);
  ws.on('message', (msg) => console.log(`Streamer: ${msg}`));
  ws.on('close', () => console.log('Streamer disconnected'));
});

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

// Handle upgrade requests
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, `https://${request.headers.host}`);

  if (pathname === '/stream') {
    streamerWSS.handleUpgrade(request, socket, head, (ws) => {
      streamerWSS.emit('connection', ws, request);
    });
  } else if (pathname === '/player') {
    playerWSS.handleUpgrade(request, socket, head, (ws) => {
      playerWSS.emit('connection', ws, request);
    });
  } else if (pathname === '/sfu') {
    sfuWSS.handleUpgrade(request, socket, head, (ws) => {
      sfuWSS.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Start server
const port = process.env.PORT || config.HttpsPort || 443;
server.listen(port, () => {
  console.log(`HTTPS server listening on port ${port}`);
});
