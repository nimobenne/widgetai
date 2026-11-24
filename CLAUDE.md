# WidgetAI

Embeddable site assistant. One script tag on any site; answers only from that site's content, cites sections, refuses everything else. Nimo's portfolio project. First tenant: his personal site nimobenne.github.io (`sites/nimo`). Second: the product page itself (`sites/widgetai`).

Setup, env vars, adding a site, embed snippet: `mdfiles/README.md`.

## Stack

Next.js App Router + TypeScript on Vercel Hobby (project `chat-bot-widget`, host chat-bot-widget-two.vercel.app). OpenAI chat completions, no tools. Neon Postgres (project `dayfold`, database `widgetai`) holds only usage counters and a 30-day question log. Site config and content snapshots live in the repo under `sites/<siteId>/`.

## Rules

- Cost must stay hard-capped. Layers: dedicated OpenAI project key with prepaid credit and auto-recharge off; `CHAT_ENABLED` kill switch (anything but `true` = off); per-IP, per-session, daily and monthly caps reserved in Postgres before any OpenAI call; checks fail closed. Never add a path that calls OpenAI before the reservation.
- Answers come only from the site snapshot. No outside knowledge, no tools.
- Store no IPs (salted hash only), no session ids in the question log, nothing personal. Never log prompts, tokens or upstream bodies.
- No phone numbers or private contact details anywhere in the app or site snapshots.
- Widget stays dependency-free, Shadow DOM, no innerHTML of untrusted text. Keep the server contract stable: `GET /api/widget/config`, `POST /api/widget/token/refresh`, `POST /api/chat`.
- Public repo `nimobenne/widgetai` (fresh history; old private history archived as `nimobenne/chatBotWidget`). Work is tracked as GitHub issues there; fix commits say `Fixes #N`. Never commit secrets or personal data: the repo is public.
