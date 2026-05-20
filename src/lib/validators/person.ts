import { z } from "zod";
import { CASE_PERSON_ROLES } from "./case";

/*
 * see: docs/phase2/05_persons_master.md §バリデーションルール
 */

const kanaRegex = /^[ァ-ヶー　\s]*$/;
const phoneRegex = /^[\d-]*$/;
const personDefaultCaseRoles = ["", ...CASE_PERSON_ROLES] as const;

export const PersonUpsertSchema = z.object({
  person_type: z.enum(["individual", "corporation"]),
  default_case_role: z.enum(personDefaultCaseRoles).optional(),
  name: z.string().min(1, "氏名を入力してください").max(200),
  name_kana: z
    .string()
    .max(200)
    .optional()
    .refine((v) => !v || kanaRegex.test(v), "フリガナはカタカナで入力してください"),
  zip: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d{7}$/.test(v.replace(/-/g, "")),
      "郵便番号は7桁の数字で入力してください",
    ),
  address_pref: z.string().max(20).optional(),
  address_city: z.string().max(50).optional(),
  address_town: z.string().max(100).optional(),
  address_line1: z.string().max(200).optional(),
  address_line2: z.string().max(200).optional(),
  phone: z
    .string()
    .optional()
    .refine(
      (v) => !v || (phoneRegex.test(v) && v.replace(/-/g, "").length >= 10 && v.replace(/-/g, "").length <= 13),
      "電話番号は10〜13桁で入力してください",
    ),
  fax: z
    .string()
    .optional()
    .refine(
      (v) => !v || phoneRegex.test(v),
      "FAX番号は数字とハイフンで入力してください",
    ),
  email: z
    .string()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, "メールアドレスの形式が正しくありません"),
  corporate_number: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{13}$/.test(v), "法人番号は13桁の数字で入力してください"),
  representative_name: z.string().max(200).optional(),
  memo: z.string().optional(),
});

export type PersonUpsertInput = z.infer<typeof PersonUpsertSchema>;
