import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiKey } from './keys';
import { ApiError, unavailable } from './format';

export async function rateHit(db: SupabaseClient, key: ApiKey, now = Date.now()) {
  const start = Math.floor(now / 60000) * 60000;
  const { data, error } = await db.rpc('api_rate_hit', { p_key: key.id, p_bucket: 'read:minute', p_window: new Date(start).toISOString() });
  if (error || !Number.isSafeInteger(data) || data < 1) throw unavailable();
  if (data > key.rate_read_per_min) throw new ApiError(429, 'rate_limited', 'Read limit exceeded', Math.max(1, Math.ceil((start + 60000 - now) / 1000)));
}
