# Preview readiness — local preparation only

## Verified checkout and compatibility

Checkout: `C:\Users\12505\Documents\Codex\2026-09-30\task-2\content-studio-local-review`.
Branch: `local/dot-connector-reliability`. Origin:
`https://github.com/Wonder-Workflow/Content-Studio.git`.
Local HEAD and the read-only remote-main check both remain
`cd75bfbb9962abb7b3fce1d71db9eed77e26888f`; no overnight changes or rebase are needed.
All prepared changes remain uncommitted. Existing local work was preserved.

The parent identifies the existing Vercel target as `wonder-workflow/content-studio`.
Production Supabase `qgrzqckvoefvstodxuln` is excluded from all writes.
These account mappings are parent-supplied, not established by tracked configuration.
The approved separate Wonder-Workflow test project's reference and cost quote are
still pending. Stop if provisioning needs payment or a Vercel upgrade.

## First preview: disabled connector, no OAuth setup

Wait for the parent's verified test target/configuration before any push or deploy.
Use the existing Vercel project and an explicit **Preview** target. Do not create a
new Vercel project, deploy to Production, merge to main, or assign a production alias.
Vercel documents that the first CLI deployment to a new project can be Production;
absence of `--prod` alone is not a sufficient safeguard.

The existing app has no general production-project guard. Preview deployments can
inherit project Preview environment variables, and public Next.js variables are
baked in at build time. Before upload, the owner must inspect branch-specific build
and runtime settings securely and replace inherited integrations with blank or
verified test-only settings. Never download production environment variables with
`vercel pull`, reuse production keys, or print secret values. A runtime override
cannot repair a production URL already baked into a build.

No `.env` variant was present in this checkout during readiness verification.
The first fixture-free preview can leave Supabase unset and both MCP flags false:
MCP and discovery should return 503, consent 404. This verifies deployment and
fail-closed behavior only, not a connected connector or job/storage integration.

## Exact settings and who enters them

| Setting | Initial preview | Later isolated integration |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Blank, or verified test URL | Owner enters `https://<TEST_PROJECT_REF>.supabase.co`; exclude production ref |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Blank, or test public key | Owner securely enters the test public/anon-compatible key; repository currently uses this variable name |
| `SUPABASE_SERVICE_ROLE_KEY` | Blank | Owner securely enters test server-only key if job/private-storage tests are authorized; never expose to client/MCP |
| `DOT_ART_CALLBACK_SECRET` | Blank | A separate test secret and secure entry require authorization; never reuse production bearer |
| `DOT_MCP_ENABLED`, `DOT_MCP_CONSENT_ENABLED` | `false`, `false` | Enable only after separately approved OAuth configuration and verification |
| `DOT_MCP_ORIGIN` | Unset | Exact stable test-preview HTTPS origin, no path |
| `DOT_MCP_OWNER_USER_ID` | Unset | Approved test Auth user's UUID, never production identity assumed |
| `DOT_MCP_CLIENT_IDS` | Unset | Approved test OAuth client UUIDs; creating clients/grants is separately gated |
| `DOT_MCP_FILE_RULES` | Unset | JSON exact verified host origins and narrow path prefixes; no guessed/wildcard download host |
| `DOT_MCP_REDIRECT_URIS` | Unset | JSON exact registered test client callback URLs |
| Slack/Grok/other outbound integration settings | Blank | Keep disabled for synthetic fixtures |

Enter secrets through the owner's secure Dashboard or an authorized connector,
not chat, command arguments, committed files, or logs. No OpenAI key is required.
No Vercel token or database password needs to be handed to this local task when
owner Dashboard/authorized connector actions suffice. No credentials were created
or configured here. OAuth server, asymmetric signing, consent, client registration,
resource-binding hook activation and user grants remain separate permission gates.
Do not disable project-wide deployment protection for host access; resolve any
preview protection restriction with the owner for this isolated target only.

## Synthetic fixture stage after target verification

Apply the repository's real migrations only to the confirmed new empty test
project, through the approved parent-controlled route. The native harness's
`sql-fixture.mjs` creates synthetic Auth/RLS structures and roles: **never apply
that bootstrap to hosted Supabase**. Full hosted RLS/storage compatibility remains
untested.

An agency creation trigger requires `auth.uid()` and real Auth membership. Use an
existing approved test identity; do not forge an Auth user, bypass/drop triggers,
or weaken RLS to seed fixtures. If no test identity exists, its credential/user
setup must be explicitly resolved before fixture creation.

Create only synthetic agency/client records, one single-image Post, one ten-slot
Carousel, and their corresponding art jobs, with fake briefs and approved test
ownership. Verify read-only status; competing claims; stale token rejection;
lease expiry/retry exhaustion; full-count finalization; replay receipt identity;
private held media; and owner/RLS denial. Delete only identified test fixtures
through the approved test-project route after recording nonsecret results.

