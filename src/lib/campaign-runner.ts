import { getCampaign, type Campaign, type SendDay } from "@/lib/campaigns";
import { getValidGoogleAccessToken, refreshGoogleAccessToken } from "@/lib/google/accounts";
import { isGmailAuthError, sendGmailMessage, type GmailSendResult } from "@/lib/google/gmail";
import {
  buildTemplateContext,
  renderTemplate,
  renderTemplateBodyWithUnsubscribe,
} from "@/lib/templates";
import {
  buildUnsubscribeUrl,
  generateUnsubscribeToken,
  getSendSuppressionStatus,
} from "@/lib/unsubscribe";
import {
  fetchCampaignSheetRows,
  getCampaignColumnMapping,
  getMissingRequiredColumns,
  normalizeHeader,
  updateCampaignSheetRow,
  type CampaignColumnMapping,
  type SheetDataRow,
} from "@/lib/sheets";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const TOUCH_1_SENT = "touch_1_sent";
const TOUCH_2_SENT = "touch_2_sent";
const TOUCH_3_SENT = "touch_3_sent";
const COMPLETED = "completed";
const SEQUENCE_STEP_NUMBERS = [1, 2, 3] as const;

type SequenceStepNumber = 1 | 2 | 3;

const DAY_MAP: Record<string, SendDay> = {
  Fri: "FRI",
  Mon: "MON",
  Sat: "SAT",
  Sun: "SUN",
  Thu: "THU",
  Tue: "TUE",
  Wed: "WED",
};

type ActiveSequenceStep = {
  bodyTemplate: string;
  delayDaysAfterPreviousStep: number;
  id: string;
  stepNumber: SequenceStepNumber;
  subjectTemplate: string;
};

type AppSettingsRow = {
  global_daily_send_cap: number | null;
  timezone: string | null;
};

type GlobalSendSettings = {
  dailySendCap: number;
  timezone: string;
};

type RunStats = {
  capLimited: boolean;
  eligibleNotProcessedDueToCap: number;
  eligibleRowsFound: number;
  emailsSelectedForRun: number;
  emailsSent: number;
  emailsSkipped: number;
  errors: string[];
  rowsScanned: number;
  stepStats: Record<SequenceStepNumber, StepRunStats>;
};

type CandidateRow = {
  email: string;
  row: SheetDataRow;
  snapshot: Record<string, unknown>;
  step: ActiveSequenceStep;
};

type SendHistoryStatus = "failed" | "sent" | "skipped";

type StepRunStats = {
  failed: number;
  selected: number;
  sent: number;
  skipped: number;
};

type StepDailyCaps = Record<SequenceStepNumber, number>;

type AvailableCapacity = {
  stepCaps: StepDailyCaps;
  total: number;
};

export type CampaignRunType = "manual" | "scheduled";

export type CampaignRunResult = {
  runId: string | null;
  skippedReason?: "already-started" | "outside-send-day";
  started: boolean;
};

export async function runCampaignNow(campaignId: string): Promise<CampaignRunResult> {
  return runCampaign(campaignId, { runType: "manual" });
}

