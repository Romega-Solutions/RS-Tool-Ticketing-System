type SupabaseEnv = Record<string, string | undefined>;

export function hasSupabaseConfig(env: SupabaseEnv = process.env): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  );
}

export function hasSupabaseAdminConfig(env: SupabaseEnv = process.env): boolean {
  return (
    hasSupabaseConfig(env) &&
    Boolean(
      env.SUPABASE_SECRET_KEY?.trim() &&
      env.SUPABASE_SECRET_KEY.trim() !== 'your-secret-key-here'
    )
  );
}
