import { z } from "zod";

/*
 * see: docs/phase2/06_cases_master.md
 */

export const CASE_TYPES = [
  "land_improvement",
  "boundary_survey",
  "building_permit",
  "farmland_conversion",
  "other",
] as const;

export const CASE_STATUSES = [
  "inquiry",
  "in_progress",
  "submitted",
  "approved",
  "completed",
  "cancelled",
] as const;

export const CASE_PERSON_ROLES = [
  "applicant",
  "transferee",
  "transferor",
  "agent",
  "billing",
  "neighbor",
  "other",
] as const;
export type CasePersonRole = (typeof CASE_PERSON_ROLES)[number];

export const CaseTypeLabels: Record<(typeof CASE_TYPES)[number], string> = {
  land_improvement: "土地改良区",
  boundary_survey: "境界確定測量",
  building_permit: "建築許可",
  farmland_conversion: "農地転用許可",
  other: "その他",
};

export const CaseStatusLabels: Record<(typeof CASE_STATUSES)[number], string> = {
  inquiry: "問い合わせ",
  in_progress: "進行中",
  submitted: "提出済み",
  approved: "承認済み",
  completed: "完了",
  cancelled: "取消",
};

export const CasePersonRoleLabels: Record<CasePersonRole, string> = {
  applicant: "申請者",
  transferee: "譲受人",
  transferor: "譲渡人",
  agent: "代理人/行政書士",
  billing: "請求先",
  neighbor: "隣地所有者",
  other: "その他",
};

export const CaseCreateSchema = z.object({
  case_name: z.string().min(1, "案件名を入力してください").max(300),
  case_type: z.enum(CASE_TYPES),
  assigned_user_id: z.string().uuid().nullable().optional(),
  submission_target: z.string().max(200).optional(),
  submission_date: z.string().optional(),
  deadline_date: z.string().optional(),
  memo: z.string().optional(),
});
export type CaseCreateInput = z.infer<typeof CaseCreateSchema>;

export const CaseUpdateSchema = CaseCreateSchema.extend({
  status: z.enum(CASE_STATUSES),
});
export type CaseUpdateInput = z.infer<typeof CaseUpdateSchema>;

export const CasePersonAddSchema = z.object({
  person_id: z.number().int().positive(),
  role: z.enum(CASE_PERSON_ROLES),
  sort_order: z.number().int().nonnegative().optional(),
  memo: z.string().optional(),
});
export type CasePersonAddInput = z.infer<typeof CasePersonAddSchema>;

export const CasePersonUpdateSchema = z.object({
  role: z.enum(CASE_PERSON_ROLES).optional(),
  sort_order: z.number().int().nonnegative().optional(),
  snapshot_name: z.string().max(200).optional(),
  snapshot_name_kana: z.string().max(200).optional(),
  snapshot_zip: z.string().max(10).optional(),
  snapshot_address_pref: z.string().max(20).optional(),
  snapshot_address_city: z.string().max(50).optional(),
  snapshot_address_town: z.string().max(100).optional(),
  snapshot_address_line1: z.string().max(200).optional(),
  snapshot_address_line2: z.string().max(200).optional(),
  snapshot_phone: z.string().max(30).optional(),
  snapshot_fax: z.string().max(30).optional(),
  snapshot_email: z.string().max(320).optional(),
  snapshot_corporate_number: z.string().max(20).optional(),
  snapshot_representative_name: z.string().max(200).optional(),
  memo: z.string().optional(),
});
export type CasePersonUpdateInput = z.infer<typeof CasePersonUpdateSchema>;

export const CaseParcelSchema = z.object({
  id: z.number().int().positive().optional(),
  sort_order: z.number().int().nonnegative().default(0),
  pref: z.string().max(20).optional(),
  city: z.string().max(50).optional(),
  aza: z.string().max(100).optional(),
  chiban: z.string().max(100).optional(),
  chimoku: z.string().max(30).optional(),
  area: z.number().nonnegative().nullable().optional(),
  tenyo_area: z.number().nonnegative().nullable().optional(),
  memo: z.string().optional(),
});
export type CaseParcelInput = z.infer<typeof CaseParcelSchema>;

export const CaseFinancialSchema = z.object({
  estimate_amount: z.number().int().nonnegative().nullable().optional(),
  invoice_amount: z.number().int().nonnegative().nullable().optional(),
  paid_amount: z.number().int().nonnegative().nullable().optional(),
  paid_date: z.string().optional(),
  tax_rate: z.number().min(0).max(100).default(10.0),
  memo: z.string().optional(),
});
export type CaseFinancialInput = z.infer<typeof CaseFinancialSchema>;
