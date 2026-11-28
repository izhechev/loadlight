# LoadLight

LoadLight is a task planner that helps you see how much time your plans will take. Write a note, review the tasks it produces, and adjust deadlines and time estimates before saving. The dashboard shows what’s due and how much work you have left.

## Video walkthroughs

Both recordings use sample tasks in guest mode.

- [Create and review tasks](https://loadlight.vercel.app/walkthroughs/capture-tasks.mp4)
- [Check your workload and plan your day](https://loadlight.vercel.app/walkthroughs/plan-your-day.mp4)

## Try it locally

Use [Node.js 20.9 or later](https://nextjs.org/docs/app/getting-started/installation).

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000) and choose **Try without an account** on the sign-in page. In guest mode, your tasks are stored in the browser and task suggestions use local rules. It works without API keys.

## Set up accounts and Gemini

1. Copy [`.env.example`](.env.example) to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. For a new Supabase database, run the SQL block in [`lib/db/schema.ts`](lib/db/schema.ts) in the Supabase SQL Editor. Then run [`supabase/MIGRATIONS.sql`](supabase/MIGRATIONS.sql) for both new and existing databases. It sets up recurring tasks, checklists and the shared AI quota.
3. Enable email sign-in in Supabase Auth. Add `http://localhost:3000/auth/callback` for local development and your production callback to the [allowed redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
4. Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` on the server. If both are set, LoadLight uses `GOOGLE_API_KEY`. On Vercel, set the variable for Production and redeploy after changing it. [Google’s API key guide](https://aistudio.google.com/docs/api-key) · [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables)
5. Sign in and preview a task. The preview says which source drafted it. Each account can make up to 20 AI requests per 10 minutes.

Set the optional server-only `GROQ_API_KEY` in Vercel as a **Secret** for **Production**, then redeploy. LoadLight tries the Gemini models before Groq and uses the same account quota for all attempts. Task extraction still checks blocked content and validates the draft before showing it. [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables) · [Groq model and output support](https://console.groq.com/docs/structured-outputs)

## Calendar and time estimates

Set `NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID` to a Google OAuth web client ID and add the app’s origin to that client’s authorized JavaScript origins. Enable the Google Calendar API for the Google Cloud project. In **Settings → Planning availability**, save your work hours and break, then choose **Import busy times**. Each import refreshes the next 31 days from your primary calendar. LoadLight keeps the busy times and hours in the current browser. [Google OAuth setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) · [Google Calendar availability API](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)

Run the `actual_minutes` migration in [`supabase/MIGRATIONS.sql`](supabase/MIGRATIONS.sql) before deploying the time-spent field for signed-in accounts. Edit a finished task to record time spent. When a new draft has no estimate, LoadLight uses the median from matching completed tasks with recorded times.

## Development

```sh
npm run lint
npm test
npm run build
```

See [Operations and management](docs/operations-and-management.md) for deployment and monitoring.
