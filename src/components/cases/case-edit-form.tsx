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
import { useToast } from "@/components/ui/toast";
import {
  CaseUpdateSchema,
  CASE_TYPES,
  CASE_STATUSES,
  CaseTypeLabels,
  CaseStatusLabels,
  type CaseUpdateInput,
} from "@/lib/validators/case";
import { updateCase, type AssignableUser } from "@/server/cases";

export function CaseEditForm({
  caseId,
  users,
  defaults,
}: {
  caseId: number;
  users: AssignableUser[];
  defaults: CaseUpdateInput;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CaseUpdateInput>({
    resolver: zodResolver(CaseUpdateSchema),
    defaultValues: defaults,
  });

  const onSubmit = (values: CaseUpdateInput) => {
    setSubmitError(null);
    startTransition(async () => {
      const res = await updateCase(caseId, values);
      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }
      toast({ message: "保存しました", tone: "success" });
      router.refresh();
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
            <Input aria-invalid={!!errors.case_name} {...register("case_name")} />
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
            <Field label="ステータス" required error={errors.status?.message}>
              <Select aria-invalid={!!errors.status} {...register("status")}>
                {CASE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CaseStatusLabels[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

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
              hint="世界測地系（JGD2011/WGS84相当）の緯度です。地図タブからクリックで設定できます。"
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
              hint="世界測地系（JGD2011/WGS84相当）の経度です。地図タブからクリックで設定できます。"
            >
              <Input
                inputMode="decimal"
                aria-invalid={!!errors.longitude}
                {...register("longitude")}
                placeholder="例: 137.391456"
              />
            </Field>
          </div>
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/cases/${caseId}/map`)}
              disabled={pending}
            >
              地図で設定する
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>提出・期日</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-m">
          <Field label="提出先" error={errors.submission_target?.message}>
            <Input aria-invalid={!!errors.submission_target} {...register("submission_target")} />
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
            <Textarea aria-invalid={!!errors.memo} {...register("memo")} />
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

      <SaveBar info="変更内容は保存するまで反映されません。">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(`/cases/${caseId}`)}
          disabled={pending}
        >
          キャンセル
        </Button>
        <Button type="submit" loading={pending} loadingLabel="保存中…">
          保存する
        </Button>
      </SaveBar>
    </form>
  );
}
