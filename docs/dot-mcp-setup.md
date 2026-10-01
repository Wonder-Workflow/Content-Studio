# DOT connector — local review

This document describes the optional official-SDK **stdio MCP bridge**, plus callback and
database changes. Nothing is installed in a host, connected, applied remotely,
or deployed. The OpenAPI file is a custom-GPT Actions contract; importing it does
not install an MCP server or give a Slack agent file access.

## What the bridge supports

`connectors/dot-mcp/server.mjs` exposes six tools: read-only job status,
claim, renew, complete from actual local files, complete from real HTTPS URLs,
and failure/release. It calls the existing app routes using the existing
callback bearer. Only the app holds its existing Supabase service-role key;
the bridge never needs a Supabase key or an OpenAI key. It does not generate
images, invoke a model, or add a paid service.

An MCP host that supports local stdio can launch this bridge. A cloud ChatGPT
or Slack runtime cannot read this computer's filesystem through stdio. Before
calling this DOT-connected, verify its actual host supports this transport and
can invoke these tools. A disabled remote Streamable HTTP adapter is now prepared
in the existing app. For the cloud target, see [cloud MCP architecture and blockers](dot-cloud-mcp.md).
OAuth enablement, installation and deployment remain separately approved work.

## Setup after explicit integration approval

Review/apply `supabase/migrations/20261001003318_dot_art_leases.sql` together with
the callback release. The old unleased completion RPC is removed. Existing
workers must switch from GET-to-start to POST claim. Members can still queue and
read art jobs; they can no longer directly update the lifecycle. Review on an
isolated Supabase database before any production migration.

Install the bridge's locked dependencies with `npm ci` inside
`connectors/dot-mcp`. Configure the host to launch `node` with the absolute path
to `server.mjs`. Supply these values through the host's protected environment,
never in tracked files, tool arguments, screenshots, or logs:

```text
DOT_STUDIO_ORIGIN=<APP_ORIGIN>
DOT_ART_CALLBACK_SECRET=<EXISTING_CALLBACK_BEARER>
DOT_IMAGE_ROOT=<EXPLICIT_ALLOWED_IMAGE_OUTPUT_FOLDER>
```

`APP_ORIGIN` must be a plain HTTPS origin, without credentials, path, query, or
fragment. Loopback HTTP is allowed solely for local testing. There is no default
production destination. Leave credentials unset during review. Do not generate,
rotate, reveal, or configure credentials as part of this local preparation.

The callback bearer retains the existing studio-wide scope. Do not distribute it
to an untrusted host or client portal. A per-user remote connector would need a
separate authorization design. The bridge sends credentials only to the selected
origin and refuses HTTP redirects.

## Worker sequence and retries

1. Read status if needed; GET never claims or writes.
2. Choose a fresh UUID `lease_token`, then claim. Retry an interrupted claim with
   the same token. Generate only when the response includes your active lease.
   A 409 means stop; another worker or a finished job owns the outcome.
3. Keep the token and frozen `expected_positions` with the artifacts. A lease
   lasts 15 minutes. Renew before expiry while working. A spent token cannot be
   reused for another attempt; after release/expiry, claim with a new token.
4. Send **all** expected images in order in one completion. A carousel expects
   ten images, or all slots that were empty when first claimed. Held/replacement
   jobs expect the complete set. Partial or extra sets are rejected. Held images
   stay pending for the existing accept/keep review flow.
5. If the completion response is interrupted, read status and retry the same
   token with identical ordered file bytes or URL descriptors. A saved success
   returns its original media IDs. A changed payload is rejected. Keep the
   original files/URLs until the result is confirmed; the bridge does not keep a
   durable local job journal.
6. For a recoverable failure, send `retryable: true` with your active token. This
   releases the job to queued, for at most three total claimed attempts. Permanent
   failures use false. Repeated failure for the same last token returns the saved
   response without releasing a newer worker. A crashed worker becomes claimable
   after expiry; there is no background auto-runner. A fourth claim after three
   expired attempts marks the job failed without generating again.

Validation errors leave the active lease available for a corrected completion.
Transient image-download/storage errors release for bounded retry. Unknown
database/transport outcomes return 503 and retain the lease so callers can retry
the same completion safely. A DB replay after concurrent uploads removes only
that request's unused new objects. A definite transaction rejection also cleans
up its new objects. An uncertain DB commit or process crash can leave unreferenced
private storage objects: cleanup requires a separately reviewed reconciliation,
because deleting on an unknown commit could destroy images already on the pack.

## Small social images and real file delivery

The app's private `post-media` bucket and existing PNG/JPEG/WebP checks are reused.
No per-image upload/finalize redesign is added.

[Vercel limits the entire Function request/response payload to 4.5 MB](https://vercel.com/docs/functions/limitations#request-body-size),
not 4.5 MB per image. The bridge and callbacks cap JSON requests at **4,000,000
bytes** for headroom. Base64 adds roughly one third to file size, so the entire
raw set should stay below roughly 3 MB, with further room for JSON. For a ten-slide
carousel, aim around 250 KB per image or less, then let the bridge check the exact
encoded request. Compress/resize actual social images before transfer, or use
real expiring HTTPS image URLs that the existing downloader can reach. Do not
send one slide per completion: that would finalize too early.

`art_job_complete_files` opens real regular files, verifies they resolve inside
the explicitly allowed image folder, checks PNG/JPEG/WebP signatures, encodes
their bytes in backend code, and sends the complete set. Local fixture tests
verify the bytes arrive unchanged and a missing/outside file is refused.
The model must receive real artifact paths from an image tool running in the
same accessible filesystem. A model-written filename, `sandbox:` link, ChatGPT
attachment URL, or model-written base64 is not proof of a deliverable. Native
ChatGPT generated-image handoff to DOT is **not verified** by this preparation.
If that runtime only displays an image without tool-accessible bytes or a real
HTTPS download URL, file delivery remains blocked until a supported bridge or
manual file export is selected. No image was generated to test this.

## Local verification

```text
npm test
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
cd connectors/dot-mcp
npm test
```

For a sandbox that blocks Node's test child processes, the application suite can
run with `node --experimental-strip-types --import ./scripts/register-test-alias.mjs
--test --test-isolation=none src/lib/*.test.ts`. The protocol test needs a local
child process and a loopback mock server. All test credentials and jobs are
synthetic. SQL tests use PGlite embedded PostgreSQL with isolated fixtures, not
Supabase or live storage. PGlite serializes queries; these tests validate SQL
behavior but do not replace a multi-connection PostgreSQL/Supabase concurrency,
RLS, and migration smoke test before release.

Sources: [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x)
and [Supabase RPC reference](https://supabase.com/docs/reference/javascript/rpc).
