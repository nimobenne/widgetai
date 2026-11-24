(() => {
  const script = document.currentScript;
  if (!script) return;

  const siteId = script.dataset.site;
  const mode = script.dataset.mode === 'inline' ? 'inline' : 'launcher';
  const target = mode === 'inline'
    ? document.querySelector(script.dataset.target || '')
    : null;

  if (!siteId || (mode === 'inline' && !target)) return;

  const apiBase = new URL(script.src, location.href).origin;
  const sessionKey = `widgetai-session-${siteId}`;
  let sessionId;

  try {
    sessionId = sessionStorage.getItem(sessionKey);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(sessionKey, sessionId);
    }
  } catch {
    sessionId = crypto.randomUUID();
  }

  const root = document.createElement('div');
  root.dataset.widgetai = '';

  if (mode === 'launcher') {
    const position = script.dataset.position || 'bottom-right';
    root.style.cssText = `position:fixed;z-index:2147483000;${position.includes('top') ? 'top:20px' : 'bottom:20px'};${position.includes('left') ? 'left:20px' : 'right:20px'}`;
    root.style.setProperty('--wa-panel-right', position.includes('left') ? 'auto' : '20px');
    root.style.setProperty('--wa-panel-left', position.includes('left') ? '20px' : 'auto');
    root.style.setProperty('--wa-panel-bottom', position.includes('top') ? 'auto' : '84px');
    root.style.setProperty('--wa-panel-top', position.includes('top') ? '84px' : 'auto');
    root.style.setProperty('--wa-panel-origin', `${position.includes('left') ? 'left' : 'right'} ${position.includes('top') ? 'top' : 'bottom'}`);
    document.body.append(root);
  } else {
    target.append(root);
  }

  const shadow = root.attachShadow({ mode: 'open' });
  const candidateAccent = script.dataset.accent || '#A84A1F';
  const accent = CSS.supports('color', candidateAccent) ? candidateAccent : '#A84A1F';
  const candidateSurface = script.dataset.surface;
  const surface = candidateSurface && CSS.supports('color', candidateSurface) ? candidateSurface : '';
  const theme = ['auto', 'light', 'dark'].includes(script.dataset.theme)
    ? script.dataset.theme
    : 'auto';

  root.dataset.theme = theme;
  root.style.setProperty('--wa-font', script.dataset.font || 'inherit');
  if (surface) root.style.setProperty('--wa-bg', surface);

  const style = document.createElement('style');
  style.textContent = `
    :host {
      --wa-default-bg: #f5f5f2;
      --wa-default-fg: #242522;
      --wa-default-muted: #696b65;
      --wa-default-border: #deded8;
      --wa-surface: #eeefeb;
      --wa-head: #f0f0ec;
      --wa-accent: ${accent};
      --wa-accent-fg: #ffffff;
      --wa-link: var(--wa-accent);
      --wa-focus: var(--wa-accent);
      --wa-default-shadow: 0 16px 48px #20221b24;
      --wa-font: inherit;
      color-scheme: light;
      display: block;
      font-family: var(--wa-font, inherit);
      color: var(--wa-text, var(--wa-default-fg));
    }
    @media (prefers-color-scheme: dark) {
      :host([data-theme="auto"]) {
        --wa-default-bg: #222320;
        --wa-default-fg: #f1f1ed;
        --wa-default-muted: #aaaba3;
        --wa-default-border: #3d3e39;
        --wa-surface: #2c2d29;
        --wa-head: #272824;
        --wa-accent-fg: #171714;
        color-scheme: dark;
      }
    }
    :host([data-theme="dark"]) {
      --wa-default-bg: #222320;
      --wa-default-fg: #f1f1ed;
      --wa-default-muted: #aaaba3;
      --wa-default-border: #3d3e39;
      --wa-surface: #2c2d29;
      --wa-head: #272824;
      --wa-accent-fg: #171714;
      color-scheme: dark;
    }
    :host([data-theme="dark"]) .launcher-label { box-shadow: 0 2px 8px #00000030; }
    @media (prefers-color-scheme: dark) {
      :host([data-theme="auto"]) .launcher-label { box-shadow: 0 2px 8px #00000030; }
    }
    * { box-sizing: border-box; }
    button, input { font: inherit; }
    button { cursor: pointer; }
    .container { position: relative; }
    .launcher-row { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
    .frame {
      width: min(340px, calc(100vw - 32px));
      height: min(480px, 70vh);
      background: var(--wa-bg, var(--wa-default-bg));
      border: 1px solid var(--wa-border, var(--wa-default-border));
      border-radius: 16px;
      box-shadow: var(--wa-shadow, var(--wa-default-shadow));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--wa-text, var(--wa-default-fg));
    }
    .launcher {
      width: 52px;
      height: 52px;
      flex: 0 0 52px;
      border: 0;
      border-radius: 50%;
      background: var(--wa-accent);
      color: var(--wa-accent-fg);
      box-shadow: 0 5px 18px #20221b38;
      display: grid;
      place-items: center;
      transition: transform 160ms ease, box-shadow 160ms ease;
    }
    .launcher { position: relative; }
    .launcher svg { position: absolute; width: 25px; height: 25px; transition: opacity 150ms ease, transform 150ms ease; }
    .launcher .icon-close { opacity: 0; transform: rotate(-45deg) scale(.8); }
    .launcher[aria-expanded="true"] .icon-chat { opacity: 0; transform: rotate(45deg) scale(.8); }
    .launcher[aria-expanded="true"] .icon-close { opacity: 1; transform: rotate(0) scale(1); }
    .launcher:hover { transform: translateY(-1px); box-shadow: 0 7px 22px #20221b42; }
    .launcher-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-width: 230px;
      padding: 8px 12px;
      border: 1px solid var(--wa-border, var(--wa-default-border));
      border-radius: 999px;
      background: var(--wa-bg, var(--wa-default-bg));
      color: var(--wa-text, var(--wa-default-fg));
      box-shadow: 0 2px 8px #20221b12;
      font-size: 12px;
      line-height: 1.2;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 220ms ease, transform 220ms ease;
    }
    .launcher-label.visible { opacity: 1; transform: translateY(0); }
    .launcher-label[hidden] { display: none; }
    .label-dismiss { border: 0; padding: 4px; background: transparent; color: var(--wa-muted, var(--wa-default-muted)); font-size: 16px; line-height: 1; border-radius: 8px; }
    .panel-wrap {
      position: fixed;
      right: var(--wa-panel-right, 20px);
      left: var(--wa-panel-left, auto);
      bottom: var(--wa-panel-bottom, 84px);
      top: var(--wa-panel-top, auto);
      visibility: hidden;
      opacity: 0;
      transform: translateY(8px) scale(.97);
      transform-origin: var(--wa-panel-origin, bottom right);
      pointer-events: none;
      transition: opacity 180ms ease, transform 180ms ease, visibility 180ms;
    }
    .panel-wrap.open { visibility: visible; opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; transition: opacity 180ms ease, transform 180ms ease, visibility 0s; }
    .head {
      padding: 12px 16px;
      border-bottom: 1px solid var(--wa-border, var(--wa-default-border));
      background: var(--wa-head);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .heading { min-width: 0; }
    .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 700; }
    .subtitle { margin-top: 0; color: var(--wa-muted, var(--wa-default-muted)); font-size: 11px; line-height: 1.35; }
    .close {
      flex: 0 0 auto;
      background: transparent;
      border: 0;
      color: var(--wa-text, var(--wa-default-fg));
      font-size: 22px;
      line-height: 1;
      padding: 8px;
      border-radius: 8px;
    }
    .close:focus-visible, .launcher:focus-visible, button:focus-visible {
      outline: 3px solid var(--wa-focus);
      outline-offset: 2px;
    }
    .input:focus-visible {
      border-color: var(--wa-focus);
      outline: 0;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--wa-focus) 24%, transparent);
    }
    .starters[hidden] { display: none; }
    .messages {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .bubble {
      max-width: 88%;
      align-self: flex-start;
      background: var(--wa-surface);
      border-radius: 12px;
      padding: 12px;
      font-size: 14px;
      line-height: 1.5;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .bubble.user {
      align-self: flex-end;
      background: var(--wa-accent);
      color: var(--wa-accent-fg);
    }
    .bubble a { color: var(--wa-link); text-decoration: underline; }
    .user a { color: inherit; }
    .bubble p { margin: 0; }
    .bubble p + p, .bubble ul + p, .bubble ol + p { margin-top: 8px; }
    .bubble ul, .bubble ol { margin: 0; padding-left: 20px; }
    .bubble li + li { margin-top: 3px; }
    .sources { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .sources a {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid var(--wa-border, var(--wa-default-border));
      border-radius: 999px;
      padding: 4px 8px;
      color: var(--wa-muted, var(--wa-default-muted));
      font-size: 11px;
      line-height: 1.25;
      text-decoration: none;
    }
    .sources a::before { content: '↗'; color: var(--wa-accent); font-size: 10px; }
    .typing { display: flex; align-items: center; gap: 4px; min-height: 34px; }
    .typing-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--wa-muted, var(--wa-default-muted)); animation: wa-pulse 900ms ease-in-out infinite; }
    .typing-dot:nth-child(2) { animation-delay: 140ms; }
    .typing-dot:nth-child(3) { animation-delay: 280ms; }
    @keyframes wa-pulse { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
    @keyframes wa-spin { to { transform: rotate(360deg); } }
    .status { font-size: 13px; color: var(--wa-muted, var(--wa-default-muted)); }
    .starters { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 16px; }
    .starter {
      background: transparent;
      border: 1px solid var(--wa-border, var(--wa-default-border));
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 12px;
      color: var(--wa-text, var(--wa-default-fg));
    }
    .starter:hover, .close:hover, .label-dismiss:hover { background: color-mix(in srgb, var(--wa-text, var(--wa-default-fg)) 7%, transparent); }
    .starter:active, .close:active, .label-dismiss:active { transform: scale(.98); }
    .composer { padding: 10px 12px 8px; border-top: 1px solid var(--wa-border, var(--wa-default-border)); }
    .form { display: flex; gap: 8px; }
    .input {
      flex: 1;
      min-width: 0;
      border: 1px solid var(--wa-border, var(--wa-default-border));
      border-radius: 12px;
      background: var(--wa-bg, var(--wa-default-bg));
      color: var(--wa-text, var(--wa-default-fg));
      padding: 8px 12px;
    }
    .input:focus { border-color: var(--wa-focus); }
    .send, .retry {
      border: 0;
      border-radius: 12px;
      background: var(--wa-accent);
      color: var(--wa-accent-fg);
      padding: 8px 11px;
      font-weight: 600;
    }
    .send { position: relative; display: inline-grid; place-items: center; min-width: 40px; min-height: 40px; }
    .send svg { width: 18px; height: 18px; }
    .send:disabled { cursor: wait; }
    .send[aria-busy="true"] svg { opacity: .48; }
    .send-spinner { position: absolute; width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: wa-spin 800ms linear infinite; }
    .counter { text-align: right; color: var(--wa-muted, var(--wa-default-muted)); font-size: 11px; height: 16px; }
    .counter.hidden { visibility: hidden; }
    .footer { text-align: center; color: var(--wa-muted, var(--wa-default-muted)); font-size: 10px; padding: 0 8px 2px; }
    .footer a { color: inherit; }
    .inline { width: min(100%, 420px); height: 560px; }
    .inline .panel-wrap { display: block !important; height: 100%; margin: 0; position: static; visibility: visible; opacity: 1; transform: none; pointer-events: auto; }
    .inline .frame { width: 100%; height: 100%; max-height: 640px; }
    .inline .close { display: none; }
    @media (max-width: 480px) {
      .launcher-row { gap: 0; }
      .launcher-label { display: none; }
      .panel-wrap.open { position: fixed; inset: 0; z-index: 2; transform-origin: bottom center; }
      .panel-wrap.open + .launcher-row { visibility: hidden; }
      .panel-wrap.open .frame { width: 100%; height: 100vh; height: 100dvh; max-height: none; border-radius: 0; border: 0; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
      .inline { max-width: 100%; }
      .inline .panel-wrap.open { position: static; inset: auto; z-index: auto; height: 100%; }
      .inline .panel-wrap.open .frame { width: 100%; height: 100%; max-height: 640px; border-radius: 16px; border: 1px solid var(--wa-border, var(--wa-default-border)); padding: 0; }
    }
    @media (max-width: 639px) {
      .launcher-label { display: none !important; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; transition: none !important; }
      .typing-dot { opacity: .75; transform: none; }
      .send-spinner { border-right-color: currentColor; opacity: .7; }
    }
  `;
  shadow.append(style);

  const container = document.createElement('div');
  container.className = mode === 'inline' ? 'inline' : 'container';

  const panelWrap = document.createElement('div');
  panelWrap.className = 'panel-wrap';
  panelWrap.id = 'widgetai-panel';

  const frame = document.createElement('section');
  frame.className = 'frame';
  if (mode === 'launcher') {
    frame.setAttribute('role', 'dialog');
    frame.setAttribute('aria-modal', 'true');
    frame.setAttribute('aria-labelledby', 'widgetai-title');
  }

  const head = document.createElement('header');
  head.className = 'head';

  const heading = document.createElement('div');
  heading.className = 'heading';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = script.dataset.title || 'Ask about this site';
  title.id = 'widgetai-title';

  const subtitle = document.createElement('div');
  subtitle.className = 'subtitle';
  subtitle.textContent = 'Answers from this site';
  heading.append(title, subtitle);

  const close = document.createElement('button');
  close.className = 'close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close assistant');
  close.textContent = '×';
  head.append(heading, close);

  const messages = document.createElement('div');
  messages.className = 'messages';
  messages.setAttribute('aria-live', 'polite');
  messages.setAttribute('aria-relevant', 'additions text');

  const starters = document.createElement('div');
  starters.className = 'starters';

  const composer = document.createElement('div');
  composer.className = 'composer';

  const form = document.createElement('form');
  form.className = 'form';

  const input = document.createElement('input');
  input.className = 'input';
  input.type = 'text';
  input.maxLength = 500;
  input.placeholder = 'Ask a question';
  input.setAttribute('aria-label', 'Your question');

  const send = document.createElement('button');
  send.className = 'send';
  send.type = 'submit';
  send.setAttribute('aria-label', 'Send question');
  send.append(createSendIcon());
  const sendSpinner = document.createElement('span');
  sendSpinner.className = 'send-spinner';
  sendSpinner.hidden = true;
  sendSpinner.setAttribute('aria-hidden', 'true');
  send.append(sendSpinner);
  form.append(input, send);

  const counter = document.createElement('div');
  counter.className = 'counter hidden';
  counter.setAttribute('aria-live', 'polite');

  const footer = document.createElement('div');
  footer.className = 'footer';
  footer.append('AI assistant · answers come from this site · ');

  const brand = document.createElement('a');
  brand.href = apiBase;
  brand.textContent = 'Built with WidgetAI';
  footer.append(brand);

  composer.append(form, counter, footer);
  frame.append(head, messages, starters, composer);
  panelWrap.append(frame);

  const launcher = document.createElement('button');
  launcher.className = 'launcher';
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Open site assistant');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'widgetai-panel');
  const chatIcon = createLauncherIcon();
  chatIcon.classList.add('icon-chat');
  const launcherCloseIcon = createCloseIcon();
  launcherCloseIcon.classList.add('icon-close');
  launcher.append(chatIcon, launcherCloseIcon);

  const label = document.createElement('span');
  label.className = 'launcher-label';
  label.hidden = true;
  const labelText = document.createElement('span');
  labelText.textContent = script.dataset.label || 'Ask about my work';
  const dismissLabel = document.createElement('button');
  dismissLabel.className = 'label-dismiss';
  dismissLabel.type = 'button';
  dismissLabel.setAttribute('aria-label', 'Dismiss assistant label');
  dismissLabel.textContent = '×';
  dismissLabel.addEventListener('click', dismissLabelPermanently);
  label.append(labelText, dismissLabel);

  const launcherRow = document.createElement('div');
  launcherRow.className = 'launcher-row';
  launcherRow.append(label, launcher);

  const labelStorageKey = `widgetai-label-dismissed-${siteId}`;
  let labelDismissed = false;
  let labelTimer;
  try {
    labelDismissed = localStorage.getItem(labelStorageKey) === 'true';
  } catch {
    // Keep the label state for this page when storage is unavailable.
  }

  function dismissLabelPermanently() {
    labelDismissed = true;
    window.clearTimeout(labelTimer);
    label.classList.remove('visible');
    label.hidden = true;
    try {
      localStorage.setItem(labelStorageKey, 'true');
    } catch {
      // The label remains dismissed for this page.
    }
  }

  if (mode === 'launcher') {
    container.append(panelWrap, launcherRow);
  } else {
    container.append(panelWrap);
  }
  shadow.append(container);

  let token = '';
  let config;
  let busy = false;
  let limited = false;
  let failedMessage = '';
  let hostOverflowSnapshot = null;
  const history = [];

  function createLauncherIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z');
    svg.append(path);
    return svg;
  }

  function createCloseIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 6l12 12M18 6 6 18');
    svg.append(path);
    return svg;
  }

  function createSendIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M22 2 11 13');
    svg.append(path);
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'm22 2-7 20-4-9-9-4Z');
    svg.append(arrow);
    return svg;
  }

  // Render the small supported markdown subset with DOM nodes only.
  function renderText(node, text) {
    const lines = text.split(/\r?\n/);
    let list = null;
    let paragraph = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      const p = document.createElement('p');
      paragraph.forEach((line, index) => {
        if (index) p.append(document.createElement('br'));
        renderInline(p, line);
      });
      node.append(p);
      paragraph = [];
    }

    function closeList() {
      if (list) {
        node.append(list);
        list = null;
      }
    }

    for (const line of lines) {
      const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
      const numbered = /^\s*(\d+)[.)]\s+(.+)$/.exec(line);

      if (bullet || numbered) {
        flushParagraph();
        const kind = bullet ? 'ul' : 'ol';
        if (!list || list.tagName.toLowerCase() !== kind) {
          closeList();
          list = document.createElement(kind);
          // Keep the model's numbering when a list is split by blank lines or sub-points.
          if (numbered && numbered[1] !== '1') list.start = Number(numbered[1]);
        }
        const item = document.createElement('li');
        renderInline(item, bullet ? bullet[1] : numbered[2]);
        list.append(item);
      } else if (!line.trim()) {
        // A blank line ends a paragraph but not a list: models often space out list items.
        flushParagraph();
      } else {
        closeList();
        paragraph.push(line.trim());
      }
    }

    flushParagraph();
    closeList();
  }

  function renderInline(node, text) {
    const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;
    let last = 0;
    let match;

    while ((match = pattern.exec(text))) {
      node.append(document.createTextNode(text.slice(last, match.index)));

      if (match[1]) {
        try {
          const url = new URL(match[2]);
          if (/^https?:$/.test(url.protocol)) {
            const link = document.createElement('a');
            link.href = url.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = match[1];
            node.append(link);
          } else {
            node.append(document.createTextNode(match[0]));
          }
        } catch {
          node.append(document.createTextNode(match[0]));
        }
      } else {
        const strong = document.createElement('strong');
        strong.textContent = match[3];
        node.append(strong);
      }
      last = pattern.lastIndex;
    }

    node.append(document.createTextNode(text.slice(last)));
  }

  function addBubble(text, who, sources = [], scrollToStart = false) {
    const row = document.createElement('div');
    row.className = `bubble ${who}`;
    renderText(row, text);

    if (sources.length) {
      const list = document.createElement('div');
      list.className = 'sources';
      sources.forEach((source) => {
        try {
          const url = new URL(source.url, location.href);
          if (!/^https?:$/.test(url.protocol)) return;
          const link = document.createElement('a');
          link.href = url.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = source.title || source.url;
          link.setAttribute('aria-label', `${source.title || source.url}, opens in a new tab`);
          list.append(link);
        } catch {
          // Ignore malformed source URLs.
        }
      });
      row.append(list);
    }

    messages.append(row);
    if (scrollToStart) {
      const messageTop = row.getBoundingClientRect().top - messages.getBoundingClientRect().top;
      messages.scrollTop += messageTop;
    } else {
      messages.scrollTop = messages.scrollHeight;
    }
    return row;
  }

  function setBusy(value) {
    busy = value;
    send.disabled = value || limited;
    input.disabled = value || limited;
    send.setAttribute('aria-busy', String(value));
    send.setAttribute('aria-label', value ? 'Sending' : 'Send question');
    sendSpinner.hidden = !value;
  }

  function syncHostScrollLock() {
    const shouldLock = mode === 'launcher'
      && panelWrap.classList.contains('open')
      && window.matchMedia('(max-width: 480px)').matches;

    if (shouldLock && !hostOverflowSnapshot) {
      hostOverflowSnapshot = [document.documentElement, document.body].map((element) => ({
        element,
        value: element.style.getPropertyValue('overflow'),
        priority: element.style.getPropertyPriority('overflow'),
      }));
      hostOverflowSnapshot.forEach(({ element }) => element.style.setProperty('overflow', 'hidden', 'important'));
    } else if (!shouldLock && hostOverflowSnapshot) {
      hostOverflowSnapshot.forEach(({ element, value, priority }) => {
        if (value) element.style.setProperty('overflow', value, priority);
        else element.style.removeProperty('overflow');
      });
      hostOverflowSnapshot = null;
    }
  }

  async function loadConfig() {
    const response = await fetch(`${apiBase}/api/widget/config?siteId=${encodeURIComponent(siteId)}`);
    if (!response.ok) {
      throw new Error(response.status === 403
        ? 'This site is not allowed to use the assistant.'
        : 'The assistant could not load.');
    }

    config = await response.json();
    token = config.widgetToken;
    title.textContent = script.dataset.title || config.name || 'Ask about this site';
    if (!script.dataset.label && config.label) labelText.textContent = config.label;
    if (config.greeting) addBubble(config.greeting, 'assistant');

    (config.starters || []).slice(0, 3).forEach((text) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'starter';
      button.textContent = text;
      button.addEventListener('click', () => ask(text));
      starters.append(button);
    });
  }

  async function refreshToken() {
    const response = await fetch(`${apiBase}/api/widget/token/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-widget-token': token },
      body: JSON.stringify({ siteId }),
    });
    if (!response.ok) throw new Error('Your session expired. Please try again.');
    token = (await response.json()).widgetToken;
  }

  async function ask(value, refocusAfter = false) {
    const question = value.trim();
    if (!question || busy) return;

    failedMessage = question;
    starters.hidden = true;
    addBubble(question, 'user');
    input.value = '';
    counter.classList.add('hidden');
    setBusy(true);

    const typing = document.createElement('div');
    typing.className = 'bubble assistant typing';
    typing.setAttribute('role', 'status');
    typing.setAttribute('aria-label', 'Assistant is thinking');
    for (let index = 0; index < 3; index += 1) {
      const dot = document.createElement('span');
      dot.className = 'typing-dot';
      dot.setAttribute('aria-hidden', 'true');
      typing.append(dot);
    }
    messages.append(typing);

    let answer;
    try {
      const body = { siteId, sessionId, message: question, history: history.slice(-2) };
      let response = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-widget-token': token },
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        await refreshToken();
        response = await fetch(`${apiBase}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-widget-token': token },
          body: JSON.stringify(body),
        });
      }

      answer = await response.json();
      typing.remove();

      if (response.status === 429 || response.status === 503 || answer.limited) {
        limited = true;
        addBubble(answer.message || 'The assistant is busy right now. Please try again later.', 'assistant', [], true);
        input.disabled = true;
        send.disabled = true;
      } else if (!response.ok) {
        throw new Error(answer.message || 'Your question could not be sent.');
      } else {
        addBubble(answer.message || 'I could not find an answer on this site.', 'assistant', answer.sources || [], true);
        history.push(
          { role: 'user', content: question },
          { role: 'assistant', content: answer.message || '' },
        );
      }
    } catch (error) {
      typing.remove();
      const row = document.createElement('div');
      row.className = 'bubble assistant';
      const message = error.name === 'SyntaxError' || error.name === 'TypeError'
        ? 'The assistant could not connect. Please try again.'
        : error.message || 'Something went wrong. Please try again.';
      row.append(document.createTextNode(message));

      const retry = document.createElement('button');
      retry.className = 'retry';
      retry.type = 'button';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => {
        row.remove();
        ask(failedMessage);
      });
      row.append(retry);
      messages.append(row);
      messages.scrollTop = messages.scrollHeight;
    } finally {
      setBusy(false);
      if (input.disabled) send.disabled = true;
      if (refocusAfter) input.focus();
    }
  }

  function open() {
    dismissLabelPermanently();
    panelWrap.classList.add('open');
    launcher.setAttribute('aria-expanded', 'true');
    launcher.setAttribute('aria-label', 'Close site assistant');
    syncHostScrollLock();
    requestAnimationFrame(() => close.focus());
  }

  function shut() {
    panelWrap.classList.remove('open');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', 'Open site assistant');
    syncHostScrollLock();
    launcher.focus();
  }

  function trapFocus(event) {
    if (mode !== 'launcher' || !panelWrap.classList.contains('open') || event.key !== 'Tab') return;

    const focusable = Array.from(frame.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ));
    if (!focusable.length) {
      event.preventDefault();
      frame.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (shadow.activeElement === first || !frame.contains(shadow.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (shadow.activeElement === last || !frame.contains(shadow.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value, true);
  });

  input.addEventListener('input', () => {
    const length = input.value.length;
    counter.textContent = `${length}/500`;
    counter.classList.toggle('hidden', length < 430);
  });

  launcher.addEventListener('click', () => {
    if (panelWrap.classList.contains('open')) shut();
    else open();
  });
  close.addEventListener('click', shut);
  window.addEventListener('resize', syncHostScrollLock);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panelWrap.classList.contains('open')) {
      event.preventDefault();
      shut();
      return;
    }
    trapFocus(event);
  });

  if (mode === 'inline') panelWrap.classList.add('open');
  if (mode === 'launcher' && !labelDismissed && window.innerWidth >= 640) {
    labelTimer = window.setTimeout(() => {
      if (labelDismissed || panelWrap.classList.contains('open') || window.innerWidth < 640) return;
      label.hidden = false;
      requestAnimationFrame(() => label.classList.add('visible'));
    }, 2000);
  }
  loadConfig().catch((error) => {
    addBubble(error.message || 'The assistant could not load.', 'assistant');
  });
})();
