# Existing Studio release checkpoint

Target approved by owner: existing Vercel wonder-workflow/content-studio at
https://content-studio-wonder-workflow.vercel.app, Supabase qgrzqckvoefvstodxuln.
Separate uorpymjhyngxduqkoccd project is unused; leave it intact.
Read-only connector checks confirm main cd75bfbb9962abb7b3fce1d71db9eed77e26888f,
healthy existing DB, first nine migrations present, lease columns absent, old
three-argument complete_dot_art_job present, seven queued jobs and zero processing.
Both existing storage buckets are private. No existing job/client contents read or changed.

Minimal application release is the already verified 45-file connector/reliability
patch, with existing auth/app/storage unchanged and cloud flags disabled until
browser-controlled setup is complete. Do not copy isolated Preview environment
settings or the branch-specific vercel.json guard into a production deployment
plan. The disabled remote branch can stay as review evidence.

Only ordinary new DB migration required is
20261001003318_dot_art_leases.sql. Do not rerun initial nine migrations. Its
replacement of complete_dot_art_job(uuid,text,jsonb) with a leased five-argument
RPC must be coordinated with the callback release: old code cannot complete jobs
after the replacement. No destructive content cleanup or resetting seven queued
jobs is needed. Coordinate a short callback/worker pause, confirm no processing
jobs, apply migration, deploy verified code using EXISTING app settings, verify,
then resume only the identified test-client job. Ordinary UI/media remain intact.
A code-only rollback needs the compatible RPC restored; do not delete lease
columns or receipts to roll back. No migration/deployment executed in this step.

Browser/owner setup: existing Supabase server-only key/callback secret remain
private; no local secret reads/copies. Configure existing-project OAuth/one host
client/approved owner/callback URLs and the client-owner-resource hook only after
coordinating with parent. Preserve existing token hook and signing compatibility;
do not blindly replace hooks or rotate active signing keys. DOT_MCP_ORIGIN uses
the existing Studio HTTPS origin. Host-issued signed scope/resource/refresh and
actual file download origins remain verification gates. No new paid API.

Slack: current code already queues then posts via chat.postMessage with job ID
and pack reference. Missing DOT_SLACK_BOT_TOKEN needs owner private entry;
DOT_SLACK_CHANNEL_ID already exists according to parent. Verify bot membership
and existing Slack/DOT message-event wake subscription before any test. A Slack
accepted message does not prove DOT woke, and a deployed MCP does not schedule it.
Do not add an unrelated webhook/cron/automation or assume @ChatGPT is DOT.

Need parent-provided exact test-client ID plus approved OAuth owner UUID before
fixture/test mutation. Owner/RLS checks already protect MCP jobs, but current
code has no client-specific allowlist; constrain the actual test invocation to
that identified client and never select one of the seven queued jobs by guess.
Use existing generated PNG for one single-image test job, verify checksum and
replay saved receipt. No manual UI upload counts as art-job completion. No new
image generation. Full-carousel correctness remains as tested locally.

Local tests/build already passed; no implementation changes justify rerunning
those suites at this read-only checkpoint. Await coordinated migration/code
release route, secure owner settings, identified test client and event-wake proof.

## Additive compatibility update (supersedes the RPC replacement warning above)

Lease completion is now named public.complete_dot_art_job_v2(uuid,text,jsonb,uuid,text).
Migration preserves the legacy public.complete_dot_art_job(uuid,text,jsonb).
New callback and both SQL harnesses call v2. Connector suite passes 15 tests,
including legacy-signature preservation; application suite passes 76; TypeScript passes.
The previous native concurrent run used the old five-argument name; it was not
repeated after the naming change. PGlite contention/replay fixtures passed with v2.

Read-only pre-release check: zero processing jobs and seven queued. Applying
migration dot_art_leases_additive_v2 through the existing Studio connector was
rejected by automatic approval review: coordinated timing/callback deployment
still pending, live schema/permissions risk. No migration was applied or retried.
Parent must resolve concrete coordinated release approval; do not bypass review.
Old and leased workers must not run concurrently for the same job even though
both RPC signatures remain available. Preserve queued work without resets.

Client IDs from read-only inventory (none explicitly named test):
Desert Bloom Healthcare f0b5485a-ae81-4fb8-8a25-08ef1f857ba3;
Wonder & Workflow db95fe63-3db7-44ba-8738-5bf41bb1a113;
Xeva Ventures ed9e867a-99e3-4816-bd16-1d4afb23edcb;
Zion White Bison Resort f481fc1a-236d-460e-bacc-d8dbea09610b.
No client chosen by inference and no content modified.

Browser exact values: consent path /oauth/consent; MCP URL
https://content-studio-wonder-workflow.vercel.app/api/dot/mcp;
DOT_MCP_ORIGIN=https://content-studio-wonder-workflow.vercel.app;
DOT_MCP_OWNER_USER_ID=fa40e52e-1cc0-4695-a263-7d197743188e;
hook public.dot_mcp_access_token_hook(jsonb). Keep enabled/consent false until
verified configuration, approved host client and signed scope/resource are ready.
Client UUIDs, exact host redirect array and actual file-rule origins/path prefixes
must come from verified setup, not guesses. Preserve existing Auth redirects.

Additive migration now applied successfully with explicit coordinated-release
approval. Read-only verification confirms both legacy/v2 signatures, v2 restricted
to service_role, seven queued jobs and zero processing. No job data mutated.
Public discovery-only bootstrap added: DOT_MCP_DISCOVERY_ENABLED=true exposes
protected-resource metadata and a 401 OAuth challenge before client/callback
registration. DOT_MCP_ENABLED=false and DOT_MCP_CONSENT_ENABLED=false keep all
job tools/consent unavailable, even with a bearer token. No private metadata or
unauthenticated tool execution. Origin is the canonical existing app; issuer is
existing qgrzqckvoefvstodxuln Auth. No guessed callbacks or unrestricted DCR.
Production release tree excludes the isolated branch's vercel.json guard.
