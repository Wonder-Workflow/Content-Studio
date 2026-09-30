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
- Download a GoHighLevel Social Planner Advance CSV for a client’s packs
- Open a client’s Brand tab, pull a brand from website and social links, and edit the one brand profile for that client
- Open Shot list, filter the shoot dates, and print the posts that are in creation

What is not in this version:

- Video upload, or a cover image taken from a video. Reel covers are images you upload yourself
- Generated art, including ChatGPT DOT. `MEDIA_SOURCES` in `src/lib/media.ts` is `upload` only
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

Find the Supabase values in the dashboard under **Project Settings → API**. Find the webhook URL and sender key in the Grok Bot desktop app, on the routine that should research the brand.

This app does not call OpenAI, Anthropic, or any other model API for brand generation. The webhook only wakes the bot. A 2xx response means the bot started. It does not mean the notes are written yet.

This version does not use the service role key inside the Next.js app. Leave it out of the app and out of `NEXT_PUBLIC_` variables. Anyone who can read a `NEXT_PUBLIC_` value can use it from the browser. The Grok Bot writes `clients.brand` and `brand_jobs.status` with the Supabase service role, or with Supabase MCP on Ian’s connection. That connection lives outside this repo.

`.env.local` is gitignored. `.env.example` only has placeholders.

## Apply the database migration

The schema lives in `supabase/migrations/`. It creates:

- `agencies` — the studio
- `agency_members` — who belongs to it (`user_id`, `agency_id`, no role)
- `clients` — a board (`name`, `slug`, `brand` JSON)
- `posts` — calendar slots on a client (`starts_on`, optional `ends_on`, status, title, hook, type, platform, and a `pack` JSON body)
- `post_media` — images on a post (carousel, static, or cover) stored in the private `post-media` bucket

Row Level Security is on. A member can see and edit every client in their own studio, and the posts on those clients. They cannot see another studio. People cannot insert themselves into a studio. The first insert into `agencies` adds the signed-in user as a member. Teammates are added later by email, and only if they already have an account.

### Option A — SQL editor (no CLI)

1. Open the Supabase project.
2. Go to **SQL Editor → New query**.
3. Paste each file in `supabase/migrations/` in name order, one query at a time. If the earlier files are already applied, run only the ones you have not applied yet. The calendar uses `20260929234500_posts.sql`. Packs add `20260930013000_posts_pack.sql`. Brand adds `20260930120000_clients_brand_shape.sql`. Before that brand file, run `select id, name, brand from public.clients where brand <> '{}'::jsonb;`. Each row must already match the brand shape (or you clear it). This app did not write brand before that migration. Brand pulls add `20260930150000_brand_jobs.sql` after the brand shape file. That file also allows optional hex `colors` on `clients.brand`. Post images add `20260930183000_post_media.sql` after the pack file. It creates `post_media` and the private `post-media` storage bucket. Pack text fields on `posts` are unchanged.
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
| `thumbnailUrl` | The cover image, when one is saved. You upload that image yourself. |
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
src/app/auth/confirm/     email link / magic link return
src/proxy.ts              refreshes the Supabase session cookie
src/lib/supabase/         browser client, server client, env check
src/components/           forms and the shell
supabase/migrations/      SQL
supabase/config.toml      local Supabase CLI config
```

Protected pages check the signed-in user on the server. The proxy only refreshes the session cookie so people stay signed in. A forged cookie is not treated as a user.
