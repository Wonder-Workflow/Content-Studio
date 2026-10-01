# Cloud MCP preparation — disabled, not connected

The prepared cloud bridge is part of the existing Next.js/Vercel app:
`POST /api/dot/mcp` uses the official MCP SDK's stateless Streamable HTTP
transport. It is separate from the optional local stdio helper. Five tools read,
claim, renew, complete and fail jobs; all reuse the existing callback handlers,
private storage and database lease/receipt logic. There is no image-model API
or OpenAI key dependency. No deployment, OAuth enablement, client creation,
installation, production request or remote migration has occurred.

`connectors/content-studio-dot-cloud` contains a portable plugin manifest,
Streamable HTTP MCP configuration and workflow skill. Its `.invalid` URL is an
explicit placeholder; this package is not ready to install. The old OpenAPI
document remains a custom-GPT Actions description, not the cloud connector.

## Authentication and configuration review

Hosted plugins require [OAuth 2.1](https://developers.openai.com/plugins/build/auth).
The adapter publishes protected-resource discovery and a 401 challenge. Every
tool declares OAuth `openid` scope and its compatibility metadata mirror.
It verifies the Supabase signature using asymmetric signing keys, exact issuer,
resource binding, expiry/issued/not-before times, scope, permitted OAuth client,
non-anonymous configured owner and current user. User-scoped RLS plus
`created_by` checks precede every privileged callback. The existing callback
bearer stays server-only; no Supabase service key is exposed to MCP or clients.
`openid` is an identity scope, not a database permission; owner/RLS checks supply
the authorization policy. Access tokens retain their expiry window; immediate
session revocation is not established by `getUser` alone.

Configuration names for future review, with placeholders only:

```text
DOT_MCP_ENABLED=false
DOT_MCP_ORIGIN=https://<APP_HOST>
DOT_MCP_OWNER_USER_ID=<APPROVED_OWNER_USER_UUID>
DOT_MCP_CLIENT_IDS=<APPROVED_OAUTH_CLIENT_UUIDS_COMMA_SEPARATED>
DOT_MCP_FILE_RULES=[{"origin":"https://<VERIFIED_FILE_HOST>","path_prefix":"/<VERIFIED_GENERATED_FILE_PREFIX>/"}]
```

Existing Supabase URL/public anon key and internal callback configuration are
reused. No new secrets are listed or created. Missing/invalid cloud configuration
returns 503 and does not access jobs. Do not enable it merely by filling these
fields: OAuth and host-file verification below must succeed first.

[Supabase's MCP OAuth guide](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
documents discovery, PKCE and dynamic registration. Its sample audience is
`authenticated`, and its supported scopes are standard OIDC scopes. This adapter
requires the canonical MCP URL in signed `aud`, or signed `resource` alongside
Supabase's `authenticated` audience, plus signed `openid` scope. An ordinary
Studio cookie/access token without resource binding is insufficient. A verified
project configuration/token hook, authorization/consent UI, approved client
registration policy and actual resource/scope token evidence are still required.
An inactive client/owner-specific hook template and consent UI are now prepared;
see [their constraints and exact isolated test plan](dot-isolated-integration.md).
No OAuth server or hook was enabled. Supabase documents
OAuth availability without a separate feature charge, but ordinary MAU, database,
storage and hosting usage still count; this project's feature availability and
billing have not been inspected.

## Actual generated-file handoff

The completion tool follows the official
[file-input contract](https://developers.openai.com/plugins/reference#define-file-inputs):
top-level `images` is listed in `_meta["openai/fileParams"]`, each item declares
`download_url`, `file_id`, `mime_type`, `file_name`, and only the first two are
required. The host must supply real authorized references. A model-written URL,
file ID or base64 is not a supported substitute.

The backend checks owner/job/lease and complete expected count first. It accepts
only configured exact HTTPS origins and narrow path prefixes, rejects IP URLs,
private/reserved DNS answers and redirects, and pins the checked IPv4 address for
the TLS request. It forwards no OAuth bearer, cookie or callback secret. Actual
downloaded image bytes are validated and encoded inside the backend for the
existing completion handler. `file_id` is an opaque host label, not a
cryptographic ownership proof; the temporary URL's capability, verified host
contract, configured owner and job scope are the trust boundary. Do not broaden
the allowlist to arbitrary public URLs. Exact generated-file host/path behavior
and whether a stronger ownership attestation is needed remain unverified.

The parent reports a successful built-in image smoke test: a real 1,207,960-byte,
1254×1254 PNG saved as Library `libfile_fbac9da4dc6481918d93d64ec7f88aa9`, SHA256
`d36054fbc950422b7dab25da9103cf9f8b14e29a4b7a9ab6efda66535b23faa7`.
This proves bytes are recoverable in the parent cloud, not that dot's MCP host
passes that file into this connector. No Studio call was part of that test.

Total raw images are capped at 2.9 MB; backend base64 expands them to about
3.87 MB under the existing 4 MB JSON cap. Vercel's total request ceiling is
4.5 MB. Send a whole carousel once, compressing each image sufficiently; do not
finalize per-image or redesign uploads. Expired URLs need fresh host references
to the same bytes. Interrupted downloads leave the lease intact for retry or
expiry; database retries remain bounded and completed bytes replay the receipt.

## Remaining evidence and next approval

Local fixture tests exercise transport, descriptors, OAuth policy, file guards,
owner/lease/full-set checks and interrupted transfer. Embedded PostgreSQL tests
exercise the migration's duplicate claim, expired retry and replay transactions.
PGlite serializes queries. The subsequently approved portable PostgreSQL stage
now passes real independent-session lock/contention tests and verified shutdown;
see [native evidence](dot-postgres-validation.md). It still uses synthetic Auth/RLS.

Cloud readiness requires actual resource-bound tokens and signed scope, initial
and repeat consent verification, host file-input propagation and exact allowlist
verification, then isolated job/storage testing and release review. The native
harness stage is complete; cloud scope remains detailed in
[the isolated test plan](dot-isolated-integration.md). Do not claim installed,
connected or deployed.