export async function runCampaign(
  campaignId: string,
  {
    runType = "manual",
    scheduledDate = null,
  }: {
    runType?: CampaignRunType;
    scheduledDate?: string | null;
  } = {},
): Promise<CampaignRunResult> {
  const campaign = await getCampaign(campaignId);

  if (runType === "manual" && !isSelectedSendDay(campaign, new Date())) {
    return {
      runId: null,
      skippedReason: "outside-send-day",
      started: false,
    };
  }

  if (!campaign.googleAccountId || !campaign.sheetId || !campaign.worksheetName) {
    throw new Error("Campaign must have a Google account, Sheet ID, and worksheet before running.");
  }

  const supabase = createSupabaseAdminClient();
  const startedAt = new Date();
  const runId = await createCampaignRun({
    campaignId,
    runType,
    scheduledDate,
    startedAt,
  });

  if (!runId) {
    return {
      runId: null,
      skippedReason: "already-started",
      started: false,
    };
  }

  const stats: RunStats = {
    capLimited: false,
    eligibleNotProcessedDueToCap: 0,
    eligibleRowsFound: 0,
    emailsSelectedForRun: 0,
    emailsSent: 0,
    emailsSkipped: 0,
    errors: [],
    rowsScanned: 0,
    stepStats: getEmptyStepStats(),
  };

  try {
    const [mapping, steps, sheetRows, globalSendSettings] = await Promise.all([
      getCampaignColumnMapping(campaignId),
      getActiveSequenceSteps(campaignId),
      fetchCampaignSheetRows({
        googleAccountId: campaign.googleAccountId,
        sheetId: campaign.sheetId,
        worksheetName: campaign.worksheetName,
      }),
      getGlobalSendSettings(),
    ]);
    const repliedRecipients = await getDetectedReplyRecipients(campaignId);

    if (!steps[1]) {
      throw new Error("Active Step 1 template is required before running this campaign.");
    }

    const missingRequiredColumns = getMissingRequiredColumns(sheetRows.headers, mapping);

    if (missingRequiredColumns.length > 0) {
      throw new Error(`Sheet is missing required columns: ${missingRequiredColumns.join(", ")}`);
    }

    const candidates = await getCandidateRows({
      headers: sheetRows.headers,
      mapping,
      repliedRecipients,
      rows: sheetRows.rows,
      steps,
    });
    const capacity = await getAvailableCapacity({
      campaign,
      globalDailySendCap: globalSendSettings.dailySendCap,
      globalTimezone: globalSendSettings.timezone,
      steps,
    });
    const selectedRows = selectCandidatesForRun(candidates, capacity);

    stats.rowsScanned = sheetRows.rows.length;
    stats.eligibleRowsFound = candidates.length;
    stats.emailsSelectedForRun = selectedRows.length;
    stats.eligibleNotProcessedDueToCap = Math.max(0, candidates.length - selectedRows.length);
    stats.capLimited = stats.eligibleNotProcessedDueToCap > 0;
    countSelectedSteps(stats, selectedRows);

    for (const candidate of selectedRows) {
      await processSelectedRow({
        campaign,
        candidate,
        headers: sheetRows.headers,
        mapping,
        stats,
      });
    }

    const status = getRunStatus(stats);
    const now = new Date().toISOString();
    await Promise.all([
      updateCampaignRun(runId, stats, status),
      supabase
        .from("campaigns")
        .update({
          last_run_at: now,
          last_successful_run_at: status === "failed" ? campaign.lastSuccessfulRunAt : now,
        })
        .eq("id", campaignId),
    ]);
  } catch (error) {
    stats.errors.push(formatError(error));
    await Promise.all([
      updateCampaignRun(runId, stats, "failed"),
      supabase.from("campaigns").update({ last_run_at: new Date().toISOString() }).eq("id", campaignId),
    ]);
  }

  return {
    runId,
    started: true,
  };
}

