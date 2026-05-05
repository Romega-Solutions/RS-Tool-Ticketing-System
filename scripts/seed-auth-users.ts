/**
 * Creates Supabase Auth users for all accounts in public.users.
 * Run once after setting up Supabase:
 *
 *   npx tsx scripts/seed-auth-users.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEFAULT_PASS   = 'Demo@1234';

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY === 'your-service-role-key-here') {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_USERS = [
  { email: 'ken@romega-solutions.com',    password: DEFAULT_PASS },
  { email: 'mark@romega-solutions.com',   password: DEFAULT_PASS },
  { email: 'anna@romega-solutions.com',   password: DEFAULT_PASS },
  { email: 'john@romega-solutions.com',   password: DEFAULT_PASS },
  { email: 'miguel@romega-solutions.com', password: DEFAULT_PASS },
  { email: 'sofia@romega-solutions.com',  password: DEFAULT_PASS },
  { email: 'trisha@romega-solutions.com', password: DEFAULT_PASS },
  { email: 'rafael@romega-solutions.com', password: DEFAULT_PASS },
];

async function main() {
  for (const user of DEMO_USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true, // skip email verification for internal users
    });

    if (error) {
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        console.log(`  skip  ${user.email} (already exists)`);
      } else {
        console.error(`  ERROR ${user.email}: ${error.message}`);
      }
    } else {
      console.log(`  created ${user.email}  (id: ${data.user?.id})`);
    }
  }
  console.log('\nDone. All users can sign in with password: Demo@1234');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
