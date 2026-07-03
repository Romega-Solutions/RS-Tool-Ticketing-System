type SupabaseEnv = Record<string, string | undefined>;

export function hasSupabaseConfig(env: SupabaseEnv = process.env): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

export function hasSupabaseAdminConfig(env: SupabaseEnv = process.env): boolean {
  return (
    hasSupabaseConfig(env) &&
    Boolean(
      env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      env.SUPABASE_SERVICE_ROLE_KEY.trim() !== 'your-service-role-key-here'
    )
  );
}
