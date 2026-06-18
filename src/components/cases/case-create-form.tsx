"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SaveBar } from "@/components/ui/save-bar";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import {
  CaseCreateSchema,
  CASE_TYPES,
  CaseTypeLabels,
  type CaseCreateInput,
} from "@/lib/validators/case";
import { createCase, type AssignableUser } from "@/server/cases";

export function CaseCreateForm({ users }: { users: AssignableUser[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CaseCreateInput>({
    resolver: zodResolver(CaseCreateSchema),
    defaultValues: { case_type: "farmland_conversion" },
  });

  const onSubmit = (values: CaseCreateInput) => {
    setSubmitError(null);
    startTransition(async () => {
      const res = await createCase(values);
      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }
      router.push(`/cases/${res.data.id}`);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-l">
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-m">
          <Field label="案件名" required error={errors.case_name?.message}>
            <Input
              aria-invalid={!!errors.case_name}
              {...register("case_name")}
              placeholder="例: 〇〇様 農地転用 5 条許可"
            />
          </Field>

          <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
            <Field label="案件種別" required error={errors.case_type?.message}>
              <Select aria-invalid={!!errors.case_type} {...register("case_type")}>
                {CASE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CaseTypeLabels[t]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="担当者" error={errors.assigned_user_id?.message}>
              <Select aria-invalid={!!errors.assigned_user_id} {...register("assigned_user_id")}>
                <option value="">未指定</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>地図座標</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-m">
          <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
            <Field
              label="緯度"
              error={errors.latitude?.message}
              hint="世界測地系（JGD2011/WGS84相当）の緯度です。未確定の場合は空欄にしてください。"
            >
              <Input
                inputMode="decimal"
                aria-invalid={!!errors.latitude}
                {...register("latitude")}
                placeholder="例: 34.769123"
              />
            </Field>
            <Field
              label="経度"
              error={errors.longitude?.message}
              hint="世界測地系（JGD2011/WGS84相当）の経度です。未確定の場合は空欄にしてください。"
            >
              <Input
                inputMode="decimal"
                aria-invalid={!!errors.longitude}
                {...register("longitude")}
                placeholder="例: 137.391456"
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>提出・期日</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-m">
          <Field label="提出先" error={errors.submission_target?.message}>
            <Input
              aria-invalid={!!errors.submission_target}
              {...register("submission_target")}
              placeholder="例: 豊橋市農業委員会"
            />
          </Field>

          <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
            <Field
              label="提出日"
              error={errors.submission_date?.message}
              hint="役所等へ書類を提出する予定日です。"
            >
              <Input
                type="date"
                aria-invalid={!!errors.submission_date}
                {...register("submission_date")}
              />
            </Field>
            <Field
              label="締切日"
              error={errors.deadline_date?.message}
              hint="提出日以降の日付を指定してください。"
            >
              <Input
                type="date"
                aria-invalid={!!errors.deadline_date}
                {...register("deadline_date")}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>メモ</CardTitle>
        </CardHeader>
        <CardBody>
          <Field label="メモ" error={errors.memo?.message}>
            <Textarea
              aria-invalid={!!errors.memo}
              {...register("memo")}
              placeholder="案件に関する補足を記録します。"
            />
          </Field>
        </CardBody>
      </Card>

      {submitError && (
        <div
          className="rounded-s border border-danger bg-danger-soft p-s text-s text-danger"
          role="alert"
        >
          {submitError}
        </div>
      )}

      <SaveBar info="入力内容を確認して登録してください。">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/cases")}
          disabled={pending}
        >
          キャンセル
        </Button>
        <Button type="submit" loading={pending} loadingLabel="登録中…">
          登録する
        </Button>
      </SaveBar>
    </form>
  );
}
