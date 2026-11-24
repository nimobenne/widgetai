import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Site, SiteConfig } from './types';

export const siteIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const url = z.url().refine(value => /^https?:\/\//.test(value));
const configSchema = z.object({
  siteId: siteIdSchema,
  name: z.string().min(1),
  allowedDomains: z.array(z.string().regex(/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/)).min(1),
  greeting: z.string().min(1),
  starters: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  sourceUrls: z.array(url).min(1),
  contactUrl: url,
  github: z.object({
    user: z.string().min(1),
    exclude: z.array(z.string()).optional(),
    monorepos: z.array(z.string()).optional()
  }).optional(),
  extraFiles: z.array(z.string().min(1)).optional()
});

export async function getSiteConfig(siteId: string): Promise<SiteConfig | null> {
  if (!siteIdSchema.safeParse(siteId).success) return null;
  try {
    const config = configSchema.parse(JSON.parse(await readFile(path.join(process.cwd(), 'sites', siteId, 'site.json'), 'utf8')));
    if (config.siteId !== siteId) throw new Error('Site ID mismatch');
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function getSite(siteId: string): Promise<Site | null> {
  const config = await getSiteConfig(siteId);
  if (!config) return null;
  const content = await readFile(path.join(process.cwd(), 'sites', siteId, 'content.md'), 'utf8');
  if (!content.trim()) throw new Error('Empty site snapshot');
  return { ...config, content };
}

export async function listSites(): Promise<SiteConfig[]> {
  const entries = await readdir(path.join(process.cwd(), 'sites'), { withFileTypes: true });
  const sites = await Promise.all(entries.filter(entry => entry.isDirectory()).map(entry => getSiteConfig(entry.name)));
  return sites.filter((site): site is SiteConfig => site !== null);
}
