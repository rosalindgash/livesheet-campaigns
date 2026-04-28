import { createClient } from "@supabase/supabase-js";

import { getRequiredEnvStatus, requireEnv } from "@/lib/env";

export function getSupabaseEnvStatus() {
  return getRequiredEnvStatus(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
}

export function createSupabaseAdminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
