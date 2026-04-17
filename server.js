const http = require("http");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3010;
const rooms = new Map();

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function normalizeRoomCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function makeUniqueRoomCode() {
  let code = makeRoomCode();
  while (rooms.has(code)) {
    code = makeRoomCode();
  }
  return code;
}

function createRoom(code, ownerId) {
  const roomCode = code || makeUniqueRoomCode();
  const room = {
    code: roomCode,
    ownerId,
    mapId: null,
    strokes: [],
    agents: [],
    liveStrokes: new Map(),
    clients: new Map()
  };
  rooms.set(roomCode, room);
  return room;
}

function getParticipants(room) {
  return Array.from(room.clients.values()).map((client) => ({
    userId: client.userId,
    name: client.name
  }));
}

function send(ws, type, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, payload }));
}

function broadcastRoom(room, type, payload, excludeUserId) {
  room.clients.forEach((client) => {
    if (excludeUserId && client.userId === excludeUserId) return;
    send(client.ws, type, payload);
  });
}

function broadcastPresence(room) {
  broadcastRoom(room, "presence", {
    participants: getParticipants(room),
    ownerId: room.ownerId
  });
}

function broadcastRoomState(room) {
  broadcastRoom(room, "room-state", {
    roomCode: room.code,
    mapId: room.mapId,
    strokes: room.strokes,
    agents: room.agents,
    participants: getParticipants(room),
    ownerId: room.ownerId
  });
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function removeLiveStrokesByUser(room, userId) {
  for (const [strokeId, stroke] of room.liveStrokes.entries()) {
    if (stroke.userId === userId) {
      room.liveStrokes.delete(strokeId);
    }
  }
}

function cleanupSocket(ws) {
  const roomCode = ws.roomCode;
  const userId = ws.userId;

  if (!roomCode || !rooms.has(roomCode)) return;

  const room = rooms.get(roomCode);
  if (!room) return;

  room.clients.delete(userId);

  for (const [strokeId, stroke] of room.liveStrokes.entries()) {
    if (stroke.userId === userId) {
      room.liveStrokes.delete(strokeId);
      broadcastRoom(room, "draw:cancel", { strokeId }, userId);
    }
  }

  if (room.clients.size === 0) {
    rooms.delete(roomCode);
    return;
  }

  if (room.ownerId === userId) {
    const nextOwner = room.clients.values().next().value;
    room.ownerId = nextOwner ? nextOwner.userId : null;
  }

  broadcastPresence(room);
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({
    ok: true,
    name: "DVT realtime server",
    rooms: rooms.size
  }));
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  ws.userId = null;
  ws.roomCode = null;
  ws.userName = null;

  send(ws, "server-ready", { ok: true });

  ws.on("message", (raw) => {
    const message = safeJsonParse(raw);
    if (!message || !message.type) {
      send(ws, "error", { message: "Невалидный пакет." });
      return;
    }

    const payload = message.payload || {};

    if (message.type === "join-room") {
      const wantsCreate = !!payload.create;
      const requestedCode = normalizeRoomCode(payload.roomCode);
      const userName = String(payload.name || "Player").trim().slice(0, 24) || "Player";

      let room = null;

      if (wantsCreate) {
        if (requestedCode && rooms.has(requestedCode)) {
          send(ws, "error", { message: "Комната с таким кодом уже существует." });
          return;
        }
        room = createRoom(requestedCode || null, null);
      } else {
        if (!requestedCode || !rooms.has(requestedCode)) {
          send(ws, "error", { message: "Комната не найдена." });
          return;
        }
        room = rooms.get(requestedCode);
      }

      if (!room) {
        send(ws, "error", { message: "Не удалось подключиться к комнате." });
        return;
      }

      const userId = makeId();
      ws.userId = userId;
      ws.roomCode = room.code;
      ws.userName = userName;

      room.clients.set(userId, {
        userId,
        name: userName,
        ws
      });

      if (!room.ownerId) {
        room.ownerId = userId;
      }

      send(ws, "joined", {
        userId,
        roomCode: room.code,
        isHost: room.ownerId === userId,
        ownerId: room.ownerId
      });

      send(ws, "room-state", {
        roomCode: room.code,
        mapId: room.mapId,
        strokes: room.strokes,
        agents: room.agents,
        participants: getParticipants(room),
        ownerId: room.ownerId
      });

      broadcastPresence(room);
      return;
    }

    if (!ws.roomCode || !rooms.has(ws.roomCode)) {
      send(ws, "error", { message: "Сначала подключись к комнате." });
      return;
    }

    const room = rooms.get(ws.roomCode);

    if (message.type === "leave-room") {
      send(ws, "left-room", { ok: true });
      cleanupSocket(ws);
      ws.roomCode = null;
      ws.userId = null;
      ws.userName = null;
      return;
    }

    if (message.type === "map:set") {
      if (room.ownerId !== ws.userId) {
        send(ws, "error", { message: "Только host может менять карту." });
        return;
      }

      room.mapId = String(payload.mapId || "").trim() || null;
      room.strokes = [];
      room.agents = [];
      room.liveStrokes.clear();

      broadcastRoom(room, "map:set", {
        mapId: room.mapId
      });
      broadcastRoomState(room);
      return;
    }

    if (message.type === "draw:start") {
      const stroke = payload.stroke;
      if (!stroke || !stroke.strokeId) return;

      room.liveStrokes.set(stroke.strokeId, stroke);
      broadcastRoom(room, "draw:start", { stroke }, ws.userId);
      return;
    }

    if (message.type === "draw:append") {
      const strokeId = String(payload.strokeId || "");
      const points = Array.isArray(payload.points) ? payload.points : [];
      if (!strokeId || !points.length) return;

      const stroke = room.liveStrokes.get(strokeId);
      if (!stroke) return;

      stroke.points = stroke.points.concat(points);

      broadcastRoom(room, "draw:append", {
        strokeId,
        points
      }, ws.userId);
      return;
    }

    if (message.type === "draw:end") {
      const strokeId = String(payload.strokeId || "");
      if (!strokeId) return;

      const stroke = room.liveStrokes.get(strokeId);
      if (!stroke) return;

      room.liveStrokes.delete(strokeId);
      room.strokes.push(stroke);

      broadcastRoom(room, "draw:end", {
        stroke
      }, ws.userId);
      return;
    }

    if (message.type === "draw:undo") {
      let indexToRemove = -1;

      for (let i = room.strokes.length - 1; i >= 0; i -= 1) {
        if (room.strokes[i].userId === ws.userId) {
          indexToRemove = i;
          break;
        }
      }

      if (indexToRemove !== -1) {
        room.strokes.splice(indexToRemove, 1);
        broadcastRoomState(room);
      }

      return;
    }

    if (message.type === "draw:clear") {
      const scope = String(payload.scope || "self");

      if (scope === "all") {
        if (room.ownerId !== ws.userId) {
          send(ws, "error", { message: "Только host может очищать карту полностью." });
          return;
        }

        room.strokes = [];
        room.liveStrokes.clear();
        broadcastRoomState(room);
        return;
      }

      room.strokes = room.strokes.filter((stroke) => stroke.userId !== ws.userId);
      removeLiveStrokesByUser(room, ws.userId);
      broadcastRoomState(room);
      return;
    }

    if (message.type === "agent:add") {
      const agent = payload.agent;
      if (!agent || !agent.instanceId) return;

      room.agents.push(agent);
      broadcastRoom(room, "agent:add", { agent }, ws.userId);
      return;
    }

    if (message.type === "agent:update") {
      const instanceId = String(payload.instanceId || "");
      if (!instanceId) return;

      const agent = room.agents.find((item) => item.instanceId === instanceId);
      if (!agent) return;

      if (typeof payload.x === "number") agent.x = payload.x;
      if (typeof payload.y === "number") agent.y = payload.y;
      if (typeof payload.size === "number") agent.size = payload.size;

      broadcastRoom(room, "agent:update", {
        instanceId,
        x: agent.x,
        y: agent.y,
        size: agent.size
      }, ws.userId);
      return;
    }

    if (message.type === "agent:remove") {
      const instanceId = String(payload.instanceId || "");
      if (!instanceId) return;

      room.agents = room.agents.filter((item) => item.instanceId !== instanceId);
      broadcastRoom(room, "agent:remove", { instanceId }, ws.userId);
      return;
    }

    if (message.type === "ping") {
      send(ws, "pong", { t: Date.now() });
    }
  });

  ws.on("close", () => {
    cleanupSocket(ws);
  });

  ws.on("error", () => {
    cleanupSocket(ws);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("DVT realtime server running on ws://0.0.0.0:" + PORT);
});