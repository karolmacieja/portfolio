// First-run local setup, shell-independent (Windows PowerShell 5.1 has no `&&`): `pnpm setup:dev` or the VS Code task.
// Plain Node with built-ins only, so it runs before `pnpm install`.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const isWindows = process.platform === "win32";

/** Whether `command --version` runs (on Windows pnpm is a .cmd shim, which needs a shell). */
function available(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore", shell: isWindows }).status === 0;
}

const missing = [
  !available("pnpm") &&
    "pnpm: run `npm install -g pnpm@10`, then close and reopen VS Code (or the terminal) so PATH is refreshed.",
  !available("docker") &&
    "Docker: install Docker Desktop (https://www.docker.com/products/docker-desktop/) and start it.",
].filter(Boolean);
if (missing.length > 0) {
  console.error(`Missing tools:\n${missing.map((line) => `  - ${line}`).join("\n")}`);
  process.exit(1);
}

const PLACEHOLDER_SECRET = "change-me-to-a-random-32+-character-secret";

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  const env = readFileSync(".env", "utf8").replace(PLACEHOLDER_SECRET, randomBytes(32).toString("base64url"));
  writeFileSync(".env", env);
  console.log("Created .env from .env.example (with a random AUTH_SECRET).");
}

const steps = [
  ["pnpm", ["install"]],
  ["docker", ["compose", "up", "-d", "--wait"]],
  ["pnpm", ["db:deploy"]],
  ["pnpm", ["db:seed"]],
];

for (const [command, args] of steps) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: isWindows });
  if (result.status !== 0) {
    console.error(
      `\n"${command} ${args.join(" ")}" failed${result.error ? `: ${result.error.message}` : ""}.`,
    );
    if (command === "docker") console.error("See the Docker error above (is Docker Desktop running?).");
    process.exit(result.status ?? 1);
  }
}

console.log(
  '\nDone. Start the app with the VS Code task "Start" (Ctrl+Shift+B) or `pnpm dev` + `pnpm worker`.',
);
