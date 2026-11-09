import { spawnSync } from "node:child_process";

const res = spawnSync("npx", ["tsx", "apps/api/src/modules/importer/cli.ts"], {
  stdio: "inherit",
  shell: true
});
process.exit(res.status ?? 0);
