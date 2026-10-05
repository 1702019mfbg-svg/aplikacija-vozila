const env = import.meta.env

export const config = {
  supabaseUrl: (env.VITE_SUPABASE_URL as string | undefined)?.trim(),
  supabaseKey: ((env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined)?.trim(),
  /** Demo režim: podaci su u memoriji, bez Supabase-a. Samo za razvoj i probu. */
  demo: __DEMO__,
}

export const isConfigured = config.demo || Boolean(config.supabaseUrl && config.supabaseKey)
