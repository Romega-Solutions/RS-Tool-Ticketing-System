import { botRoute } from '@/lib/bot-api/auth';
import { comments } from '@/lib/bot-api/read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const guarded = botRoute('tasks:read', comments, '/api/bot/v1/tasks/{id}/comments');
export { guarded as GET, guarded as HEAD, guarded as OPTIONS, guarded as POST, guarded as PUT, guarded as PATCH, guarded as DELETE };
