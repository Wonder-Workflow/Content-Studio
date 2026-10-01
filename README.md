# Content Studio

Content Studio is an agency content calendar. The team signs in, shares one studio, and keeps a board for each client. Every seat is equal. There are no roles in this version.

This repository is a new app. It does not copy the Netlify pilot, and it does not move any live data.

What you can do now:

- Sign in with email and password, or with an email magic link
- Log out
- Create a studio the first time you sign in
- Add client boards
- Add a teammate who already has an account
- Open a client calendar, add a post, and change its date, range, status, and hook
- Open a post’s pack and edit the hook, shot list and angles, caption, call to action, and images
- Ask DOT to fill empty image slots on a pack (carousel, post or story image, or reel cover)
- Generate a batch of draft packs for a client (a week, two weeks, a month, or a custom range), then revise one pack or the whole batch
- Download a GoHighLevel Social Planner Advance CSV for a client’s packs
- Open a client’s Brand tab, pull a brand from website and social links, and edit the one brand profile for that client
- Open Shot list, filter the shoot dates, and print the posts that are in creation

What is not in this version:

- Video upload, or a cover image taken from a video
- Calling OpenAI, the Images API, or any other paid image model from this app. DOT draws the images outside Vercel
- A logo on the brand
- Netlify Blobs, or any connection to the old pilot

Each client row has a `brand` JSON column. It starts as `{}`. The Brand tab is the editor. There is no second brand store.

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` (see below), apply the database migration, then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run build` checks the production build. `npm run lint` runs ESLint. `npm test` runs the lib tests.

## Environment variables

| Name | Where it goes | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` and Vercel | Project URL, like `https://abcdef.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` and Vercel | The anon key, or the newer publishable key. Safe to expose to the browser. |
| `BRAND_BOT_WEBHOOK_URL` | `.env.local` and Vercel, server only | Grok Bot routine URL (“POST to”). Not a `NEXT_PUBLIC_` variable. |
| `BRAND_BOT_WEBHOOK_SECRET` | `.env.local` and Vercel, server only | Grok Bot sender key. The app sends `Authorization: Bearer <this key>`. Paste the key only, not the word Bearer. |
| `DOT_SLACK_BOT_TOKEN` | `.env.local` and Vercel, server only | Slack bot token that posts an art job to DOT. Optional. Not a `NEXT_PUBLIC_` variable. |
| `DOT_SLACK_CHANNEL_ID` | `.env.local` and Vercel, server only | Production value is `C0C5S889VTL` (`#content` in `agents-wby7363.slack.com`). If the token is set and this is blank, the app uses that channel. |
| `DOT_ART_CALLBACK_SECRET` | Vercel Production, server only | Bearer secret for `/api/dot/art-jobs/*`. Required before DOT can call back. |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel Production, server only | Used only by those DOT routes to write the private `post-media` bucket. Studio pages do not use it. |

Find the Supabase values in the dashboard under **Project Settings → API**. Find the webhook URL and sender key in the Grok Bot desktop app, on the routine that should research the brand.

This app does not call OpenAI, Anthropic, or any other model API. Brand research is a webhook that only wakes the Grok Bot. Image generation is a job for DOT. A 2xx response from Slack or the brand webhook means the message was accepted. It does not mean the notes or the images are saved yet.

Studio pages use the anon key and the signed-in member. They do not use the service role key. The DOT image routes are the exception: `/api/dot/art-jobs` writes the private `post-media` bucket with `SUPABASE_SERVICE_ROLE_KEY` after the bearer secret matches. Never put that key, the Slack token, or the callback secret in a `NEXT_PUBLIC_` variable. Anyone who can read a `NEXT_PUBLIC_` value can use it from the browser. The Grok Bot still writes `clients.brand` and `brand_jobs.status` from outside this repo. Brand pulls do not use the DOT variables, and DOT does not use the brand bot variables.

`.env.local` is gitignored. `.env.example` lists the names. Secrets stay blank there. `DOT_SLACK_CHANNEL_ID` is set to the production channel `C0C5S889VTL`.