The already generated PNG is 1,207,960 bytes, SHA256
`d36054fbc950422b7dab25da9103cf9f8b14e29a4b7a9ab6efda66535b23faa7`,
Library `libfile_fbac9da4dc6481918d93d64ec7f88aa9`. It fits a single Post transfer.
Ten copies exceed the 2.9 MB raw-set cap; use existing tiny fixture images for a
synthetic carousel or a separately approved sufficiently small actual set. Never
finish a carousel per image. Vercel's total 4.5 MB request ceiling still applies.

Actual PNG bytes were recovered in the parent cloud; propagation through hosted
MCP file inputs is still unverified. Connecting the host requires separately
approved OAuth grants. Verify actual `download_url`/`file_id` references and exact
allowlist before enabling downloads. No invented paths or model-written base64.

## Pending gates

The owner has approved the separate test project and preview stage; this document
does not ask for that approval again. Execution awaits the parent's authoritative
test reference, cost outcome, existing Vercel target/settings verification, secure
test-only configuration and permitted publication route. Push/deploy remain paused
until those arrive. New secrets, Auth identity setup, OAuth clients/grants/hook
activation, plugin installation and production release are not covered by this
local preparation. No account setup, installation or deployment happened here.

Official deployment/environment behavior:
[Vercel deploy CLI](https://vercel.com/docs/cli/deploy),
[environments](https://vercel.com/docs/deployments/environments),
[environment variables](https://vercel.com/docs/environment-variables).


Local readiness validation refreshed: 76 application tests, 14 connector tests and one native-harness guard pass. Route type generation, TypeScript, lint, optimized Next.js build and git diff whitespace checks pass. The earlier three-case native independent-session PostgreSQL run remains recorded in dot-postgres-validation.md; no database server was restarted for this reconciliation.

## Authorized isolated setup checkpoint

The parent verified test project `uorpymjhyngxduqkoccd` (`content-studio-dot-test`),
Wonder-Workflow org `oruwhtafdkkvrxaaywrv`, ACTIVE_HEALTHY in ca-central-1.
The WonderWorkflow connector independently confirmed the same identity and empty
public schema/migration history before applying ordinary application migrations.
This supersedes the earlier pending-project note above. Production remains excluded.

Publication branch: `local/dot-connector-reliability`. Before pushing, the parent
must confirm the existing `wonder-workflow/content-studio` Git integration routes
this branch exclusively to Preview and has branch-specific build/runtime overrides:

- `NEXT_PUBLIC_SUPABASE_URL=https://uorpymjhyngxduqkoccd.supabase.co`.
- Owner privately enters TEST-only `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, and a separate `DOT_ART_CALLBACK_SECRET`.
- `DOT_MCP_ENABLED=false`, `DOT_MCP_CONSENT_ENABLED=false` initially.
- `DOT_SLACK_BOT_TOKEN`, `DOT_SLACK_CHANNEL_ID`, `BRAND_BOT_WEBHOOK_URL`,
  `BRAND_BOT_WEBHOOK_SECRET` blank/removed for this branch. No inherited outbound
  integration credentials or other production values may reach its build/runtime.
- No Production environment edits, production alias, main merge, or project creation.

If settings cannot be installed before a Git push, suspend automatic deployments
for this branch through owner-controlled Vercel settings before pushing; only
trigger its Preview after secure configuration is complete. Do not infer isolation
from the absence of --prod, and do not download environment values to audit them.
No Vercel connector is available to this task; secure settings and route confirmation
require the parent/owner. No new upgrade/payment is authorized.

The owner has now authorized test login/OAuth/plugin/private-key entry and separate
branch/Preview publication as a bundled stage. Those are pending execution, not
completed. Initial disabled Preview comes first; then establish its stable origin,
configure one approved test owner/client/redirect and resource-binding hook, register
its private host connection, verify actual host file references, and enable gates.
Stop rather than weaken signed-scope/resource, RLS, or file-origin checks if the
real provider/host contract fails. Secret values never go into chat or Git.

First deployment clarification from the parent's browser scope-only inspection:
only the two public Supabase variables are All Environments and need exact-branch
Preview overrides. Existing server/service, callback, webhook and Slack variables
are Production-only. Keep those absent in the first Preview: no test server key or
new callback secret is needed for the disabled initial deployment. The minimum
four Preview overrides are the TEST URL, privately entered TEST public key,
`DOT_MCP_ENABLED=false`, `DOT_MCP_CONSENT_ENABLED=false`, on precisely
`local/dot-connector-reliability`. Later job/OAuth probes need the remaining secure
settings under the already approved bundled stage.

All ten ordinary application migrations succeeded in order on the isolated test
project. MCP assigned application-time migration versions (20261001204355 through
20261001204548), preserving names and file contents rather than original filename
versions. Future CLI migration-history reconciliation must account for that mapping;
do not blindly push migrations again. Security advisors returned no lints. The
four claim/renew/fail/complete RPCs deny anon/authenticated execution and permit
service_role. No OAuth hook was registered or applied as part of this schema stage.
Read-only hosted verification also confirms all 11 public tables have RLS enabled and both post-media and batch-references buckets are private. No test user, fixture job, upload, OAuth configuration or secret entry was performed in the schema step.
