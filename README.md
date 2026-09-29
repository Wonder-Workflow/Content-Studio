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
- Open a post’s pack and edit the hook, shot list and angles, caption, and call to action

What is not in this version:

- A brand editor or shot list
- Image upload
- Netlify Blobs, or any connection to the old pilot

Each client row has a `brand` JSON column. It starts as `{}` and waits for a later editor.

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

`npm run build` checks the production build. `npm run lint` runs ESLint.

## Environment variables

| Name | Where it goes | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` and Vercel | Project URL, like `https://abcdef.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` and Vercel | The anon key, or the newer publishable key. Safe to expose to the browser. |

Find both in the Supabase dashboard under **Project Settings → API**.

This version does not use the service role key. Leave it out of the app and out of `NEXT_PUBLIC_` variables. Anyone who can read a `NEXT_PUBLIC_` value can use it from the browser.

`.env.local` is gitignored. `.env.example` only has placeholders.

## Apply the database migration

The schema lives in `supabase/migrations/`. It creates:

- `agencies` — the studio
- `agency_members` — who belongs to it (`user_id`, `agency_id`, no role)
- `clients` — a board (`name`, `slug`, `brand` JSON)
- `posts` — calendar slots on a client (`starts_on`, optional `ends_on`, status, title, hook, type, platform, and a `pack` JSON body)

Row Level Security is on. A member can see and edit every client in their own studio, and the posts on those clients. They cannot see another studio. People cannot insert themselves into a studio. The first insert into `agencies` adds the signed-in user as a member. Teammates are added later by email, and only if they already have an account.

### Option A — SQL editor (no CLI)

1. Open the Supabase project.
2. Go to **SQL Editor → New query**.
3. Paste each file in `supabase/migrations/` in name order, one query at a time. If the earlier files are already applied, run only the ones you have not applied yet. The calendar uses `20260929234500_posts.sql`. Packs add `20260930013000_posts_pack.sql`.
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
3. Add the same two environment variables as `.env.local` for Production (and Preview, if you want preview logins). Set them before the first deploy. Next.js reads `NEXT_PUBLIC_` values at build time, so if you add them later, redeploy.
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
- Brand and Shot list stay placeholders.

There is no sample calendar data. An empty month is the starting point.

## Packs

A pack is the working copy for one post. It uses the same `posts` row as the calendar. Title, hook, status, type, platform, and dates stay on the row. Shot list and angles, caption, and call to action are stored in `posts.pack`.

Open a pack in either place:

- On the calendar, click a card, then **Open pack**.
- On the Packs tab, click the post.

The pack editor has one hook, plus title, status, type, platform, dates, shot list and angles, caption, and call to action. Save, then refresh. The text is still there. The calendar card shows the saved title, status, and dates.

Signed-in check:

1. Apply `supabase/migrations/20260930013000_posts_pack.sql` if it is not on the database yet.
2. Sign in and open a client that already has a post. If the month is empty, add a post on the calendar first.
3. Open that post’s pack from the calendar card (**Open pack**) or from the Packs tab.
4. Change the hook, title, status, type, platform, dates, shot list and angles, caption, and call to action. Save.
5. Refresh the pack page. The values you typed are still there.
6. Open the calendar on that post’s month. The card shows the saved title and status, and it sits on the saved dates.
7. Brand and Shot list still show their placeholders.

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
