import { runCampaign } from "@/lib/campaign-runner";
import { listCampaigns, type Campaign, type SendDay } from "@/lib/campaigns";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ScheduledRunRow = {
  finished_at: string | null;
  id: string;
  scheduled_date: string | null;
  started_at: string;
  status: string;
};

export type CampaignScheduleSummary = {
  due: boolean;
  localDate: string;
  localDay: SendDay;
  localTime: string;
  nextDescription: string;
  reason: string;
  scheduleDescription: string;
};

export type CampaignScheduleDetails = {
  lastScheduledRun: ScheduledRunRow | null;
  summary: CampaignScheduleSummary;
};

export type SchedulerCampaignResult = {
  action: "dry-run" | "not-due" | "skipped" | "started";
  campaignId: string;
  campaignName: string;
  due: boolean;
  localDate: string;
  localTime: string;
  reason: string;
  runId: string | null;
};

export type SchedulerRunResult = {
  dryRun: boolean;
  finishedAt: string;
  results: SchedulerCampaignResult[];
  startedAt: string;
};

const DAY_MAP: Record<string, SendDay> = {
  Fri: "FRI",
  Mon: "MON",
  Sat: "SAT",
  Sun: "SUN",
  Thu: "THU",
  Tue: "TUE",
  Wed: "WED",
};

export async function runDueCampaigns({
  dryRun = false,
  now = new Date(),
}: {
  dryRun?: boolean;
  now?: Date;
} = {}): Promise<SchedulerRunResult> {
  const startedAt = new Date().toISOString();
  const campaigns = (await listCampaigns()).filter((campaign) => campaign.status === "active");
  const results: SchedulerCampaignResult[] = [];

  for (const campaign of campaigns) {
    const summary = getCampaignScheduleSummary(campaign, now);
    const existingRun = summary.due
      ? await getScheduledRunForDate(campaign.id, summary.localDate)
      : null;

    if (!summary.due) {
      results.push({
        action: "not-due",
        campaignId: campaign.id,
        campaignName: campaign.name,
        due: false,
        localDate: summary.localDate,
        localTime: summary.localTime,
        reason: summary.reason,
        runId: null,
      });
      continue;
    }

    if (existingRun) {
      results.push({
        action: "skipped",
        campaignId: campaign.id,
        campaignName: campaign.name,
        due: true,
        localDate: summary.localDate,
        localTime: summary.localTime,
        reason: existingRun.finished_at
          ? "Scheduled run already completed for this campaign date."
          : "Scheduled run is already in progress for this campaign date.",
        runId: existingRun.id,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        action: "dry-run",
        campaignId: campaign.id,
        campaignName: campaign.name,
        due: true,
        localDate: summary.localDate,
        localTime: summary.localTime,
        reason: "Campaign is due. Dry run did not send email.",
        runId: null,
      });
      continue;
    }

    const runResult = await runCampaign(campaign.id, {
      runType: "scheduled",
      scheduledDate: summary.localDate,
    });

    results.push({
      action: runResult.started ? "started" : "skipped",
      campaignId: campaign.id,
      campaignName: campaign.name,
      due: true,
      localDate: summary.localDate,
      localTime: summary.localTime,
      reason: runResult.started
        ? "Scheduled campaign run started and finished."
        : "Scheduled run was already started by another cron request.",
      runId: runResult.runId,
    });
  }

  return {
    dryRun,
    finishedAt: new Date().toISOString(),
    results,
    startedAt,
  };
}

export async function getCampaignScheduleDetails(
  campaign: Campaign,
  now = new Date(),
): Promise<CampaignScheduleDetails> {
  const [lastScheduledRun] = await Promise.all([getLastScheduledRun(campaign.id)]);

  return {
    lastScheduledRun,
    summary: getCampaignScheduleSummary(campaign, now),
  };
}

export function getCampaignScheduleSummary(
  campaign: Campaign,
  now = new Date(),
): CampaignScheduleSummary {
  const zonedNow = getZonedDateParts(now, campaign.timezone);
  const sendDays = campaign.sendDays.length > 0 ? campaign.sendDays.join(", ") : "No send days";
  const scheduleDescription = `${sendDays} at ${campaign.sendTime} ${campaign.timezone}`;

  if (campaign.status !== "active") {
    return {
      due: false,
      localDate: zonedNow.date,
      localDay: zonedNow.day,
      localTime: zonedNow.time,
      nextDescription: scheduleDescription,
      reason: `Campaign is ${campaign.status}; scheduled runs require active status.`,
      scheduleDescription,
    };
  }

  if (!campaign.sendDays.includes(zonedNow.day)) {
    return {
      due: false,
      localDate: zonedNow.date,
      localDay: zonedNow.day,
      localTime: zonedNow.time,
      nextDescription: scheduleDescription,
      reason: `${zonedNow.day} is not one of this campaign's send days.`,
      scheduleDescription,
    };
  }

  if (zonedNow.time < campaign.sendTime) {
    return {
      due: false,
      localDate: zonedNow.date,
      localDay: zonedNow.day,
      localTime: zonedNow.time,
      nextDescription: `${zonedNow.date} at ${campaign.sendTime} ${campaign.timezone}`,
      reason: `Current campaign time ${zonedNow.time} is before send time ${campaign.sendTime}.`,
      scheduleDescription,
    };
  }

  return {
    due: true,
    localDate: zonedNow.date,
    localDay: zonedNow.day,
    localTime: zonedNow.time,
    nextDescription: `${zonedNow.date} at ${campaign.sendTime} ${campaign.timezone}`,
    reason: "Campaign is due for today's scheduled window.",
    scheduleDescription,
  };
}

async function getScheduledRunForDate(
  campaignId: string,
  scheduledDate: string,
): Promise<ScheduledRunRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("campaign_runs")
    .select("id, scheduled_date, started_at, finished_at, status")
    .eq("campaign_id", campaignId)
    .eq("run_type", "scheduled")
    .eq("scheduled_date", scheduledDate)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<ScheduledRunRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function getLastScheduledRun(campaignId: string): Promise<ScheduledRunRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("campaign_runs")
    .select("id, scheduled_date, started_at, finished_at, status")
    .eq("campaign_id", campaignId)
    .eq("run_type", "scheduled")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<ScheduledRunRow>();

  if (error) {
    throw error;
  }

  return data;
}

function getZonedDateParts(date: Date, timeZone: string): {
  date: string;
  day: SendDay;
  time: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    weekday: "short",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = values.hour === "24" ? "00" : values.hour;
  const weekday = DAY_MAP[values.weekday ?? ""] ?? "MON";

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    day: weekday,
    time: `${hour}:${values.minute}`,
  };
}
