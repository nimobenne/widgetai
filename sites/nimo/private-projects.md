## [Projects in private repos](https://nimobenne.github.io/#projects)

These projects live in private repositories. The summaries below are the public details.

### [WidgetAI site assistant](https://chat-bot-widget-two.vercel.app/)

The assistant answering questions on this site. Nimo built it as a small chat widget that any website can add with one script tag. It answers only from that site's own pages and its public GitHub projects, links to the part it used, and declines everything else. Each site is locked to its own domains with signed tokens. Hard limits keep the running cost to a few cents a day: a prepaid provider budget, per-visitor and per-chat limits, daily and monthly caps, short answers and a small model. Built with Next.js, TypeScript, the OpenAI API and Postgres on Neon, hosted on Vercel. Started 2026.

### [NewsDigest](https://nimobenne.github.io/#projects)

A news digest website built for a journalist who wanted to stop spending mornings hunting for stories. Twice each morning it reads Canadian and international news feeds, removes repeats, uses GPT-4o-mini to grade the stories and write short pitches for the best ones, and publishes the result as a web page. Every AI step is capped to keep costs low. Built with Python and the OpenAI API, hosted on Vercel. Built in 2026 and running daily.

### [VolleyMaps](https://nimobenne.github.io/#projects)

A site for finding pickup volleyball games in Toronto. It shows games on a map and in a live list, with filters for the things players care about. Organizers opt in to be listed. Built with Next.js, TypeScript, Postgres and MapLibre maps, hosted on Vercel. Live at volleymaps.vercel.app.

### [autoclipper](https://nimobenne.github.io/#projects)

Client work. A video pipeline for a client who wanted short videos posted without hiring an editor. It takes a long video, finds the best moments, reframes them tall for phones, adds captions and sound, and schedules the posts. About 10,000 lines of Python using ffmpeg, and it runs every day.
