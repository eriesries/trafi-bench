# trafi-bench

Competitor-benchmark workspace. Capture screenshots of competitor admin /
backoffice screens, let GPT-4o Vision describe every visible feature, then
edit / categorize / compare them across competitors. All data lives in
Supabase (Postgres + Storage).

## Stack

- **Vite + React 19 + TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** components
- **Zustand** for state, **React Router v7** for routing
- **Supabase** (Postgres + Storage) for persistence
- **OpenAI Vision API** for screenshot analysis (`gpt-4o-mini` by default)

## Local setup

```bash
# 1. Install deps
npm install

# 2. Configure env vars
cp .env.example .env.local
# then edit .env.local and paste your real keys

# 3. Set up Supabase schema (one-off — see "Supabase" below)

# 4. Run the dev server
npm run dev
```

The app starts on http://localhost:5173.

### Environment variables

See [`.env.example`](./.env.example) for the full list. Quick recap:

| Variable                         | Required | What it is                                                                 |
| -------------------------------- | -------- | -------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`              | yes      | Your Supabase project URL                                                  |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | yes      | Supabase publishable (anon) key — used directly in the browser             |
| `VITE_OPENAI_API_KEY`            | yes      | OpenAI API key with access to a vision model                               |
| `VITE_OPENAI_MODEL`              | no       | Override the default model (`gpt-4o-mini`)                                 |

> **Never commit `.env.local`**. It is git-ignored. Share real values with
> teammates through a password manager (1Password, Bitwarden, Vault, etc.).

## Supabase

The full schema is in [`supabase/schema.sql`](./supabase/schema.sql). Open
the Supabase **SQL Editor** and run it once on a fresh project. The file
is idempotent and also contains `alter table … add column if not exists`
snippets for incremental migrations — re-run the bottom section whenever
the schema changes.

Tables: `benchmarks`, `competitors`, `screens`. Storage bucket: `screens`
(public read; uploads happen from the browser via the publishable key
and are gated by storage RLS).

## Build

```bash
npm run build      # type-check + Vite production build
npm run preview    # serve dist/
```

## Deploying

Any static host works (Vercel, Netlify, Cloudflare Pages, GitHub Pages
behind an action…). Configure the four `VITE_*` env vars in the host's
dashboard — **do not** bake them into committed files.
