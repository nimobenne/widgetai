import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { getSite, listSites } from '../lib/sites';
import { cleanReadme, excerptAtMost, githubProjectEntries, htmlToText, syncSite } from '../lib/siteSync';
import { parseSources, trimHistory, validateChatInput } from '../lib/ai';

test('sites load snapshots and reject unknown IDs and path traversal', async () => {
  for (const id of ['nimo', 'widgetai']) {
    const site = await getSite(id);
    assert.equal(site?.siteId, id);
    assert.equal(site?.starters.length, 3);
    assert.match(site!.content, /^## \[.+\]\(https:\/\//m);
  }
  assert.equal(await getSite('../nimo'), null);
  assert.equal(await getSite('missing'), null);
  assert.equal((await listSites()).length, 2);
});

test('sync extracts headings with real ancestor anchors, text and entities', async () => {
  const html = await readFile('tests/fixtures/site.html', 'utf8');
  const text = htmlToText(html, 'https://example.com/');
  assert.match(text, /## \[Our work\]\(https:\/\/example.com\/#work\)/);
  assert.match(text, /### \[Tools & projects\]\(https:\/\/example.com\/#tools\)/);
  assert.match(text, /Useful <tools> and café/);
  assert.doesNotMatch(text, /secret|menu|footer|555|display:none|alert/);
  assert.match(text, /## \[Contact\]\(https:\/\/example.com\/#contact\)/);
});

test('sync fetches every source and replaces snapshots only after all sources succeed', async () => {
  const original = process.cwd();
  const root = await mkdtemp(path.join(original, 'tests', '.sync-'));
  try {
    await mkdir(path.join(root, 'sites', 'fixture'), { recursive: true });
    await writeFile(path.join(root, 'sites', 'fixture', 'site.json'), JSON.stringify({
      siteId: 'fixture', name: 'Fixture', allowedDomains: ['example.com'], greeting: 'Hello',
      starters: ['One', 'Two', 'Three'], sourceUrls: ['https://example.com/one', 'https://example.com/two'], contactUrl: 'https://example.com/#contact'
    }));
    const snapshot = path.join(root, 'sites', 'fixture', 'content.md');
    await writeFile(snapshot, 'Existing content');
    process.chdir(root);
    const seen: string[] = [];
    const fetcher = (async (url: string, options: RequestInit) => {
      seen.push(url);
      assert.ok(options.signal);
      return new Response('<section id="work"><h2>Work</h2><p>Public text</p></section>');
    }) as typeof fetch;
    await syncSite('fixture', fetcher);
    assert.deepEqual(seen, ['https://example.com/one', 'https://example.com/two']);
    assert.match(await readFile(snapshot, 'utf8'), /https:\/\/example.com\/two#work/);
    const synced = await readFile(snapshot, 'utf8');
    await assert.rejects(syncSite('fixture', (async () => new Response('Unavailable', { status: 503 })) as typeof fetch));
    assert.equal(await readFile(snapshot, 'utf8'), synced);
    await assert.rejects(syncSite('missing', fetcher));
  } finally {
    process.chdir(original);
    assert.ok(root.startsWith(path.join(original, 'tests') + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});

test('README cleaning keeps plain prose and removes badges, images, HTML, code, tables and link syntax', () => {
  const cleaned = cleanReadme(`# Useful Project\n\n[![Build](https://img.shields.io/build.svg)](https://ci.example.com)\n\nA clear [project guide](https://example.com/guide) for teams.\n\n<img src="secret.png">Visible text.</img>\n\n\`\`\`js\nconst secret = true;\n\`\`\`\n\n| Name | Value |\n| --- | --- |\n| secret | hidden |\n\n![diagram](https://example.com/diagram.png)`);
  assert.equal(cleaned.title, 'Useful Project');
  assert.match(cleaned.prose, /A clear project guide for teams/);
  assert.match(cleaned.prose, /teams\.\n\nVisible text\./);
  assert.doesNotMatch(cleaned.prose, /shields|secret|hidden|diagram|https:\/\//);
});

test('README cleaning joins prose wraps, drops fragments and stops before setup sections', async () => {
  const markdown = await readFile('tests/fixtures/github-readme-quality.md', 'utf8');
  const cleaned = cleanReadme(markdown);
  assert.equal(cleaned.type, 'Solo build');
  assert.equal(cleaned.stack, 'Python, Flask');
  assert.match(cleaned.prose, /A useful project guide joins hard wrapped lines into complete paragraphs\./);
  assert.doesNotMatch(cleaned.prose, /5-7B|10\+|alpha, beta|alpha beta|This bullet|Install dependencies|environment file|quick-start/);
  assert.doesNotMatch(cleaned.prose, /^(?:Python|2026-09)$/m);
});

test('README excerpts keep the first complete sentence when it exceeds the word limit', () => {
  const longSentence = `${Array.from({ length: 100 }, (_, index) => `word${index}`).join(' ')}.`;
  assert.equal(excerptAtMost(longSentence, 90), longSentence);
});

test('GitHub projects exclude configured repos, expand monorepos and sort by newest push', async () => {
  const calls: string[] = [];
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const repos = [
    { name: 'older', full_name: 'nimo/older', description: 'Older project', language: 'Python', pushed_at: '2025-03-20T00:00:00Z', html_url: 'https://github.com/nimo/older', default_branch: 'main', fork: false, archived: false, private: false, visibility: 'public' },
    { name: 'portfolio', full_name: 'nimo/portfolio', description: null, language: 'TypeScript', pushed_at: '2025-03-04T00:00:00Z', html_url: 'https://github.com/nimo/portfolio', default_branch: 'main', fork: false, archived: false, private: false, visibility: 'public' },
    { name: 'excluded', full_name: 'nimo/excluded', description: 'skip', language: null, pushed_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/nimo/excluded', default_branch: 'main', fork: false, archived: false, private: false, visibility: 'public' },
    { name: 'forked', full_name: 'nimo/forked', description: 'skip', language: null, pushed_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/nimo/forked', default_branch: 'main', fork: true, archived: false, private: false, visibility: 'public' },
    { name: 'archived', full_name: 'nimo/archived', description: 'skip', language: null, pushed_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/nimo/archived', default_branch: 'main', fork: false, archived: true, private: false, visibility: 'public' },
    { name: 'private', full_name: 'nimo/private', description: 'skip', language: null, pushed_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/nimo/private', default_branch: 'main', fork: false, archived: false, private: true, visibility: 'private' }
  ];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/users/nimo/repos?')) return response(repos);
    if (url.includes('/repos/nimo/portfolio/contents?')) return response([
      { name: 'alpha', path: 'alpha', type: 'dir', html_url: 'https://github.com/nimo/portfolio/tree/main/alpha' },
      { name: 'empty', path: 'empty', type: 'dir', html_url: 'https://github.com/nimo/portfolio/tree/main/empty' },
      { name: 'README.md', path: 'README.md', type: 'file', html_url: 'https://github.com/nimo/portfolio/blob/main/README.md' }
    ]);
    if (url.includes('/alpha/README.md')) return response({ encoding: 'base64', content: Buffer.from('# Alpha\n\nA new monorepo project.').toString('base64') });
    if (url.includes('/empty/README.md')) return response(null, 404);
    if (url.includes('/repos/nimo/older/readme')) return response({ encoding: 'base64', content: Buffer.from('# Older\n\nAn older standalone project.').toString('base64') });
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;
  const entries = await githubProjectEntries({ user: 'nimo', exclude: ['excluded'], monorepos: ['portfolio'] }, fetcher);
  assert.deepEqual(entries.map(entry => entry.title), ['Older', 'Alpha']);
  assert.equal(entries[1].url, 'https://github.com/nimo/portfolio/tree/main/alpha');
  assert.equal(entries[1].pushed, '2025-03');
  assert.equal(entries[0].description, 'Older project');
  assert.ok(calls.every(url => !url.includes('/forked/') && !url.includes('/private/') && !url.includes('/archived/')));
  assert.ok(!calls.some(url => url.endsWith('/repos/nimo/portfolio/readme')));
});

test('sync renders labeled GitHub metadata and shortens excerpts to keep the snapshot under 14,000 characters', async () => {
  const original = process.cwd();
  const root = await mkdtemp(path.join(original, 'tests', '.sync-'));
  try {
    await mkdir(path.join(root, 'sites', 'fixture'), { recursive: true });
    await writeFile(path.join(root, 'sites', 'fixture', 'site.json'), JSON.stringify({
      siteId: 'fixture', name: 'Fixture', allowedDomains: ['example.com'], greeting: 'Hello',
      starters: ['One', 'Two', 'Three'], sourceUrls: ['https://example.com/'], contactUrl: 'https://example.com/#contact', github: { user: 'nimo' }
    }));
    const sentence = 'This project has useful public documentation. ';
    const markdown = `# Example\n\n${sentence.repeat(90)}`;
    const pageText = 'Portfolio content. '.repeat(700);
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://example.com/') return new Response(`<main><h1>Page</h1><p>${pageText}</p></main>`);
      if (url.includes('/users/nimo/repos?')) return new Response(JSON.stringify([
        { name: 'a', full_name: 'nimo/a', description: 'Project A', language: 'TypeScript', pushed_at: '2025-01-01T00:00:00Z', html_url: 'https://github.com/nimo/a', default_branch: 'main', fork: false, archived: false, private: false, visibility: 'public' },
        { name: 'b', full_name: 'nimo/b', description: 'Project B', language: 'Python', pushed_at: '2024-01-01T00:00:00Z', html_url: 'https://github.com/nimo/b', default_branch: 'main', fork: false, archived: false, private: false, visibility: 'public' }
      ]));
      if (url.includes('/repos/nimo/a/readme') || url.includes('/repos/nimo/b/readme')) return new Response(JSON.stringify({ encoding: 'base64', content: Buffer.from(markdown).toString('base64') }));
      throw new Error(`Unexpected URL ${url}`);
    }) as typeof fetch;
    process.chdir(root);
    const messages: string[] = [];
    const originalLog = console.log;
    console.log = message => messages.push(String(message));
    try { await syncSite('fixture', fetcher); } finally { console.log = originalLog; }
    const content = await readFile(path.join(root, 'sites', 'fixture', 'content.md'), 'utf8');
    assert.ok(content.length <= 14000);
    assert.match(content, /Language: TypeScript · Updated: January 2025/);
    assert.match(messages.join('\n'), /GitHub README excerpts shortened evenly/);
  } finally {
    process.chdir(original);
    assert.ok(root.startsWith(path.join(original, 'tests') + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});

test('GitHub fetch failure does not replace the existing snapshot', async () => {
  const original = process.cwd();
  const root = await mkdtemp(path.join(original, 'tests', '.sync-'));
  try {
    await mkdir(path.join(root, 'sites', 'fixture'), { recursive: true });
    await writeFile(path.join(root, 'sites', 'fixture', 'site.json'), JSON.stringify({
      siteId: 'fixture', name: 'Fixture', allowedDomains: ['example.com'], greeting: 'Hello',
      starters: ['One', 'Two', 'Three'], sourceUrls: ['https://example.com/'], contactUrl: 'https://example.com/#contact', github: { user: 'nimo' }
    }));
    const snapshot = path.join(root, 'sites', 'fixture', 'content.md');
    await writeFile(snapshot, 'Existing snapshot');
    process.chdir(root);
    const fetcher = (async (input: string | URL | Request) => String(input) === 'https://example.com/'
      ? new Response('<main><h1>Page</h1><p>Readable</p></main>')
      : new Response('Unavailable', { status: 503 })) as typeof fetch;
    await assert.rejects(syncSite('fixture', fetcher), /GitHub fetch failed \(503\)/);
    assert.equal(await readFile(snapshot, 'utf8'), 'Existing snapshot');
  } finally {
    process.chdir(original);
    assert.ok(root.startsWith(path.join(original, 'tests') + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});

test('sources are deduplicated and limited to exact snapshot URLs', () => {
  const content = '## [Projects](https://example.com/#projects)\nText\n## [About](https://example.com/#about)';
  assert.deepEqual(parseSources('[Work](https://example.com/#projects) https://example.com/#projects. [Fake](https://evil.com/) https://example.com/#about-evil', content), [
    { title: 'Projects', url: 'https://example.com/#projects' }
  ]);
});

test('history keeps two user/assistant turns and truncates each message', () => {
  const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, content: String(i).repeat(600) }));
  const trimmed = trimHistory(history);
  assert.equal(trimmed.length, 4);
  assert.equal(trimmed[0].content, '4'.repeat(500));
  assert.ok(trimmed.every(item => item.content.length === 500));
  assert.throws(() => validateChatInput({ siteId: 'nimo', sessionId: 's', message: 'x'.repeat(501) }));
  assert.throws(() => validateChatInput({ siteId: 'nimo', sessionId: 's', message: 'hello', history: [{ role: 'system', content: 'inject' }] }));
});
