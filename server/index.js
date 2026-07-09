const express = require("express");
const cors = require("cors");
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const path = require("path");
const https = require("https");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "";

if (!API_KEY) {
  console.warn("⚠️  API_KEY chưa được cấu hình! Đặt biến môi trường API_KEY trước khi dùng production.");
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ ok: true, apiKeyConfigured: Boolean(API_KEY) });
});

// =============================================================================
// API KEY AUTH
// =============================================================================
function getApiKeyFromRequest(req) {
  const header = req.headers["x-api-key"];
  if (header) return header;
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function isValidApiKey(key) {
  if (!API_KEY) return false;
  if (!key || key.length !== API_KEY.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(API_KEY));
  } catch {
    return false;
  }
}

function requireApiKey(req, res, next) {
  if (!API_KEY) {
    return res.status(503).json({ error: "Server chưa cấu hình API_KEY" });
  }
  const key = getApiKeyFromRequest(req);
  if (!isValidApiKey(key)) {
    return res.status(401).json({ error: "API key không hợp lệ hoặc thiếu" });
  }
  next();
}

app.use("/api", requireApiKey);

// =============================================================================
// IN-MEMORY STORE
// =============================================================================
const accounts = new Map();
const commandQueues = new Map();

function getAccount(username) {
  if (!accounts.has(username)) {
    accounts.set(username, {
      username,
      status: "Offline",
      cash: 0,
      bank: 0,
      serverTime: "N/A",
      playerCount: "0",
      jobId: "",
      placeId: 0,
      autoJobEnabled: false,
      acceptingJobs: false,
      isPadding: false,
      isCleaning: false,
      hp: 100,
      lastSeen: null,
      online: false,
    });
    commandQueues.set(username, []);
  }
  return accounts.get(username);
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

function isOnline(acc) {
  if (!acc.lastSeen) return false;
  return Date.now() - acc.lastSeen < 15000;
}

// =============================================================================
// ROBLOX SERVER LIST (for hop command)
// =============================================================================
function fetchRobloxServers(placeId) {
  return new Promise((resolve, reject) => {
    const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&limit=50`;
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function getUsedJobIds(excludeUsername) {
  const used = [];
  accounts.forEach((acc, username) => {
    if (username !== excludeUsername && acc.jobId && isOnline(acc)) {
      used.push(acc.jobId);
    }
  });
  return used;
}

// =============================================================================
// BOT API
// =============================================================================
app.get("/api/bot/used-jobids", (req, res) => {
  const exclude = req.query.exclude || "";
  res.json({ jobIds: getUsedJobIds(exclude) });
});

app.post("/api/bot/heartbeat", (req, res) => {
  const data = req.body;
  if (!data.username) return res.status(400).json({ error: "username required" });

  const acc = getAccount(data.username);
  Object.assign(acc, {
    status: data.status || acc.status,
    cash: data.cash ?? acc.cash,
    bank: data.bank ?? acc.bank,
    serverTime: data.serverTime || acc.serverTime,
    playerCount: data.playerCount || acc.playerCount,
    jobId: data.jobId || acc.jobId,
    placeId: data.placeId || acc.placeId,
    autoJobEnabled: data.autoJobEnabled ?? acc.autoJobEnabled,
    acceptingJobs: data.acceptingJobs ?? acc.acceptingJobs,
    isPadding: data.isPadding ?? acc.isPadding,
    isCleaning: data.isCleaning ?? acc.isCleaning,
    hp: data.hp ?? acc.hp,
    lastSeen: Date.now(),
    online: true,
  });

  const commands = commandQueues.get(data.username) || [];
  commandQueues.set(data.username, []);

  broadcast({ type: "accounts_update", accounts: getAllAccounts() });
  res.json({ ok: true, commands });
});

// =============================================================================
// DASHBOARD API
// =============================================================================
function getAllAccounts() {
  const list = [];
  accounts.forEach((acc) => {
    list.push({ ...acc, online: isOnline(acc) });
  });
  return list.sort((a, b) => a.username.localeCompare(b.username));
}

app.get("/api/accounts", (req, res) => {
  res.json(getAllAccounts());
});

app.post("/api/accounts/:username/command", async (req, res) => {
  const { username } = req.params;
  const { action, params } = req.body;

  if (!action) return res.status(400).json({ error: "action required" });

  const validActions = [
    "hop", "stop_autojob", "go_bank", "go_job",
    "check_studs", "send_money", "start_autojob",
  ];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: "invalid action" });
  }

  const acc = getAccount(username);
  const cmd = { id: Date.now(), action, params: params || {} };

  if (action === "hop") {
    try {
      const usedIds = getUsedJobIds(username);
      const servers = await fetchRobloxServers(acc.placeId || req.body.placeId);
      if (servers && servers.data) {
        let best = null;
        let bestCount = Infinity;
        for (const s of servers.data) {
          if (
            !usedIds.includes(s.id) &&
            s.id !== acc.jobId &&
            s.playing < s.maxPlayers &&
            s.playing < bestCount
          ) {
            bestCount = s.playing;
            best = s;
          }
        }
        if (best) {
          cmd.params = { targetJobId: best.id, playerCount: best.playing };
          acc.status = "Đang hop server";
        }
      }
    } catch (e) {
      console.error("Hop server lookup failed:", e.message);
    }
  }

  if (action === "stop_autojob") acc.status = "Đang dừng autojob";
  if (action === "go_bank") acc.status = "Đang padding đến bank";
  if (action === "go_job") acc.status = "Đang padding đến job";
  if (action === "check_studs") acc.status = "Đang check player studs";
  if (action === "send_money") acc.status = "Đang chuyển tiền";
  if (action === "start_autojob") acc.status = "Bật auto job";

  const queue = commandQueues.get(username) || [];
  queue.push(cmd);
  commandQueues.set(username, queue);

  broadcast({ type: "accounts_update", accounts: getAllAccounts() });
  res.json({ ok: true, command: cmd });
});

// =============================================================================
// WEBSOCKET
// =============================================================================
wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const apiKey = url.searchParams.get("apiKey") || "";

  if (!isValidApiKey(apiKey)) {
    ws.close(4001, "Unauthorized");
    return;
  }

  ws.send(JSON.stringify({ type: "accounts_update", accounts: getAllAccounts() }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "get_accounts") {
        ws.send(JSON.stringify({ type: "accounts_update", accounts: getAllAccounts() }));
      }
    } catch (_) {}
  });
});

setInterval(() => {
  accounts.forEach((acc) => {
    acc.online = isOnline(acc);
    if (!acc.online && acc.lastSeen) {
      acc.status = "Offline";
    }
  });
  broadcast({ type: "accounts_update", accounts: getAllAccounts() });
}, 5000);

// =============================================================================
// START
// =============================================================================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`AutoJob Dashboard running on port ${PORT}`);
  console.log(`API_KEY: ${API_KEY ? "đã cấu hình ✓" : "CHƯA CẤU HÌNH — thêm biến API_KEY trên Railway"}`);
});
