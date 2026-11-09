import { botRoute } from '@/lib/bot-api/auth';
import { activity } from '@/lib/bot-api/read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const guarded = botRoute('tasks:read', activity, '/api/bot/v1/tasks/{id}/activity');
export { guarded as GET, guarded as HEAD, guarded as OPTIONS, guarded as POST, guarded as PUT, guarded as PATCH, guarded as DELETE };
