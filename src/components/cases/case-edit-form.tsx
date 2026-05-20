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
import { Card, CardBody } from "@/components/ui/card";
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
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
    startTransition(async () => {
      const res = await updateCase(caseId, values);
      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-l">
      <Card>
        <CardBody className="flex flex-col gap-m">
          <Field label="案件名" required error={errors.case_name?.message}>
            <Input {...register("case_name")} />
          </Field>

          <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
            <Field label="案件種別" required error={errors.case_type?.message}>
              <Select {...register("case_type")}>
                {CASE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CaseTypeLabels[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ステータス" required error={errors.status?.message}>
              <Select {...register("status")}>
                {CASE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CaseStatusLabels[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="担当者" error={errors.assigned_user_id?.message}>
            <Select {...register("assigned_user_id")}>
              <option value="">未指定</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="提出先" error={errors.submission_target?.message}>
            <Input {...register("submission_target")} />
          </Field>

          <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
            <Field label="提出日" error={errors.submission_date?.message}>
              <Input type="date" {...register("submission_date")} />
            </Field>
            <Field label="締切日" error={errors.deadline_date?.message}>
              <Input type="date" {...register("deadline_date")} />
            </Field>
          </div>

          <Field label="メモ" error={errors.memo?.message}>
            <Textarea {...register("memo")} />
          </Field>
        </CardBody>
      </Card>

      {submitError && (
        <p className="text-s text-danger" role="alert">
          {submitError}
        </p>
      )}
      {saved && <p className="text-s text-success">保存しました。</p>}

      <div className="flex justify-end gap-s">
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : "保存する"}
        </Button>
      </div>
    </form>
  );
}
