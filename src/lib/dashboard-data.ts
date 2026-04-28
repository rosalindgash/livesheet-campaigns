import { getAuthEnvStatus } from "@/lib/auth";
import {
  getConnectedGoogleAccount,
  type ConnectedGoogleAccount,
} from "@/lib/google/accounts";
import { getGoogleOAuthEnvStatus } from "@/lib/google/oauth";
import { createSupabaseAdminClient, getSupabaseEnvStatus } from "@/lib/supabase/server";

export type DashboardSnapshot = {
  auth: {
    configured: boolean;
    missing: string[];
  };
  database: {
    configured: boolean;
    missing: string[];
    reachable: boolean;
    error?: string;
  };
  totals: {
    campaigns: number;
    sentToday: number;
    recentRuns: number;
  };
  settings: {
    ownerEmail: string | null;
    globalDailySendCap: number | null;
    timezone: string | null;
  };
  google: {
    configured: boolean;
    missing: string[];
    account: ConnectedGoogleAccount | null;
    error?: string;
  };
};

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const auth = getAuthEnvStatus();
  const database = getSupabaseEnvStatus();
  const google = getGoogleOAuthEnvStatus();
  const emptyTotals = { campaigns: 0, sentToday: 0, recentRuns: 0 };

  if (!database.configured) {
    return {
      auth,
      database: {
        configured: false,
        missing: database.missing,
        reachable: false,
      },
      totals: emptyTotals,
      settings: emptySettings(),
      google: {
        configured: google.configured,
        missing: google.missing,
        account: null,
      },
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [settingsResult, campaignsResult, sentTodayResult, recentRunsResult] = await Promise.all([
      supabase
        .from("app_settings")
        .select("owner_email, global_daily_send_cap, timezone")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase.from("campaigns").select("id", { count: "exact", head: true }),
      supabase
        .from("send_history")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", startOfToday.toISOString()),
      supabase.from("campaign_runs").select("id", { count: "exact", head: true }).limit(10),
    ]);

    const firstError =
      settingsResult.error ??
      campaignsResult.error ??
      sentTodayResult.error ??
      recentRunsResult.error;

    if (firstError) {
      throw firstError;
    }

    const googleAccount = await loadGoogleAccount();

    return {
      auth,
      database: {
        configured: true,
        missing: [],
        reachable: true,
      },
      totals: {
        campaigns: campaignsResult.count ?? 0,
        sentToday: sentTodayResult.count ?? 0,
        recentRuns: recentRunsResult.count ?? 0,
      },
      settings: {
        ownerEmail: settingsResult.data?.owner_email ?? null,
        globalDailySendCap: settingsResult.data?.global_daily_send_cap ?? null,
        timezone: settingsResult.data?.timezone ?? null,
      },
      google: {
        configured: google.configured,
        missing: google.missing,
        account: googleAccount.account,
        error: googleAccount.error,
      },
    };
  } catch (error) {
    return {
      auth,
      database: {
        configured: true,
        missing: [],
        reachable: false,
        error: formatErrorMessage(error, "Unknown Supabase connection error"),
      },
      totals: emptyTotals,
      settings: emptySettings(),
      google: {
        configured: google.configured,
        missing: google.missing,
        account: null,
      },
    };
  }
}

function emptySettings() {
  return {
    ownerEmail: null,
    globalDailySendCap: null,
    timezone: null,
  };
}

async function loadGoogleAccount(): Promise<{
  account: ConnectedGoogleAccount | null;
  error?: string;
}> {
  try {
    return {
      account: await getConnectedGoogleAccount(),
    };
  } catch (error) {
    return {
      account: null,
      error: formatErrorMessage(error, "Unable to load Google account."),
    };
  }
}

function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}
