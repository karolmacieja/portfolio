// First-run local setup, shell-independent (Windows PowerShell 5.1 has no `&&`): `pnpm setup:dev` or the VS Code task.
// Plain Node with built-ins only, so it runs before `pnpm install`.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

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
  // On Windows pnpm is a .cmd shim, which needs a shell.
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(
      `\n"${command} ${args.join(" ")}" failed${result.error ? `: ${result.error.message}` : ""}.`,
    );
    if (command === "docker") console.error("Is Docker Desktop running?");
    process.exit(result.status ?? 1);
  }
}

console.log(
  '\nDone. Start the app with the VS Code task "Start" (Ctrl+Shift+B) or `pnpm dev` + `pnpm worker`.',
);
