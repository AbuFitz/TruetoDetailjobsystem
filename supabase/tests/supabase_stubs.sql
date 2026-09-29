-- Minimal stand-ins for the parts of Supabase the migrations touch, so they
-- can be applied to a plain local Postgres for testing. Never run this
-- against a real Supabase project.
-- Supabase installs extensions into their own schema and puts it on the
-- default search_path; mirror that so path-pinned functions behave the same.
create schema extensions;
create extension pgcrypto with schema extensions;
alter database postgres set search_path = "$user", public, extensions;
set search_path = "$user", public, extensions;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public, extensions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud varchar, role varchar,
  email text,
  encrypted_password text,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  confirmation_token varchar, recovery_token varchar, email_change_token_new varchar, email_change varchar,
  email_change_token_current varchar default '', phone_change text default '', phone_change_token varchar default '',
  reauthentication_token varchar default '',
  is_sso_user boolean not null default false, is_anonymous boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null, provider text not null, identity_data jsonb not null,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
  email text generated always as (lower(identity_data ->> 'email')) stored
);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);

-- Tests set the signed-in user with: set local request.jwt.claim.sub = '<uuid>'
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, allowed_mime_types text[], file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
