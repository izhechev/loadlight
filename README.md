# LoadLight

LoadLight is a task planner that helps you see how much time your plans will take. Write a note, review the tasks it produces, and adjust deadlines and time estimates before saving. The dashboard shows what’s due and how much work you have left.

## Try it locally

Use [Node.js 20.9 or later](https://nextjs.org/docs/app/getting-started/installation).

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000) and choose **Try without an account** on the sign-in page. In guest mode, your tasks are stored in the browser and task suggestions use local rules. It works without API keys.

## Set up accounts and Gemini

1. Copy [`.env.example`](.env.example) to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. For a new Supabase database, run the SQL block in [`lib/db/schema.ts`](lib/db/schema.ts) in the Supabase SQL Editor. For an existing database, check [`supabase/MIGRATIONS.sql`](supabase/MIGRATIONS.sql) and apply any recurrence changes you’re missing.
3. Enable email sign-in in Supabase Auth. Add `http://localhost:3000/auth/callback` for local development and your production callback to the [allowed redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
4. To enable Gemini, apply the AI quota block in [`supabase/MIGRATIONS.sql`](supabase/MIGRATIONS.sql) and set the server-only `GOOGLE_API_KEY`. LoadLight uses [Gemini 3.5 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite). Gemini requests require a signed-in account and are limited to 20 app requests per account every 10 minutes.

## Development

```sh
npm run lint
npm test
npm run build
```

See [Operations and management](docs/operations-and-management.md) for deployment and monitoring.
