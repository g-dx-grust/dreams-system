// see: docs/assets/field_dictionary.md

export type FieldEntry = {
  path: string;
  label: string;
  group: string;
  aliases?: string[];
};

type FieldGroup = {
  group: string;
  fields: FieldEntry[];
};

const INDEXED_PARCEL_COUNT = 13;

const PARCEL_FIELD_DEFS = [
  ["pref", "所在都道府県"],
  ["city", "所在市区町村"],
  ["aza", "大字・字"],
  ["chiban", "地番"],
  ["locationFull", "所在地（市区町村〜地番）"],
  ["chimoku", "地目"],
  ["area", "地積"],
  ["tenyoArea", "転用面積"],
] as const;

const CORE_FIELDS: FieldEntry[] = [
  { path: "caseNumber", label: "案件番号", group: "案件基本情報" },
  { path: "caseName", label: "案件名", group: "案件基本情報" },
  { path: "caseMemo", label: "案件メモ・申請理由", group: "案件基本情報" },
  { path: "caseTypeLabel", label: "案件種別（日本語）", group: "案件基本情報" },
  { path: "submissionTarget", label: "提出先", group: "案件基本情報" },
  { path: "submissionDate", label: "提出日（和暦）", group: "案件基本情報" },
  { path: "deadlineDate", label: "締切日（和暦）", group: "案件基本情報" },
  { path: "today", label: "生成日（和暦）", group: "案件基本情報" },
  { path: "todayYear", label: "生成年（和暦）", group: "案件基本情報" },
  { path: "todayMonth", label: "生成月", group: "案件基本情報" },
  { path: "todayDay", label: "生成日（日）", group: "案件基本情報" },
  { path: "parcel.pref", label: "所在都道府県", group: "土地情報（1筆目）" },
  { path: "parcel.city", label: "所在市区町村", group: "土地情報（1筆目）" },
  { path: "parcel.aza", label: "大字・字", group: "土地情報（1筆目）" },
  { path: "parcel.chiban", label: "地番", group: "土地情報（1筆目）" },
  { path: "parcel.locationFull", label: "所在地（市区町村〜地番）", group: "土地情報（1筆目）" },
  { path: "parcel.chimoku", label: "地目", group: "土地情報（1筆目）" },
  { path: "parcel.area", label: "地積（㎡）", group: "土地情報（1筆目）" },
  { path: "parcel.tenyoArea", label: "転用面積（㎡）", group: "土地情報（1筆目）" },
  ...buildParcelIndexFields(rangeIndexes(INDEXED_PARCEL_COUNT)),
  { path: "totalArea", label: "地積合計（㎡）", group: "土地情報（複数筆）" },
  { path: "totalTenyoArea", label: "転用面積合計（㎡）", group: "土地情報（複数筆）" },
  { path: "estimateAmount", label: "見積金額（税抜）", group: "金額" },
  { path: "estimateAmountTax", label: "消費税額", group: "金額" },
  { path: "estimateAmountTotal", label: "見積金額（税込）", group: "金額" },
  { path: "invoiceAmount", label: "請求金額（税抜）", group: "金額" },
  { path: "invoiceAmountTax", label: "請求消費税額", group: "金額" },
  { path: "invoiceAmountTotal", label: "請求金額（税込）", group: "金額" },
];

const PERSON_FIELD_DEFS = [
  ["name", "氏名"],
  ["nameKana", "フリガナ"],
  ["zip", "郵便番号"],
  ["addressPref", "都道府県"],
  ["addressCity", "市区町村"],
  ["addressTown", "町域"],
  ["addressLine1", "番地"],
  ["addressLine2", "建物名"],
  ["addressFull", "住所（全体）"],
  ["addressNoPref", "住所（都道府県除く）"],
  ["phone", "電話番号"],
  ["fax", "FAX"],
  ["email", "メール"],
  ["corporateNumber", "法人番号"],
  ["representativeName", "代表者氏名"],
] as const;

