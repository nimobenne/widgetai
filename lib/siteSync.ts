import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSiteConfig } from './sites';
import type { SiteConfig } from './types';

const CONTENT_LIMIT = 14_000;
const GITHUB_API = 'https://api.github.com';

function decode(text: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', copy: '©', middot: '·' };
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (raw, code: string) => {
    if (code.startsWith('#')) {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return entities[code.toLowerCase()] ?? raw;
  });
}

export function scrubPhoneNumbers(text: string): string {
  return text.replace(/\+?\d[\d\s().-]{6,}\d/g, value => {
    const digits = value.replace(/\D/g, '').length;
    return digits >= 9 && digits <= 15 ? '' : value;
  });
}

function clean(text: string): string {
  return scrubPhoneNumbers(decode(text)).replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function htmlToText(html: string, sourceUrl: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] ?? html;
  const filtered = main.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|nav|footer|svg|noscript|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<a\b[^>]*href\s*=\s*["']tel:[^"']*["'][^>]*>[\s\S]*?<\/a\s*>/gi, '');
  const stack: { tag: string; anchor: string }[] = [];
  const sections: string[] = [];
  let heading: { level: number; text: string; anchor: string } | undefined;
  let current = { title: 'Page', level: 2, anchor: '', text: '' };
  const flush = () => {
    const text = clean(current.text);
    if (!text && current.title === 'Page') return;
    const url = new URL(sourceUrl);
    if (current.anchor) url.hash = current.anchor;
    sections.push(`${'#'.repeat(current.level)} [${clean(current.title).replace(/[\[\]]/g, '')}](${url.href})\n\n${text}`);
  };
  for (const token of filtered.match(/<[^>]*>|[^<]+/g) || []) {
    if (!token.startsWith('<')) {
      if (heading) heading.text += token;
      else current.text += token;
      continue;
    }
    const closing = token.match(/^<\/\s*([\w-]+)/)?.[1]?.toLowerCase();
    if (closing) {
      if (/^h[1-6]$/.test(closing) && heading) {
        current = { title: heading.text, level: Math.max(2, heading.level), anchor: heading.anchor, text: '' };
        heading = undefined;
      }
      const index = stack.map(item => item.tag).lastIndexOf(closing);
      if (index >= 0) stack.splice(index);
      if (/^(p|div|section|article|li|ul|ol|br|header)$/.test(closing)) current.text += '\n';
      continue;
    }
    const tag = token.match(/^<\s*([\w-]+)/)?.[1]?.toLowerCase();
    if (!tag) continue;
    const idMatch = token.match(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const anchor = idMatch ? decode(idMatch[1] ?? idMatch[2] ?? idMatch[3]) : stack.at(-1)?.anchor || '';
    if (/^h[1-6]$/.test(tag)) {
      flush();
      heading = { level: Number(tag[1]), text: '', anchor };
    }
    if (/^(p|div|section|article|li|ul|ol|br|header)$/.test(tag)) current.text += '\n';
    if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag) && !token.endsWith('/>')) stack.push({ tag, anchor });
  }
  flush();
  return sections.join('\n\n') + '\n';
}

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  pushed_at: string;
  html_url: string;
  default_branch: string;
  fork: boolean;
  archived: boolean;
  private: boolean;
  visibility?: string;
}

interface GitHubReadme { content: string; encoding: string }
interface GitHubFile { name: string; type: string; path: string; html_url: string }

