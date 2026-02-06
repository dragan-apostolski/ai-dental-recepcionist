
/**
 * Central configuration for external services.
 * Insert your Supabase details here.
 */
export const SUPABASE_CONFIG = {
  // Your Supabase Project URL (e.g., https://xyz.supabase.co)
  url: process.env.VITE_SUPABASE_URL,

  // Your Supabase Publishable Key (sb_publishable_...)
  // This is used for client-side operations restricted by Row Level Security (RLS).
  publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,

  // Your Supabase Secret Key (sb_secret_...)
  // WARNING: Never expose this in a public client-side application in production.
  // It is provided here for completeness, but the app uses the Publishable Key by default.
  secretKey: process.env.VITE_SUPABASE_SECRET_KEY
};