## Apply the database migration

The schema lives in `supabase/migrations/`. It creates:

- `agencies` — the studio
- `agency_members` — who belongs to it (`user_id`, `agency_id`, no role)
- `clients` — a board (`name`, `slug`, `brand` JSON)
- `posts` — calendar slots on a client (`starts_on`, optional `ends_on`, status, title, hook, type, platform, and a `pack` JSON body)
- `post_media` — images on a post (carousel, static, or cover) stored in the private `post-media` bucket
- `art_jobs` — one DOT image request per post (`queued`, `processing`, `done`, or `failed`)
- `batch_jobs` — one Generate batch for a client, with `posts.batch_id` and `art_jobs.batch_id` pointing at it
- `batch_references` — optional style images in the private `batch-references` bucket
- `batch_revisions` — a change request for one pack or the whole batch
- `art_pending_media` — DOT images held until someone accepts them onto the pack

Row Level Security is on. A member can see and edit every client in their own studio, and the posts on those clients. They cannot see another studio. People cannot insert themselves into a studio. The first insert into `agencies` adds the signed-in user as a member. Teammates are added later by email, and only if they already have an account.

### Option A — SQL editor (no CLI)

1. Open the Supabase project.
2. Go to **SQL Editor → New query**.
3. Paste each file in `supabase/migrations/` in name order, one query at a time. If the earlier files are already applied, run only the ones you have not applied yet. The calendar uses `20260929234500_posts.sql`. Packs add `20260930013000_posts_pack.sql`. Brand adds `20260930120000_clients_brand_shape.sql`. Before that brand file, run `select id, name, brand from public.clients where brand <> '{}'::jsonb;`. Each row must already match the brand shape (or you clear it). This app did not write brand before that migration. Brand pulls add `20260930150000_brand_jobs.sql` after the brand shape file. That file also allows optional hex `colors` on `clients.brand`. Post images add `20260930183000_post_media.sql` after the pack file. It creates `post_media` and the private `post-media` storage bucket. DOT art jobs add `20260930203000_art_jobs.sql` after the post image file. That file creates `art_jobs` and allows `source` `dot` on `post_media`. Pack text fields on `posts` are unchanged. Generate batch adds `20260930320000_batch_jobs.sql` after the art job file. That file creates `batch_jobs`, `batch_references`, `batch_revisions`, and `art_pending_media`, and adds `batch_id` on `posts` and `art_jobs`.
4. Run it.

### Option B — Supabase CLI

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from this folder:

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

`your-project-ref` is the id in the project URL (`https://your-project-ref.supabase.co`).

## Supabase Auth setup

In the dashboard, under **Authentication**:

1. **Providers → Email**: leave Email enabled. That covers both password sign-in and magic links.
2. **URL configuration**:
   - Site URL: `http://localhost:3000` while you are developing. Change it to the Vercel URL when you deploy.
   - Add these redirect URLs:
     - `http://localhost:3000/auth/confirm`
     - `https://YOUR-VERCEL-DOMAIN/auth/confirm`
3. Confirm email can stay on. New password accounts get a confirmation email. The link comes back to `/auth/confirm`, which starts the session.

Sign-up order for a teammate: they create an account first, then someone already in the studio adds that email on the studio page.

## Connect Vercel

Ian keeps the deploy.

1. Push this repo to GitHub (the pull request does that).
2. In Vercel, **Add New → Project** and import the GitHub repo. Framework preset is Next.js. Root directory is the repo root.
3. Add the same environment variables as `.env.local` for Production (and Preview, if you want preview logins). Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` before the first deploy. Next.js reads `NEXT_PUBLIC_` values at build time, so if you add them later, redeploy. Add `BRAND_BOT_WEBHOOK_URL` and `BRAND_BOT_WEBHOOK_SECRET` when the Grok Bot routine is ready. Those two are server-only. After you add or change them, redeploy.
4. Deploy.
5. Copy the deployment URL back into Supabase **Authentication → URL configuration** as a redirect URL (`https://YOUR-VERCEL-DOMAIN/auth/confirm`). Add the bare site URL as well if you want it as the Site URL.

