// LabBuddy — Supabase client (server-side, service-role).
//
// The service-role key bypasses RLS, so this client should NEVER be exposed
// to the browser. All DB access from the server goes through `supabase`.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://wdoiyhqeldnrjtrlcjvw.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY env var is required in production.");
  }
  console.warn(
    "[supabase] WARNING: SUPABASE_SERVICE_ROLE_KEY not set. DB calls will fail.",
  );
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || "missing",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

/**
 * Verify a Supabase access token and return the user's UUID, or null if
 * the token is missing/invalid/expired.
 *
 * Note: this makes an HTTP round-trip to Supabase per call. For higher
 * throughput we could swap this for local HS256 verification using the
 * project's JWT secret, but at our scale the simplicity wins.
 */
export async function verifyAccessToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
