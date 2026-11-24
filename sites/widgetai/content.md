## [What WidgetAI is](https://chat-bot-widget-two.vercel.app/#top)

WidgetAI is a generic, embeddable site assistant. One script tag adds a chat assistant to a website. Each site has its own config and a checked-in snapshot of its public content. The assistant answers only from that site's snapshot, cites the supporting sections, and says when the content does not cover a question. It refuses unrelated tasks and points visitors to the site's contact URL. WidgetAI is a portfolio project by Nimo Benne.

## [Adding WidgetAI to a site](https://chat-bot-widget-two.vercel.app/#setup)

WidgetAI is not self-service. Nimo adds it to each site on request. Every site gets its own configuration, a snapshot of its public pages, and an allowlist of the exact domains it may run on. Requests carry signed tokens bound to the site and domain, so copying the widget onto another website does not work. There are no public install instructions.

## [Cost caps](https://chat-bot-widget-two.vercel.app/#limits)

The CHAT_ENABLED switch stops model calls immediately when it is off. Before each model call, Postgres atomically reserves counters for five messages per IP per minute, thirty per IP per UTC day, twenty per session, a global UTC daily cap of 60 messages, and a global calendar month cap of 1200 messages. The two global caps are configurable. Rejected attempts also consume counters. A database error blocks the model call. IP addresses are salted and hashed; raw IP addresses are never stored. Each reply is capped at 300 output tokens, with no automatic retries and a fifteen second timeout. Use a dedicated OpenAI project key with prepaid credit and auto-recharge off as a separate spending backstop. Limits show a friendly contact link to visitors.

## [How it is built](https://chat-bot-widget-two.vercel.app/#stack)

WidgetAI uses Next.js 14, TypeScript, a plain JavaScript embed, OpenAI Chat Completions (gpt-4o-mini by default), and Neon Postgres through @neondatabase/serverless. Site configs and content live in the repository. Conversation history stays in the browser and only the last two turns are sent as context, truncated to 500 characters per message. The server stores usage counters and questions with an answered flag, with no raw IP or session ID in question logs. A daily authenticated cron prunes expired counters and questions older than thirty days. There are no booking tools, calendars, payments, or account dashboards.

## [Contact Nimo](https://nimobenne.github.io/#contact)

WidgetAI is a portfolio project by Nimo Benne. Contact Nimo through the contact section of his public portfolio at https://nimobenne.github.io/#contact.