No Auth.js setup. No Netlify site. Do not point this app at the old pilot’s database.

## Calendar

Open a client from the studio page. The Calendar tab is the month grid at `/clients/your-client`.

- **Add post** or a day number opens the post. Title, hook, type (Reel, Post, Carousel, Story), platform, and status are saved to Supabase.
- Status colors are Idea, In-creation, Ready, and Published.
- Start date is the day the post sits on. End date is optional. A range shows on every day it covers, up to 62 days.
- Drag a card to another day to move the whole range, or change the dates in the editor.
- Previous, Today, and Next change the month. The month stays in the URL as `?month=2026-09`.
- Refresh the page. The post is still there.
- Brand is edited on the Brand tab. Shot list reads these same posts.

There is no sample calendar data. An empty month is the starting point.

## Packs

A pack is the working copy for one post. It uses the same `posts` row as the calendar. Title, hook, status, type, platform, and dates stay on the row. Shot list and angles, caption, and call to action are stored in `posts.pack`.

Open a pack in either place:

- On the calendar, click a card, then **Open pack**.
- On the Packs tab, click the post.

The pack editor has one hook, plus title, status, type, platform, dates, images, shot list and angles, caption, and call to action. Save, then refresh. The text is still there. Images save when you add, reorder, or remove them, and they are still there after a refresh. The calendar card shows the saved title, status, and dates.

Image slots follow the type:

- **Carousel** — up to 10 images, in order, plus a cover
- **Post** or **Story** — one image, plus a cover
- **Reel** — cover only. Upload the cover yourself. Nothing is grabbed from a video

PNG, JPEG, and WebP only. Each file can be up to 10MB. Video files are rejected.

Signed-in check:

1. Apply `supabase/migrations/20260930013000_posts_pack.sql` if it is not on the database yet.
2. Sign in and open a client that already has a post. If the month is empty, add a post on the calendar first.
3. Open that post’s pack from the calendar card (**Open pack**) or from the Packs tab.
4. Change the hook, title, status, type, platform, dates, shot list and angles, caption, and call to action. Save.
5. Refresh the pack page. The values you typed are still there.
6. Open the calendar on that post’s month. The card shows the saved title and status, and it sits on the saved dates.
7. Open Shot list for that client. The post shows up when its dates overlap the range and its status is In-creation. Brand is a separate tab.
8. Apply `supabase/migrations/20260930183000_post_media.sql` if it is not on the database yet.
9. On the pack, add a PNG or JPEG, refresh, and confirm it is still there. Remove it. A video file is refused.

## GoHighLevel CSV

On a client’s Packs tab, **Download GHL CSV** saves one Advance CSV for every post on that client. In GoHighLevel:

1. Open **Marketing → Social Planner**.
2. Choose **New Post → CSV Upload** (some accounts say **Upload from CSV**).
3. Choose **Advance** (Advanced), not Basic.
4. Upload the file, pick the social accounts, review anything GHL flags, then import.

Upload the file at least 10 minutes before the earliest time in it. GHL accepts 90 posts per file. If the packs page says there are more, split the file first.

The header row is the field-name row from GHL’s Advance sample (`advance-sample.csv`, May 2025). The sample’s first row is only a group label (All Social, Facebook, Instagram, …) and is not in this file. `thumbnailUrl` is included because the 15 May 2026 help article added it. It is placed after `videoUrls (comma-separated)`.

| CSV column | What Content Studio writes |
| --- | --- |
| `postAtSpecificTime (YYYY-MM-DD HH:mm:ss)` | The post’s start date at `09:00:00`. The studio stores a date, not a time. GHL reads that clock time in the location’s timezone. Change it in the file if you need another hour. |
| `content` | The pack caption. The call to action stays in the studio. |
| `imageUrls (comma-separated)` | Carousel images in order, or the single image for a Post or Story. Empty for a Reel. At most 10 URLs, separated by a comma and a space. |
| `videoUrls (comma-separated)` | Always empty. There is no video upload. |
| `thumbnailUrl` | The cover image, when one is saved. Upload it yourself, or let DOT fill a reel cover. |
| `mediaOptimization (true/false)` | Present and empty. |
| `type (post/story/reel)` | The first of these columns is Facebook. The second is Instagram. A post fills only the column for its platform (`Instagram` or `Facebook`). Reel, Story, and Post map to `reel`, `story`, and `post`. A carousel maps to `post`. Other platforms leave both columns empty. |