async function processSelectedRow({
  campaign,
  candidate,
  headers,
  mapping,
  stats,
  step,
}: {
  campaign: Campaign;
  candidate: CandidateRow;
  headers: string[];
  mapping: CampaignColumnMapping;
  stats: RunStats;
  step?: ActiveSequenceStep;
}) {
  if (!campaign.googleAccountId || !campaign.sheetId || !campaign.worksheetName) {
    throw new Error("Campaign Google Sheet configuration is missing.");
  }

  const selectedStep = step ?? candidate.step;
  const token = generateUnsubscribeToken();
  const context = buildTemplateContext(headers, candidate.row.values);
  const subject = renderTemplate(selectedStep.subjectTemplate, context);
  const body = renderTemplateBodyWithUnsubscribe({
    bodyTemplate: selectedStep.bodyTemplate,
    context,
    unsubscribeUrl: buildUnsubscribeUrl(token),
  });
  const missingColumns = Array.from(new Set([...subject.missingColumns, ...body.missingColumns]));

  if (missingColumns.length > 0) {
    stats.emailsSkipped += 1;
    stats.stepStats[selectedStep.stepNumber].skipped += 1;
    await insertSendHistory({
      bodyRendered: body.output,
      campaignId: campaign.id,
      errorMessage: `Template references missing columns: ${missingColumns.join(", ")}`,
      recipientEmail: candidate.email,
      recipientRowNumber: candidate.row.rowNumber,
      recipientSnapshot: candidate.snapshot,
      sequenceStepId: selectedStep.id,
      status: "skipped",
      subjectRendered: subject.output,
      token,
    });
    return;
  }

  const suppressionStatus = await getSendSuppressionStatus(candidate.email);

  if (suppressionStatus.suppressed) {
    stats.emailsSkipped += 1;
    stats.stepStats[selectedStep.stepNumber].skipped += 1;
    await insertSendHistory({
      bodyRendered: body.output,
      campaignId: campaign.id,
      errorMessage: `Suppressed recipient: ${suppressionStatus.reason}`,
      recipientEmail: candidate.email,
      recipientRowNumber: candidate.row.rowNumber,
      recipientSnapshot: candidate.snapshot,
      sequenceStepId: selectedStep.id,
      status: "skipped",
      subjectRendered: subject.output,
      token,
    });
    return;
  }

  try {
    const gmailResult = await sendCampaignMessageWithRefresh({
      body: body.output,
      campaignGoogleAccountId: campaign.googleAccountId,
      recipientEmail: candidate.email,
      subject: subject.output,
    });

    await insertSendHistory({
      bodyRendered: body.output,
      campaignId: campaign.id,
      gmailMessageId: gmailResult.messageId,
      gmailThreadId: gmailResult.threadId,
      recipientEmail: candidate.email,
      recipientRowNumber: candidate.row.rowNumber,
      recipientSnapshot: candidate.snapshot,
      sequenceStepId: selectedStep.id,
      status: "sent",
      subjectRendered: subject.output,
      token,
    });

    await updateCampaignSheetRow({
      googleAccountId: campaign.googleAccountId,
      headers,
      mapping,
      rowNumber: candidate.row.rowNumber,
      sheetId: campaign.sheetId,
      values: getSuccessfulSheetWriteback(selectedStep.stepNumber),
      worksheetName: campaign.worksheetName,
    });
    stats.emailsSent += 1;
    stats.stepStats[selectedStep.stepNumber].sent += 1;
  } catch (error) {
    const message = truncate(formatError(error), 300);
    stats.errors.push(`Row ${candidate.row.rowNumber}: ${message}`);
    stats.stepStats[selectedStep.stepNumber].failed += 1;
    await insertSendHistory({
      bodyRendered: body.output,
      campaignId: campaign.id,
      errorMessage: message,
      recipientEmail: candidate.email,
      recipientRowNumber: candidate.row.rowNumber,
      recipientSnapshot: candidate.snapshot,
      sequenceStepId: selectedStep.id,
      status: "failed",
      subjectRendered: subject.output,
      token,
    });
    await updateCampaignSheetRow({
      googleAccountId: campaign.googleAccountId,
      headers,
      mapping,
      rowNumber: candidate.row.rowNumber,
      sheetId: campaign.sheetId,
      values: {
        errorMessage: message,
        status: "error",
      },
      worksheetName: campaign.worksheetName,
    });
  }
}

async function getCandidateRows({
  headers,
  mapping,
  repliedRecipients,
  rows,
  steps,
}: {
  headers: string[];
  mapping: CampaignColumnMapping;
  repliedRecipients: Set<string>;
  rows: SheetDataRow[];
  steps: Partial<Record<SequenceStepNumber, ActiveSequenceStep>>;
}): Promise<CandidateRow[]> {
  const candidates: CandidateRow[] = [];

  for (const row of rows) {
    const email = normalizeEmail(getMappedValue(headers, row.values, mapping.emailColumn));
    const status = normalizeCell(getMappedValue(headers, row.values, mapping.statusColumn));
    const stage = normalizeCell(getMappedValue(headers, row.values, mapping.stageColumn));
    const lastSentAt = getMappedValue(headers, row.values, mapping.lastSentAtColumn);
    const unsubscribedAt = normalizeCell(getMappedValue(headers, row.values, mapping.unsubscribedAtColumn));
    const repliedAt = normalizeCell(getMappedValue(headers, row.values, mapping.repliedAtColumn));
    const step = getEligibleStep({
      lastSentAt,
      stage,
      status,
      steps,
    });

    if (!email || !isEmail(email)) {
      continue;
    }

    if (unsubscribedAt || repliedAt) {
      continue;
    }

    if (repliedRecipients.has(email)) {
      continue;
    }

    if (!step) {
      continue;
    }

    const suppressionStatus = await getSendSuppressionStatus(email);

    if (suppressionStatus.suppressed) {
      continue;
    }

    candidates.push({
      email,
      row,
      snapshot: {
        rowNumber: row.rowNumber,
        values: Object.fromEntries(headers.map((header, index) => [header, row.values[index] ?? ""])),
      },
      step,
    });
  }

  return candidates;
}

