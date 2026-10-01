import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { psqlPlan, TARGET } from "./dot-postgres-concurrency.mjs";

test("native harness fixes the disposable loopback target and refuses executable paths outside workspace", () => {
  const workspace = resolve("fixture-workspace");
  const plan = psqlPlan(resolve(workspace, "pg17/bin/psql.exe"), workspace);
  assert.deepEqual(TARGET, { host: "127.0.0.1", port: "55432", database: "content_studio_test", user: "dot_fixture" });
  assert.equal(plan.env.PGHOST, "127.0.0.1"); assert.equal(plan.env.PGDATABASE, "content_studio_test");
  assert.equal(plan.env.PGPASSWORD, ""); assert.equal(Object.hasOwn(plan.env, "PGSERVICE"), false); assert.ok(plan.args.includes("--no-password"));
  assert.throws(() => psqlPlan("psql.exe", workspace), /absolute/);
  assert.throws(() => psqlPlan(resolve(workspace, "../outside/psql.exe"), workspace), /inside/);
  assert.throws(() => psqlPlan(resolve(workspace, "pg17/bin/other.exe"), workspace), /psql/);
});