Image links are signed HTTPS URLs from the private `post-media` bucket. They last 7 days. Import the CSV before they expire. GHL has to be able to fetch the URL without a login.

There is no new public environment variable. Storage uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the migration’s RLS policies.

## Brand

Brand is the one set of notes for a client. It is stored on `clients.brand`. The Brand tab is the only editor. Calendar and packs do not keep a second copy.

A saved profile has these text keys:

- `identity.name` (80), `identity.tagline` (160), `identity.positioning` (400)
- `audience` (800)
- `offers` (2000) — one stay type or service per line
- `voice.tone` (300), `voice.caption_pattern` (2000)
- `do` (2000) and `dont` (2000) — one line per bullet
- `visual_notes` (2000) — light and imagery, text only
- `phrases` (800) — soft calls to action and lines they like
- `colors` — optional hex swatches: `primary`, `secondary`, `accent`, `background`, `text`. Each value is `#RGB` or `#RRGGBB`. The key is omitted when every swatch is blank.

`{}` is the empty brand. The form shows blank fields and placeholders. Save writes every key, including empty strings. Any studio member who can open the client can edit the brand. There is no logo upload.

Signed-in check:

1. Apply `supabase/migrations/20260930120000_clients_brand_shape.sql` if it is not on the database yet. Before you run it, check `select id, name, brand from public.clients where brand <> '{}'::jsonb;`. Every row must already be empty or match the keys above. If one does not, clear it with `update public.clients set brand = '{}'::jsonb where id = '…';` and then run the migration.
2. Sign in, open a client, and open Brand.
3. With the fields empty, choose **Save brand**. Refresh. The fields are still empty, and the page does not error.
4. Fill brand name, tagline, positioning, audience, offers, tone, caption pattern, do, don't, visual notes, and phrases. Save.
5. Refresh. The same text is still there.
6. Open the same client as another studio member. The same brand is there, and that member can change it and save.
7. Optional: fill Primary with `#1B3A4B` (or `#abc`). Save. Refresh. The swatch is still there. A value like `navy` is rejected. Clearing the field and saving removes that swatch.

## Pull brand from links

Above the brand form, **Pull brand from links** queues a `brand_jobs` row and wakes a Grok Bot routine. The bot is not in this repo. It researches the website and social links, then writes `clients.brand`. People still edit and save in the form.

The webhook body is JSON:

```json
{
  "job_id": "…",
  "client_id": "…",
  "website_url": "https://harbor.example/",
  "social_urls": ["https://www.instagram.com/harbor"],
  "regenerate": false,
  "notes": "Optional."
}
```

`notes` is left out when the field is blank. The request header is `Authorization: Bearer <BRAND_BOT_WEBHOOK_SECRET>`. The app waits only for the bot to accept the POST. It does not wait for the research to finish.

Job status is `queued`, `processing`, `done`, or `failed`. The page polls while a pull is queued or running. When it reaches **done**, the page reloads the brand notes. **Refresh brand** does the same thing if the notes still look old.

One completed pull is kept per client. Another **Pull** is refused until **Regenerate**. A failed pull can be tried again. If a pull is already queued or running, a second Pull returns that job instead of creating another. Regenerate marks the open job failed and starts a new one.

If the webhook env vars are missing, the button returns an error and does not insert a row. Ask an admin to set them on Vercel (and in `.env.local` for local runs).

The bot should set `brand_jobs.status` to `processing`, then `done` or `failed`, and write `clients.brand` in the shape above (including optional `colors`). Use the Supabase service role, or Supabase MCP with Ian’s connection. Studio members can also update a job’s status, which is enough to debug a stuck row. Members cannot delete jobs.

