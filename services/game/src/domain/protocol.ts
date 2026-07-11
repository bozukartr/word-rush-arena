import { z } from "zod";

const identity = {
  playerName: z.string().trim().min(2).max(20),
  idToken: z.string().optional(),
  appCheckToken: z.string().optional(),
  requestId: z.string().min(1).max(64)
};

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_room"), ...identity }),
  z.object({ type: z.literal("join_room"), roomCode: z.string(), ...identity }),
  z.object({ type: z.literal("set_ready"), ready: z.boolean(), requestId: z.string() }),
  z.object({ type: z.literal("start_match"), requestId: z.string() }),
  z.object({ type: z.literal("submit_word"), word: z.string().min(1).max(24), requestId: z.string() }),
  z.object({ type: z.literal("ping"), requestId: z.string() })
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface PlayerSnapshot {
  id: string;
  name: string;
  score: number;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomSnapshot {
  code: string;
  phase: "lobby" | "countdown" | "playing" | "results";
  players: PlayerSnapshot[];
  letters: string[];
  endsAt: number | null;
  winnerId: string | null;
}
