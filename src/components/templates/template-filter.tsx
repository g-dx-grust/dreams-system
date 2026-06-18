"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { LocationAreaRow, TemplateCategoryRow } from "@/server/templates";
import { CASE_TYPES, CaseTypeLabels } from "@/lib/validators/case";

/*
 * テンプレート一覧の常設フィルタバー。選択は即時反映（URLクエリを更新）し、
 * 適用中フィルタをチップで可視化する。キーワードは300msデバウンス。see: DESIGN.md §8.8
 */
type Props = {
  categories: TemplateCategoryRow[];
  locationAreas: LocationAreaRow[];
};

export function TemplateFilter({ categories, locationAreas }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get("q") ?? "");
  const firstRender = useRef(true);

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

  const pushWith = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(sp.toString());
    mutate(params);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const update = (values: Record<string, string>) =>
    pushWith((params) => {
      for (const [key, value] of Object.entries(values)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
    });

  // キーワードはデバウンス（300ms）後に反映
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(() => {
      const current = sp.get("q") ?? "";
      const next = q.trim();
      if (next === current) return;
      pushWith((params) => (next ? params.set("q", next) : params.delete("q")));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sp, pathname, router]);

  const categoryName = (id: string) =>
    categories.find((c) => String(c.id) === id)?.name ?? id;
  const areaName = (id: number) =>
    locationAreas.find((a) => a.id === id)?.name ?? String(id);
  const prefectureName = (id: number) =>
    prefectures.find((p) => p.id === id)?.name ?? String(id);
  const municipalityName = (id: number) =>
    municipalities.find((m) => m.id === id)?.name ?? String(id);

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (sp.get("q"))
    chips.push({
      key: "q",
      label: `キーワード: ${sp.get("q")}`,
      onRemove: () => {
        setQ("");
        update({ q: "" });
      },
    });
  if (sp.get("categoryId"))
    chips.push({
      key: "categoryId",
      label: `カテゴリ: ${categoryName(sp.get("categoryId") as string)}`,
      onRemove: () => update({ categoryId: "" }),
    });
  if (sp.get("caseType"))
    chips.push({
      key: "caseType",
      label: `案件種別: ${
        CaseTypeLabels[sp.get("caseType") as keyof typeof CaseTypeLabels] ?? sp.get("caseType")
      }`,
      onRemove: () => update({ caseType: "" }),
    });
  if (effectiveAreaId)
    chips.push({
      key: "areaId",
      label: `エリア: ${areaName(effectiveAreaId)}`,
      onRemove: () => update({ areaId: "", prefectureId: "", municipalityId: "" }),
    });
  if (effectivePrefectureId)
    chips.push({
      key: "prefectureId",
      label: `都道府県: ${prefectureName(effectivePrefectureId)}`,
      onRemove: () => update({ prefectureId: "", municipalityId: "" }),
    });
  if (selectedMunicipalityId)
    chips.push({
      key: "municipalityId",
      label: `市町村: ${municipalityName(selectedMunicipalityId)}`,
      onRemove: () => update({ municipalityId: "" }),
    });

  const clearAll = () => {
    setQ("");
    router.push(pathname);
  };

  return (
    <div className="flex flex-col gap-s">
      <div className="flex flex-wrap items-end gap-s">
        <label className="flex min-w-[220px] flex-1 flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">キーワード</span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="様式名" />
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">カテゴリ</span>
          <Select
            value={sp.get("categoryId") ?? ""}
            onChange={(e) => update({ categoryId: e.target.value })}
            className="w-[160px]"
          >
            <option value="">すべて</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">案件種別</span>
          <Select
            value={sp.get("caseType") ?? ""}
            onChange={(e) => update({ caseType: e.target.value })}
            className="w-[180px]"
          >
            <option value="">すべて</option>
            {CASE_TYPES.map((t) => (
              <option key={t} value={t}>
                {CaseTypeLabels[t]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">エリア</span>
          <Select
            value={effectiveAreaId ? String(effectiveAreaId) : ""}
            onChange={(e) =>
              update({ areaId: e.target.value, prefectureId: "", municipalityId: "" })
            }
            className="w-[160px]"
          >
            <option value="">すべて</option>
            {locationAreas.map((area) => (
              <option key={area.id} value={String(area.id)}>
                {area.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">都道府県</span>
          <Select
            value={effectivePrefectureId ? String(effectivePrefectureId) : ""}
            onChange={(e) =>
              update({
                areaId: effectiveAreaId ? String(effectiveAreaId) : "",
                prefectureId: e.target.value,
                municipalityId: "",
              })
            }
            className="w-[160px]"
          >
            <option value="">すべて</option>
            {visiblePrefectures.map((prefecture) => (
              <option key={prefecture.id} value={String(prefecture.id)}>
                {prefecture.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">市町村</span>
          <Select
            value={selectedMunicipalityId ? String(selectedMunicipalityId) : ""}
            onChange={(e) =>
              update({
                areaId: effectiveAreaId ? String(effectiveAreaId) : "",
                prefectureId: effectivePrefectureId ? String(effectivePrefectureId) : "",
                municipalityId: e.target.value,
              })
            }
            className="w-[200px]"
          >
            <option value="">すべて</option>
            {visibleMunicipalities.map((municipality) => (
              <option key={municipality.id} value={String(municipality.id)}>
                {municipality.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-xs">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-xxs rounded-s bg-grey-7 py-xxs pl-s pr-xxs text-xs text-text-grey"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`${chip.label} を解除`}
                className="flex h-4 w-4 items-center justify-center rounded-s text-text-quaternary hover:bg-grey-20 hover:text-text-black"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-xs text-xs text-text-link hover:underline"
          >
            すべて解除
          </button>
        </div>
      )}
    </div>
  );
}
