import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const gamePublicDir = resolve(scriptsDir, "../public");
const projectPublicDir = resolve(scriptsDir, "../../../public");

await mkdir(projectPublicDir, { recursive: true });

for (const entry of await readdir(gamePublicDir, { withFileTypes: true })) {
  const source = resolve(gamePublicDir, entry.name);
  const target = resolve(projectPublicDir, entry.name);

  if (entry.isDirectory()) {
    await rm(target, { recursive: true, force: true });
    await cp(source, target, { recursive: true });
  } else {
    await cp(source, target);
  }
}
