const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const yargs = require('yargs');
const helmet = require('helmet');
const hsts = require('hsts');
const RateLimit = require('express-rate-limit');

const argv = yargs.argv;
const configPath = argv.configFile || './config.json';
const config = JSON.parse(fs.readFileSync(configPath));

const app = express();
app.use(helmet());
app.use(hsts({ maxAge: 15552000 }));

const limiter = RateLimit({ windowMs: 1 * 60 * 1000, max: 100 });
app.use(limiter);

if (config.EnableWebserver) {
  for (const route in config.AdditionalRoutes) {
    const localPath = path.join(__dirname, config.AdditionalRoutes[route]);
    app.use(route, express.static(localPath));
  }
  app.get('/', (req, res) => {
    const homepagePath = path.join(__dirname, config.HomepageFile);
    if (fs.existsSync(homepagePath)) res.sendFile(homepagePath);
    else res.status(404).send('Homepage file not found');
  });
}

const server = config.UseHTTPS
  ? https.createServer(
      {
        key: fs.readFileSync(config.HTTPSKeyFile),
        cert: fs.readFileSync(config.HTTPSCertFile),
      },
      app
    )
  : http.createServer(app);

const playerWSS = new WebSocket.Server({ noServer: true });
const streamerWSS = new WebSocket.Server({ port: config.StreamerPort });
const sfuWSS = new WebSocket.Server({ port: config.SFUPort });

let nextPlayerId = 1;

playerWSS.on('connection', (ws, req) => {
  const playerId = nextPlayerId++;
  console.log(`Player connected: ${playerId}`);

  ws.on('message', (msg) => {
    console.log(`Player ${playerId} says: ${msg}`);
  });

  ws.on('close', () => {
    console.log(`Player disconnected: ${playerId}`);
  });
});

streamerWSS.on('connection', (ws, req) => {
  console.log(`Streamer connected: ${req.socket.remoteAddress}`);

  ws.on('message', (msg) => {
    console.log(`Streamer says: ${msg}`);
  });

  ws.on('close', () => {
    console.log(`Streamer disconnected`);
  });
});

sfuWSS.on('connection', (ws, req) => {
  console.log(`SFU connected: ${req.socket.remoteAddress}`);

  ws.on('message', (msg) => {
    console.log(`SFU says: ${msg}`);
  });

  ws.on('close', () => {
    console.log(`SFU disconnected`);
  });
});

server.on('upgrade', function upgrade(request, socket, head) {
  const { pathname } = require('url').parse(request.url);

  if (pathname === '/playerws') {
    playerWSS.handleUpgrade(request, socket, head, function done(ws) {
      playerWSS.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(config.UseHTTPS ? config.HttpsPort : config.HttpPort, () => {
  console.log(
    `${config.UseHTTPS ? 'HTTPS' : 'HTTP'} server listening on port ` +
      (config.UseHTTPS ? config.HttpsPort : config.HttpPort)
  );
});
