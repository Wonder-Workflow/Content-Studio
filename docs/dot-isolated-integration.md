# Inactive OAuth and isolated concurrency preparation

No hook is registered, OAuth/client settings enabled, account created, database
started, portable software installed or preview deployed by this patch.
The subsequently approved portable download was blocked by disk space; its
incomplete file was removed. After disk cleanup, the approved retry completed
real independent-session tests and verified shutdown/cleanup. See
[native validation](dot-postgres-validation.md) and [historical attempt](dot-postgres-attempt.md).

## Reviewed token binding

[OpenAI permits a signed `aud` or `resource` binding](https://developers.openai.com/plugins/build/auth).
[Supabase supports client-specific additional JWT claims](https://supabase.com/docs/guides/auth/oauth-server/token-security).
The prepared hook adds an exact `resource` claim for one approved owner/client
while retaining `aud=authenticated` for Supabase Auth and Data APIs. The adapter
accepts that signed combination or an exact MCP audience, and rejects conflicting
resource claims. A normal Supabase token without resource binding still fails.
Signature, issuer, times, signed scope, current owner and OAuth client checks
remain required; the hook does not create a scope to make tests pass.

`supabase/templates/dot_mcp_access_token_hook.sql` is a review template outside
the migration directory. Unreplaced placeholders leave tokens unchanged. The
function only adds resource when the existing claims contain `openid`, the
approved owner/client, normal authenticated audience/role, non-anonymous status
and matching event user. Other clients remain unchanged; an approved client
without valid scope loses any old resource binding. It needs no table access,
HTTP endpoint or service key; only `supabase_auth_admin` can execute it.
Compose it with any existing token hook rather than replace that hook blindly.

The hook maps a client to exactly one canonical resource. It cannot inspect a
`resource` request parameter that the documented hook input does not expose.
Do not claim full RFC 8707 propagation until an isolated authorization, token
and refresh flow with correct/wrong resource parameters verifies it. If the
provider requires stricter request validation, stop and resolve that documented
integration gap; do not weaken the adapter.

The docs say requested scopes enter access tokens, but sample JWTs omit scope.
This hook deliberately stays unavailable if signed scope is missing. Real token
issuance, refresh, `getUser` and user-scoped RLS calls still need verification.
Tests supply synthetic scope-bearing events, not evidence that a project issues
them. No signing keys or access tokens have been created.

## Consent UI

`/oauth/consent` is inactive unless both cloud and consent gates are enabled and
configuration is complete. The page and POST action verify the current owner,
retrieve authorization details from Supabase, check the approved client, matching
authorization ID, supported identity scopes including `openid` and exact
registered redirect URI. The action repeats those checks before approving or
denying; caller form fields do not authorize access. Redirect results are limited
to the registered callback and OAuth response parameters. Client names render
as escaped text; client logos/links are not fetched.

Future placeholders, in addition to the cloud configuration:

```text
DOT_MCP_CONSENT_ENABLED=false
DOT_MCP_REDIRECT_URIS=["https://<EXACT_CALLBACK_FROM_HOST_MANAGEMENT_PAGE>"]
```

Configure the isolated project's authorization path as `/oauth/consent` only
after review. The existing sign-in flow is reused in another tab, preserving the
original consent tab. If authorization details return only an already-approved
redirect, this UI blocks rather than infer the requesting client's identity.
That reconnect case needs provider/host verification before release; a test
grant may need explicitly approved revocation to restart initial consent.

## Native PostgreSQL harness, now executed in the approved isolated stage

`scripts/dot-postgres-concurrency.mjs` imports the same synthetic prerequisites
and actual lease migration as the embedded tests. Its target cannot be changed
through CLI or inherited PG configuration:

```text
host=127.0.0.1 port=55432 database=content_studio_test user=dot_fixture
```

It refuses existing user tables, ignores inherited PostgreSQL password/service
configuration, accepts only an absolute workspace-local psql path, and requires
`--ack-disposable`. It does not initialize, start or stop a cluster, install
software, create a database, read credentials or connect remotely. A separately
approved empty loopback cluster/database must exist first. Windows children are
hidden and bounded; the script leaves synthetic database contents for inspection.

The first session claims while holding a transaction open. The second competes
for that job; a third observes `pg_stat_activity` lock waiting before the first
commits. Exactly one claim must succeed. The same barrier tests two matching
completion calls: both must return the original receipt with ten total rows.
An interrupted/released/expired sequence must exhaust after three claims.
These fixtures stub Auth/RLS prerequisites, so even a native pass would not prove
full Supabase authorization or storage integration.
The approved native run passed these cases and observed actual lock waiting;
see [results and shutdown proof](dot-postgres-validation.md).

Safe plan-only invocation (no process or database started):

```text
node scripts/dot-postgres-concurrency.mjs --plan
```

After the specific permission below, the review command would be:

```text
node scripts/dot-postgres-concurrency.mjs --psql <ABSOLUTE_WORKSPACE_PSQL_EXE> --ack-disposable
```

## Portable stage permission — granted and completed

The owner authorized downloading/extracting the official EDB PostgreSQL 17 x64 binary ZIP
into a new `content-studio-isolated-db` directory under the task workspace;
initialize a disposable cluster with local fixture superuser `dot_fixture`,
loopback-only host authentication, port 55432, and database `content_studio_test`;
run the prepared harness; then stop that process. No Docker, machine-wide
installer, Windows service, firewall change, cloud account, production access or
password is needed. The migration target is only that disposable database; the
harness applies synthetic prerequisites and `20261001003318_dot_art_leases.sql`.
Software/cloud cost is $0. No automatic download/start command is supplied.
That stage is complete; no further PostgreSQL-stage approval is needed.

Cloud proof remains a later, distinct decision: separate Free Supabase test
project, test owner/public PKCE client, reviewed hook/consent configuration,
Vercel test preview and a private host connection. First prove OAuth and real
file-reference/checksum transfer without app migrations or live jobs. Supabase
OAuth/token hooks are available on Free; free project slot and Vercel eligibility
must be confirmed with a $0 additional-spend ceiling. Full synthetic job/storage
testing would subsequently require approving all ten application migrations
only in that separate test project. Production remains excluded.
