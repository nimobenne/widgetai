# WidgetAI

WidgetAI is an embeddable site assistant and a portfolio project by Nimo Benne. Add one script tag to a site. Visitors can ask about that site's content and receive short answers with source links. Questions outside the snapshot get a plain refusal and the site's contact URL.

## Architecture

Next.js 16 App Router serves the widget APIs. Site settings and public content snapshots live in `sites/<siteId>/site.json` and `content.md`. OpenAI Chat Completions generates answers with `gpt-4o-mini` by default, no tools, no retries, a 15-second timeout, and at most 300 output tokens. The prompt requires answers under 120 words and exact source URLs from the snapshot. Replies marked `[[unanswered]]`, empty replies, and replies without a supporting section become a contact fallback. Uncited replies are kept when both the question and answer match a snapshot section; that section supplies the source. Greetings and thanks receive a fixed friendly reply with starter topics and no model call. Trimming preserves line breaks and uses the last complete sentence within 119 words where possible; extra brackets around Markdown links are removed. Source links and fallback sections come only from the snapshot; matching a section does not independently verify every claim a model makes.

Conversation history comes from the client. Only the last two turns (four user/assistant messages), each truncated to 500 characters, reach the model. New messages are limited to 500 characters and request bodies to 4 KB before JSON parsing.

Neon Postgres, accessed with `@neondatabase/serverless`, stores only usage counter rows and question logs. Question rows have `site_id`, the question (at most 500 characters), an `answered` flag, and `created_at`. No conversation history, assistant replies, raw IP addresses, or session IDs are stored in the question table. The answered flag means a factual reply includes a known source; small talk is logged as unanswered. It is not a human accuracy rating. Questions older than 30 days and expired counters are pruned daily. Session counter keys contain a hash of the site and session ID and expire 24 hours after their first admitted request.

There are no bookings, calendar integrations, accounts, billing, email delivery, or admin dashboards.

## Environment and local setup

Use Node.js 22 or newer (required by the OpenAI SDK). Install with `npm install`. Copy `.env.example` to `.env.local` yourself and fill in values. Do not commit secrets. `npm run dev` starts the local server.

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-only key for a dedicated OpenAI project |
| `OPENAI_MODEL` | Chat Completions model, defaults to `gpt-4o-mini`; must support `max_tokens` and `temperature` |
| `CHAT_ENABLED` | Only `true` permits model calls; absent or any other value disables chat |
| `DATABASE_URL` | Neon Postgres connection URL; required in production |
| `WIDGET_SIGNING_SECRET` | Random secret for site/hostname-bound HMAC tokens; required in all environments |
| `IP_SALT` | Independent random secret for hashing the first forwarded IP hop; required for chat |
| `DAILY_MESSAGE_CAP` | Global UTC daily reservation cap, default `60` |
| `MONTHLY_MESSAGE_CAP` | Global UTC calendar month reservation cap, default `1200` |
| `CRON_SECRET` | Bearer secret protecting `/api/cron/prune` |

Use separate random values for the signing secret, IP salt, and cron secret. A global cap of `0` blocks all model calls. Invalid caps fail closed. Request failures log fixed error classes, numeric upstream statuses, and safe reason codes such as `openai_401`, `db_timeout`, and `missing_openai_api_key`. Missing required settings are reported on the first request that needs them. Logs never include exception messages, upstream bodies, prompts, IPs, tokens, or session IDs. Without `DATABASE_URL`, development and tests use an in-memory store behind the same interface. Production and Vercel deployments require Postgres and never fall back to memory after an error. Memory counters reset with the local process and are unsuitable for production.

## Database setup

`db/schema.sql` idempotently creates `usage_counters`, `questions`, and their expiry indexes. Supply `DATABASE_URL` in the process environment and run:

```sh
npm run db:setup
```

The standalone scripts read process environment variables; they do not load `.env.local` automatically. Provision the database in the existing Neon `dayfold` project outside this repository workflow. The setup script creates tables and sets existing infinite session counters to expire after 24 hours. Repeating setup does not extend finite expiries.