Signed-in check:

1. Apply `supabase/migrations/20260930150000_brand_jobs.sql` if it is not on the database yet.
2. Set `BRAND_BOT_WEBHOOK_URL` and `BRAND_BOT_WEBHOOK_SECRET` on the server. Use a routine you can watch, or a request bin, so you can see the POST.
3. Sign in, open a client, and open Brand.
4. Enter a website and, if you want, one social link per line. Choose **Pull brand from links**.
5. In Supabase, `select id, client_id, status, website_url, social_urls, regenerate from public.brand_jobs order by created_at desc limit 5;` shows a `queued` row (or `failed` if the webhook rejected the call). The request bin or the bot’s run history shows the JSON body and `Authorization: Bearer …`.
6. Choose **Pull brand from links** again while that job is still queued. A second row is not created.
7. Mark the row `done` (the bot does this, or you can update it while signed in). The status line says done. Choose **Refresh brand** if the notes have not appeared yet. Edit a field and **Save brand**. Refresh. The edit is still there.
8. With a done job, **Pull brand from links** is replaced by **Regenerate**. Starting it inserts another row with `regenerate` true and wakes the webhook again.
9. Unset the webhook env vars, redeploy or restart, and pull again. The page asks an admin to set `BRAND_BOT_WEBHOOK_URL` and `BRAND_BOT_WEBHOOK_SECRET`, and no new row is created.
10. Open a pack and save it. Shot list, caption, and call to action still save. Those pack fields are unchanged.

## Generate with DOT

On a pack, **Generate with DOT** queues an `art_jobs` row for that post. This app does not call OpenAI, the Images API, or any other image model. DOT makes the images outside Vercel. DOT is the Slack agent and the ChatGPT plugin. It reads the job and sends the images back. They land in the same slots as a manual upload: `post_media` in the private `post-media` bucket. `source` is `dot`. There is not a second media board.

The button uses the saved brand and the saved pack: title, hook, type, platform, shot list and angles, caption, and call to action. Save the pack first if you just edited those. Notes for DOT are optional.

Empty slots are filled. Images already on the pack stay. If every slot for that saved type is full, the page asks you to replace them or skip. Replace clears that type only (carousel slides, the single image, or the reel cover) and saves the new ones. Other slots stay. Skip leaves the pack as it is.

A carousel can take up to 10 slides. A Post or Story uses one image. A Reel uses the cover. One open job per post. If a job is already queued or running, a second click keeps that job.

The status chip says Queued, Processing, Done, or Failed. The page checks while the job is open. When it is done, the new images show on the pack. You can still upload and remove images by hand.

### Slack

Production posts to **#content** in the `agents-wby7363.slack.com` workspace. The channel id is `C0C5S889VTL`.

1. Create a Slack bot that can post in that workspace, and invite it to **#content**.
2. On Vercel Production, and in `.env.local` if you want it locally, set `DOT_SLACK_BOT_TOKEN` to the bot token. Server only. Do not use a `NEXT_PUBLIC_` name.
3. Set `DOT_SLACK_CHANNEL_ID` to `C0C5S889VTL`. If the token is set and the channel id is blank, the app still posts to `C0C5S889VTL`.
4. Choose **Generate with DOT**. The message starts with “DOT, pick up this art job.” It includes the job id, the post id, the client slug, the pack path (`/clients/{slug}/packs/{postId}`), the type, and the brief. A long brief is shortened in Slack. The plugin still gets the full brief.

If the token is missing, the job is still queued. The page says DOT can pull it from the plugin. The brand bot variables are not required.

### ChatGPT custom action

The contract is [`docs/dot-art-openapi.yaml`](docs/dot-art-openapi.yaml). It is an
Actions schema, not an installed plugin. The local stdio MCP bridge, placeholder
setup, real-file handoff requirements, and remaining DOT runtime limitations are
documented in [`docs/dot-mcp-setup.md`](docs/dot-mcp-setup.md). These instructions
describe a future integration after approval; local preparation does not
configure credentials, install a connector, or deploy.

