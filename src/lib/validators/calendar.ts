import { z } from "zod";

export const ScheduleStatusSchema = z.enum([
  "planned",
  "in_progress",
  "done",
  "carried_over",
  "cancelled",
]);

export const ScheduleIdSchema = z.string().uuid("予定の選択内容が正しくありません。");

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を入力してください。");
const TimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|30)$/, "時刻は30分単位で入力してください。");

const OptionalUuidSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().uuid("選択内容が正しくありません。").nullable(),
);

const OptionalTextSchema = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max, `${max}文字以内で入力してください。`).nullable(),
  );

const OptionalCaseIdSchema = z.preprocess((value) => {
  if (value === "" || value == null) return null;
  if (typeof value === "number" && Number.isNaN(value)) return null;
  return value;
}, z.coerce.number().int("案件の選択内容が正しくありません。").positive("案件の選択内容が正しくありません。").nullable());

function minuteOfDay(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export const ScheduleFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "件名を入力してください。")
      .max(200, "件名は200文字以内で入力してください。"),
    date: DateSchema,
    startTime: TimeSchema,
    endTime: TimeSchema,
    userId: z.string().uuid("担当者を選択してください。"),
    scheduleTypeId: OptionalUuidSchema,
    status: ScheduleStatusSchema,
    caseId: OptionalCaseIdSchema,
    location: OptionalTextSchema(200),
    memo: OptionalTextSchema(5000),
  })
  .refine((value) => minuteOfDay(value.endTime) > minuteOfDay(value.startTime), {
    path: ["endTime"],
    message: "終了時刻は開始時刻より後にしてください。",
  })
  .refine(
    (value) => minuteOfDay(value.startTime) >= 8 * 60 && minuteOfDay(value.endTime) <= 18 * 60,
    {
      path: ["startTime"],
      message: "時刻は8:00から18:00の範囲で入力してください。",
    },
  );

export const ScheduleMoveSchema = z
  .object({
    scheduleId: ScheduleIdSchema,
    userId: z.string().uuid(),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
  })
  .refine((value) => new Date(value.endAt).getTime() > new Date(value.startAt).getTime(), {
    path: ["endAt"],
    message: "終了日時は開始日時より後にしてください。",
  });

export type ScheduleMoveInput = z.infer<typeof ScheduleMoveSchema>;
export type ScheduleFormInput = z.infer<typeof ScheduleFormSchema>;

export const ScheduleCommentSchema = z.object({
  scheduleId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1, "コメントを入力してください。")
    .max(2000, "コメントは2000文字以内で入力してください。"),
});

export type ScheduleCommentInput = z.infer<typeof ScheduleCommentSchema>;

const DailyReportBodySchema = z
  .string()
  .trim()
  .max(5000, "日報本文は5000文字以内で入力してください。");

export const DailyReportSaveSchema = z.object({
  reportDate: DateSchema,
  body: DailyReportBodySchema,
});

export const DailyReportSubmitSchema = z.object({
  reportDate: DateSchema,
  body: DailyReportBodySchema.min(1, "日報本文を入力してください。"),
});

export const DailyReportCommentSchema = z.object({
  reportId: z.string().uuid("日報の選択内容が正しくありません。"),
  body: z
    .string()
    .trim()
    .min(1, "コメントを入力してください。")
    .max(2000, "コメントは2000文字以内で入力してください。"),
});

export type DailyReportSaveInput = z.infer<typeof DailyReportSaveSchema>;
export type DailyReportSubmitInput = z.infer<typeof DailyReportSubmitSchema>;
export type DailyReportCommentInput = z.infer<typeof DailyReportCommentSchema>;