async function getDetectedReplyRecipients(campaignId: string): Promise<Set<string>> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("reply_events")
    .select("recipient_email")
    .eq("campaign_id", campaignId)
    .returns<Array<{ recipient_email: string }>>();

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((event) => normalizeEmail(event.recipient_email)));
}

function getEligibleStep({
  lastSentAt,
  stage,
  status,
  steps,
}: {
  lastSentAt: string;
  stage: string;
  status: string;
  steps: Partial<Record<SequenceStepNumber, ActiveSequenceStep>>;
}): ActiveSequenceStep | null {
  if (status === "paused") {
    return null;
  }

  if ((stage === "" || stage === "new") && ["", "new", "active"].includes(status)) {
    return steps[1] ?? null;
  }

  if (stage === TOUCH_1_SENT && steps[2] && hasDelayElapsed(lastSentAt, steps[2].delayDaysAfterPreviousStep)) {
    return steps[2];
  }

  if (stage === TOUCH_2_SENT && steps[3] && hasDelayElapsed(lastSentAt, steps[3].delayDaysAfterPreviousStep)) {
    return steps[3];
  }

  return null;
}

function hasDelayElapsed(lastSentAt: string, delayDays: number): boolean {
  const lastSentTime = Date.parse(lastSentAt);

  if (Number.isNaN(lastSentTime)) {
    return false;
  }

  const elapsedMs = Date.now() - lastSentTime;
  const delayMs = delayDays * 24 * 60 * 60 * 1000;

  return elapsedMs >= delayMs;
}

async function sendCampaignMessageWithRefresh({
  body,
  campaignGoogleAccountId,
  recipientEmail,
  subject,
}: {
  body: string;
  campaignGoogleAccountId: string;
  recipientEmail: string;
  subject: string;
}): Promise<GmailSendResult> {
  const accessToken = await getValidGoogleAccessToken(campaignGoogleAccountId);

  try {
    return await sendGmailMessage({
      accessToken,
      htmlBody: body,
      subject,
      to: recipientEmail,
    });
  } catch (error) {
    if (!isGmailAuthError(error)) {
      throw error;
    }

    return sendGmailMessage({
      accessToken: await refreshGoogleAccessToken(campaignGoogleAccountId),
      htmlBody: body,
      subject,
      to: recipientEmail,
    });
  }
}

async function getActiveSequenceSteps(
  campaignId: string,
): Promise<Partial<Record<SequenceStepNumber, ActiveSequenceStep>>> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sequence_steps")
    .select("id, step_number, subject_template, body_template, delay_days_after_previous_step")
    .eq("campaign_id", campaignId)
    .eq("is_active", true)
    .in("step_number", [1, 2, 3])
    .returns<
      Array<{
        body_template: string;
        delay_days_after_previous_step: number;
        id: string;
        step_number: number;
        subject_template: string;
      }>
    >();

  if (error) {
    throw error;
  }

  return (data ?? []).reduce<Partial<Record<SequenceStepNumber, ActiveSequenceStep>>>(
    (steps, row) => {
      if (!isSequenceStepNumber(row.step_number)) {
        return steps;
      }

      steps[row.step_number] = {
        bodyTemplate: row.body_template,
        delayDaysAfterPreviousStep: row.delay_days_after_previous_step,
        id: row.id,
        stepNumber: row.step_number,
        subjectTemplate: row.subject_template,
      };

      return steps;
    },
    {},
  );
}

