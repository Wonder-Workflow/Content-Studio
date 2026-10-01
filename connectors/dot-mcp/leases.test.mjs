import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { readFixtureMigrationSQL } from "./sql-fixture.mjs";

// Isolated embedded PostgreSQL. No project keys, URLs, or live jobs.
async function database(format = "Carousel", hold = false, replace = false) {
  const db = new PGlite();
  await db.exec(await readFixtureMigrationSQL());
  const id = randomUUID(), post = randomUUID(), client = randomUUID(), agency = randomUUID();
  await db.query("insert into clients values ($1,$2)", [client, agency]);
  await db.query("insert into posts values ($1,$2,$3)", [post, client, format]);
  await db.query("insert into art_jobs(id,post_id,client_id,agency_id,hold_media,replace_media) values($1,$2,$3,$4,$5,$6)", [id, post, client, agency, hold, replace]);
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].result;
  const claim = (token) => scalar("select claim_dot_art_job($1,$2) as result", [id, token]);
  const fail = (token, retryable = true) => scalar("select fail_dot_art_job($1,$2,'interrupted',$3) as result", [id, token, retryable]);
  const rows = (positions, tag = "one") => positions.map((position) => ({ id: randomUUID(), position, storage_path: `${tag}/${position}.png`, mime_type: "image/png", byte_size: 12 }));
  const complete = (token, media, hash = "a".repeat(64), kind = format === "Carousel" ? "carousel" : "static") => scalar("select complete_dot_art_job($1,$2,$3::jsonb,$4,$5) as result", [id, kind, JSON.stringify(media), token, hash]);
  const state = async () => (await db.query("select * from art_jobs where id=$1", [id])).rows[0];
  const expire = () => db.query("update art_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1", [id]);
  return { db, id, post, client, claim, fail, rows, complete, state, expire, scalar };
}

test("duplicate claims, same-token claim replay, renewal, expiry and stale completion", async () => {
  const f = await database();
  try {
    const a = randomUUID(), b = randomUUID();
    const results = await Promise.allSettled([f.claim(a), f.claim(b)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    const claimed = await f.claim(a);
    assert.equal(claimed.attempt_count, 1);
    assert.equal((await f.claim(a)).lease_expires_at, claimed.lease_expires_at);
    await f.scalar("select renew_dot_art_job($1,$2) as result", [f.id, a]);
    await f.expire();
    await assert.rejects(f.claim(a), /expired/);
    await assert.rejects(f.scalar("select renew_dot_art_job($1,$2) as result", [f.id, a]), /active matching lease/);
    await f.claim(b);
    await assert.rejects(f.complete(a, f.rows(claimed.expected_positions)), /active matching lease/);
    assert.equal((await f.state()).attempt_count, 2);
  } finally { await f.db.close(); }
});

test("full carousel required; completion replay returns saved media without new inserts", async () => {
  const f = await database();
  try {
    const token = randomUUID();
    const claim = await f.claim(token);
    await assert.rejects(f.complete(token, f.rows([0])), /full expected image set/);
    assert.equal((await f.state()).status, "processing");
    const media = f.rows(claim.expected_positions);
    const result = await f.complete(token, media);
    const repeated = await f.complete(token, f.rows(claim.expected_positions, "duplicate"));
    assert.deepEqual(repeated.media, result.media);
    assert.equal(repeated.replayed, true);
    assert.equal((await f.db.query("select count(*)::int as count from post_media")).rows[0].count, 10);
    await assert.rejects(f.complete(token, media, "b".repeat(64)), /different completion/);
    await assert.rejects(f.complete(randomUUID(), media), /different completion/);
    assert.ok((await f.state()).completed_at);
  } finally { await f.db.close(); }
});

test("recoverable interruption retries are bounded; repeated failure cannot release another worker", async () => {
  const f = await database("Post");
  try {
    const a = randomUUID(), b = randomUUID(), c = randomUUID();
    await f.claim(a);
    assert.equal((await f.fail(a)).status, "queued");
    await assert.rejects(f.claim(a), /expired/);
    await f.claim(b);
    assert.equal((await f.fail(a)).status, "queued");
    assert.equal((await f.state()).status, "processing");
    assert.equal((await f.state()).lease_token, b);
    await f.expire();
    await f.claim(c);
    assert.equal((await f.fail(c)).status, "failed");
    await assert.rejects(f.claim(randomUUID()), /already finished/);
    assert.equal((await f.state()).attempt_count, 3);
  } finally { await f.db.close(); }
});

test("third expired attempt becomes terminal instead of starting a fourth generation", async () => {
  const f = await database("Post");
  try {
    for (let n = 0; n < 3; n++) { await f.claim(randomUUID()); await f.expire(); }
    assert.equal((await f.claim(randomUUID())).status, "failed");
    assert.equal((await f.state()).attempt_count, 3);
  } finally { await f.db.close(); }
});

test("held replacement leaves existing images; empty-slot claims freeze the expected count", async () => {
  for (const hold of [false, true]) {
    const f = await database("Carousel", hold);
    try {
      await f.db.query("insert into post_media values($1,$2,$3,'carousel',0,'existing.png','image/png',12,'upload')", [randomUUID(), f.post, f.client]);
      const token = randomUUID();
      const claim = await f.claim(token);
      assert.equal(claim.expected_positions.length, hold ? 10 : 9);
      await f.complete(token, f.rows(claim.expected_positions));
      const count = (table) => f.scalar(`select count(*)::int as result from ${table}`);
      assert.equal(await count("post_media"), hold ? 1 : 10);
      assert.equal(await count("art_pending_media"), hold ? 10 : 0);
    } finally { await f.db.close(); }
  }
});

test("rejected write rolls back replacement and completion; signed-in members cannot mutate lifecycle", async () => {
  const f = await database("Post", false, true);
  try {
    await f.db.query("insert into post_media values($1,$2,$3,'static',0,'existing.png','image/png',12,'upload')", [randomUUID(), f.post, f.client]);
    const token = randomUUID();
    await f.claim(token);
    const bad = f.rows([0]); bad[0].byte_size = -1;
    await assert.rejects(f.complete(token, bad), /check constraint/);
    assert.equal((await f.state()).status, "processing");
    assert.equal((await f.db.query("select storage_path from post_media")).rows[0].storage_path, "existing.png");
    await f.db.exec("set role authenticated");
    await assert.rejects(f.claim(randomUUID()), /permission denied/);
    await assert.rejects(f.db.query("update art_jobs set status='done'"), /permission denied/);
    await assert.rejects(f.db.query("insert into art_jobs(id,lease_token) values($1,$2)", [randomUUID(), token]), /permission denied/);
  } finally { await f.db.close(); }
});

test("format change after interruption and filled slots retire the old job instead of blocking requeue", async () => {
  const changed = await database("Carousel");
  try {
    await changed.claim(randomUUID()); await changed.expire();
    await changed.db.query("update posts set format='Post' where id=$1", [changed.post]);
    assert.equal((await changed.claim(randomUUID())).status, "failed");
    assert.equal((await changed.state()).status, "failed");
  } finally { await changed.db.close(); }
  const filled = await database("Post");
  try {
    await filled.db.query("insert into post_media values($1,$2,$3,'static',0,'existing.png','image/png',12,'upload')", [randomUUID(), filled.post, filled.client]);
    assert.equal((await filled.claim(randomUUID())).status, "failed");
    assert.equal((await filled.state()).attempt_count, 0);
  } finally { await filled.db.close(); }
});
