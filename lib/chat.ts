import { NextRequest } from 'next/server';
import { z } from 'zod';
import { runAssistant, validateChatInput } from './ai';
import { getSite } from './sites';
import { getStore } from './store';
import { usageInput } from './limits';
import { verifyWidgetToken } from './widgetToken';
import { BodyError, originAllowed, readBody, requestHost, widgetJson } from './widgetHttp';
import { logFailure, requiredEnv, type FailureService } from './observability';
import type { Site } from './types';

export function createChatHandler(deps = { getStore, runAssistant }) {
  return async (req: NextRequest) => {
    let site: Site | null = null;
    let service: FailureService = 'request';
    const limited = (status: number) => widgetJson(req, site, {
      message: `The assistant is taking a break. Please try again later or use [the contact section](${site?.contactUrl || 'https://nimobenne.github.io/#contact'}).`, limited: true
    }, status);
    // The kill switch runs before body reads, database access, or client construction.
    if (process.env.CHAT_ENABLED !== 'true') {
      // Read only the bounded public site ID to supply the right contact link and CORS.
      try {
        const body = await readBody(req);
        if (body && typeof body === 'object' && 'siteId' in body && typeof body.siteId === 'string') site = await getSite(body.siteId);
      } catch { /* Disabled even if config is unavailable. */ }
      return limited(503);
    }
    try {
      const input = validateChatInput(await readBody(req));
      site = await getSite(input.siteId);
      if (!site) return widgetJson(req, null, { message: 'Unknown site' }, 404);
      if (!originAllowed(req, site)) return widgetJson(req, site, { message: 'Origin not allowed' }, 403);
      requiredEnv('WIDGET_SIGNING_SECRET');
      if (!verifyWidgetToken(req.headers.get('x-widget-token'), { siteId: site.siteId, host: requestHost(req) }).ok) {
        return widgetJson(req, site, { message: 'Please reload the assistant to reconnect.' }, 401);
      }
      service = 'db';
      const store = deps.getStore();
      if (!await store.reserveUsage(usageInput(req.headers, input.siteId, input.sessionId))) return limited(429);
      service = 'openai';
      const result = await deps.runAssistant(site, input);
      service = 'db';
      await store.logQuestion(site.siteId, input.message, result.answered);
      return widgetJson(req, site, { message: result.message, sources: result.sources });
    } catch (error) {
      if (error instanceof BodyError) return widgetJson(req, site, { message: error.message }, error.status);
      if (error instanceof z.ZodError) return widgetJson(req, site, { message: 'Please send a message of 1 to 500 characters.' }, 400);
      logFailure('/api/chat', error, service);
      return limited(503);
    }
  };
}