async function getAvailableCapacity({
  campaign,
  globalDailySendCap,
  globalTimezone,
  steps,
}: {
  campaign: Campaign;
  globalDailySendCap: number;
  globalTimezone: string;
  steps: Partial<Record<SequenceStepNumber, ActiveSequenceStep>>;
}): Promise<AvailableCapacity> {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const campaignDay = getLocalDayRangeUtc(now, campaign.timezone);
  const globalDay = getLocalDayRangeUtc(now, globalTimezone);

  const [campaignSentResult, globalSentResult, stepSentResult] = await Promise.all([
    supabase
      .from("send_history")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("send_type", "campaign")
      .eq("status", "sent")
      .gte("sent_at", campaignDay.start.toISOString())
      .lt("sent_at", campaignDay.end.toISOString()),
    supabase
      .from("send_history")
      .select("id", { count: "exact", head: true })
      .eq("send_type", "campaign")
      .eq("status", "sent")
      .gte("sent_at", globalDay.start.toISOString())
      .lt("sent_at", globalDay.end.toISOString()),
    supabase
      .from("send_history")
      .select("sequence_step_id")
      .eq("campaign_id", campaign.id)
      .eq("send_type", "campaign")
      .eq("status", "sent")
      .gte("sent_at", campaignDay.start.toISOString())
      .lt("sent_at", campaignDay.end.toISOString())
      .returns<Array<{ sequence_step_id: string | null }>>(),
  ]);

  const firstError = campaignSentResult.error ?? globalSentResult.error ?? stepSentResult.error;

  if (firstError) {
    throw firstError;
  }

  const sentByStep = getSentCountsByStep(stepSentResult.data ?? [], steps);

  return {
    stepCaps: {
      1: Math.max(0, campaign.touch1DailyCap - sentByStep[1]),
      2: Math.max(0, campaign.touch2DailyCap - sentByStep[2]),
      3: Math.max(0, campaign.touch3DailyCap - sentByStep[3]),
    },
    total: Math.min(
      Math.max(0, campaign.dailySendCap - (campaignSentResult.count ?? 0)),
      Math.max(0, globalDailySendCap - (globalSentResult.count ?? 0)),
    ),
  };
}

function selectCandidatesForRun(
  candidates: CandidateRow[],
  capacity: AvailableCapacity,
): CandidateRow[] {
  const selected: CandidateRow[] = [];
  let totalRemaining = capacity.total;

  for (const stepNumber of SEQUENCE_STEP_NUMBERS) {
    let stepRemaining = Math.min(capacity.stepCaps[stepNumber], totalRemaining);

    if (stepRemaining <= 0) {
      continue;
    }

    for (const candidate of candidates) {
      if (candidate.step.stepNumber !== stepNumber) {
        continue;
      }

      selected.push(candidate);
      stepRemaining -= 1;
      totalRemaining -= 1;

      if (stepRemaining <= 0 || totalRemaining <= 0) {
        break;
      }
    }

    if (totalRemaining <= 0) {
      break;
    }
  }

  return selected;
}

function getSentCountsByStep(
  rows: Array<{ sequence_step_id: string | null }>,
  steps: Partial<Record<SequenceStepNumber, ActiveSequenceStep>>,
): StepDailyCaps {
  const stepById = new Map(
    SEQUENCE_STEP_NUMBERS.flatMap((stepNumber) => {
      const step = steps[stepNumber];

      return step ? [[step.id, stepNumber] as const] : [];
    }),
  );
  const counts = getEmptyStepDailyCaps();

  for (const row of rows) {
    const stepNumber = row.sequence_step_id ? stepById.get(row.sequence_step_id) : null;

    if (stepNumber) {
      counts[stepNumber] += 1;
    }
  }

  return counts;
}

function getEmptyStepDailyCaps(): StepDailyCaps {
  return {
    1: 0,
    2: 0,
    3: 0,
  };
}

