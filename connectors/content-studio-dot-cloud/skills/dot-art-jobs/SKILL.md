---
name: dot-art-jobs
description: Process an explicitly requested owned Content Studio art job and deliver real generated image files.
---

Read `art_job_status` first; reading does not claim work. Claim with a fresh UUID
lease token. Reuse that token for the same active worker, renew before expiry,
and stop if another worker owns the lease. After interruption, inspect status;
do not start duplicate generation while another lease remains active.

Use the job brief and its frozen expected positions. Deliver exactly the entire
ordered image set to `art_job_complete` in one call. Never complete an individual
carousel slide. Use actual host-provided file inputs; never invent a download
URL, file ID, local path, or model-written base64. A Library ID alone does not
prove that the host can pass the file to this tool.

Keep the total raw image set below 2.9 MB. Prefer small compressed social images.
If the full carousel cannot fit, stop and report the size limitation. Replaying
completion with the same actual bytes and lease returns the recorded receipt.
If temporary download references expire, request fresh host references to the
same files. For recoverable failure, use `art_job_fail` with `retryable: true`;
claims are bounded to three attempts. Never configure credentials or deploy.
