import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { randomUUID } from "node:crypto";

if (getApps().length === 0 && process.env.GOOGLE_CLOUD_PROJECT) {
  initializeApp({ credential: applicationDefault() });
}

export async function resolvePlayerId(idToken?: string): Promise<string> {
  if (idToken && getApps().length > 0) {
    const decoded = await getAuth().verifyIdToken(idToken, true);
    return decoded.uid;
  }
  if (process.env.ALLOW_INSECURE_AUTH === "true" || process.env.NODE_ENV !== "production") {
    return `local-${randomUUID()}`;
  }
  throw new Error("AUTH_REQUIRED");
}
