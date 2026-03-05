
/**
 * Central configuration for external services.
 * Insert your Supabase details here.
 */
export const SUPABASE_CONFIG = {
  // Your Supabase Project URL (e.g., https://xyz.supabase.co)
  url: import.meta.env.VITE_SUPABASE_URL,

  // Your Supabase Publishable Key (often called 'anon' key)
  // This is safe and REQUIRED to be exposed to the browser. 
  // Supabase restricts access using Database Row Level Security (RLS), not by hiding this key.
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};