function toSnakeCase(input: string): string {
  return input.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function rangeIndexes(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

export function normalizeFieldLookup(input: string): string {
  return input
    .trim()
    .replace(/^\{\{?/, "")
    .replace(/\}\}?$/, "")
    .replace(/\s+/g, "");
}

function withAliases(entry: FieldEntry): FieldEntry {
  const alias = toSnakeCase(entry.path);
  if (alias === entry.path) return entry;
  return { ...entry, aliases: [alias] };
}

function buildParcelIndexFields(indexes: number[]): FieldEntry[] {
  return indexes.flatMap((index) =>
    PARCEL_FIELD_DEFS.map(([suffix, label]) =>
      withAliases({
        path: `parcels[${index}].${suffix}`,
        label: `${index + 1}筆目 ${label}`,
        group: "土地情報（複数筆）",
      }),
    ),
  );
}

function buildPersonFields(role: {
  key: string;
  group: string;
  labelPrefix: string;
  nameLabel?: string;
}): FieldEntry[] {
  return PERSON_FIELD_DEFS.map(([suffix, label]) =>
    withAliases({
      path: `${role.key}.${suffix}`,
      label:
        suffix === "name" && role.nameLabel
          ? role.nameLabel
          : `${role.labelPrefix}${label}`,
      group: role.group,
    }),
  );
}

function buildIndexedPersonFields(role: {
  key: string;
  group: string;
  labelPrefix: string;
  indexes: number[];
}): FieldEntry[] {
  return role.indexes.flatMap((index) =>
    ["name", "addressFull", "phone", "email"].map((suffix) =>
      withAliases({
        path: `${role.key}[${index}].${suffix}`,
        label: `${index + 1}人目 ${role.labelPrefix}${suffixLabel(suffix)}`,
        group: role.group,
      }),
    ),
  );
}

function suffixLabel(suffix: string): string {
  switch (suffix) {
    case "name":
      return "氏名";
    case "addressFull":
      return "住所（全体）";
    case "phone":
      return "電話番号";
    case "email":
      return "メール";
    default:
      return suffix;
  }
}

const PERSON_FIELDS = [
  ...buildPersonFields({ key: "applicant", group: "申請者", labelPrefix: "申請者" }),
  ...buildPersonFields({ key: "transferee", group: "譲受人", labelPrefix: "譲受人" }),
  ...buildPersonFields({ key: "transferor", group: "譲渡人", labelPrefix: "譲渡人" }),
  ...buildPersonFields({
    key: "agent",
    group: "代理人/行政書士",
    labelPrefix: "代理人",
  }),
  ...buildPersonFields({
    key: "billing",
    group: "請求先",
    labelPrefix: "請求先",
    nameLabel: "請求先氏名・法人名",
  }),
  ...buildPersonFields({
    key: "neighbor",
    group: "隣地所有者",
    labelPrefix: "隣地所有者",
  }).map((field) =>
    field.path === "neighbor.name" || field.path === "neighbor.addressFull"
      ? {
          ...field,
          label: field.label.includes("住所")
            ? "隣地所有者住所（1人目）"
            : "隣地所有者氏名（1人目）",
        }
      : field,
  ),
  ...buildIndexedPersonFields({
    key: "applicants",
    group: "申請者（複数）",
    labelPrefix: "申請者",
    indexes: [0, 1],
  }),
  ...buildIndexedPersonFields({
    key: "neighbors",
    group: "隣地所有者（複数）",
    labelPrefix: "隣地所有者",
    indexes: [0, 1],
  }).map((field) => {
    const match = field.path.match(/^neighbors\[(\d+)\]\.(.+)$/);
    const index = match?.[1] ? Number(match[1]) + 1 : 1;
    const suffix = match?.[2] ? suffixLabel(match[2]) : field.label;
    return {
      ...field,
      label: `隣地所有者${suffix}（${index}人目）`,
    };
  }),
];

export const FIELD_DICT: FieldEntry[] = [...CORE_FIELDS, ...PERSON_FIELDS].map(withAliases);

const FIELD_LOOKUP = new Map<string, FieldEntry>();

for (const field of FIELD_DICT) {
  for (const key of [field.path, ...(field.aliases ?? [])]) {
    FIELD_LOOKUP.set(normalizeFieldLookup(key), field);
  }
}

export const FIELD_GROUPS: FieldGroup[] = Object.entries(
  FIELD_DICT.reduce<Record<string, FieldEntry[]>>((acc, field) => {
    acc[field.group] ??= [];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    acc[field.group]!.push(field);
    return acc;
  }, {}),
).map(([group, fields]) => ({ group, fields }));

export function suggestFieldEntry(input: string): FieldEntry | undefined {
  return FIELD_LOOKUP.get(normalizeFieldLookup(input));
}

export function canonicalizeFieldPath(input: string): string {
  const suggested = suggestFieldEntry(input);
  if (suggested) return suggested.path;
  return normalizeFieldLookup(input);
}

export function fieldLabel(path: string): string {
  return suggestFieldEntry(path)?.label ?? canonicalizeFieldPath(path);
}
