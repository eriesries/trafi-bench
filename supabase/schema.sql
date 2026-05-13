-- =====================================================================
-- Benchmark Studio — Supabase schema
-- Run this entire file inside your Supabase project's SQL editor.
-- Safe to re-run: every CREATE uses IF NOT EXISTS / ON CONFLICT.
-- =====================================================================

create extension if not exists pgcrypto;

-- ------------------------------- tables -------------------------------

create table if not exists public.benchmarks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null,
  summary     text,
  owner       text,
  status      text not null default 'draft'
              check (status in ('draft','in-review','published','archived')),
  criteria    text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.competitors (
  id            uuid primary key default gen_random_uuid(),
  benchmark_id  uuid not null references public.benchmarks(id) on delete cascade,
  name          text not null,
  website       text,
  logo_url      text,
  tagline       text,
  description   text,
  tier          text not null default 'emerging'
                check (tier in ('leader','challenger','niche','emerging')),
  founded       text,
  hq_location   text,
  pricing       jsonb not null default '[]'::jsonb,
  strengths     text[] not null default '{}',
  weaknesses    text[] not null default '{}',
  features      jsonb not null default '[]'::jsonb,
  sections      text[] not null default '{}',
  overall_score numeric,
  notes         text,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.screens (
  id                  uuid primary key default gen_random_uuid(),
  competitor_id       uuid not null references public.competitors(id) on delete cascade,
  title               text not null,
  section             text,
  image_url           text not null,
  image_storage_path  text not null,
  source_url          text,
  additional_images   jsonb not null default '[]'::jsonb,
  ai_summary          text,
  features            jsonb not null default '[]'::jsonb,
  notes               text,
  analysis_status     text not null default 'idle'
                      check (analysis_status in ('idle','analyzing','done','error')),
  analysis_error      text,
  analyzed_with       text,
  position            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- If you already ran the original schema, add the new columns manually:
alter table public.screens add column if not exists source_url text;
alter table public.screens add column if not exists additional_images jsonb not null default '[]'::jsonb;
alter table public.screens add column if not exists section text;
alter table public.competitors add column if not exists sections text[] not null default '{}';

create index if not exists competitors_benchmark_id_idx on public.competitors(benchmark_id);
create index if not exists screens_competitor_id_idx    on public.screens(competitor_id);
create index if not exists benchmarks_updated_at_idx    on public.benchmarks(updated_at desc);

-- ---------------------------- updated_at -----------------------------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.benchmarks;
create trigger set_updated_at before update on public.benchmarks
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.competitors;
create trigger set_updated_at before update on public.competitors
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.screens;
create trigger set_updated_at before update on public.screens
  for each row execute function public.set_updated_at();

-- ---------------------- RLS (open: publishable key) -------------------

alter table public.benchmarks  enable row level security;
alter table public.competitors enable row level security;
alter table public.screens     enable row level security;

drop policy if exists "anon all benchmarks"  on public.benchmarks;
create policy        "anon all benchmarks"  on public.benchmarks
  for all using (true) with check (true);

drop policy if exists "anon all competitors" on public.competitors;
create policy        "anon all competitors" on public.competitors
  for all using (true) with check (true);

drop policy if exists "anon all screens"     on public.screens;
create policy        "anon all screens"     on public.screens
  for all using (true) with check (true);

-- ----------------------- Storage bucket -------------------------------

insert into storage.buckets (id, name, public)
values ('screens', 'screens', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "anon read screens bucket"   on storage.objects;
create policy        "anon read screens bucket"   on storage.objects
  for select using (bucket_id = 'screens');

drop policy if exists "anon upload screens bucket" on storage.objects;
create policy        "anon upload screens bucket" on storage.objects
  for insert with check (bucket_id = 'screens');

drop policy if exists "anon update screens bucket" on storage.objects;
create policy        "anon update screens bucket" on storage.objects
  for update using (bucket_id = 'screens')
  with check (bucket_id = 'screens');

drop policy if exists "anon delete screens bucket" on storage.objects;
create policy        "anon delete screens bucket" on storage.objects
  for delete using (bucket_id = 'screens');
