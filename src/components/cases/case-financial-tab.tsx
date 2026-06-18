"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { SaveBar } from "@/components/ui/save-bar";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatJPY } from "@/lib/format";
import { updateCaseFinancial } from "@/server/cases";
import type { CaseFinancialRow } from "@/server/cases";

type FormValues = {
  estimate_amount: string;
  invoice_amount: string;
  paid_amount: string;
  paid_date: string;
  tax_rate: string;
  memo: string;
};

export function CaseFinancialTab({
  caseId,
  financial,
}: {
  caseId: number;
  financial: CaseFinancialRow | null;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { isDirty },
  } = useForm<FormValues>({
    defaultValues: {
      estimate_amount: financial?.estimate_amount != null ? String(financial.estimate_amount) : "",
      invoice_amount: financial?.invoice_amount != null ? String(financial.invoice_amount) : "",
      paid_amount: financial?.paid_amount != null ? String(financial.paid_amount) : "",
      paid_date: financial?.paid_date ?? "",
      tax_rate: financial?.tax_rate != null ? String(financial.tax_rate) : "10",
      memo: financial?.memo ?? "",
    },
  });

  const v = watch();
  const taxRate = Number(v.tax_rate) || 0;
  const estimate = Number(v.estimate_amount) || 0;
  const invoice = Number(v.invoice_amount) || 0;
  const paid = Number(v.paid_amount) || 0;
  const estimateIncl = Math.round(estimate * (1 + taxRate / 100));
  const invoiceIncl = Math.round(invoice * (1 + taxRate / 100));
  const unpaid = invoiceIncl - paid;

  const onSubmit = (values: FormValues) => {
    setError(null);
    startTransition(async () => {
      const res = await updateCaseFinancial(caseId, {
        estimate_amount: values.estimate_amount === "" ? null : Number(values.estimate_amount),
        invoice_amount: values.invoice_amount === "" ? null : Number(values.invoice_amount),
        paid_amount: values.paid_amount === "" ? null : Number(values.paid_amount),
        paid_date: values.paid_date || undefined,
        tax_rate: Number(values.tax_rate) || 10,
        memo: values.memo || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast({ message: "金額情報を保存しました", tone: "success" });
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-m">
      <Card>
        <CardHeader>
          <CardTitle>金額情報</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-m">
          <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
            <Field label="見積金額（税抜）">
              <Input type="number" min="0" {...register("estimate_amount")} />
            </Field>
            <Field label="消費税率（%）">
              <Select {...register("tax_rate")}>
                <option value="10">10%</option>
                <option value="8">8%</option>
                <option value="0">0%</option>
              </Select>
            </Field>
          </div>

          <div className="rounded-s bg-over-background px-m py-s text-s">
            見積金額（税込）: <span className="font-semibold tabular-nums">{formatJPY(estimateIncl)}</span>
          </div>

          <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
            <Field label="請求金額（税抜）">
              <Input type="number" min="0" {...register("invoice_amount")} />
            </Field>
            <Field label="入金金額">
              <Input type="number" min="0" {...register("paid_amount")} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
            <div className="rounded-s bg-over-background px-m py-s text-s">
              請求金額（税込）: <span className="font-semibold tabular-nums">{formatJPY(invoiceIncl)}</span>
            </div>
            <div
              className={cn(
                "rounded-s px-m py-s text-s",
                unpaid > 0 ? "bg-danger-soft text-danger" : "bg-over-background",
              )}
            >
              未収金: <span className="font-semibold tabular-nums">{formatJPY(unpaid)}</span>
            </div>
          </div>

          <Field label="入金日">
            <Input type="date" {...register("paid_date")} />
          </Field>

          <Field label="メモ">
            <Textarea {...register("memo")} />
          </Field>
        </CardBody>
      </Card>

      {error && (
        <div
          className="rounded-s border border-danger bg-danger-soft p-s text-s text-danger"
          role="alert"
        >
          {error}
        </div>
      )}

      <SaveBar info={isDirty ? <>未保存の変更があります</> : null}>
        <Button type="submit" loading={pending} loadingLabel="保存中…">
          保存する
        </Button>
      </SaveBar>
    </form>
  );
}
