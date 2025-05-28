const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const https = require("https");
const WebSocket = require("ws");
const app = express();

const config = JSON.parse(fs.readFileSync("./config.json"));

if (config.EnableWebserver) {
  for (const route in config.AdditionalRoutes) {
    const staticPath = path.join(__dirname, config.AdditionalRoutes[route]);
    app.use(route, express.static(staticPath));
  }

  app.get("/", (req, res) => {
    const homepagePath = path.join(__dirname, config.HomepageFile);
    if (fs.existsSync(homepagePath)) {
      res.sendFile(homepagePath);
    } else {
      res.status(404).send("Homepage not found");
    }
  });
}

const server = config.UseHTTPS
  ? https.createServer({
      key: fs.readFileSync(config.HTTPSKeyFile),
      cert: fs.readFileSync(config.HTTPSCertFile),
    }, app)
  : http.createServer(app);

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("[Player] connected");

  ws.on("message", async (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (err) {
      console.error("Invalid message:", message);
      return;
    }

    console.log("Received:", msg);
  });

  ws.on("close", () => {
    console.log("[Player] disconnected");
  });
});

const port = config.UseHTTPS ? config.HttpsPort : config.HttpPort;
server.listen(port, () => {
  console.log(`[Server] Running on port ${port}`);
});
