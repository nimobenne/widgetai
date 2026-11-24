import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { ConfigurationError, logFailure } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) {
    logFailure('/api/cron/prune', new ConfigurationError('CRON_SECRET'));
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json({ ok: true, pruned: await getStore().prune() }); }
  catch (error) {
    logFailure('/api/cron/prune', error, 'db');
    return NextResponse.json({ message: 'Pruning failed' }, { status: 503 });
  }
}
