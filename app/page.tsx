'use client';

import { useEffect } from 'react';

export default function HomePage() {
  useEffect(() => {
    const host = document.getElementById('widgetai-demo');
    if (!host || host.querySelector('script')) return;
    const script = document.createElement('script');
    script.src = '/widget.js';
    script.dataset.site = 'widgetai';
    script.dataset.mode = 'inline';
    script.dataset.target = '#widgetai-demo';
    script.dataset.theme = 'auto';
    script.dataset.accent = '#8c442c';
    host.append(script);
  }, []);

  return (
    <main className="site-shell">
      <header className="topbar"><a className="wordmark" href="#top">WidgetAI</a></header>
      <section className="intro" id="top">
        <p className="eyebrow">A site assistant</p>
        <h1>Answers grounded in your website.</h1>
        <p className="lede">WidgetAI is an embeddable assistant that answers visitor questions using your site’s content, cites its sources, and declines everything else.</p>
      </section>

      <section className="demo-section" aria-labelledby="demo-title">
        <div><p className="eyebrow">Try it here</p><h2 id="demo-title">Ask WidgetAI about WidgetAI</h2><p className="subtle">This live assistant is limited to information about this project.</p></div>
        <div id="widgetai-demo" className="demo-mount" aria-label="Live WidgetAI assistant demo" />
      </section>

      <section className="site-setup-section" id="setup" aria-labelledby="site-setup-title">
        <div><p className="eyebrow">Set up for your site</p><h2 id="site-setup-title">Added by request.</h2></div>
        <p className="subtle">We add WidgetAI to each site on request. Every site has its own domain allowlist and signed access tokens, so the assistant only responds from its approved domain.</p>
      </section>

      <section className="details-grid">
        <article id="limits"><p className="eyebrow">Cost controls</p><h2>Hard limits at each layer.</h2><p>Provider credit is prepaid, with auto-recharge off. A kill switch, per-visitor and per-chat limits, daily and monthly global caps, short answers, a small model, and fail-closed checks keep usage bounded.</p></article>
        <article id="stack"><p className="eyebrow">Under the hood</p><h2>Small, explicit pieces.</h2><p>Next.js and TypeScript serve the app. OpenAI generates answers, site content lives in this project, and Neon Postgres stores usage counters and a 30-day question log. A Shadow DOM embed keeps widget styles contained, while signed tokens and a per-domain allowlist control requests.</p></article>
      </section>

      <footer className="page-footer"><p>A portfolio project by <a href="https://nimobenne.github.io" target="_blank" rel="noreferrer">Nimo Benne</a>.</p><span className="footer-links"><a href="https://github.com/nimobenne/widgetai" target="_blank" rel="noreferrer">Source on GitHub</a> · <a href="/privacy">Privacy</a></span></footer>
    </main>
  );
}
