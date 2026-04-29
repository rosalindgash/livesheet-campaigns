import { getValidGoogleAccessToken, refreshGoogleAccessToken } from "@/lib/google/accounts";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const COLUMN_MAPPING_FIELDS = [
  { key: "emailColumn", dbKey: "email_column", label: "Email", required: true, defaultValue: "email" },
  { key: "firstNameColumn", dbKey: "first_name_column", label: "First name", required: false, defaultValue: "first_name" },
  { key: "lastNameColumn", dbKey: "last_name_column", label: "Last name", required: false, defaultValue: "last_name" },
  { key: "organizationColumn", dbKey: "organization_column", label: "Organization", required: false, defaultValue: "organization" },
  { key: "websiteColumn", dbKey: "website_column", label: "Website", required: false, defaultValue: "website" },
  { key: "stateColumn", dbKey: "state_column", label: "State", required: false, defaultValue: "state" },
  { key: "eTranscriptColumn", dbKey: "e_transcript_column", label: "E-Transcript", required: false, defaultValue: "e_transcript" },
  { key: "statusColumn", dbKey: "status_column", label: "Status", required: true, defaultValue: "status" },
  { key: "stageColumn", dbKey: "stage_column", label: "Stage", required: true, defaultValue: "stage" },
  { key: "lastSentAtColumn", dbKey: "last_sent_at_column", label: "Last sent at", required: true, defaultValue: "last_sent_at" },
  { key: "lastTouchSentColumn", dbKey: "last_touch_sent_column", label: "Last touch sent", required: true, defaultValue: "last_touch_sent" },
  { key: "repliedAtColumn", dbKey: "replied_at_column", label: "Replied at", required: true, defaultValue: "replied_at" },
  { key: "unsubscribedAtColumn", dbKey: "unsubscribed_at_column", label: "Unsubscribed at", required: true, defaultValue: "unsubscribed_at" },
  { key: "errorMessageColumn", dbKey: "error_message_column", label: "Error message", required: true, defaultValue: "error_message" },
  { key: "notesColumn", dbKey: "notes_column", label: "Notes", required: false, defaultValue: "notes" },
] as const;

export type ColumnMappingField = (typeof COLUMN_MAPPING_FIELDS)[number];
export type ColumnMappingKey = ColumnMappingField["key"];

export type CampaignColumnMapping = Record<ColumnMappingKey, string | null> & {
  id: string | null;
  campaignId: string;
};

export type SheetValidationResult = {
  ok: boolean;
  spreadsheetTitle: string | null;
  worksheets: string[];
  headers: string[];
  previewRows: string[][];
  missingRequiredColumns: string[];
  error?: string;
};

export type SheetDataRow = {
  rowNumber: number;
  values: string[];
};

export type CampaignSheetRows = {
  headers: string[];
  rows: SheetDataRow[];
};

type CampaignColumnMappingRow = {
  id: string;
  campaign_id: string;
  email_column: string;
  first_name_column: string | null;
  last_name_column: string | null;
  organization_column: string | null;
  website_column: string | null;
  state_column: string | null;
  e_transcript_column: string | null;
  status_column: string;
  stage_column: string;
  last_sent_at_column: string;
  last_touch_sent_column: string;
  replied_at_column: string;
  unsubscribed_at_column: string;
  error_message_column: string;
  notes_column: string | null;
};

type SpreadsheetResponse = {
  properties?: {
    title?: string;
  };
  sheets?: Array<{
    properties?: {
      title?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type ValuesResponse = {
  values?: string[][];
  error?: {
    message?: string;
  };
};

type BatchUpdateResponse = {
  error?: {
    message?: string;
  };
};

class GoogleSheetsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleSheetsApiError";
  }
}

export async function getCampaignColumnMapping(
  campaignId: string,
): Promise<CampaignColumnMapping> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("campaign_column_mappings")
    .select(
      "id, campaign_id, email_column, first_name_column, last_name_column, organization_column, website_column, state_column, e_transcript_column, status_column, stage_column, last_sent_at_column, last_touch_sent_column, replied_at_column, unsubscribed_at_column, error_message_column, notes_column",
    )
    .eq("campaign_id", campaignId)
    .maybeSingle<CampaignColumnMappingRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return getDefaultColumnMapping(campaignId);
  }

  return mapColumnMappingRow(data);
}

export async function saveCampaignColumnMapping(
  campaignId: string,
  mapping: CampaignColumnMapping,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const payload = Object.fromEntries(
    COLUMN_MAPPING_FIELDS.map((field) => [field.dbKey, mapping[field.key]]),
  );
  const { error } = await supabase.from("campaign_column_mappings").upsert(
    {
      campaign_id: campaignId,
      ...payload,
    },
    { onConflict: "campaign_id" },
  );

  if (error) {
    throw error;
  }
}

