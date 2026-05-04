import type { Campaign, CampaignFormOptions, CampaignStatus, SendDay } from "@/lib/campaigns";
import { CAMPAIGN_STATUSES, SEND_DAYS } from "@/lib/campaigns";

type CampaignFormProps = {
  action: (formData: FormData) => Promise<void>;
  campaign?: Campaign;
  options: CampaignFormOptions;
  submitLabel: string;
};

const DEFAULT_SEND_DAYS: SendDay[] = ["MON", "TUE", "WED", "THU", "FRI"];

export function CampaignForm({ action, campaign, options, submitLabel }: CampaignFormProps) {
  const selectedDays = campaign?.sendDays.length ? campaign.sendDays : DEFAULT_SEND_DAYS;
  const status = campaign?.status ?? "draft";

  return (
    <form action={action} className="form-grid">
      {campaign ? <input name="campaignId" type="hidden" value={campaign.id} /> : null}

      <label className="field">
        <span>Name</span>
        <input
          name="name"
          required
          defaultValue={campaign?.name}
          placeholder="Spring counselor outreach"
        />
      </label>

      <label className="field">
        <span>Status</span>
        <select name="status" required defaultValue={status}>
          {CAMPAIGN_STATUSES.map((campaignStatus) => (
            <option key={campaignStatus} value={campaignStatus}>
              {formatStatus(campaignStatus)}
            </option>
          ))}
        </select>
      </label>

      <label className="field full">
        <span>Description</span>
        <textarea
          name="description"
          defaultValue={campaign?.description}
          placeholder="Internal notes about this campaign"
          rows={4}
        />
      </label>

      <label className="field">
        <span>Google account</span>
        <select name="googleAccountId" defaultValue={campaign?.googleAccountId ?? ""}>
          <option value="">No account selected</option>
          {options.googleAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.email}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Worksheet/tab name</span>
        <input
          name="worksheetName"
          required
          defaultValue={campaign?.worksheetName ?? "Sheet1"}
          placeholder="Sheet1"
        />
      </label>

      <label className="field full">
        <span>Google Sheet URL</span>
        <input
          name="sheetUrl"
          required
          defaultValue={campaign?.sheetUrl ?? ""}
          placeholder="https://docs.google.com/spreadsheets/d/..."
        />
      </label>

      <label className="field">
        <span>Daily campaign send cap</span>
        <input
          name="dailySendCap"
          required
          min={1}
          step={1}
          type="number"
          defaultValue={campaign?.dailySendCap ?? 40}
        />
      </label>

      <label className="field">
        <span>Touch 1 daily cap</span>
        <input
          name="touch1DailyCap"
          required
          min={0}
          step={1}
          type="number"
          defaultValue={campaign?.touch1DailyCap ?? 20}
        />
      </label>

      <label className="field">
        <span>Touch 2 daily cap</span>
        <input
          name="touch2DailyCap"
          required
          min={0}
          step={1}
          type="number"
          defaultValue={campaign?.touch2DailyCap ?? 20}
        />
      </label>

      <label className="field">
        <span>Touch 3 daily cap</span>
        <input
          name="touch3DailyCap"
          required
          min={0}
          step={1}
          type="number"
          defaultValue={campaign?.touch3DailyCap ?? 0}
        />
      </label>

      <label className="field">
        <span>Timezone</span>
        <input
          name="timezone"
          required
          defaultValue={campaign?.timezone ?? options.defaultTimezone}
          placeholder="America/Chicago"
        />
      </label>

      <label className="field">
        <span>Send time</span>
        <input name="sendTime" required type="time" defaultValue={campaign?.sendTime ?? "07:00"} />
      </label>

      <fieldset className="field day-picker">
        <legend>Send days</legend>
        <div>
          {SEND_DAYS.map((day) => (
            <label key={day}>
              <input
                name="sendDays"
                type="checkbox"
                value={day}
                defaultChecked={selectedDays.includes(day)}
              />
              <span>{day}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="form-actions full">
        <button type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}

function formatStatus(status: CampaignStatus) {
  return status[0].toUpperCase() + status.slice(1);
}
