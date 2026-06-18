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

/*
 * 提出日と締切日が両方入力されている場合のみ前後関係を検証する。
 * 値は HTML date 入力（YYYY-MM-DD）想定。空文字は未入力として扱う。
 */
const refineSubmissionBeforeDeadline = <T extends { submission_date?: string; deadline_date?: string }>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  const submission = value.submission_date?.trim();
  const deadline = value.deadline_date?.trim();
  if (submission && deadline && submission > deadline) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["deadline_date"],
      message: "締切日は提出日以降の日付を指定してください",
    });
  }
};

const optionalCoordinate = (min: number, max: number, label: string) =>
  z.preprocess(
    (value) => {
      if (value == null) return null;
      if (typeof value === "number" && Number.isNaN(value)) return null;
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed === "" ? null : Number(trimmed);
      }
      return value;
    },
    z
      .number({ invalid_type_error: `${label}は数値で入力してください` })
      .finite(`${label}は数値で入力してください`)
      .min(min, `${label}の範囲が正しくありません`)
      .max(max, `${label}の範囲が正しくありません`)
      .nullable()
      .optional(),
  );

const refineCoordinatePair = <
  T extends { latitude?: number | null; longitude?: number | null },
>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  const hasLat = value.latitude != null;
  const hasLng = value.longitude != null;
  if (hasLat === hasLng) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [hasLat ? "longitude" : "latitude"],
    message: "緯度と経度は両方入力してください",
  });
};

const refineCaseBase = <
  T extends {
    submission_date?: string;
    deadline_date?: string;
    latitude?: number | null;
    longitude?: number | null;
  },
>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  refineSubmissionBeforeDeadline(value, ctx);
  refineCoordinatePair(value, ctx);
};

const CaseBaseSchema = z.object({
  case_name: z.string().min(1, "案件名を入力してください").max(300),
  case_type: z.enum(CASE_TYPES),
  assigned_user_id: z.string().uuid().nullable().optional(),
  submission_target: z.string().max(200).optional(),
  submission_date: z.string().optional(),
  deadline_date: z.string().optional(),
  latitude: optionalCoordinate(-90, 90, "緯度"),
  longitude: optionalCoordinate(-180, 180, "経度"),
  memo: z.string().optional(),
});

export const CaseCreateSchema = CaseBaseSchema.superRefine(refineCaseBase);
export type CaseCreateInput = z.infer<typeof CaseCreateSchema>;

export const CaseUpdateSchema = CaseBaseSchema.extend({
  status: z.enum(CASE_STATUSES),
}).superRefine(refineCaseBase);
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
  oaza: z.string().max(100).optional(),
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
