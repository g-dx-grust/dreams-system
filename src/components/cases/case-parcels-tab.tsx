"use client";

import { useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { PREFECTURES } from "@/lib/prefectures";
import { upsertCaseParcels } from "@/server/cases";
import type { CaseParcelRow } from "@/server/cases";

type ParcelFormRow = {
  id?: number;
  sort_order: number;
  pref: string;
  city: string;
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
    aza: "",
    chiban: "",
    chimoku: "",
    area: "",
    tenyo_area: "",
    memo: "",
  };
}

export function CaseParcelsTab({
  caseId,
  parcels,
}: {
  caseId: number;
  parcels: CaseParcelRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
    startTransition(async () => {
      const res = await upsertCaseParcels(
        caseId,
        v.parcels.map((p, i) => ({
          id: p.id,
          sort_order: i,
          pref: p.pref || undefined,
          city: p.city || undefined,
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
      setSaved(true);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-l">
      {fields.map((f, i) => (
        <Card key={f.id}>
          <CardBody className="flex flex-col gap-m">
            <div className="flex items-center justify-between">
              <h3 className="text-m font-medium">筆 #{i + 1}</h3>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  onClick={() => remove(i)}
                  disabled={pending}
                >
                  この筆を削除
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
              <Field label="都道府県">
                <Select {...register(`parcels.${i}.pref`)}>
                  <option value="">選択してください</option>
                  {PREFECTURES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="市区町村">
                <Input {...register(`parcels.${i}.city`)} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
              <Field label="大字・字">
                <Input {...register(`parcels.${i}.aza`)} />
              </Field>
              <Field label="地番">
                <Input {...register(`parcels.${i}.chiban`)} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-m sm:grid-cols-3">
              <Field label="地目">
                <Input {...register(`parcels.${i}.chimoku`)} placeholder="田 / 畑 / 宅地 など" />
              </Field>
              <Field label="地積（㎡）">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register(`parcels.${i}.area`)}
                />
              </Field>
              <Field label="転用面積（㎡）">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register(`parcels.${i}.tenyo_area`)}
                />
              </Field>
            </div>

            <Field label="メモ">
              <Input {...register(`parcels.${i}.memo`)} />
            </Field>
          </CardBody>
        </Card>
      ))}

      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => append(emptyRow(fields.length))}
          disabled={pending}
        >
          筆を追加
        </Button>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-m">
          <div className="text-s text-text-grey">
            合計地積:{" "}
            <span className="font-medium text-text-black">{totalArea.toLocaleString()} ㎡</span>
            <span className="ml-m">
              合計転用面積:{" "}
              <span className="font-medium text-text-black">{totalTenyo.toLocaleString()} ㎡</span>
            </span>
          </div>
          <div className="flex items-center gap-s">
            {saved && <span className="text-s text-success">保存しました。</span>}
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存する"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {error && (
        <p className="text-s text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
