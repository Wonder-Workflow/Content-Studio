# Native PostgreSQL validation — completed locally

Repository/branch: Wonder-Workflow/Content-Studio, `local/dot-connector-reliability`.
The authorized retry began with 12,398,559,232 bytes free on C:. The earlier
disk-space blocker was resolved without broadening the approved stage.

## Source and available integrity evidence

The official PostgreSQL Windows downloads page links EDB's binary distribution.
EDB's PostgreSQL 17.11 Windows x64 link
`https://sbp.enterprisedb.com/getfile.jsp?fileid=1260569` resolves to:

```text
https://get.enterprisedb.com/postgresql/postgresql-17.11-4-windows-x64-binaries.zip
```

Downloaded archive size: **379,726,839 bytes**, matching distributor metadata.
Recorded SHA256:

```text
b9424ee7bc60b52450ff910a3630225df32e633f3cb29c1d126d9299d59aea28
```

Archive paths were checked to stay within the new extraction directory before
successful extraction. The archive reports 21,961 entries and 995,717,790 total
uncompressed bytes. No publisher checksum sidecar was available in the checked
locations, and the four PostgreSQL executables report `NotSigned`; the SHA256 is
a local integrity record, not an independently authenticated publisher digest.
Only the official HTTPS distributor was used. Runtime version was confirmed as
PostgreSQL 17.11, x86_64 Windows, msvc-19.44.35228, 64-bit.

## Exact local target and scope

```text
127.0.0.1:55432 / content_studio_test / dot_fixture
```

The running server itself returned `server_address=127.0.0.1`, port `55432`, and
`listen_addresses=127.0.0.1`. No Windows service or machine-wide installation was
created. Only a temporary fixture user without a password was used. Synthetic
prerequisites and `20261001003318_dot_art_leases.sql` were applied in this empty
disposable database. No other application migration, live data, remote database,
OAuth hook, account/client configuration or image job call was used.

## Actual independent-session results

- Competing claim: passed. The observer saw the second session waiting on a
  database lock while the first held its claim transaction open. After commit,
  exactly one distinct worker token claimed the job; attempt count remained one.
- Matching completion replay: passed. The observer again saw a real lock wait.
  After commit, both calls returned the original media IDs, the second reported
  replay, and the entire carousel had exactly ten rows, without duplicate writes.
- Interrupted retry: passed. Recoverable release followed by an expired lease
  and another claim exhausted the job after three attempts (`failed:3`).

The first startup attempt exposed an empty-port environment issue during initdb;
no server started. The next run exposed libpq treating an empty `PGSERVICE` as a
service lookup. That server was stopped successfully in `finally`. Process-only
environment handling was corrected, `PGSERVICE` was omitted from the harness's
curated child environment, and the final run passed in a fresh disposable cluster.
The harness also recognizes Windows CRLF transaction-barrier output.

## Shutdown and cleanup proof

The final wrapper returned:

```json
{"HarnessExit":0,"StopExit":0,"StatusExit":3,"Port55432Listening":false,"PostmasterPidFilePresent":false}
```

`pg_ctl` reported `no server running`. An independent check confirmed both test
clusters had status exit 3 and no PID file; another TCP probe found no listener
on port 55432. The two stopped disposable cluster directories were then removed
using checked absolute paths confined to this stage, leaving no fixture database
or user state. Portable binaries, archive, wrapper and shutdown evidence remain
only in `../content-studio-isolated-db`; no unrelated files were changed.

The harness target/path unit test and syntax/diff checks passed after the local
fix. The application's prior 76 tests, 14 serial connector tests and optimized
build remain applicable; the app implementation was not changed by this stage.

## Remaining integration gaps

These are real PostgreSQL transaction/lock tests with synthetic Auth/RLS
prerequisites. They do not prove complete Supabase RLS, private-storage upload and
unknown-commit reconciliation, OAuth token/resource/signed-scope issuance, repeat
consent, or generated-file propagation through dot cloud. Those require the
separately reviewed cloud test project/preview/client stage, with confirmed
account eligibility and a $0 additional-spend ceiling. Nothing was pushed,
deployed, connected, installed in a host or configured in a cloud account.
