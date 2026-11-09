import { botRoute } from '@/lib/bot-api/auth';
import { states } from '@/lib/bot-api/read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const guarded = botRoute('tasks:read', states, '/api/bot/v1/projects/{id}/states');
export { guarded as GET, guarded as HEAD, guarded as OPTIONS, guarded as POST, guarded as PUT, guarded as PATCH, guarded as DELETE };
