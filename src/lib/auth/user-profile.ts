import type { User } from "@supabase/supabase-js";

type MetadataRecord = Record<string, unknown>;

export type AuthUserProfile = {
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

const EMAIL_KEYS = ["email", "user_email", "mail"];
const FULL_NAME_KEYS = ["full_name", "name", "display_name", "nickname", "en_name"];
const AVATAR_URL_KEYS = [
  "avatar_url",
  "picture",
  "avatar",
  "avatar_thumb",
  "avatar_middle",
  "avatar_big",
  "image_url",
];

function isMetadataRecord(value: unknown): value is MetadataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectMetadataRecords(value: unknown): MetadataRecord[] {
  if (!isMetadataRecord(value)) return [];

  const records = [value];
  for (const key of ["data", "user", "user_info", "profile"]) {
    const nested = value[key];
    if (isMetadataRecord(nested)) records.push(nested);
  }
  return records;
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstText(records: MetadataRecord[], keys: string[]): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = textValue(record[key]);
      if (value) return value;
    }
  }
  return null;
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function extractAuthUserProfile(user: User): AuthUserProfile {
  const records = [
    ...collectMetadataRecords(user.user_metadata),
    ...(user.identities ?? []).flatMap((identity) => collectMetadataRecords(identity.identity_data)),
  ];

  const email = user.email ?? firstText(records, EMAIL_KEYS);

  return {
    email: email?.toLowerCase() ?? null,
    fullName: firstText(records, FULL_NAME_KEYS),
    avatarUrl: safeHttpUrl(firstText(records, AVATAR_URL_KEYS)),
  };
}
