import http from "node:http";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { ClientMessageSchema } from "./domain/protocol.js";
import { RoomManager } from "./domain/room-manager.js";
import { resolvePlayerId } from "./auth/firebase.js";

const port = Number(process.env.PORT ?? 8080);
const app = express();
app.disable("x-powered-by");
app.get("/healthz", (_request, response) => response.json({ ok: true, service: "word-rush-arena-game" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/game" });
const rooms = new RoomManager();

function send(socket: WebSocket, value: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(value));
}

wss.on("connection", (socket) => {
  let playerId: string | null = null;

  socket.on("message", async (raw) => {
    let requestId = "unknown";
    try {
      const json = JSON.parse(raw.toString()) as unknown;
      const message = ClientMessageSchema.parse(json);
      requestId = message.requestId;

      if (message.type === "create_room" || message.type === "join_room") {
        if (playerId) throw new Error("ALREADY_IN_ROOM");
        playerId = await resolvePlayerId(message.idToken);
        if (message.type === "create_room") rooms.create(playerId, message.playerName, socket);
        else rooms.join(message.roomCode, playerId, message.playerName, socket);
        send(socket, { type: "ack", requestId });
        return;
      }

      if (!playerId) throw new Error("AUTH_REQUIRED");
      if (message.type === "set_ready") rooms.setReady(playerId, message.ready);
      if (message.type === "start_match") rooms.start(playerId);
      if (message.type === "submit_word") {
        send(socket, { type: "word_result", requestId, ...rooms.submitWord(playerId, message.word) });
        return;
      }
      if (message.type === "ping") {
        send(socket, { type: "pong", requestId, serverTime: Date.now() });
        return;
      }
      send(socket, { type: "ack", requestId });
    } catch (error) {
      const parsed = error instanceof Error ? error.message : "INVALID_MESSAGE";
      send(socket, { type: "error", requestId, code: parsed });
    }
  });

  socket.on("close", () => {
    if (playerId) rooms.disconnect(playerId);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", message: "game server listening", port }));
});
