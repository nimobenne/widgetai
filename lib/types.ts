export interface SiteConfig {
  siteId: string;
  name: string;
  allowedDomains: string[];
  greeting: string;
  starters: [string, string, string];
  sourceUrls: string[];
  contactUrl: string;
  github?: { user: string; exclude?: string[]; monorepos?: string[] };
  extraFiles?: string[];
}

export interface Site extends SiteConfig { content: string }
export interface Source { title: string; url: string }
export interface HistoryMessage { role: 'user' | 'assistant'; content: string }
export interface UsageInput {
  ipHash: string;
  sessionHash: string;
  dailyCap: number;
  monthlyCap: number;
}
