# Weekend Cricket Scoreboard

A mobile-first scorekeeping application for friendly weekend cricket matches.

## Current scope

This initial scaffold includes the application shell, routes, shared navigation, and placeholder screens. Database and authentication implementation will be added in the next increment.

## Run locally

```bash
npm install
npm run dev
```

## Planned architecture

- Next.js App Router with React and TypeScript
- Tailwind CSS for the design system
- Supabase Auth and PostgreSQL (not yet configured)
- Vercel deployment

## Cricket AI

The captain-protected Cricket AI uses read-only, allowlisted analytics tools. It cannot run arbitrary SQL or change cricket data. Conversations remain in the browser and are not stored; Supabase stores only monthly token/cost totals and short-lived operational metadata.

Before enabling it:

1. Run `supabase/migrations/0017_ai_assistant_usage.sql` in the Supabase SQL Editor.
2. Add the server-only AI variables from `.env.example` to the Vercel production environment.
3. Keep `OPENAI_API_KEY` secret and never expose it through a `NEXT_PUBLIC_` variable.

The provider is selected with `AI_PROVIDER`. The application currently includes an OpenAI adapter, and additional providers can be added behind the `AiProvider` interface without changing the chat UI or cricket analytics.
