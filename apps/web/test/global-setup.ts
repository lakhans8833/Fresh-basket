import { execFileSync } from "node:child_process";
import path from "node:path";

/** Recreate a throwaway database from the real migrations + seed before the run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/freshbasket_test";
  execFileSync("bash", [path.resolve(__dirname, "../../../scripts/local-db.sh"), "--reset"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