Vercel runs `/api/cron/prune` once daily at `0 0 * * *` (UTC), compatible with Hobby cron frequency. Set `CRON_SECRET` in Vercel so scheduled requests carry `Authorization: Bearer <CRON_SECRET>`. Unauthorized requests cannot prune data.

## Content and new sites

The included sites are `nimo` (Nimo's public portfolio) and `widgetai` (the product itself). The Nimo snapshot is generated from the public portfolio HTML and excludes phone numbers. WidgetAI's initial snapshot is maintained by hand.

To add a site:

1. Create `sites/<siteId>/site.json`. IDs use lowercase letters, digits, and hyphens, with at most 64 characters. Use this shape:

   ```json
   {
     "siteId": "example",
     "name": "Example",
     "allowedDomains": ["example.com", "localhost"],
     "greeting": "Hi! Ask me about Example.",
     "starters": ["What is Example?", "What does it do?", "How do I get in touch?"],
     "sourceUrls": ["https://example.com/"],
     "contactUrl": "https://example.com/#contact"
   }
   ```

   Optional fields configure generated GitHub project content and additional site-local Markdown files:

   ```json
   {
     "github": {
       "user": "example-user",
       "exclude": ["repository-to-skip"],
       "monorepos": ["repository-with-project-folders"]
     },
     "extraFiles": ["maintainer-content.md"]
   }
   ```

   GitHub sync includes public, non-fork, non-archived repositories, excluding the configured names. A configured monorepo contributes one entry for each top-level directory with a `README.md`. Extra files are appended from the site's directory with their text preserved except phone numbers are scrubbed; missing files are skipped. The full snapshot is limited to 14,000 characters, with README excerpts shortened evenly when needed.

2. Create a plain-text `content.md` snapshot, or run `npm run site:sync -- example`. Each section heading uses `[Title](https://example.com/#real-anchor)` so the assistant can cite it. The sync script fetches all configured source URLs, removes scripts/navigation and phone numbers, and extracts readable text with headings and existing IDs. Pages without section IDs link to the page URL. JavaScript-rendered content is not executed. All fetches must succeed before the snapshot is replaced.
3. Review the extracted text and source anchors. Keep only public content intended for the assistant. Commit the config and snapshot. Source pages changing do not update the assistant until the snapshot is synced and deployed.
4. Register the exact hostname of every embedding site. `www.example.com` and `example.com` are separate entries. Wildcards and automatic same-server bypasses are unsupported. `localhost` permits local development at any port.

Refresh an existing snapshot with:

```sh
npm run site:sync -- nimo
```

The `nimo` snapshot also includes public GitHub project descriptions and cleaned README excerpts. `.github/workflows/site-sync.yml` runs this sync every Monday at 06:00 UTC and on manual dispatch. It uses Node.js 22 and commits and pushes changes under `sites/` to `main` as `nimobenne`.

Do not sync `widgetai` from an older deployed page while its new product page is pending. Keep its hand-written snapshot until the public page matches it.

## Embed and API contract

```html
<script
  src="https://chat-bot-widget-two.vercel.app/widget.js"
  data-site="nimo"
  defer
></script>
```

The `nimo` embed works on `nimobenne.github.io` and `localhost`. Create another site config for another hostname. The script and marketing UI are maintained separately from this server implementation.

### Widget theming

The launcher inherits the host page's font and follows `prefers-color-scheme` by default. Set `data-accent` to a CSS color or a host custom property such as `var(--accent)`. Set `data-title` to override the panel title; otherwise it uses the site config name. An optional label comes from `data-label` or the site config's `label`; it appears once after a short delay on screens 640px wide or larger and stays dismissed after the visitor opens the chat or dismisses it. Set `data-surface` to a color or custom property to choose the widget background.

Inline hosts can set CSS custom properties on the element that contains the embed. Launcher hosts can set them on `body` or another ancestor. These values inherit into the widget's Shadow DOM:

| Variable | Controls |
| --- | --- |
| `--wa-bg` | Panel and input background |
| `--wa-text` | Main text |
| `--wa-muted` | Subtitle, status, counter, and footer text |
| `--wa-border` | Frame, separators, and control borders |
| `--wa-shadow` | Panel shadow |

For example, set `--wa-bg: var(--bg)`, `--wa-text: var(--text)`, `--wa-muted: var(--muted)`, and `--wa-border: var(--border)` on the embed host to match the surrounding page. The default palette remains in effect for any value that is not set.

| Route | Request | Response |
| --- | --- | --- |
| `GET /api/widget/config?siteId=X` | Allowed Origin | `{siteId,name,greeting,starters,widgetToken}` |
| `POST /api/widget/token/refresh` | `x-widget-token`, JSON `{siteId}` | `{widgetToken}` |
| `POST /api/chat` | `x-widget-token`, JSON `{siteId,sessionId,message,history?}` | `{message,sources:[{title,url}]}` |

History entries contain `role: "user" | "assistant"` and `content`. Unknown sites return 404, blocked origins 403, and invalid tokens 401. Tokens expire after one hour; refresh accepts up to five minutes of expiry grace. Missing signing secrets block access. Same-origin requests without an Origin header use the request hostname and still require it to be in the site's allowlist.

All widget routes support OPTIONS. An explicit `?siteId=X` checks that site's origin allowlist. Preflights without a site ID accept only origins registered to an existing site, because browsers do not include the POST body in preflights. Every actual POST rechecks the requested site and token. Allowed origins are echoed in CORS response headers. Config responses are not cached.

Rate/cap failures return 429 `{message,limited:true}` with a friendly contact link. Disabled chat and backend/model failures return 503 `{message,limited:true}`. Invalid JSON returns 400; oversized bodies return 413.

## Cost-cap layers

1. `CHAT_ENABLED` is checked first. Only the literal `true` enables chat.
2. The request body is capped at 4 KB, the message at 500 characters, and history at two turns of 500 characters each.
3. Origin allowlists and mandatory signed site/hostname tokens guard the widget endpoints. These limit browser use; they are not a secret authentication system for public websites.
4. Before any OpenAI call, one atomic Postgres statement reserves all five windows: per IP 5/minute, per IP 30/UTC day, per session 20/24 hours, global 60/UTC day, global 1200/UTC calendar month. The IP uses SHA-256 of the first nonempty client hop from `x-vercel-forwarded-for`, then `x-real-ip`, then `x-forwarded-for`, plus `IP_SALT`. The deployment must supply and overwrite the trusted client IP header; Vercel supplies `x-vercel-forwarded-for`. Session IDs are client-provided; IP and global caps remain effective if visitors start new sessions.
5. Minute/day/month counters are fixed UTC windows. Session counters expire 24 hours after the first admitted request and reset on reuse after expiry. Global windows are incremented first; only if both pass are IP windows incremented, and only if both IP windows pass is the session touched. Rejected reservations can make the assistant stop earlier, but cannot create extra model calls or unbounded new IP/session rows. Failed model calls retain their reservation. Database or config errors block the call.
6. The SDK has no automatic retries, a 15-second timeout, and `max_tokens: 300`. These are message/output limits, not a guaranteed dollar budget; input size and model choice also affect cost.
7. Use a **dedicated OpenAI project key with prepaid credit and auto-recharge off** as the spending backstop. Keep the key server-side. Check usage in the OpenAI dashboard.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

These commands need no secrets. Tests mock OpenAI and the database and exercise every cap, fail-closed behavior, body limits, the kill switch, CORS, tokens, history, site loading, HTML extraction, source parsing, and pruning. Applying the schema and checking a live model reply require operator-provided credentials.

The server uses Next.js `16.4.6`, React and React DOM `19.3.1`, Zod `4.6.7`, and OpenAI `7.63.0`. Run `npm audit --omit=dev` to check production dependencies for known advisories. API route traces include the site configs and snapshots for deployment. The daily Vercel cron uses the Node.js route handler and bearer authentication.
