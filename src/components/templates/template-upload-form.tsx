"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileUp, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadTemplate } from "@/server/templates";
import type { LocationAreaRow, TemplateCategoryRow } from "@/server/templates";
import { CASE_TYPES, CaseTypeLabels } from "@/lib/validators/case";

type Props = {
  categories: TemplateCategoryRow[];
  locationAreas: LocationAreaRow[];
};

export function TemplateUploadForm({ categories, locationAreas }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [areaId, setAreaId] = useState("");
  const [prefectureId, setPrefectureId] = useState("");
  const [municipalityId, setMunicipalityId] = useState("");
  const [selectedFileType, setSelectedFileType] = useState<string | null>(null);

  const prefectures = locationAreas.flatMap((area) =>
    area.prefectures.map((prefecture) => ({
      ...prefecture,
      area_id: area.id,
    })),
  );
  const municipalities = prefectures.flatMap((prefecture) =>
    prefecture.municipalities.map((municipality) => ({
      ...municipality,
      prefecture_id: prefecture.id,
      area_id: prefecture.area_id,
    })),
  );
  const visiblePrefectures = areaId
    ? prefectures.filter((prefecture) => String(prefecture.area_id) === areaId)
    : prefectures;
  const visibleMunicipalities = prefectureId
    ? municipalities.filter((municipality) => String(municipality.prefecture_id) === prefectureId)
    : areaId
      ? municipalities.filter((municipality) => String(municipality.area_id) === areaId)
      : municipalities;
  const fileHint =
    selectedFileType === "xlsx"
      ? "Excel はアップロード後にセル座標を登録します。"
      : selectedFileType === "docx"
        ? "Word は { } の差し込み名を自動検出します。"
        : ".docx または .xlsx のみ（最大10MB）";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const form = e.currentTarget;
      const fd = new FormData(form);
      const result = await uploadTemplate(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/templates/${result.data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>テンプレートをアップロード</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-m">
          <div className="grid grid-cols-1 gap-s rounded-s border border-border bg-grey-5 px-m py-s text-s lg:grid-cols-3">
            {[
              { icon: FileUp, label: "1. ファイル登録" },
              { icon: ListChecks, label: "2. 基本情報を整理" },
              { icon: ClipboardCheck, label: "3. マッピング確認" },
            ].map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="flex items-center gap-s text-text-grey">
                  <Icon size={16} />
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>

          <Field label="ファイル" hint={fileHint} required>
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept=".docx,.xlsx"
              required
              onChange={(e) => {
                const f = e.target.files?.[0];
                setSelectedFileType(f?.name.split(".").pop()?.toLowerCase() ?? null);
                if (f) {
                  const nameInput = e.target.form?.elements.namedItem("name");
                  if (nameInput instanceof HTMLInputElement && !nameInput.value) {
                    nameInput.value = f.name.replace(/\.(docx|xlsx)$/i, "");
                  }
                }
              }}
              className="block w-full text-s"
            />
          </Field>

          <Field label="様式名" required>
            <Input
              name="name"
              placeholder="例：農地転用許可申請書（5条）"
              required
              maxLength={200}
            />
          </Field>

          <Field label="カテゴリ" required>
            <Select name="categoryId" required defaultValue="">
              <option value="" disabled>
                選択してください
              </option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-m sm:grid-cols-3">
            <Field label="エリア">
              <Select
                value={areaId}
                onChange={(e) => {
                  setAreaId(e.target.value);
                  setPrefectureId("");
                  setMunicipalityId("");
                }}
              >
                <option value="">未設定</option>
                {locationAreas.map((area) => (
                  <option key={area.id} value={String(area.id)}>
                    {area.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="都道府県">
              <Select
                value={prefectureId}
                onChange={(e) => {
                  setPrefectureId(e.target.value);
                  setMunicipalityId("");
                }}
              >
                <option value="">未設定</option>
                {visiblePrefectures.map((prefecture) => (
                  <option key={prefecture.id} value={String(prefecture.id)}>
                    {prefecture.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="対象市町村" hint="必要な様式のみ設定">
              <Select
                name="municipalityId"
                value={municipalityId}
                onChange={(e) => setMunicipalityId(e.target.value)}
              >
                <option value="">未設定</option>
                {visibleMunicipalities.map((municipality) => (
                  <option key={municipality.id} value={String(municipality.id)}>
                    {municipality.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div>
            <Label>対応案件種別（複数選択可）</Label>
            <div className="mt-xs flex flex-wrap gap-xs">
              {CASE_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-xs text-s cursor-pointer">
                  <input type="checkbox" name="applicableCaseTypes" value={t} className="rounded" />
                  {CaseTypeLabels[t]}
                </label>
              ))}
            </div>
            <p className="mt-xs text-xs text-text-grey">未選択の場合は全案件種別で表示されます。</p>
          </div>

          <Field label="説明">
            <Textarea name="description" rows={2} placeholder="このテンプレートの用途など" />
          </Field>

          {error && <p className="text-s text-danger">{error}</p>}

          <div className="flex gap-xs">
            <Button type="submit" variant="primary" loading={submitting}>
              アップロードする
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              キャンセル
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