export async function validateCampaignSheet({
  googleAccountId,
  sheetId,
  worksheetName,
  mapping,
}: {
  googleAccountId: string;
  sheetId: string;
  worksheetName: string;
  mapping: CampaignColumnMapping;
}): Promise<SheetValidationResult> {
  const accessToken = await getValidGoogleAccessToken(googleAccountId);

  try {
    return await validateCampaignSheetWithToken({
      accessToken,
      mapping,
      sheetId,
      worksheetName,
    });
  } catch (error) {
    if (!isGoogleAuthError(error)) {
      throw error;
    }

    const refreshedAccessToken = await refreshGoogleAccessToken(googleAccountId);

    try {
      return await validateCampaignSheetWithToken({
        accessToken: refreshedAccessToken,
        mapping,
        sheetId,
        worksheetName,
      });
    } catch (retryError) {
      if (isGoogleAuthError(retryError)) {
        throw new Error("Google rejected the saved credentials. Reconnect Google and try again.");
      }

      throw retryError;
    }
  }
}

export async function fetchCampaignSheetRows({
  googleAccountId,
  sheetId,
  worksheetName,
}: {
  googleAccountId: string;
  sheetId: string;
  worksheetName: string;
}): Promise<CampaignSheetRows> {
  return runWithSheetsTokenRetry(googleAccountId, async (accessToken) => {
    const values = await fetchWorksheetValues(sheetId, worksheetName, accessToken, "A1:ZZ");
    const headers = normalizeHeaders(values[0] ?? []);

    return {
      headers,
      rows: values.slice(1).map((row, index) => ({
        rowNumber: index + 2,
        values: normalizeRow(row, headers.length),
      })),
    };
  });
}

export async function updateCampaignSheetRow({
  googleAccountId,
  headers,
  mapping,
  rowNumber,
  sheetId,
  values,
  worksheetName,
}: {
  googleAccountId: string;
  headers: string[];
  mapping: CampaignColumnMapping;
  rowNumber: number;
  sheetId: string;
  values: Partial<{
    errorMessage: string;
    lastSentAt: string;
    lastTouchSent: string;
    stage: string;
    status: string;
  }>;
  worksheetName: string;
}): Promise<void> {
  const data = [
    buildMappedCellUpdate(headers, mapping.statusColumn, rowNumber, values.status),
    buildMappedCellUpdate(headers, mapping.stageColumn, rowNumber, values.stage),
    buildMappedCellUpdate(headers, mapping.lastSentAtColumn, rowNumber, values.lastSentAt),
    buildMappedCellUpdate(headers, mapping.lastTouchSentColumn, rowNumber, values.lastTouchSent),
    buildMappedCellUpdate(headers, mapping.errorMessageColumn, rowNumber, values.errorMessage),
  ].filter((update): update is { range: string; values: string[][] } => Boolean(update));

  if (data.length === 0) {
    return;
  }

  await runWithSheetsTokenRetry(googleAccountId, async (accessToken) => {
    await batchUpdateWorksheetValues({
      accessToken,
      data,
      sheetId,
      worksheetName,
    });
  });
}

async function runWithSheetsTokenRetry<T>(
  googleAccountId: string,
  operation: (accessToken: string) => Promise<T>,
): Promise<T> {
  const accessToken = await getValidGoogleAccessToken(googleAccountId);

  try {
    return await operation(accessToken);
  } catch (error) {
    if (!isGoogleAuthError(error)) {
      throw error;
    }

    return operation(await refreshGoogleAccessToken(googleAccountId));
  }
}

async function validateCampaignSheetWithToken({
  accessToken,
  sheetId,
  worksheetName,
  mapping,
}: {
  accessToken: string;
  sheetId: string;
  worksheetName: string;
  mapping: CampaignColumnMapping;
}): Promise<SheetValidationResult> {
  const spreadsheet = await fetchSpreadsheetMetadata(sheetId, accessToken);

  if (!spreadsheet.worksheets.includes(worksheetName)) {
    return {
      ok: false,
      spreadsheetTitle: spreadsheet.title,
      worksheets: spreadsheet.worksheets,
      headers: [],
      previewRows: [],
      missingRequiredColumns: [],
      error: `Worksheet "${worksheetName}" was not found.`,
    };
  }

  const values = await fetchWorksheetValues(sheetId, worksheetName, accessToken);
  const headers = normalizeHeaders(values[0] ?? []);
  const previewRows = values.slice(1, 11).map((row) => normalizeRow(row, headers.length));
  const missingRequiredColumns = getMissingRequiredColumns(headers, mapping);

  return {
    ok: missingRequiredColumns.length === 0,
    spreadsheetTitle: spreadsheet.title,
    worksheets: spreadsheet.worksheets,
    headers,
    previewRows,
    missingRequiredColumns,
  };
}

