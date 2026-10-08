// Copies the static game into www/ for the Capacitor native shells.
import { cp, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const out = new URL("www/", root);
const files = [
  "index.html", "styles.css", "app.js", "game-core.js", "words.js", "effects.js",
  "auth-flow.js", "firebase-config.js", "tr_words.txt", "manifest.webmanifest"
];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of files) await cp(new URL(file, root), new URL(file, out));
await cp(new URL("icons/", root), new URL("icons/", out), { recursive: true });
console.log(`www/ hazır (${files.length} dosya + ikonlar)`);
