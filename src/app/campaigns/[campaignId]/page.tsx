import Link from "next/link";

import { deleteCampaign, pauseCampaign, resumeCampaign } from "@/app/campaigns/actions";
import { requireOwnerSession } from "@/lib/auth";
import { getCampaign, type Campaign } from "@/lib/campaigns";
import {
  COLUMN_MAPPING_FIELDS,
  getCampaignColumnMapping,
  validateCampaignSheet,
  type CampaignColumnMapping,
  type SheetValidationResult,
} from "@/lib/sheets";

import { TemplatePreview } from "./TemplatePreview";
import { saveColumnMapping, validateSheetConfiguration } from "./sheet-actions";

const sheetMessages: Record<string, string> = {
  validated: "Sheet validation passed.",
  "mapping-saved": "Column mapping saved.",
  "missing-config": "Select a Google account, Sheet URL, and worksheet before validating.",
  "missing-columns": "Sheet validation found missing required columns.",
};

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ sheet?: string }>;
}) {
  await requireOwnerSession();
  const { campaignId } = await params;
  const query = await searchParams;
  const [campaign, mapping] = await Promise.all([
    getCampaign(campaignId),
    getCampaignColumnMapping(campaignId),
  ]);
  const validation = await loadSheetValidation(campaign, mapping);
  const sheetMessage = query.sheet ? sheetMessages[query.sheet] : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Campaign</p>
          <h1>{campaign.name}</h1>
        </div>
        <div className="topbar-actions">
          <Link href="/campaigns">Campaigns</Link>
          <Link href={`/campaigns/${campaign.id}/edit`}>Edit</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <section className="grid three">
        <Metric label="Status" value={campaign.status} />
        <Metric label="Daily cap" value={campaign.dailySendCap.toString()} />
        <Metric label="Send time" value={campaign.sendTime} />
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Details</p>
              <h2>Campaign setup</h2>
            </div>
            <span className={`status-pill ${campaign.status}`}>{campaign.status}</span>
          </div>
          <dl className="details-list">
            <Detail label="Description" value={campaign.description || "No description"} />
            <Detail label="Google account" value={campaign.googleAccountEmail ?? "Not selected"} />
            <Detail label="Sheet URL" value={campaign.sheetUrl ?? "Not set"} />
            <Detail label="Parsed sheet ID" value={campaign.sheetId ?? "Not parsed"} />
            <Detail label="Worksheet/tab" value={campaign.worksheetName ?? "Not set"} />
            <Detail label="Timezone" value={campaign.timezone} />
            <Detail label="Send days" value={campaign.sendDays.join(", ")} />
          </dl>
        </div>

        <div className="panel">
          <h2>Run history placeholders</h2>
          <dl className="details-list">
            <Detail label="Last run" value={formatOptionalDate(campaign.lastRunAt)} />
            <Detail
              label="Last successful run"
              value={formatOptionalDate(campaign.lastSuccessfulRunAt)}
            />
            <Detail label="Created" value={formatOptionalDate(campaign.createdAt)} />
            <Detail label="Updated" value={formatOptionalDate(campaign.updatedAt)} />
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Google Sheets</p>
            <h2>Worksheet validation</h2>
          </div>
          <form action={validateSheetConfiguration}>
            <input name="campaignId" type="hidden" value={campaign.id} />
            <button type="submit">Validate sheet</button>
          </form>
        </div>

        {sheetMessage ? <div className="notice">{sheetMessage}</div> : null}
        {validation.error ? <div className="notice error">{validation.error}</div> : null}

        <div className="grid two">
          <div>
            <h3>Sheet status</h3>
            <dl className="details-list compact-details">
              <Detail label="Spreadsheet" value={validation.spreadsheetTitle ?? "Not validated"} />
              <Detail
                label="Worksheet"
                value={
                  validation.worksheets.includes(campaign.worksheetName ?? "")
                    ? `${campaign.worksheetName} found`
                    : campaign.worksheetName ?? "Not set"
                }
              />
              <Detail
                label="Header check"
                value={
                  validation.ok
                    ? "Required columns found"
                    : validation.missingRequiredColumns.length > 0
                      ? `Missing: ${validation.missingRequiredColumns.join(", ")}`
                      : "Not validated"
                }
              />
            </dl>
          </div>

          <div>
            <h3>Worksheets</h3>
            {validation.worksheets.length > 0 ? (
              <div className="chip-list">
                {validation.worksheets.map((worksheet) => (
                  <span key={worksheet}>{worksheet}</span>
                ))}
              </div>
            ) : (
              <p className="muted">No worksheet list loaded yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Column mapping</p>
            <h2>Map sheet headers</h2>
          </div>
        </div>
        <form action={saveColumnMapping} className="mapping-grid">
          <input name="campaignId" type="hidden" value={campaign.id} />
          {COLUMN_MAPPING_FIELDS.map((field) => (
            <label className="field" key={field.key}>
              <span>
                {field.label}
                {field.required ? " *" : ""}
              </span>
              <select name={field.key} required={field.required} defaultValue={mapping[field.key] ?? ""}>
                {!field.required ? <option value="">Not mapped</option> : null}
                {getHeaderOptions(validation.headers, mapping[field.key]).map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="form-actions full">
            <button type="submit">Save mapping</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Preview</p>
            <h2>First 10 rows</h2>
          </div>
        </div>
        {validation.headers.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {validation.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {validation.previewRows.length > 0 ? (
                  validation.previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {validation.headers.map((header, columnIndex) => (
                        <td key={`${header}-${columnIndex}`}>{row[columnIndex]}</td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={validation.headers.length}>No data rows found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Validate the sheet to load headers and preview rows.</p>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Template preview</p>
            <h2>Render with selected row</h2>
          </div>
        </div>
        <TemplatePreview headers={validation.headers} rows={validation.previewRows} />
      </section>

      <section className="panel">
        <div className="row-actions">
          {campaign.status === "active" ? (
            <form action={pauseCampaign}>
              <input name="campaignId" type="hidden" value={campaign.id} />
              <button type="submit">Pause campaign</button>
            </form>
          ) : (
            <form action={resumeCampaign}>
              <input name="campaignId" type="hidden" value={campaign.id} />
              <button type="submit">Resume campaign</button>
            </form>
          )}
          <form action={deleteCampaign}>
            <input name="campaignId" type="hidden" value={campaign.id} />
            <button className="danger-button" type="submit">
              Delete campaign
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

async function loadSheetValidation(
  campaign: Campaign,
  mapping: CampaignColumnMapping,
): Promise<SheetValidationResult> {
  if (!campaign.googleAccountId || !campaign.sheetId || !campaign.worksheetName) {
    return {
      ok: false,
      spreadsheetTitle: null,
      worksheets: [],
      headers: [],
      previewRows: [],
      missingRequiredColumns: [],
      error: "Select a Google account, Sheet URL, and worksheet before validation.",
    };
  }

  try {
    return await validateCampaignSheet({
      googleAccountId: campaign.googleAccountId,
      sheetId: campaign.sheetId,
      worksheetName: campaign.worksheetName,
      mapping,
    });
  } catch (error) {
    return {
      ok: false,
      spreadsheetTitle: null,
      worksheets: [],
      headers: [],
      previewRows: [],
      missingRequiredColumns: [],
      error: error instanceof Error ? error.message : "Unable to validate Google Sheet.",
    };
  }
}

function getHeaderOptions(headers: string[], selectedHeader: string | null): string[] {
  const options = new Set(headers);

  if (selectedHeader) {
    options.add(selectedHeader);
  }

  return Array.from(options);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatOptionalDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