export function getDefaultColumnMapping(campaignId: string): CampaignColumnMapping {
  const defaults = Object.fromEntries(
    COLUMN_MAPPING_FIELDS.map((field) => [field.key, field.defaultValue]),
  ) as Record<ColumnMappingKey, string>;

  return {
    id: null,
    campaignId,
    ...defaults,
  };
}

export function getMissingRequiredColumns(
  headers: string[],
  mapping: CampaignColumnMapping,
): string[] {
  const normalizedHeaders = new Set(headers.map(normalizeHeader));

  return COLUMN_MAPPING_FIELDS.filter((field) => field.required)
    .map((field) => mapping[field.key])
    .filter((column): column is string => typeof column === "string" && column.length > 0)
    .filter((column) => !normalizedHeaders.has(normalizeHeader(column)));
}

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function mapColumnMappingRow(row: CampaignColumnMappingRow): CampaignColumnMapping {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    emailColumn: row.email_column,
    firstNameColumn: row.first_name_column,
    lastNameColumn: row.last_name_column,
    organizationColumn: row.organization_column,
    websiteColumn: row.website_column,
    stateColumn: row.state_column,
    eTranscriptColumn: row.e_transcript_column,
    statusColumn: row.status_column,
    stageColumn: row.stage_column,
    lastSentAtColumn: row.last_sent_at_column,
    lastTouchSentColumn: row.last_touch_sent_column,
    repliedAtColumn: row.replied_at_column,
    unsubscribedAtColumn: row.unsubscribed_at_column,
    errorMessageColumn: row.error_message_column,
    notesColumn: row.notes_column,
  };
}

async function fetchSpreadsheetMetadata(
  sheetId: string,
  accessToken: string,
): Promise<{ title: string | null; worksheets: string[] }> {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`);

  url.searchParams.set("fields", "properties.title,sheets.properties.title");

  const data = await fetchGoogleJson<SpreadsheetResponse>(url, accessToken);

  return {
    title: data.properties?.title ?? null,
    worksheets:
      data.sheets
        ?.map((sheet) => sheet.properties?.title)
        .filter((title): title is string => typeof title === "string") ?? [],
  };
}

async function fetchWorksheetValues(
  sheetId: string,
  worksheetName: string,
  accessToken: string,
  rangeSuffix = "A1:ZZ11",
): Promise<string[][]> {
  const range = `${quoteWorksheetName(worksheetName)}!${rangeSuffix}`;
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
  );
  const data = await fetchGoogleJson<ValuesResponse>(url, accessToken);

  return data.values ?? [];
}

async function batchUpdateWorksheetValues({
  accessToken,
  data,
  sheetId,
  worksheetName,
}: {
  accessToken: string;
  data: Array<{ range: string; values: string[][] }>;
  sheetId: string;
  worksheetName: string;
}): Promise<void> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
  );

  await fetchGoogleJson<BatchUpdateResponse>(url, accessToken, {
    method: "POST",
    body: JSON.stringify({
      data: data.map((entry) => ({
        ...entry,
        range: `${quoteWorksheetName(worksheetName)}!${entry.range}`,
      })),
      valueInputOption: "RAW",
    }),
  });
}

async function fetchGoogleJson<T extends { error?: { message?: string } }>(
  url: URL,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });
  const data = (await response.json()) as T;

  if (!response.ok || data.error) {
    throw new GoogleSheetsApiError(
      data.error?.message ?? "Google Sheets request failed.",
      response.status,
    );
  }

  return data;
}

function isGoogleAuthError(error: unknown): error is GoogleSheetsApiError {
  return error instanceof GoogleSheetsApiError && (error.status === 401 || error.status === 403);
}

function normalizeHeaders(headers: string[]): string[] {
  return headers.map((header) => header.trim()).filter(Boolean);
}

function normalizeRow(row: string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => row[index] ?? "");
}

function buildMappedCellUpdate(
  headers: string[],
  mappedColumn: string | null,
  rowNumber: number,
  value: string | undefined,
): { range: string; values: string[][] } | null {
  if (!mappedColumn || value === undefined) {
    return null;
  }

  const columnIndex = headers.findIndex((header) => normalizeHeader(header) === normalizeHeader(mappedColumn));

  if (columnIndex < 0) {
    throw new Error(`Mapped column "${mappedColumn}" was not found in the Sheet headers.`);
  }

  return {
    range: `${toColumnName(columnIndex + 1)}${rowNumber}`,
    values: [[value]],
  };
}

function toColumnName(columnNumber: number): string {
  let number = columnNumber;
  let name = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name;
}

function quoteWorksheetName(worksheetName: string): string {
  return `'${worksheetName.replaceAll("'", "''")}'`;
}