1. In ChatGPT, open the DOT custom GPT, then **Configure → Actions**, and import that file.
2. Set the server URL to the production origin, such as `https://your-studio.vercel.app`. No path after the host.
3. Set authentication to API key, Bearer. Paste the same value you will store in `DOT_ART_CALLBACK_SECRET`.
4. On Vercel Production, set `DOT_ART_CALLBACK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`. Both are server only. The secret is the bearer token on these routes:
   - `GET /api/dot/art-jobs/{id}`
   - `POST /api/dot/art-jobs/{id}/claim`
   - `POST /api/dot/art-jobs/{id}/renew`
   - `POST /api/dot/art-jobs/{id}/complete`
   - `POST /api/dot/art-jobs/{id}/fail`
5. The service role key lets those routes write the private bucket. Studio pages do not use it. Do not add an OpenAI key to this Next app.

`GET` returns the job, brief, brand, pack path, and slots without changing status.
Claim with a client-chosen UUID `lease_token` before generating; retry a claim with
the same token and renew its 15-minute lease before expiry. `complete` requires
that token and the entire expected ordered image set. It returns the saved result
on an identical replay. `fail` requires the token and a `retryable` boolean;
recoverable failures requeue for at most three claimed attempts. The whole JSON
request is capped at 4 MB, below Vercel's 4.5 MB ceiling. The storage limit of
10 MB per file does not override that total request limit.

Signed-in check:

1. Apply `supabase/migrations/20260930203000_art_jobs.sql` if it is not on the database yet.
2. Sign in, open a pack with an empty image slot, and choose **Generate with DOT**.
3. In Supabase, `select id, post_id, status, replace_media from public.art_jobs order by created_at desc limit 5;` shows a queued row.
4. Choose **Generate with DOT** again while that job is queued. A second row is not created.
5. After the lease migration/release is approved and applied, authenticated GET returns the brief without changing status. POST claim obtains the exclusive lease.
6. POST complete with the lease token and the full expected image set. Replay the identical request and confirm the media IDs stay the same. Existing manual images remain when filling empty slots.
7. Fill every slot for that type, then choose **Generate with DOT**. The page asks you to replace or skip. Skip leaves the images. Replace queues a job with `replace_media` true.
8. Unset `DOT_SLACK_BOT_TOKEN` and generate again after the open job is done or failed. The new job is still queued, and the page says Slack is not connected.

## Generate batch

On a client calendar, **Generate batch** opens `/clients/{slug}/batch`. It drafts packs for that client from the saved brand. This app still does not call OpenAI or any image model. Each draft queues an `art_jobs` row, the same contract as **Generate with DOT**.

1. **Window.** 1 week, 2 weeks, or 1 month starts today. Custom dates can cover up to 62 days.
2. **Mix.** Counts per week for carousels, static posts, and reel covers. The defaults are 1 carousel and 3 static posts. A full week uses those counts. A short leftover week is scaled down. Posts are spread across the days in that week.
3. **Look.** A style note, plus optional https links (one per line, up to 8) and up to 4 reference images (PNG, JPEG, or WebP, 10MB each).
4. **Output.** Idea posts on the calendar, with a title, one hook, a shot list, a caption, a call to action, type, and Instagram as the platform. An image job is queued for each pack. If Slack is connected, DOT is asked in #content. If it is not, the jobs stay queued for the plugin.

Open the batch page after it runs. It lists the drafts, the image-job status, and the style note. **Open calendar** jumps to the month the window starts in.

**Revise this batch** on that page sends one note to every pack in the batch. **Revise this pack** on a batch pack sends the note to that pack only. A note about the hook, caption, title, or call to action updates that copy and does not queue images. A note about a slide, tone, color, or other look queues a new art job. If the pack already has images, the new ones wait on the pack. **Use these images** replaces that slot. **Keep current images** discards the new ones. The previous images stay until then.

There is no new environment variable. Reference images use the private `batch-references` bucket from the migration. DOT image callbacks still use `DOT_ART_CALLBACK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`. The server-action body limit is raised so those reference images can upload with the form, the same way a pack image does.