async function getGlobalSendSettings(): Promise<GlobalSendSettings> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("global_daily_send_cap, timezone")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<AppSettingsRow>();

  if (error) {
    throw error;
  }

  return {
    dailySendCap:
      data?.global_daily_send_cap ??
      Number.parseInt(process.env.DEFAULT_GLOBAL_DAILY_SEND_CAP ?? "70", 10),
    timezone: data?.timezone ?? process.env.DEFAULT_TIMEZONE ?? "America/Chicago",
  };
}

function getLocalDayRangeUtc(now: Date, timeZone: string): { end: Date; start: Date } {
  const localDate = getLocalDateParts(now, timeZone);
  const start = localDateTimeToUtc(localDate, timeZone);
  const nextLocalDate = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day + 1));
  const end = localDateTimeToUtc(
    {
      day: nextLocalDate.getUTCDate(),
      month: nextLocalDate.getUTCMonth() + 1,
      year: nextLocalDate.getUTCFullYear(),
    },
    timeZone,
  );

  return { end, start };
}

function isSelectedSendDay(campaign: Campaign, now: Date): boolean {
  const day = getLocalSendDay(now, campaign.timezone);

  return campaign.sendDays.includes(day);
}

function getLocalSendDay(date: Date, timeZone: string): SendDay {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);

  return DAY_MAP[weekday] ?? "MON";
}

function getLocalDateParts(date: Date, timeZone: string): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    day: Number.parseInt(values.day, 10),
    month: Number.parseInt(values.month, 10),
    year: Number.parseInt(values.year, 10),
  };
}

function localDateTimeToUtc(
  localDate: { day: number; month: number; year: number },
  timeZone: string,
): Date {
  const guessedUtc = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day));
  const firstOffset = getTimeZoneOffsetMs(guessedUtc, timeZone);
  const firstUtc = new Date(guessedUtc.getTime() - firstOffset);
  const secondOffset = getTimeZoneOffsetMs(firstUtc, timeZone);

  return new Date(guessedUtc.getTime() - secondOffset);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = values.hour === "24" ? "00" : values.hour;
  const localTimeAsUtc = Date.UTC(
    Number.parseInt(values.year, 10),
    Number.parseInt(values.month, 10) - 1,
    Number.parseInt(values.day, 10),
    Number.parseInt(hour, 10),
    Number.parseInt(values.minute, 10),
    Number.parseInt(values.second, 10),
  );

  return localTimeAsUtc - date.getTime();
}

async function createCampaignRun({
  campaignId,
  runType,
  scheduledDate,
  startedAt,
}: {
  campaignId: string;
  runType: CampaignRunType;
  scheduledDate: string | null;
  startedAt: Date;
}): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("campaign_runs")
    .insert({
      campaign_id: campaignId,
      run_type: runType,
      scheduled_date: scheduledDate,
      started_at: startedAt.toISOString(),
      status: "failed",
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    if (runType === "scheduled" && error.code === "23505") {
      return null;
    }

    throw error;
  }

  return data.id;
}

async function updateCampaignRun(
  runId: string,
  stats: RunStats,
  status: "failed" | "partial_success" | "success",
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("campaign_runs")
    .update({
      cap_limited: stats.capLimited,
      eligible_not_processed_due_to_cap: stats.eligibleNotProcessedDueToCap,
      eligible_rows_found: stats.eligibleRowsFound,
      emails_selected_for_run: stats.emailsSelectedForRun,
      emails_sent: stats.emailsSent,
      emails_skipped: stats.emailsSkipped,
      error_summary: buildErrorSummary(stats),
      errors_count: stats.errors.length,
      finished_at: new Date().toISOString(),
      run_metadata: {
        stepStats: stats.stepStats,
      },
      rows_scanned: stats.rowsScanned,
      status,
    })
    .eq("id", runId);

  if (error) {
    throw error;
  }
}

