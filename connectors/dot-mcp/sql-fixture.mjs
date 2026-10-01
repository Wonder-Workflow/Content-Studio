import { readFile } from "node:fs/promises";

// Synthetic prerequisites only: this does not model full Supabase RLS or Auth.
export const fixtureBootstrapSQL = `
create role anon; create role authenticated; create role service_role;
create schema private; create schema auth;
create function auth.uid() returns uuid language sql as 'select null::uuid';
create function private.can_access_client(uuid) returns boolean language sql as 'select true';
create table clients (id uuid primary key, agency_id uuid);
create table posts (id uuid primary key, client_id uuid, format text);
create table art_jobs (
  id uuid primary key, client_id uuid, post_id uuid, agency_id uuid, created_by uuid,
  brief text, replace_media boolean default false, hold_media boolean default false,
  batch_id uuid, status text default 'queued', error text,
  created_at timestamptz default now(), updated_at timestamptz default now(), completed_at timestamptz);
create unique index art_jobs_one_open_per_post_idx on art_jobs(post_id) where status in ('queued','processing');
create table post_media (id uuid primary key, post_id uuid, client_id uuid, kind text, position integer,
  storage_path text not null unique, mime_type text not null, byte_size integer check (byte_size > 0), source text,
  unique(post_id, kind, position));
create table art_pending_media (like post_media including all);
alter table art_pending_media add column art_job_id uuid;
create policy art_jobs_insert_member on art_jobs for insert to authenticated with check (true);
grant select, insert, update on art_jobs to authenticated;
create function complete_dot_art_job(uuid, text, jsonb) returns void language sql as 'select';
`;

export async function readFixtureMigrationSQL() {
  const original = await readFile(new URL("../../supabase/migrations/20260930203000_art_jobs.sql", import.meta.url), "utf8");
  const start = original.indexOf("create or replace function private.art_jobs_set_timestamps()");
  const end = original.indexOf("revoke all on function private.art_jobs_guard()");
  if (start < 0 || end < start) throw new Error("Fixture prerequisite markers changed; review before running");
  return fixtureBootstrapSQL + original.slice(start, end)
    + await readFile(new URL("../../supabase/migrations/20261001003318_dot_art_leases.sql", import.meta.url), "utf8");
}
