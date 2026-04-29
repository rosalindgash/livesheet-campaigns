import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const SEQUENCE_STEP_NUMBERS = [1, 2, 3] as const;

export type SequenceStepNumber = (typeof SEQUENCE_STEP_NUMBERS)[number];

export type SequenceStep = {
  id: string | null;
  campaignId: string;
  stepNumber: SequenceStepNumber;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  delayDaysAfterPreviousStep: number;
  stageRequired: string;
  stageAfterSend: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type SequenceStepRow = {
  id: string;
  campaign_id: string;
  step_number: number;
  name: string;
  subject_template: string;
  body_template: string;
  delay_days_after_previous_step: number;
  stage_required: string;
  stage_after_send: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const DEFAULT_SEQUENCE_STEPS: Record<SequenceStepNumber, Omit<SequenceStep, "id" | "campaignId" | "createdAt" | "updatedAt">> = {
  1: {
    stepNumber: 1,
    name: "Touch 1",
    subjectTemplate: "",
    bodyTemplate: "",
    delayDaysAfterPreviousStep: 0,
    stageRequired: "new",
    stageAfterSend: "touch_1_sent",
    isActive: true,
  },
  2: {
    stepNumber: 2,
    name: "Touch 2",
    subjectTemplate: "",
    bodyTemplate: "",
    delayDaysAfterPreviousStep: 4,
    stageRequired: "touch_1_sent",
    stageAfterSend: "touch_2_sent",
    isActive: true,
  },
  3: {
    stepNumber: 3,
    name: "Touch 3",
    subjectTemplate: "",
    bodyTemplate: "",
    delayDaysAfterPreviousStep: 6,
    stageRequired: "touch_2_sent",
    stageAfterSend: "touch_3_sent",
    isActive: true,
  },
};

export async function listSequenceSteps(campaignId: string): Promise<SequenceStep[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sequence_steps")
    .select(
      "id, campaign_id, step_number, name, subject_template, body_template, delay_days_after_previous_step, stage_required, stage_after_send, is_active, created_at, updated_at",
    )
    .eq("campaign_id", campaignId)
    .order("step_number", { ascending: true })
    .returns<SequenceStepRow[]>();

  if (error) {
    throw error;
  }

  const savedSteps = new Map(
    (data ?? []).map((row) => [row.step_number, mapSequenceStepRow(row)]),
  );

  return SEQUENCE_STEP_NUMBERS.map(
    (stepNumber) => savedSteps.get(stepNumber) ?? getDefaultSequenceStep(campaignId, stepNumber),
  );
}

export function getDefaultSequenceStep(
  campaignId: string,
  stepNumber: SequenceStepNumber,
): SequenceStep {
  return {
    id: null,
    campaignId,
    createdAt: null,
    updatedAt: null,
    ...DEFAULT_SEQUENCE_STEPS[stepNumber],
  };
}

export function isSequenceStepNumber(value: number): value is SequenceStepNumber {
  return SEQUENCE_STEP_NUMBERS.includes(value as SequenceStepNumber);
}

function mapSequenceStepRow(row: SequenceStepRow): SequenceStep {
  if (!isSequenceStepNumber(row.step_number)) {
    throw new Error("Sequence step number must be 1, 2, or 3.");
  }

  return {
    id: row.id,
    campaignId: row.campaign_id,
    stepNumber: row.step_number,
    name: row.name,
    subjectTemplate: row.subject_template,
    bodyTemplate: row.body_template,
    delayDaysAfterPreviousStep: row.delay_days_after_previous_step,
    stageRequired: row.stage_required,
    stageAfterSend: row.stage_after_send,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
