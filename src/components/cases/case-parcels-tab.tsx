"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SaveBar } from "@/components/ui/save-bar";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { PREFECTURES } from "@/lib/prefectures";
import { upsertCaseParcels } from "@/server/cases";
import type { CaseParcelRow } from "@/server/cases";

type ParcelFormRow = {
  id?: number;
  sort_order: number;
  pref: string;
  city: string;
  oaza: string;
  aza: string;
  chiban: string;
  chimoku: string;
  area: string;
  tenyo_area: string;
  memo: string;
};

type FormValues = {
  parcels: ParcelFormRow[];
};

function toFormRow(p: CaseParcelRow): ParcelFormRow {
  return {
    id: p.id,
    sort_order: p.sort_order,
    pref: p.pref ?? "",
    city: p.city ?? "",
    oaza: p.oaza ?? "",
    aza: p.aza ?? "",
    chiban: p.chiban ?? "",
    chimoku: p.chimoku ?? "",
    area: p.area != null ? String(p.area) : "",
    tenyo_area: p.tenyo_area != null ? String(p.tenyo_area) : "",
    memo: p.memo ?? "",
  };
}

function emptyRow(sortOrder: number): ParcelFormRow {
  return {
    sort_order: sortOrder,
    pref: "",
    city: "",
    oaza: "",
    aza: "",
    chiban: "",
    chimoku: "",
    area: "",
    tenyo_area: "",
    memo: "",
  };
}

function formatArea(value: number): string {
  return value.toLocaleString("ja-JP", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function CaseParcelsTab({
  caseId,
  parcels,
}: {
  caseId: number;
  parcels: CaseParcelRow[];
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { register, control, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: {
      parcels: parcels.length > 0 ? parcels.map(toFormRow) : [emptyRow(0)],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "parcels" });

  const values = watch("parcels");
  const totalArea = values.reduce((s, p) => s + (Number(p.area) || 0), 0);
  const totalTenyo = values.reduce((s, p) => s + (Number(p.tenyo_area) || 0), 0);

  const onSubmit = (v: FormValues) => {
    setError(null);
    startTransition(async () => {
      const res = await upsertCaseParcels(
        caseId,
        v.parcels.map((p, i) => ({
          id: p.id,
          sort_order: i,
          pref: p.pref || undefined,
          city: p.city || undefined,
          oaza: p.oaza || undefined,
          aza: p.aza || undefined,
          chiban: p.chiban || undefined,
          chimoku: p.chimoku || undefined,
          area: p.area === "" ? null : Number(p.area),
          tenyo_area: p.tenyo_area === "" ? null : Number(p.tenyo_area),
          memo: p.memo || undefined,
        })),
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast({ message: "土地情報を保存しました", tone: "success" });
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-m">
      {error && (
        <div
          role="alert"
          className="rounded-s border border-danger bg-danger-soft p-s text-s text-danger"
        >
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-m border border-border bg-white">
        <Table>
          <THead>
            <tr>
              <TH className="w-10 text-right">No.</TH>
              <TH>都道府県</TH>
              <TH>市区町村</TH>
              <TH>大字</TH>
              <TH>字</TH>
              <TH>地番</TH>
              <TH>地目</TH>
              <TH numeric>地積（㎡）</TH>
              <TH numeric>転用面積（㎡）</TH>
              <TH>備考</TH>
              <TH className="w-10">
                <span className="sr-only">操作</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {fields.map((f, i) => (
              <TR key={f.id}>
                <TD numeric className="text-text-grey">
                  {i + 1}
                </TD>
                <TD className="min-w-[8rem]">
                  <Select aria-label={`${i + 1}行目 都道府県`} {...register(`parcels.${i}.pref`)}>
                    <option value="">選択</option>
                    {PREFECTURES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </TD>
                <TD className="min-w-[7rem]">
                  <Input
                    aria-label={`${i + 1}行目 市区町村`}
                    {...register(`parcels.${i}.city`)}
                  />
                </TD>
                <TD className="min-w-[7rem]">
                  <Input
                    aria-label={`${i + 1}行目 大字`}
                    placeholder="大字○○"
                    {...register(`parcels.${i}.oaza`)}
                  />
                </TD>
                <TD className="min-w-[7rem]">
                  <Input
                    aria-label={`${i + 1}行目 字`}
                    placeholder="字○○"
                    {...register(`parcels.${i}.aza`)}
                  />
                </TD>
                <TD className="min-w-[6rem]">
                  <Input
                    aria-label={`${i + 1}行目 地番`}
                    {...register(`parcels.${i}.chiban`)}
                  />
                </TD>
                <TD className="min-w-[6rem]">
                  <Input
                    aria-label={`${i + 1}行目 地目`}
                    placeholder="田 / 畑 / 宅地"
                    {...register(`parcels.${i}.chimoku`)}
                  />
                </TD>
                <TD numeric className="min-w-[7rem]">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    aria-label={`${i + 1}行目 地積`}
                    className="text-right tabular-nums"
                    {...register(`parcels.${i}.area`)}
                  />
                </TD>
                <TD numeric className="min-w-[7rem]">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    aria-label={`${i + 1}行目 転用面積`}
                    className="text-right tabular-nums"
                    {...register(`parcels.${i}.tenyo_area`)}
                  />
                </TD>
                <TD className="min-w-[8rem]">
                  <Input
                    aria-label={`${i + 1}行目 備考`}
                    {...register(`parcels.${i}.memo`)}
                  />
                </TD>
                <TD>
                  <Button
                    type="button"
                    variant="text"
                    size="sm"
                    aria-label={`${i + 1}行目を削除する`}
                    onClick={() => remove(i)}
                    disabled={pending || fields.length <= 1}
                    className="text-danger hover:no-underline disabled:text-text-disabled"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
          <tfoot className="border-t border-border bg-head">
            <tr>
              <TD className="font-semibold text-text-grey" colSpan={7}>
                合計（{fields.length} 筆）
              </TD>
              <TD numeric className="font-bold text-text-black">
                {formatArea(totalArea)}
              </TD>
              <TD numeric className="font-bold text-text-black">
                {formatArea(totalTenyo)}
              </TD>
              <TD colSpan={2} />
            </tr>
          </tfoot>
        </Table>
      </div>

      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => append(emptyRow(fields.length))}
          disabled={pending}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          筆を追加
        </Button>
      </div>

      <SaveBar info={<>未保存の変更は保存するまで反映されません。</>}>
        <Button type="submit" loading={pending} loadingLabel="保存中…">
          保存する
        </Button>
      </SaveBar>
    </form>
  );
}
