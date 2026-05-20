"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import type { LocationAreaRow, TemplateCategoryRow } from "@/server/templates";
import { CASE_TYPES, CaseTypeLabels } from "@/lib/validators/case";

type Props = {
  categories: TemplateCategoryRow[];
  locationAreas: LocationAreaRow[];
};

export function TemplateFilter({ categories, locationAreas }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const prefectures = locationAreas.flatMap((area) =>
    area.prefectures.map((prefecture) => ({
      ...prefecture,
      area_id: area.id,
      area_name: area.name,
    })),
  );
  const municipalities = prefectures.flatMap((prefecture) =>
    prefecture.municipalities.map((municipality) => ({
      ...municipality,
      prefecture_name: prefecture.name,
      prefecture_id: prefecture.id,
      area_id: prefecture.area_id,
      area_name: prefecture.area_name,
    })),
  );

  const selectedAreaId = Number(sp.get("areaId") ?? "") || null;
  const selectedPrefectureId = Number(sp.get("prefectureId") ?? "") || null;
  const selectedMunicipalityId = Number(sp.get("municipalityId") ?? "") || null;
  const selectedMunicipality =
    municipalities.find((municipality) => municipality.id === selectedMunicipalityId) ?? null;
  const effectivePrefectureId =
    selectedPrefectureId ?? selectedMunicipality?.prefecture_id ?? null;
  const selectedPrefecture =
    prefectures.find((prefecture) => prefecture.id === effectivePrefectureId) ?? null;
  const effectiveAreaId =
    selectedAreaId ?? selectedPrefecture?.area_id ?? selectedMunicipality?.area_id ?? null;

  const visiblePrefectures = effectiveAreaId
    ? prefectures.filter((prefecture) => prefecture.area_id === effectiveAreaId)
    : prefectures;
  const visibleMunicipalities = effectivePrefectureId
    ? municipalities.filter((municipality) => municipality.prefecture_id === effectivePrefectureId)
    : effectiveAreaId
      ? municipalities.filter((municipality) => municipality.area_id === effectiveAreaId)
      : municipalities;

  function update(values: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    params.delete("page");
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex gap-xs flex-wrap">
      <Select
        value={sp.get("categoryId") ?? ""}
        onChange={(e) => update({ categoryId: e.target.value })}
        className="w-[160px]"
      >
        <option value="">カテゴリ: すべて</option>
        {categories.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select
        value={sp.get("caseType") ?? ""}
        onChange={(e) => update({ caseType: e.target.value })}
        className="w-[180px]"
      >
        <option value="">案件種別: すべて</option>
        {CASE_TYPES.map((t) => (
          <option key={t} value={t}>
            {CaseTypeLabels[t]}
          </option>
        ))}
      </Select>
      <Select
        value={effectiveAreaId ? String(effectiveAreaId) : ""}
        onChange={(e) =>
          update({
            areaId: e.target.value,
            prefectureId: "",
            municipalityId: "",
          })
        }
        className="w-[180px]"
      >
        <option value="">エリア: すべて</option>
        {locationAreas.map((area) => (
          <option key={area.id} value={String(area.id)}>
            {area.name}
          </option>
        ))}
      </Select>
      <Select
        value={effectivePrefectureId ? String(effectivePrefectureId) : ""}
        onChange={(e) =>
          update({
            areaId: effectiveAreaId ? String(effectiveAreaId) : "",
            prefectureId: e.target.value,
            municipalityId: "",
          })
        }
        className="w-[180px]"
      >
        <option value="">都道府県: すべて</option>
        {visiblePrefectures.map((prefecture) => (
          <option key={prefecture.id} value={String(prefecture.id)}>
            {prefecture.name}
          </option>
        ))}
      </Select>
      <Select
        value={selectedMunicipalityId ? String(selectedMunicipalityId) : ""}
        onChange={(e) =>
          update({
            areaId: effectiveAreaId ? String(effectiveAreaId) : "",
            prefectureId: effectivePrefectureId ? String(effectivePrefectureId) : "",
            municipalityId: e.target.value,
          })
        }
        className="w-[220px]"
      >
        <option value="">市町村: すべて</option>
        {visibleMunicipalities.map((municipality) => (
          <option key={municipality.id} value={String(municipality.id)}>
            {municipality.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