async function githubJson<T>(url: string, fetcher: typeof fetch, token?: string, allowMissing = false): Promise<T | null> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'WidgetAI-site-sync' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetcher(url, { headers, signal: AbortSignal.timeout(15000) });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub fetch failed (${response.status})`);
  return await response.json() as T;
}

async function listPublicRepos(user: string, fetcher: typeof fetch, token?: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  for (let page = 1; ; page++) {
    const url = `${GITHUB_API}/users/${encodeURIComponent(user)}/repos?type=public&per_page=100&page=${page}`;
    const batch = await githubJson<GitHubRepo[]>(url, fetcher, token);
    if (!batch) throw new Error('GitHub returned no repository list');
    repos.push(...batch.filter(repo => repo.visibility === 'public' && !repo.private && !repo.fork && !repo.archived));
    if (batch.length < 100) break;
  }
  return repos;
}

function decodeReadme(readme: GitHubReadme): string {
  if (readme.encoding !== 'base64') throw new Error('GitHub returned an unsupported README encoding');
  return Buffer.from(readme.content.replace(/\s/g, ''), 'base64').toString('utf8');
}

export function cleanReadme(markdown: string): { title: string; type: string; stack: string; prose: string } {
  let inCode = false;
  const proseLines: string[] = [];
  let title = '';
  let type = '';
  let stack = '';
  const withoutEmbeddedContent = markdown
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  for (const sourceLine of withoutEmbeddedContent.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (/^```|^~~~/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (/^#{1,6}\s*(?:setup|install(?:ation)?|usage|getting[ -]+started|quick[ -]+start|development|running|configuration|license|contributing)\b/i.test(line)) break;
    if (!line) {
      if (proseLines.length && proseLines.at(-1) !== '') proseLines.push('');
      continue;
    }
    if (!title) title = line.match(/^#\s+(.+?)\s*#*$/)?.[1] ?? '';
    const labeled = line.match(/^\*{0,2}(Type|Stack):\*{0,2}\s*(.+)$/i);
    if (labeled) {
      if (labeled[1].toLowerCase() === 'type') type = labeled[2];
      else stack = labeled[2];
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) || /^\s*\|?\s*:?-{3,}/.test(line)) continue;
    if (/^\s*\[[^\]]+\]:\s*\S+/.test(line)) continue;
    if (/^\s*\[!?\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*$/.test(line) || /^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) continue;
    if (/shields\.io|badge|travis-ci|coveralls/i.test(line) && /!\[|\.svg\b|badge/i.test(line)) continue;
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^\s*(?:[-+*]\s+|\d+[.)]\s+|>\s?)/.test(line)) continue;
    const words = line.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
    const numericWords = line.match(/\b[\w.-]*\d[\w.-]*\b/g) ?? [];
    if (words.length < 6 || numericWords.length >= words.length / 2 || (line.match(/,/g)?.length ?? 0) >= words.length / 2) continue;
    proseLines.push(line);
  }
  const prose = proseLines.join('\n').replace(/([^\n])\n(?=[^\n])/g, '$1 ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(?:[\w-]+)(?:\s+[^<>]*?)?\s*\/?>/g, ' ')
    .replace(/^\s*(?:[-+*]\s+|\d+[.)]\s+|>\s?)/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: clean(title.replace(/^#\s*/, '')) || '', type: clean(type), stack: clean(stack), prose: clean(prose) };
}

export function excerptAtMost(prose: string, maxWords: number): string {
  const sentences = prose.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [];
  const result: string[] = [];
  let words = 0;
  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    const count = sentence.split(/\s+/).filter(Boolean).length;
    if (!sentence || !/[.!?]+$/.test(sentence)) break;
    if (words + count > maxWords) {
      if (!result.length && count <= 140) result.push(sentence);
      break;
    }
    result.push(sentence);
    words += count;
  }
  return result.join(' ');
}

interface ProjectEntry {
  title: string;
  url: string;
  description: string;
  language: string;
  pushed: string;
  pushedAt: string;
  type?: string;
  stack?: string;
  prose: string;
}

async function readmeFor(readmeUrl: string, fetcher: typeof fetch, token?: string): Promise<string> {
  const readme = await githubJson<GitHubReadme>(readmeUrl, fetcher, token, true);
  return readme ? decodeReadme(readme) : '';
}

export async function githubProjectEntries(config: NonNullable<SiteConfig['github']>, fetcher: typeof fetch = fetch): Promise<ProjectEntry[]> {
  const token = process.env.GITHUB_TOKEN;
  const excluded = new Set(config.exclude ?? []);
  const repos = (await listPublicRepos(config.user, fetcher, token))
    .filter(repo => !excluded.has(repo.name) && !excluded.has(repo.full_name));
  const entries: ProjectEntry[] = [];
  for (const repo of repos) {
    const common = {
      description: clean(repo.description ?? ''),
      language: clean(repo.language ?? ''),
      pushed: repo.pushed_at.slice(0, 7),
      pushedAt: repo.pushed_at
    };
    if ((config.monorepos ?? []).includes(repo.name) || (config.monorepos ?? []).includes(repo.full_name)) {
      const contentsUrl = `${GITHUB_API}/repos/${repo.full_name}/contents?ref=${encodeURIComponent(repo.default_branch)}`;
      const files = await githubJson<GitHubFile[]>(contentsUrl, fetcher, token);
      if (!Array.isArray(files)) throw new Error(`GitHub returned invalid contents for ${repo.name}`);
      for (const directory of files.filter(file => file.type === 'dir')) {
        const readmeUrl = `${GITHUB_API}/repos/${repo.full_name}/contents/${directory.path}/README.md?ref=${encodeURIComponent(repo.default_branch)}`;
        const markdown = await readmeFor(readmeUrl, fetcher, token);
        if (!markdown) continue;
        const cleaned = cleanReadme(markdown);
        if (!common.description && !cleaned.prose && !cleaned.title) continue;
        entries.push({ title: cleaned.title || directory.name, url: directory.html_url, ...common, type: cleaned.type, stack: cleaned.stack, prose: cleaned.prose });
      }
      continue;
    }
    const markdown = await readmeFor(`${GITHUB_API}/repos/${repo.full_name}/readme`, fetcher, token);
    const cleaned = cleanReadme(markdown);
    if (!common.description && !cleaned.prose && !cleaned.title) continue;
    entries.push({ title: cleaned.title || repo.name, url: repo.html_url, ...common, type: cleaned.type, stack: cleaned.stack, prose: cleaned.prose });
  }
  return entries.sort((a, b) => b.pushedAt.localeCompare(a.pushedAt) || a.title.localeCompare(b.title));
}

function renderProjects(entries: ProjectEntry[], wordLimit: number): string {
  return entries.map(entry => {
    const metadata = [entry.description, ...(entry.type ? [`Type: ${entry.type}`] : []), ...(entry.stack ? [`Stack: ${entry.stack}`] : [])];
    const date = entry.pushed ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${entry.pushed}-01T00:00:00Z`)) : '';
    const details = [entry.language ? `Language: ${entry.language}` : '', date ? `Updated: ${date}` : ''].filter(Boolean).join(' · ');
    const prose = excerptAtMost(entry.prose, wordLimit);
    return `### [${entry.title}](${entry.url})\n\n${[...metadata, details, prose].filter(Boolean).join('\n\n')}`;
  }).join('\n\n');
}

async function buildSnapshot(siteId: string, site: SiteConfig, fetcher: typeof fetch): Promise<string> {
  const sections: string[] = [];
  for (const url of site.sourceUrls) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Source fetch failed (${response.status})`);
    const content = htmlToText(await response.text(), url);
    if (!content.trim()) throw new Error('Source has no readable text');
    sections.push(content);
  }
  const pageSnapshot = sections.join('\n');
  const siteDir = path.join(process.cwd(), 'sites', siteId);
  let extraContent = '';
  for (const file of site.extraFiles ?? []) {
    if (path.basename(file) !== file || file === '.' || file === '..') throw new Error('Extra file must be a file name within the site directory');
    try {
      const extra = await readFile(path.join(siteDir, file), 'utf8');
      if (extra.length) extraContent += `${extraContent.endsWith('\n') ? '' : '\n'}\n${scrubPhoneNumbers(extra)}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  let snapshot = pageSnapshot;
  if (site.github) {
    const entries = await githubProjectEntries(site.github, fetcher);
    const prefix = `## [GitHub projects](https://github.com/${encodeURIComponent(site.github.user)})`;
    let wordLimit = 90;
    let githubSection = entries.length ? `${prefix}\n\n${renderProjects(entries, wordLimit)}` : prefix;
    const withSection = (section: string) => `${pageSnapshot}${pageSnapshot.endsWith('\n') ? '' : '\n'}\n${section}\n${extraContent}`;
    snapshot = withSection(githubSection);
    while (snapshot.length > CONTENT_LIMIT && wordLimit > 0) {
      wordLimit--;
      githubSection = entries.length ? `${prefix}\n\n${renderProjects(entries, wordLimit)}` : prefix;
      snapshot = withSection(githubSection);
    }
    if (wordLimit < 90) console.log(`GitHub README excerpts shortened evenly to ${wordLimit} words to fit ${CONTENT_LIMIT} characters.`);
    if (snapshot.length > CONTENT_LIMIT) throw new Error(`Snapshot exceeds ${CONTENT_LIMIT} characters after shortening GitHub excerpts`);
  }
  else snapshot += extraContent;
  if (snapshot.length > CONTENT_LIMIT) throw new Error(`Snapshot exceeds ${CONTENT_LIMIT} characters`);
  return snapshot;
}

export async function syncSite(siteId: string, fetcher: typeof fetch = fetch): Promise<void> {
  const site = await getSiteConfig(siteId);
  if (!site) throw new Error('Unknown site');
  const snapshot = await buildSnapshot(siteId, site, fetcher);
  const target = path.join(process.cwd(), 'sites', siteId, 'content.md');
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, snapshot, 'utf8');
  await rename(temporary, target);
}
