import { randomInt } from "node:crypto";
import type { WebSocket } from "ws";
import { generateRoomCode, normalizeRoomCode } from "./room-code.js";
import { scoreWord } from "./scoring.js";
import { canBuildWord, DEVELOPMENT_DICTIONARY, normalizeTurkishWord } from "./words.js";
import type { RoomSnapshot } from "./protocol.js";

const ROUND_MS = 75_000;
const LETTERS = [..."AAABCDEEEFGĞHIIİJKLMNOÖPRSTUÜVYZ"];

interface Player {
  id: string;
  name: string;
  score: number;
  combo: number;
  ready: boolean;
  connected: boolean;
  socket: WebSocket;
  acceptedWords: Set<string>;
}

interface Room {
  code: string;
  hostId: string;
  phase: RoomSnapshot["phase"];
  players: Map<string, Player>;
  letters: string[];
  claimedWords: Set<string>;
  endsAt: number | null;
  timer?: NodeJS.Timeout;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly playerRooms = new Map<string, string>();

  create(playerId: string, name: string, socket: WebSocket): Room {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
    const room: Room = {
      code,
      hostId: playerId,
      phase: "lobby",
      players: new Map(),
      letters: [],
      claimedWords: new Set(),
      endsAt: null
    };
    this.rooms.set(code, room);
    this.addPlayer(room, playerId, name, socket);
    this.broadcast(room);
    return room;
  }

  join(codeValue: string, playerId: string, name: string, socket: WebSocket): Room {
    const code = normalizeRoomCode(codeValue);
    const room = this.rooms.get(code);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.phase !== "lobby") throw new Error("ROOM_ALREADY_STARTED");
    if (room.players.size >= 4) throw new Error("ROOM_FULL");
    this.addPlayer(room, playerId, name, socket);
    this.broadcast(room);
    return room;
  }

  setReady(playerId: string, ready: boolean): void {
    const room = this.requirePlayerRoom(playerId);
    room.players.get(playerId)!.ready = ready;
    this.broadcast(room);
  }

  start(playerId: string): void {
    const room = this.requirePlayerRoom(playerId);
    if (room.hostId !== playerId) throw new Error("HOST_ONLY");
    if (room.players.size < 2) throw new Error("NOT_ENOUGH_PLAYERS");
    if ([...room.players.values()].some((player) => !player.ready)) throw new Error("PLAYERS_NOT_READY");
    room.phase = "playing";
    room.letters = this.generateLetters(12);
    room.endsAt = Date.now() + ROUND_MS;
    room.timer = setInterval(() => {
      if (room.endsAt !== null && Date.now() >= room.endsAt) this.finish(room);
      else this.broadcast(room);
    }, 1000);
    this.broadcast(room);
  }

  submitWord(playerId: string, rawWord: string): { accepted: boolean; word: string; points: number; reason?: string } {
    const room = this.requirePlayerRoom(playerId);
    if (room.phase !== "playing" || room.endsAt === null || Date.now() >= room.endsAt) {
      return { accepted: false, word: rawWord, points: 0, reason: "MATCH_NOT_ACTIVE" };
    }
    const player = room.players.get(playerId)!;
    const word = normalizeTurkishWord(rawWord);
    if ([...word].length < 2) return { accepted: false, word, points: 0, reason: "WORD_TOO_SHORT" };
    if (!canBuildWord(word, room.letters)) return { accepted: false, word, points: 0, reason: "LETTERS_NOT_AVAILABLE" };
    if (!DEVELOPMENT_DICTIONARY.has(word)) return { accepted: false, word, points: 0, reason: "WORD_NOT_FOUND" };
    if (room.claimedWords.has(word)) return { accepted: false, word, points: 0, reason: "WORD_ALREADY_CLAIMED" };
    const points = scoreWord(word, player.combo);
    room.claimedWords.add(word);
    player.acceptedWords.add(word);
    player.score += points;
    player.combo += 1;
    this.broadcast(room);
    return { accepted: true, word, points };
  }

  disconnect(playerId: string): void {
    const code = this.playerRooms.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player) return;
    player.connected = false;
    this.broadcast(room);
    setTimeout(() => {
      if (player.connected) return;
      room.players.delete(playerId);
      this.playerRooms.delete(playerId);
      if (room.players.size === 0) this.dispose(room);
      else {
        if (room.hostId === playerId) room.hostId = room.players.keys().next().value as string;
        this.broadcast(room);
      }
    }, 15_000).unref();
  }

  private addPlayer(room: Room, id: string, name: string, socket: WebSocket): void {
    room.players.set(id, { id, name, score: 0, combo: 0, ready: false, connected: true, socket, acceptedWords: new Set() });
    this.playerRooms.set(id, room.code);
  }

  private requirePlayerRoom(playerId: string): Room {
    const room = this.rooms.get(this.playerRooms.get(playerId) ?? "");
    if (!room || !room.players.has(playerId)) throw new Error("PLAYER_NOT_IN_ROOM");
    return room;
  }

  private generateLetters(count: number): string[] {
    const guaranteedSeed = [..."OYUN"];
    return [
      ...guaranteedSeed,
      ...Array.from(
        { length: Math.max(0, count - guaranteedSeed.length) },
        () => LETTERS[randomInt(LETTERS.length)]!,
      ),
    ];
  }

  private snapshot(room: Room): RoomSnapshot {
    const ordered = [...room.players.values()].sort((a, b) => b.score - a.score);
    return {
      code: room.code,
      phase: room.phase,
      players: ordered.map((player) => ({
        id: player.id, name: player.name, score: player.score, ready: player.ready,
        connected: player.connected, isHost: player.id === room.hostId
      })),
      letters: room.letters,
      endsAt: room.endsAt,
      winnerId: room.phase === "results" ? (ordered[0]?.id ?? null) : null
    };
  }

  private broadcast(room: Room): void {
    const snapshot = this.snapshot(room);
    for (const player of room.players.values()) {
      if (player.socket.readyState === player.socket.OPEN) {
        player.socket.send(JSON.stringify({ type: "room_snapshot", room: snapshot, youId: player.id }));
      }
    }
  }

  private finish(room: Room): void {
    if (room.timer) clearInterval(room.timer);
    room.phase = "results";
    room.endsAt = null;
    this.broadcast(room);
  }

  private dispose(room: Room): void {
    if (room.timer) clearInterval(room.timer);
    this.rooms.delete(room.code);
  }
}
