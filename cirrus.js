const fs = require('fs');
const path = require('path');
const express = require('express');
const https = require('https');
const helmet = require('helmet');
const hsts = require('hsts');
const WebSocket = require('ws');
const RateLimit = require('express-rate-limit');
const yargs = require('yargs');

// Load config
const argv = yargs.argv;
const configPath = argv.configFile || './config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Express app
const app = express();
app.use(helmet());
app.use(hsts({ maxAge: 15552000 }));
app.use(RateLimit({ windowMs: 1 * 60 * 1000, max: 100 }));

// Static file serving
if (config.EnableWebserver) {
  for (const route in config.AdditionalRoutes) {
    app.use(route, express.static(path.join(__dirname, config.AdditionalRoutes[route])));
  }

  app.use(express.static(path.join(__dirname, 'Public')));
  app.use('/images', express.static(path.join(__dirname, 'images')));
  app.use('/scripts', express.static(path.join(__dirname, 'scripts')));
  app.use('/', express.static(path.join(__dirname, 'custom_html')));

  app.get('/', (req, res) => {
    const homepage = path.join(__dirname, config.HomepageFile || 'public_html/player.html');
    if (fs.existsSync(homepage)) {
      res.sendFile(homepage);
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

// WebSocket setup
const wss = new WebSocket.Server({ noServer: true });

let clientCounter = 1;
wss.on('connection', (ws, req) => {
  const id = clientCounter++;
  console.log(`Client #${id} connected via WebSocket from ${req.socket.remoteAddress}`);

  ws.on('message', msg => console.log(`Client #${id}:`, msg));
  ws.on('close', () => console.log(`Client #${id} disconnected`));
});

// Upgrade handler — ONLY handle WebSocket upgrades, fallback to Express
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, `https://${req.headers.host}`);

  // Only handle WebSocket for specific path
  if (pathname === '/ws' || pathname === '/stream' || pathname === '/player') {
    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req);
    });
  } else {
    // Fallback — close the socket silently, don't interfere with HTTP
    socket.destroy();
  }
});

// Start server
const port = config.HttpsPort || 443;
server.listen(port, '0.0.0.0', () => {
  console.log(`✅ HTTPS server running on port ${port}`);
});
