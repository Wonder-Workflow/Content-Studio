# Approved portable PostgreSQL attempt — blocked by storage

Historical first attempt. After disk cleanup, the authorized retry completed;
see [native test and shutdown evidence](dot-postgres-validation.md).

The owner authorized the portable PostgreSQL stage. That authorization remains;
no repeat approval is needed merely to retry in the existing writable workspace
after adequate disk space is available.

Source verified through the official chain:

- https://www.postgresql.org/download/windows/ links EDB's binary archives.
- https://www.enterprisedb.com/download-postgresql-binaries lists PostgreSQL 17.11
  Windows x64 at https://sbp.enterprisedb.com/getfile.jsp?fileid=1260569.
- That link resolves over HTTPS to
  https://get.enterprisedb.com/postgresql/postgresql-17.11-4-windows-x64-binaries.zip.
- The distributor's HEAD response reports 379,726,839 bytes and a multipart ETag,
  which is not a SHA256 checksum. Attempts to read `.sha256`, `.sha256sum` and
  `.md5` sidecars returned 403; no independent publisher checksum was obtained.

A new workspace directory `../content-studio-isolated-db` was created without
replacing an existing folder. Download failed at 70,936,845 bytes with Windows
"There is not enough space on the disk." The incomplete archive was removed
using its checked literal path. No binary was extracted or executed, cluster
initialized, database created, migration applied or PostgreSQL server started.
The stage directory contains no files. A loopback TCP probe found no listener
on port 55432. After partial-file cleanup, C: reported approximately
116,203,520 bytes free (about 111 MiB) in the final probe, below even the 362 MiB
compressed archive.

Native contention/replay/interruption tests therefore did not run. The harness
was corrected to recognize Windows CRLF in its transaction barrier. Its existing
target/path guard test passed; `git diff --check` passed. This is not evidence
that the native multi-session tests pass. The prior application/embedded test
results and remaining OAuth, consent and generated-file integration gaps stand.

Required direction: make sufficient space available in the authorized workspace,
or authorize a different writable location. The archive alone needs 379.7 MB;
extracted binaries and the disposable cluster need additional space. Recommend
at least 2 GB available as a working allowance, not an independently measured
minimum. No unrelated files or caches were removed to make room. No cloud charge
or persistent credential/service was introduced.
