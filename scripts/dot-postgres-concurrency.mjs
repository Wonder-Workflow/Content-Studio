import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFixtureMigrationSQL } from "../connectors/dot-mcp/sql-fixture.mjs";

export const TARGET = Object.freeze({ host: "127.0.0.1", port: "55432", database: "content_studio_test", user: "dot_fixture" });
export function psqlPlan(executable, workspace = fileURLToPath(new URL("../../", import.meta.url))) {
  if (!isAbsolute(executable) || !["psql.exe", "psql"].includes(basename(executable).toLowerCase())) throw new Error("Supply an absolute portable psql path");
  const child = relative(workspace, executable);
  if (child.startsWith("..") || isAbsolute(child)) throw new Error("psql must be inside the task workspace");
  return { executable, args: ["-X", "--no-password", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    env: { PGHOST: TARGET.host, PGPORT: TARGET.port, PGDATABASE: TARGET.database, PGUSER: TARGET.user,
      PGPASSWORD: "", PGSERVICEFILE: resolve(workspace, "content-studio-isolated-db/no-service.conf"),
      PGPASSFILE: resolve(workspace, "content-studio-isolated-db/no-password.conf"), PGSSLMODE: "disable" } };
}

function session(plan, sql, appName, hold = false) {
  // Deliberately do not inherit PG* credentials, connection strings or service files.
  const child = spawn(plan.executable, plan.args, { windowsHide: true,
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, ...plan.env, PGAPPNAME: appName }, stdio: "pipe" });
  let stdout = "", stderr = ""; let signalReady;
  const ready = new Promise((resolveReady) => { signalReady = resolveReady; });
  child.stdout.on("data", (chunk) => { stdout += chunk; if (/HOLDER_READY\r?\n/.test(stdout)) signalReady(); });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 15_000);
  const result = new Promise((resolveResult, reject) => {
    child.on("error", reject);
    child.on("close", (code) => { clearTimeout(timer); resolveResult({ code, stdout, stderr }); });
  });
  child.stdin.write(sql + "\n"); if (!hold) child.stdin.end();
  return { ready, result, commit: () => child.stdin.end("COMMIT;\n"), stop: () => child.kill() };
}
function jsonRows(output) { return output.split(/\r?\n/).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line)); }
async function query(plan, sql) {
  const result = await session(plan, sql, "dot_fixture_inspector").result;
  assert.equal(result.code, 0, result.stderr); return result.stdout.trim();
}

async function race(plan, firstSQL, secondSQL, secondFails = false) {
  const holder = session(plan, `BEGIN; ${firstSQL}\n\\echo HOLDER_READY`, "dot_fixture_holder", true);
  let contender;
  try {
    await Promise.race([holder.ready, holder.result.then(() => { throw new Error("Holder ended before barrier"); })]);
    contender = session(plan, `SET lock_timeout='8s'; ${secondSQL}`, "dot_fixture_contender");
    // Observe actual server lock waiting, not merely overlapping Promise calls.
    let blocked = false;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      if (await query(plan, "select count(*) from pg_stat_activity where application_name='dot_fixture_contender' and wait_event_type='Lock';") === "1") { blocked = true; break; }
      await new Promise((done) => setTimeout(done, 50));
    }
    assert.equal(blocked, true, "Contender did not demonstrably wait on a database lock");
    holder.commit();
    const [a, b] = await Promise.all([holder.result, contender.result]);
    assert.equal(a.code, 0, a.stderr);
    if (secondFails) { assert.notEqual(b.code, 0); assert.match(b.stderr, /already claimed/); }
    else assert.equal(b.code, 0, b.stderr);
    return [jsonRows(a.stdout).at(-1), jsonRows(b.stdout).at(-1)];
  } finally { holder.stop(); contender?.stop(); }
}

export async function runConcurrency(plan) {
  assert.equal(await query(plan, "select current_database();"), TARGET.database);
  const existing = await query(plan, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and c.relkind in ('r','p','v','m');");
  assert.equal(existing, "0", "Target must be a fresh empty disposable database; refusing existing tables");
  await query(plan, await readFixtureMigrationSQL());
  const client = randomUUID(), agency = randomUUID(), post = randomUUID(), job = randomUUID(), worker = randomUUID();
  await query(plan, `insert into clients values ('${client}','${agency}'); insert into posts values ('${post}','${client}','Carousel');
    insert into art_jobs(id,post_id,client_id,agency_id) values ('${job}','${post}','${client}','${agency}');`);
  const [claim] = await race(plan, `select claim_dot_art_job('${job}','${worker}');`, `select claim_dot_art_job('${job}','${randomUUID()}');`, true);
  assert.equal(claim.attempt_count, 1);
  const media = claim.expected_positions.map((position) => ({ id: randomUUID(), position, storage_path: `fixture/${position}.png`, mime_type: "image/png", byte_size: 12 }));
  const sql = `select complete_dot_art_job('${job}','carousel','${JSON.stringify(media)}'::jsonb,'${worker}','${"a".repeat(64)}');`;
  const [complete, replay] = await race(plan, sql, sql);
  assert.deepEqual(replay.media, complete.media); assert.equal(replay.replayed, true);
  assert.equal(await query(plan, "select count(*) from post_media;"), "10");
  const retryPost = randomUUID(), retryJob = randomUUID(), a = randomUUID(), b = randomUUID(), c = randomUUID();
  await query(plan, `insert into posts values ('${retryPost}','${client}','Post'); insert into art_jobs(id,post_id,client_id,agency_id) values ('${retryJob}','${retryPost}','${client}','${agency}');
    select claim_dot_art_job('${retryJob}','${a}'); select fail_dot_art_job('${retryJob}','${a}','fixture interruption',true);
    select claim_dot_art_job('${retryJob}','${b}'); update art_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='${retryJob}';
    select claim_dot_art_job('${retryJob}','${c}'); select fail_dot_art_job('${retryJob}','${c}','fixture interruption',true);`);
  assert.equal(await query(plan, `select status || ':' || attempt_count from art_jobs where id='${retryJob}';`), "failed:3");
  return { duplicateClaim: "passed with observed lock waiting", completionReplay: "passed with observed lock waiting", interruptedRetry: "failed after three attempts as expected", target: TARGET };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv[2] === "--plan") {
    console.log(JSON.stringify({ target: TARGET, prerequisite: "Approved portable PostgreSQL 17 cluster, empty database, loopback only", runsAutomatically: false }, null, 2));
  } else {
    if (process.argv.length !== 5 || process.argv[2] !== "--psql" || process.argv[4] !== "--ack-disposable") throw new Error("Use --plan, or --psql <workspace portable psql path> --ack-disposable after explicit approval");
    console.log(JSON.stringify(await runConcurrency(psqlPlan(process.argv[3])), null, 2));
  }
}
