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

// Express setup
const app = express();
app.use(helmet());
app.use(hsts({ maxAge: 15552000 }));
app.use(RateLimit({ windowMs: 1 * 60 * 1000, max: 100 }));

// Serve static content
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
    const homepagePath = path.join(__dirname, config.HomepageFile || 'public_html/player.html');
    if (fs.existsSync(homepagePath)) {
      res.sendFile(homepagePath);
    } else {
      res.status(404).send('Homepage file not found');
    }
  });
}

// Create HTTPS server
const server = https.createServer({
  key: fs.readFileSync(config.HTTPSKeyFile),
  cert: fs.readFileSync(config.HTTPSCertFile)
}, app);

// Single WebSocket server (Pixel Streaming expects one endpoint)
const wss = new WebSocket.Server({ noServer: true });

// WebSocket handlers
let nextId = 1;
wss.on('connection', (ws, req) => {
  const id = nextId++;
  console.log(`WebSocket client connected [#${id}] from ${req.socket.remoteAddress}`);

  ws.on('message', (msg) => {
    console.log(`WS [#${id}]: ${msg}`);
  });

  ws.on('close', () => {
    console.log(`WebSocket client [#${id}] disconnected`);
  });
});

// Handle WebSocket upgrades on root path only
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, `https://${req.headers.host}`).pathname;

  // Pixel Streaming client (UE5) typically connects to `/`
  if (pathname === '/') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Start server
const port = process.env.PORT || config.HttpsPort || 443;
server.listen(port, () => {
  console.log(`✅ HTTPS server running on port ${port}`);
});
