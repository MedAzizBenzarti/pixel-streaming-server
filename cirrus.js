// cirrus.js – Updated Pixel Streaming Signaling Server

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const WebSocket = require('ws');
const yargs = require('yargs');

const argv = yargs.argv;
const configPath = argv.configFile || './config.json';
const config = JSON.parse(fs.readFileSync(configPath));

const app = express();

// Serve static frontend
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

// HTTP or HTTPS server
const server = config.UseHTTPS
    ? https.createServer({
        key: fs.readFileSync(config.HTTPSKeyFile),
        cert: fs.readFileSync(config.HTTPSCertFile),
    }, app)
    : http.createServer(app);

const wss = new WebSocket.Server({ server });

let streamer = null;
const players = new Set();

wss.on('connection', (ws, req) => {
    ws.isAlive = true;

    ws.on('pong', () => ws.isAlive = true);

    ws.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (err) {
            console.error('Invalid JSON:', data);
            return;
        }

        if (msg.type === 'offer' && streamer) {
            streamer.send(JSON.stringify(msg));
        } else if (msg.type === 'answer') {
            [...players].forEach(p => p.send(JSON.stringify(msg)));
        } else if (msg.type === 'iceCandidate') {
            if (msg.target === 'streamer' && streamer) {
                streamer.send(JSON.stringify(msg));
            } else {
                [...players].forEach(p => p.send(JSON.stringify(msg)));
            }
        } else if (msg.type === 'identify' && msg.role === 'streamer') {
            console.log('[Streamer] connected');
            streamer = ws;

            streamer.on('close', () => {
                console.log('[Streamer] disconnected');
                streamer = null;
            });
        } else {
            // Assume it's a player
            console.log('[Player] connected');
            players.add(ws);

            if (streamer) {
                streamer.send(JSON.stringify({ type: 'playerConnected' }));
            }

            ws.on('close', () => {
                console.log('[Player] disconnected');
                players.delete(ws);
            });
        }
    });
});

// Heartbeat to remove dead connections
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

server.listen(config.UseHTTPS ? config.HttpsPort : config.HttpPort, () => {
    console.log(`🚀 Server running on port ${config.UseHTTPS ? config.HttpsPort : config.HttpPort}`);
});
