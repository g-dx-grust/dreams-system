"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PREFECTURES } from "@/lib/prefectures";
import { PersonUpsertSchema, type PersonUpsertInput } from "@/lib/validators/person";
import { CASE_PERSON_ROLES, CasePersonRoleLabels } from "@/lib/validators/case";
import { createPerson, updatePerson, findDuplicates, type DuplicateCandidate } from "@/server/persons";

type Props = {
  mode: "create" | "edit";
  personId?: number;
  defaultValues?: Partial<PersonUpsertInput>;
};

export function PersonForm({ mode, personId, defaultValues }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PersonUpsertInput>({
    resolver: zodResolver(PersonUpsertSchema),
    defaultValues: {
      person_type: "individual",
      default_case_role: "",
      ...defaultValues,
    },
  });

  const personType = watch("person_type");
  const nameValue = watch("name");

  useEffect(() => {
    if (mode !== "create" || !nameValue || nameValue.length < 2) {
      setDuplicates([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await findDuplicates(nameValue);
      if (res.ok) setDuplicates(res.data);
    }, 400);
    return () => clearTimeout(timer);
  }, [nameValue, mode]);

  const searchZip = async () => {
    const zip = watch("zip")?.replace(/-/g, "");
    if (!zip || zip.length !== 7) return;
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`);
      const data = (await res.json()) as {
        results?: { address1: string; address2: string; address3: string }[];
      };
      const first = data.results?.[0];
      if (first) {
        setValue("address_pref", first.address1);
        setValue("address_city", first.address2);
        setValue("address_town", first.address3);
      }
    } catch {
      // 住所補完は失敗してもフォーム送信を妨げない
    }
  };

  const onSubmit = (values: PersonUpsertInput) => {
    setSubmitError(null);
    startTransition(async () => {
      const res = mode === "create"
        ? await createPerson(values)
        : await updatePerson(personId!, values);
      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }
      router.push(`/persons/${res.data.id}`);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-l">
      <Card>
        <CardBody className="flex flex-col gap-m">
          <h2 className="text-l font-medium">基本情報</h2>

          <Field label="区分" required error={errors.person_type?.message}>
            <Controller
              name="person_type"
              control={control}
              render={({ field }) => (
                <div className="flex gap-m">
                  <label className="flex items-center gap-xs text-s">
                    <input
                      type="radio"
                      value="individual"
                      checked={field.value === "individual"}
                      onChange={() => field.onChange("individual")}
                    />
                    個人
                  </label>
                  <label className="flex items-center gap-xs text-s">
                    <input
                      type="radio"
                      value="corporation"
                      checked={field.value === "corporation"}
                      onChange={() => field.onChange("corporation")}
                    />
                    法人
                  </label>
                </div>
              )}
            />
          </Field>

          <Field
            label="案件での既定役割"
            error={errors.default_case_role?.message}
            hint="案件に追加するときの初期選択です。案件側で変更できます。"
          >
            <Select {...register("default_case_role")} className="max-w-[240px]">
              <option value="">指定なし</option>
              {CASE_PERSON_ROLES.map((r) => (
                <option key={r} value={r}>
                  {CasePersonRoleLabels[r]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="氏名・法人名" required error={errors.name?.message}>
            <Input {...register("name")} />
          </Field>

          {duplicates.length > 0 && (
            <div className="rounded-m border border-[rgba(255,204,23,0.6)] bg-[rgba(255,204,23,0.1)] p-s text-s">
              <p className="font-medium text-text-black">
                この人物は既に登録されている可能性があります
              </p>
              <ul className="mt-xs flex flex-col gap-xxs">
                {duplicates.map((d) => (
                  <li key={d.id} className="text-text-black">
                    {d.name}
                    {d.address_pref && `（${d.address_pref}${d.address_city ?? ""}）`}
                    <span className="ml-s text-xs text-text-grey">
                      類似度: {(d.similarity * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Field label="フリガナ" error={errors.name_kana?.message}>
            <Input {...register("name_kana")} placeholder="カタカナで入力" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-m">
          <h2 className="text-l font-medium">住所</h2>

          <Field label="郵便番号" error={errors.zip?.message} hint="7桁の数字（ハイフンなし）">
            <div className="flex items-center gap-s">
              <Input {...register("zip")} className="max-w-[180px]" placeholder="4418077" />
              <Button type="button" variant="secondary" size="sm" onClick={searchZip}>
                住所を補完
              </Button>
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
            <Field label="都道府県" error={errors.address_pref?.message}>
              <Select {...register("address_pref")}>
                <option value="">選択してください</option>
                {PREFECTURES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="市区町村" error={errors.address_city?.message}>
              <Input {...register("address_city")} />
            </Field>
          </div>

          <Field label="町域・大字" error={errors.address_town?.message}>
            <Input {...register("address_town")} />
          </Field>

          <Field label="番地" error={errors.address_line1?.message}>
            <Input {...register("address_line1")} />
          </Field>

          <Field label="建物名・部屋番号" error={errors.address_line2?.message}>
            <Input {...register("address_line2")} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-m">
          <h2 className="text-l font-medium">連絡先</h2>

          <div className="grid grid-cols-1 gap-m sm:grid-cols-2">
            <Field label="電話番号" error={errors.phone?.message}>
              <Input {...register("phone")} placeholder="例: 0532-00-0000" />
            </Field>
            <Field label="FAX番号" error={errors.fax?.message}>
              <Input {...register("fax")} />
            </Field>
          </div>

          <Field label="メールアドレス" error={errors.email?.message}>
            <Input type="email" {...register("email")} />
          </Field>
        </CardBody>
      </Card>

      {personType === "corporation" && (
        <Card>
          <CardBody className="flex flex-col gap-m">
            <h2 className="text-l font-medium">法人情報</h2>
            <Field label="法人番号" error={errors.corporate_number?.message} hint="13桁の数字">
              <Input {...register("corporate_number")} />
            </Field>
            <Field label="代表者氏名" error={errors.representative_name?.message}>
              <Input {...register("representative_name")} />
            </Field>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="flex flex-col gap-m">
          <h2 className="text-l font-medium">メモ</h2>
          <Field label="自由記述" error={errors.memo?.message}>
            <Textarea {...register("memo")} rows={4} />
          </Field>
        </CardBody>
      </Card>

      {submitError && (
        <p className="text-s text-danger" role="alert">
          {submitError}
        </p>
      )}

      <div className="flex justify-end gap-s">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          disabled={pending}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "送信中…" : mode === "create" ? "登録する" : "更新する"}
        </Button>
      </div>
    </form>
  );
}