async function insertSendHistory({
  bodyRendered,
  campaignId,
  errorMessage,
  gmailMessageId,
  gmailThreadId,
  recipientEmail,
  recipientRowNumber,
  recipientSnapshot,
  sequenceStepId,
  status,
  subjectRendered,
  token,
}: {
  bodyRendered: string;
  campaignId: string;
  errorMessage?: string;
  gmailMessageId?: string;
  gmailThreadId?: string | null;
  recipientEmail: string;
  recipientRowNumber: number;
  recipientSnapshot: Record<string, unknown>;
  sequenceStepId: string;
  status: SendHistoryStatus;
  subjectRendered: string;
  token: string;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("send_history").insert({
    body_rendered: bodyRendered,
    campaign_id: campaignId,
    error_message: errorMessage ?? null,
    gmail_message_id: gmailMessageId ?? null,
    gmail_thread_id: gmailThreadId ?? null,
    recipient_email: recipientEmail,
    recipient_row_number: recipientRowNumber,
    recipient_snapshot: recipientSnapshot,
    send_type: "campaign",
    sent_at: status === "sent" ? new Date().toISOString() : null,
    sequence_step_id: sequenceStepId,
    status,
    subject_rendered: subjectRendered,
    unsubscribe_token: token,
  });

  if (error) {
    throw error;
  }
}

function getRunStatus(stats: RunStats): "failed" | "partial_success" | "success" {
  if (stats.errors.length > 0 && stats.emailsSent === 0) {
    return "failed";
  }

  if (stats.errors.length > 0 || stats.emailsSkipped > 0 || stats.capLimited) {
    return "partial_success";
  }

  return "success";
}

function getMappedValue(
  headers: string[],
  row: string[],
  mappedColumn: string | null,
): string {
  if (!mappedColumn) {
    return "";
  }

  const columnIndex = headers.findIndex((header) => normalizeHeader(header) === normalizeHeader(mappedColumn));

  return columnIndex >= 0 ? row[columnIndex] ?? "" : "";
}

function normalizeCell(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildErrorSummary(stats: RunStats): string | null {
  const parts = [
    buildStepSummary(stats),
    ...stats.errors.slice(0, 5),
    stats.capLimited
      ? `${stats.eligibleNotProcessedDueToCap} eligible row(s) were not processed due to send caps.`
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" ") : null;
}

function buildStepSummary(stats: RunStats): string {
  return ([1, 2, 3] as const)
    .map((stepNumber) => {
      const stepStats = stats.stepStats[stepNumber];

      return `Step ${stepNumber}: selected ${stepStats.selected}, sent ${stepStats.sent}, skipped ${stepStats.skipped}, failed ${stepStats.failed}.`;
    })
    .join(" ");
}

function countSelectedSteps(stats: RunStats, selectedRows: CandidateRow[]) {
  for (const candidate of selectedRows) {
    stats.stepStats[candidate.step.stepNumber].selected += 1;
  }
}

function getEmptyStepStats(): Record<SequenceStepNumber, StepRunStats> {
  return {
    1: { failed: 0, selected: 0, sent: 0, skipped: 0 },
    2: { failed: 0, selected: 0, sent: 0, skipped: 0 },
    3: { failed: 0, selected: 0, sent: 0, skipped: 0 },
  };
}

function getSuccessfulSheetWriteback(stepNumber: SequenceStepNumber): {
  errorMessage: string;
  lastSentAt: string;
  lastTouchSent: string;
  stage: string;
  status: string;
} {
  const lastSentAt = new Date().toISOString();

  if (stepNumber === 1) {
    return {
      errorMessage: "",
      lastSentAt,
      lastTouchSent: "1",
      stage: TOUCH_1_SENT,
      status: TOUCH_1_SENT,
    };
  }

  if (stepNumber === 2) {
    return {
      errorMessage: "",
      lastSentAt,
      lastTouchSent: "2",
      stage: TOUCH_2_SENT,
      status: TOUCH_2_SENT,
    };
  }

  return {
    errorMessage: "",
    lastSentAt,
    lastTouchSent: "3",
    stage: COMPLETED,
    status: TOUCH_3_SENT,
  };
}

function isSequenceStepNumber(value: number): value is SequenceStepNumber {
  return value === 1 || value === 2 || value === 3;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown campaign run error.";
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
