# Local DOT preparation

Repository: `https://github.com/Wonder-Workflow/Content-Studio.git`

Checkout: `C:\Users\12505\Documents\Codex\2026-09-30\task-2\content-studio-local-review`

Branch: `local/dot-connector-reliability`

Baseline/HEAD: `cd75bfbb9962abb7b3fce1d71db9eed77e26888f` (changes uncommitted).
The checkout was newly cloned into a non-existing folder; no existing work was
replaced. Repository AGENTS.md and the installed Next.js route-handler guide
were read. No repository `.agents/skills` directory or ancestor AGENTS.md was
found. The Supabase skill was used; its CLI generated the migration filename.

## Behavior

- Status GET no longer starts work. Atomic row-locked claim gives an exclusive
  15-minute lease and freezes the expected positions. Same-token claim replay
  preserves the attempt count; renew extends only an active matching lease.
- Expired/released tokens cannot complete or acquire another attempt. Recoverable
  failure requeues; three claims exhaust the job. A changed format or already
  filled target retires a stale job so the open-job index cannot block requeue.
- Completion requires exactly the full expected set. It atomically writes the
  existing media/pending-media tables and records a hash and success receipt.
  Identical retries return original media IDs; changed payloads are refused.
- Existing held-image acceptance remains. Definite rejected uploads are cleaned
  up; unknown DB commit outcomes retain files rather than delete committed media.
- Five remote Streamable HTTP tools, protected-resource discovery, owner-scoped
  OAuth validation and constrained host-file delivery are prepared but disabled.
  Portable plugin templates are included. See [cloud readiness gaps](dot-cloud-mcp.md).
- Six optional official-SDK stdio MCP tools reuse the existing callback bearer and private
  storage. Real local image bytes are read within an explicitly allowed folder;
  no generation, image model, OpenAI key, paid API, or upload redesign is added.
- Total JSON requests are capped at 4 MB. Setup documents the Vercel 4.5 MB total
  ceiling, base64 overhead, and the requirement to send a carousel as one set.

## Changed files

```text
.gitignore
README.md
package.json
package-lock.json
docs/dot-art-openapi.yaml
docs/dot-mcp-setup.md
docs/dot-local-review.md
docs/dot-cloud-mcp.md
docs/dot-isolated-integration.md
docs/dot-postgres-attempt.md
docs/dot-postgres-validation.md
src/lib/art-callback.ts
src/lib/art-lease.ts
src/lib/art-lease.test.ts
src/lib/dot-mcp-config.ts
src/lib/dot-mcp-auth.ts
src/lib/dot-mcp-files.ts
src/lib/dot-mcp.ts
src/lib/dot-mcp.test.ts
src/lib/dot-consent.ts
src/lib/dot-consent.test.ts
src/lib/supabase/proxy.ts
src/app/api/dot/art-jobs/[id]/claim/route.ts
src/app/api/dot/art-jobs/[id]/renew/route.ts
src/app/api/dot/mcp/route.ts
src/app/.well-known/oauth-protected-resource/route.ts
src/app/oauth/consent/page.tsx
src/app/oauth/consent/actions.ts
supabase/migrations/20261001003318_dot_art_leases.sql
supabase/templates/dot_mcp_access_token_hook.sql
scripts/dot-postgres-concurrency.mjs
scripts/dot-postgres-concurrency.test.mjs
connectors/content-studio-dot-cloud/plugin.json
connectors/content-studio-dot-cloud/mcp.json
connectors/content-studio-dot-cloud/skills/dot-art-jobs/SKILL.md
connectors/dot-mcp/package.json
connectors/dot-mcp/package-lock.json
connectors/dot-mcp/server.mjs
connectors/dot-mcp/client.mjs
connectors/dot-mcp/client.test.mjs
connectors/dot-mcp/leases.test.mjs
connectors/dot-mcp/protocol.test.mjs
connectors/dot-mcp/sql-fixture.mjs
connectors/dot-mcp/oauth-hook.test.mjs
```

## Validation and release limits

Application suite: 76 passing tests, including cloud configuration, OAuth-policy,
mock signature-verifier, transport, host-file, interruption and consent checks.
The native harness's target/path guard test passes without running PostgreSQL.
Connector suite: 14 passing tests. Three embedded hook tests validate inert
placeholders, resource binding without changing audience/scope, and
Auth-admin-only execution. Other connector tests include
duplicate claim/replay, expiry/stale completion, interrupted retry exhaustion,
partial-carousel rejection, completion replay, replacement rollback, held media,
lifecycle permission denial, changed-format recovery, actual file-byte transfer,
total body limit, and an official SDK stdio handshake with loopback-only HTTP.
Type generation and TypeScript checks passed. Lint and optimized build passed.
OpenAPI YAML and required mutation/lease fields were checked locally.
The root tests used Node's single-process `--test-isolation=none` mode; connector
tests used ordinary `npm test`, now with `--test-concurrency=1`. An initial
parallel connector run alongside the build exhausted memory; the final serial
run passed all 14 tests. No live jobs or production credentials were used.
Plugin JSON was reviewed against the official portable schemas; OpenAI host scan,
OAuth token issuance, real DNS/TLS file transfer and cloud file propagation are
not established by mocked local tests.

Embedded SQL tests use PGlite with synthetic fixtures and serialize queries.
The approved native PostgreSQL run now establishes independent-session lock
waiting for claims and completion replay. Neither suite proves full existing
RLS, private-storage integration or migration compatibility on an actual
Supabase instance. Those still need the separate isolated cloud stage before
release. Existing workers must migrate to the claim protocol with this release.

DOT's actual ChatGPT/Slack runtime and native generated-file handoff remain
unverified. A disabled remote adapter is now included; real resource-bound OAuth
tokens, consent/client setup and host-generated-file propagation remain unverified.
See [cloud architecture and verification gaps](dot-cloud-mcp.md).
Crash/uncertain-commit orphan cleanup needs reviewed reconciliation, not blind
deletion. No connector installation, credential configuration, push, deployment,
production request, remote migration, or image generation was performed.

After the historical disk-space failure, the approved portable PostgreSQL retry
passed actual independent-session claims/completion replay and bounded interrupted
retry, with observed lock waiting. Shutdown was independently verified and both
disposable clusters removed. See [native evidence](dot-postgres-validation.md).
Only the harness's process environment/barrier handling changed in this stage.
Cloud account/OAuth/client/preview setup, full Supabase RLS/private storage and
all production changes remain separate decisions.

Preview reconciliation: remote main and local HEAD remain cd75bfbb9962abb7b3fce1d71db9eed77e26888f. The refreshed application suite passes 76 tests. See [preview prerequisites and exact secure configuration](dot-preview-readiness.md). No account setup, push or deployment occurred. Production Supabase qgrzqckvoefvstodxuln is excluded; authoritative isolated target/configuration is pending from the parent.
Refreshed connector suite: 14 passing; native target guard: one passing. Route type generation, TypeScript, lint, optimized build and diff whitespace checks also pass. No new database/server was started during preview reconciliation.
