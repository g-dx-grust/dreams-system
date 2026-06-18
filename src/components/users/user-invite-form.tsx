"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { inviteUser } from "@/server/users";

const Schema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  fullName: z.string().min(1, "氏名を入力してください").max(100),
  role: z.enum(["admin", "user"]),
});
type FormValues = z.infer<typeof Schema>;

export function UserInviteForm({ onDone }: { onDone?: () => void }) {
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { role: "user" },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const res = await inviteUser(values);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    toast({ message: "招待メールを送信しました", tone: "success" });
    reset();
    onDone?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-m">
      <Field label="メールアドレス" required error={errors.email?.message}>
        <Input {...register("email")} type="email" placeholder="user@n-grust.co.jp" />
      </Field>
      <Field label="氏名" required error={errors.fullName?.message}>
        <Input {...register("fullName")} placeholder="山田 太郎" />
      </Field>
      <Field label="ロール" required error={errors.role?.message}>
        <Select {...register("role")}>
          <option value="user">一般ユーザー</option>
          <option value="admin">管理者</option>
        </Select>
      </Field>
      {serverError && (
        <div
          className="rounded-s border border-danger bg-danger-soft p-s text-s text-danger"
          role="alert"
        >
          {serverError}
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} loadingLabel="送信中…">
          招待メールを送信する
        </Button>
      </div>
    </form>
  );
}
