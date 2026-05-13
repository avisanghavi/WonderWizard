// LabBuddy — Supabase client (browser-side).
//
// Uses the publishable (anon) key — safe to expose to the browser. All access
// is gated by Row-Level Security on the Supabase project. The auth session is
// persisted in localStorage by supabase-js and refreshed automatically.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://wdoiyhqeldnrjtrlcjvw.supabase.co";

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "sb_publishable_bN-v6H1EzlreigKZahR-Ng_5PryNnrM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