Signed-in check:

1. Apply `supabase/migrations/20260930320000_batch_jobs.sql` if it is not on the database yet.
2. Save a brand on the client (name, offers, tone, and visual notes are enough).
3. On the calendar, choose **Generate batch**. Leave the mix at 1 carousel and 3 static posts, add a style note, and choose **Generate batch**.
4. The batch page lists 4 drafts for a one-week window. The calendar for that month shows them as Idea. In Supabase, `select id, post_id, batch_id, status, hold_media from public.art_jobs order by created_at desc limit 10;` shows one queued row per draft.
5. On the batch page, revise the whole batch with “warmer tones”. Each pack’s shot list includes that note, and a new art job is queued. Revise one pack with “change the hook to Come in from the heat”. That hook changes. A second image job is not queued for a hook-only note.
6. When a pack already has images, a look revision sets `hold_media`. After DOT completes, the pack shows **Use these images** and **Keep current images**. The previous images stay until you choose.

## Shot list

Shot list is the call sheet for one client. It reads the same `posts` rows as the calendar. It does not add a table. Any studio member who can open the client can open the sheet.

The default window is the current month. From and To accept any range up to 366 days, including a range that crosses months. A post is included when its dates overlap that window.

- **In-creation** is included. That is the default, matching the posts that are ready to shoot.
- **Include Ready** adds Ready posts. Idea and Published stay off the sheet.
- Each row shows the date or date range, title, type, platform, hook, and shot list and angles (`posts.pack.shot_list_and_angles`). Caption and call to action stay on the pack.
- **Filmed** checks stay in this browser. They are not saved on the post and they are not shared with the studio.
- **Print** hides the studio header, tabs, and filters so the page can be printed or saved as a PDF.

There is no new migration for this tab. If the calendar and pack migrations are already applied, the sheet can read posts.

Signed-in check:

1. Sign in and open a client.
2. On the calendar, have four posts if you can: an In-creation post in the current month with a hook and a multi-line shot list, a Ready post in that month, an Idea or Published post in that month, and an In-creation post whose dates cross into the month from outside it.
3. Open Shot list with no dates in the URL. The range is the current month. The In-creation posts that overlap it are listed with dates, title, type, platform, hook, and shot list. Ready, Idea, and Published are not listed.
4. Check **Include Ready** and choose **Show shots**. The Ready post appears. Idea and Published still do not.
5. Set From and To to a window with no overlapping posts. The page says nothing to shoot.
6. Set an end date before the start date, or open `?from=nope&to=2026-09-02`. The page explains the range and does not crash. Show shots still works after you pick valid dates.
7. Mark a row **Filmed** and refresh. The check is still there in this browser. Open a private window: that check is not there.
8. Choose **Print**. Preview shows the client name, the date range, and the rows, including filmed checks. The studio header, client tabs, and date filters are not on the page.
9. Open Calendar, a pack, and Brand. Editing and saving still work.

## Project layout

```
src/app/                  pages (login, studio, client boards)
src/app/api/dot/          DOT art job callbacks (bearer secret, no studio session)
src/app/(app)/clients/[slug]/batch/   Generate batch and one batch’s drafts
src/app/auth/confirm/     email link / magic link return
src/proxy.ts              refreshes the Supabase session cookie
src/lib/supabase/         browser client, server client, env check
src/components/           forms and the shell
docs/dot-art-openapi.yaml ChatGPT custom action for DOT
supabase/migrations/      SQL
supabase/config.toml      local Supabase CLI config
```

Protected pages check the signed-in user on the server. The proxy only refreshes the session cookie so people stay signed in. A forged cookie is not treated as a user.
## Prepared cloud DOT connector

The local review branch also prepares a disabled remote Streamable HTTP MCP
adapter in this app, an owner-scoped OAuth gate and portable plugin templates.
See [cloud configuration and verification gaps](docs/dot-cloud-mcp.md).
Nothing is installed, connected or deployed by these changes.
