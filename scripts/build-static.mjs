import { copyFile, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const out = new URL("dist/", root);
const assets = ["index.html", "studio.css", "studio.js", "planner.html", "app.js", "styles.css"];

await mkdir(out, { recursive: true });
await Promise.all(assets.map((name) => copyFile(new URL(name, root), new URL(name, out))));
