import { NextRequest } from 'next/server';
import { getSite } from '@/lib/sites';
import { signWidgetToken } from '@/lib/widgetToken';
import { originAllowed, requestHost, widgetJson, widgetOptions } from '@/lib/widgetHttp';
import { logFailure } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const site = await getSite(req.nextUrl.searchParams.get('siteId') || '');
  if (!site) return widgetJson(req, null, { message: 'Unknown site' }, 404);
  if (!originAllowed(req, site)) return widgetJson(req, site, { message: 'Origin not allowed' }, 403);
  try {
    return widgetJson(req, site, { siteId: site.siteId, name: site.name, greeting: site.greeting, starters: site.starters, widgetToken: signWidgetToken({ siteId: site.siteId, host: requestHost(req) }) });
  } catch (error) {
    logFailure('/api/widget/config', error);
    return widgetJson(req, site, { message: 'The assistant is unavailable.' }, 503);
  }
}
export const OPTIONS = widgetOptions;
