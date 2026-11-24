import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSite, siteIdSchema } from '@/lib/sites';
import { signWidgetToken, verifyWidgetToken } from '@/lib/widgetToken';
import { BodyError, originAllowed, readBody, requestHost, widgetJson, widgetOptions } from '@/lib/widgetHttp';
import type { Site } from '@/lib/types';
import { logFailure, requiredEnv } from '@/lib/observability';

export async function POST(req: NextRequest) {
  let site: Site | null = null;
  try {
    const { siteId } = z.object({ siteId: siteIdSchema }).parse(await readBody(req));
    site = await getSite(siteId);
    if (!site) return widgetJson(req, null, { message: 'Unknown site' }, 404);
    if (!originAllowed(req, site)) return widgetJson(req, site, { message: 'Origin not allowed' }, 403);
    const expected = { siteId, host: requestHost(req) };
    requiredEnv('WIDGET_SIGNING_SECRET');
    if (!verifyWidgetToken(req.headers.get('x-widget-token'), expected, { graceSeconds: 300 }).ok) return widgetJson(req, site, { message: 'Please reload the assistant to reconnect.' }, 401);
    return widgetJson(req, site, { widgetToken: signWidgetToken(expected) });
  } catch (error) {
    if (!(error instanceof BodyError) && !(error instanceof z.ZodError)) logFailure('/api/widget/token/refresh', error);
    return widgetJson(req, site, { message: 'Unable to refresh the assistant.' }, error instanceof BodyError ? error.status : error instanceof z.ZodError ? 400 : 503);
  }
}
export const OPTIONS = widgetOptions;
