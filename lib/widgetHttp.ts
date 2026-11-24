import { NextRequest, NextResponse } from 'next/server';
import { domainAllowed } from './domainCheck';
import { getSite, listSites } from './sites';
import type { SiteConfig } from './types';

export function requestHost(req: NextRequest): string {
  const origin = req.headers.get('origin');
  if (origin === null) return req.nextUrl.hostname.toLowerCase();
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) return '';
    return url.hostname.toLowerCase();
  } catch { return ''; }
}

export function originAllowed(req: NextRequest, site: SiteConfig): boolean {
  const host = requestHost(req);
  return !!host && domainAllowed(host, site.allowedDomains);
}

export async function widgetJson(req: NextRequest, site: SiteConfig | null, payload: unknown, status = 200) {
  const response = NextResponse.json(payload, { status });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Vary', 'Origin');
  let allowed = site ? originAllowed(req, site) : false;
  if (!site) {
    try { allowed = (await listSites()).some(config => originAllowed(req, config)); }
    catch { /* A missing allowlist must never enable cross-origin reads. */ }
  }
  if (allowed && req.headers.get('origin')) response.headers.set('Access-Control-Allow-Origin', req.headers.get('origin')!);
  return response;
}

export class BodyError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function readBody(req: NextRequest): Promise<unknown> {
  if (Number(req.headers.get('content-length')) > 4096) throw new BodyError(413, 'Request is too large');
  const reader = req.body?.getReader();
  if (!reader) throw new BodyError(400, 'JSON body required');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new BodyError(413, 'Request is too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new BodyError(400, 'Invalid JSON'); }
}

export async function widgetOptions(req: NextRequest) {
  // The contract sends siteId in POST bodies, which preflights cannot carry.
  // With no query ID, allow an origin registered to any site; POST rechecks its exact site.
  const siteId = req.nextUrl.searchParams.get('siteId');
  const sites = siteId ? [await getSite(siteId)].filter((site): site is NonNullable<typeof site> => site !== null) : await listSites();
  const allowed = sites.some(site => originAllowed(req, site));
  const response = new NextResponse(null, { status: allowed ? 204 : 403 });
  response.headers.set('Vary', 'Origin');
  if (allowed) {
    response.headers.set('Access-Control-Allow-Origin', req.headers.get('origin') || req.nextUrl.origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-widget-token');
  }
  return response;
}
