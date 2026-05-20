#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const DEMO_PERSONS = [
  {
    person_type: "individual",
    default_case_role: "applicant",
    name: "山田 太郎",
    name_kana: "ヤマダ タロウ",
    zip: "4420888",
    address_pref: "愛知県",
    address_city: "豊川市",
    address_town: "千歳通",
    address_line1: "2丁目18番地",
    address_line2: "千歳レジデンス 301",
    phone: "0533-80-1001",
    fax: "0533-80-1002",
    email: "demo+applicant-yamada@example.com",
    memo: "デモ用架空データ: 申請者",
  },
  {
    person_type: "individual",
    default_case_role: "transferee",
    name: "加藤 美咲",
    name_kana: "カトウ ミサキ",
    zip: "4400881",
    address_pref: "愛知県",
    address_city: "豊橋市",
    address_town: "広小路",
    address_line1: "1丁目24番地",
    address_line2: "広小路オフィス 4F",
    phone: "0532-55-2001",
    fax: "0532-55-2002",
    email: "demo+transferee-kato@example.com",
    memo: "デモ用架空データ: 譲受人",
  },
  {
    person_type: "individual",
    default_case_role: "transferor",
    name: "鈴木 一郎",
    name_kana: "スズキ イチロウ",
    zip: "4410105",
    address_pref: "愛知県",
    address_city: "豊川市",
    address_town: "伊奈町",
    address_line1: "南山新田45番地",
    address_line2: "",
    phone: "0533-72-3001",
    fax: "0533-72-3002",
    email: "demo+transferor-suzuki@example.com",
    memo: "デモ用架空データ: 譲渡人",
  },
  {
    person_type: "corporation",
    default_case_role: "agent",
    name: "行政書士法人 東三河リーガル",
    name_kana: "ギョウセイショシホウジン ヒガシミカワリーガル",
    zip: "4400851",
    address_pref: "愛知県",
    address_city: "豊橋市",
    address_town: "前田南町",
    address_line1: "1丁目12番地8",
    address_line2: "リーガルビル 2F",
    phone: "0532-39-4101",
    fax: "0532-39-4102",
    email: "demo+agent-legal@example.com",
    corporate_number: "1010000000001",
    representative_name: "小林 誠",
    memo: "デモ用架空データ: 代理人/行政書士",
  },
  {
    person_type: "corporation",
    default_case_role: "billing",
    name: "株式会社 グリーンファーム豊川",
    name_kana: "カブシキガイシャ グリーンファームトヨカワ",
    zip: "4420068",
    address_pref: "愛知県",
    address_city: "豊川市",
    address_town: "諏訪",
    address_line1: "3丁目133番地",
    address_line2: "GF豊川ビル",
    phone: "0533-89-5001",
    fax: "0533-89-5002",
    email: "demo+billing-greenfarm@example.com",
    corporate_number: "1010000000002",
    representative_name: "森田 健",
    memo: "デモ用架空データ: 請求先",
  },
  {
    person_type: "individual",
    default_case_role: "neighbor",
    name: "近藤 正",
    name_kana: "コンドウ タダシ",
    zip: "4420842",
    address_pref: "愛知県",
    address_city: "豊川市",
    address_town: "蔵子",
    address_line1: "6丁目9番地12",
    address_line2: "",
    phone: "0533-84-6101",
    fax: "0533-84-6102",
    email: "demo+neighbor-kondo@example.com",
    memo: "デモ用架空データ: 隣地所有者",
  },
  {
    person_type: "individual",
    default_case_role: "neighbor",
    name: "伊藤 千尋",
    name_kana: "イトウ チヒロ",
    zip: "4411231",
    address_pref: "愛知県",
    address_city: "豊川市",
    address_town: "一宮町",
    address_line1: "上新切20番地",
    address_line2: "",
    phone: "0533-93-6201",
    fax: "0533-93-6202",
    email: "demo+neighbor-ito@example.com",
    memo: "デモ用架空データ: 隣地所有者",
  },
  {
    person_type: "corporation",
    default_case_role: "other",
    name: "株式会社 青葉測量設計",
    name_kana: "カブシキガイシャ アオバソクリョウセッケイ",
    zip: "4418019",
    address_pref: "愛知県",
    address_city: "豊橋市",
    address_town: "花田町",
    address_line1: "字中ノ坪26番地",
    address_line2: "青葉測量ビル",
    phone: "0532-33-7001",
    fax: "0532-33-7002",
    email: "demo+survey-aoba@example.com",
    corporate_number: "1010000000003",
    representative_name: "青木 亮",
    memo: "デモ用架空データ: 測量協力先",
  },
];

async function loadEnvFile(envPath) {
  let raw;
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (!key || process.env[key]) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function normalizeName(value) {
  return value.normalize("NFKC").replace(/\s+/gu, "");
}

function sanitize(row) {
  return {
    person_type: row.person_type,
    default_case_role: row.default_case_role,
    name: row.name,
    name_kana: row.name_kana,
    zip: row.zip,
    address_pref: row.address_pref,
    address_city: row.address_city,
    address_town: row.address_town,
    address_line1: row.address_line1,
    address_line2: row.address_line2 || null,
    phone: row.phone,
    fax: row.fax,
    email: row.email,
    corporate_number: row.corporate_number || null,
    representative_name: row.representative_name || null,
    memo: row.memo,
    name_normalized: normalizeName(row.name),
  };
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(".env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です。");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let created = 0;
  let updated = 0;

  for (const row of DEMO_PERSONS) {
    const payload = sanitize(row);
    const { data: existing, error: selectError } = await supabase
      .from("persons")
      .select("id")
      .eq("email", payload.email)
      .maybeSingle();

    if (selectError) {
      throw new Error(`${payload.name} の検索に失敗しました: ${selectError.message}`);
    }

    if (existing) {
      const { error } = await supabase.from("persons").update(payload).eq("id", existing.id);
      if (error) throw new Error(`${payload.name} の更新に失敗しました: ${error.message}`);
      updated += 1;
      console.log(`update person#${existing.id} ${payload.name}`);
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("persons")
      .insert(payload)
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(`${payload.name} の登録に失敗しました: ${error?.message || "unknown"}`);
    }
    created += 1;
    console.log(`create person#${inserted.id} ${payload.name}`);
  }

  console.log("");
  console.log("Summary");
  console.log(`  created: ${created}`);
  console.log(`  updated: ${updated}`);
  console.log(`  total:   ${DEMO_PERSONS.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
