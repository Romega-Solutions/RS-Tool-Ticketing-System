import LoginForm from './login-form';
import { isPreviewRoleSwitcherEnabled } from '@/lib/preview-role-switcher';

// Rendered per request so the preview-only guards are evaluated at request
// time on the server, never baked into a static page at build time.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <LoginForm previewRoleSwitcher={isPreviewRoleSwitcherEnabled()} />;
}
