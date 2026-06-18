"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ScheduleFormSchema, type ScheduleFormInput } from "@/lib/validators/calendar";
import {
  createSchedule,
  searchCalendarCases,
  updateSchedule,
  type CalendarCaseOption,
  type CalendarSchedule,
  type CalendarScheduleType,
  type CalendarUser,
} from "@/server/calendar";

const STATUS_OPTIONS = [
  { value: "planned", label: "予定" },
  { value: "in_progress", label: "進行中" },
  { value: "done", label: "完了" },
  { value: "carried_over", label: "繰越" },
  { value: "cancelled", label: "取消" },
] as const satisfies ReadonlyArray<{ value: ScheduleFormInput["status"]; label: string }>;

type CalendarScheduleFormProps = {
  mode: "create" | "edit";
  date: string;
  users: CalendarUser[];
  scheduleTypes: CalendarScheduleType[];
  schedule?: CalendarSchedule | null;
  onCancel: () => void;
  onSaved: (scheduleId: string) => void;
};

function formatTokyoDate(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatTokyoTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function isScheduleStatus(value: string): value is ScheduleFormInput["status"] {
  return STATUS_OPTIONS.some((option) => option.value === value);
}

function formatCaseLabel(option: Pick<CalendarCaseOption, "caseNumber" | "caseName">): string {
  return `${option.caseNumber} / ${option.caseName}`;
}

function defaultsForForm(
  mode: CalendarScheduleFormProps["mode"],
  date: string,
  users: CalendarUser[],
  schedule?: CalendarSchedule | null,
): ScheduleFormInput {
  if (mode === "edit" && schedule) {
    return {
      title: schedule.title,
      date: formatTokyoDate(schedule.startAt),
      startTime: formatTokyoTime(schedule.startAt),
      endTime: formatTokyoTime(schedule.endAt),
      userId: schedule.userId ?? "",
      scheduleTypeId: schedule.scheduleTypeId ?? "",
      status: isScheduleStatus(schedule.status) ? schedule.status : "planned",
      caseId: schedule.caseId,
      location: schedule.location ?? "",
      memo: schedule.memo ?? "",
    };
  }

  return {
    title: "",
    date,
    startTime: "09:00",
    endTime: "10:00",
    userId: users[0]?.id ?? "",
    scheduleTypeId: "",
    status: "planned",
    caseId: null,
    location: "",
    memo: "",
  };
}

export function CalendarScheduleForm({
  mode,
  date,
  users,
  scheduleTypes,
  schedule,
  onCancel,
  onSaved,
}: CalendarScheduleFormProps) {
  const toast = useToast();
  const caseInputId = React.useId();
  const [pending, startTransition] = React.useTransition();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [caseQuery, setCaseQuery] = React.useState(() =>
    schedule?.caseId && schedule.caseNumber
      ? formatCaseLabel({
          caseNumber: schedule.caseNumber,
          caseName: schedule.caseName ?? "",
        })
      : "",
  );
  const [selectedCase, setSelectedCase] = React.useState<CalendarCaseOption | null>(() =>
    schedule?.caseId && schedule.caseNumber
      ? {
          id: schedule.caseId,
          caseNumber: schedule.caseNumber,
          caseName: schedule.caseName ?? "",
        }
      : null,
  );
  const [caseOptions, setCaseOptions] = React.useState<CalendarCaseOption[]>([]);
  const [caseSearchError, setCaseSearchError] = React.useState<string | null>(null);
  const [isSearchingCases, setIsSearchingCases] = React.useState(false);

  const defaultValues = React.useMemo(
    () => defaultsForForm(mode, date, users, schedule),
    [date, mode, schedule, users],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ScheduleFormInput>({
    resolver: zodResolver(ScheduleFormSchema),
    defaultValues,
  });

  React.useEffect(() => {
    reset(defaultValues);
    if (schedule?.caseId && schedule.caseNumber) {
      const nextCase = {
        id: schedule.caseId,
        caseNumber: schedule.caseNumber,
        caseName: schedule.caseName ?? "",
      };
      setSelectedCase(nextCase);
      setCaseQuery(formatCaseLabel(nextCase));
    } else {
      setSelectedCase(null);
      setCaseQuery("");
    }
    setCaseOptions([]);
    setCaseSearchError(null);
  }, [defaultValues, reset, schedule]);

  React.useEffect(() => {
    const keyword = caseQuery.trim();
    if (selectedCase || keyword.length < 2) {
      setCaseOptions([]);
      setCaseSearchError(null);
      setIsSearchingCases(false);
      return;
    }

    let active = true;
    setIsSearchingCases(true);
    const timer = window.setTimeout(() => {
      searchCalendarCases(keyword)
        .then((result) => {
          if (!active) return;
          if (result.ok) {
            setCaseOptions(result.data);
            setCaseSearchError(null);
          } else {
            setCaseOptions([]);
            setCaseSearchError(result.error);
          }
        })
        .catch(() => {
          if (!active) return;
          setCaseOptions([]);
          setCaseSearchError("案件候補の取得に失敗しました。時間をおいて再度お試しください。");
        })
        .finally(() => {
          if (active) setIsSearchingCases(false);
        });
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [caseQuery, selectedCase]);

  const clearCase = () => {
    setSelectedCase(null);
    setCaseQuery("");
    setCaseOptions([]);
    setCaseSearchError(null);
    setValue("caseId", null, { shouldDirty: true, shouldValidate: true });
  };

  const selectCase = (option: CalendarCaseOption) => {
    setSelectedCase(option);
    setCaseQuery(formatCaseLabel(option));
    setCaseOptions([]);
    setCaseSearchError(null);
    setValue("caseId", option.id, { shouldDirty: true, shouldValidate: true });
  };

  const onSubmit = (values: ScheduleFormInput) => {
    setSubmitError(null);
    startTransition(async () => {
      const result =
        mode === "edit" && schedule
          ? await updateSchedule(schedule.id, values)
          : await createSchedule(values);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      toast({
        message: mode === "edit" ? "予定を保存しました。" : "予定を登録しました。",
        tone: "success",
      });
      onSaved(result.data.id);
    });
  };

  const title = mode === "edit" ? "予定を編集" : "予定を追加";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardBody className="flex flex-col gap-m">
          <Field label="件名" required error={errors.title?.message}>
            <Input aria-invalid={!!errors.title} {...register("title")} />
          </Field>

          <div className="grid grid-cols-1 gap-m sm:grid-cols-3">
            <Field label="日付" required error={errors.date?.message}>
              <Input type="date" aria-invalid={!!errors.date} {...register("date")} />
            </Field>
            <Field label="開始時刻" required error={errors.startTime?.message}>
              <Input
                type="time"
                min="08:00"
                max="18:00"
                step="1800"
                aria-invalid={!!errors.startTime}
                {...register("startTime")}
              />
            </Field>
            <Field label="終了時刻" required error={errors.endTime?.message}>
              <Input
                type="time"
                min="08:00"
                max="18:00"
                step="1800"
                aria-invalid={!!errors.endTime}
                {...register("endTime")}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-m sm:grid-cols-3">
            <Field label="担当者" required error={errors.userId?.message}>
              <Select aria-invalid={!!errors.userId} {...register("userId")}>
                <option value="">選択してください</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName ?? user.email}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="予定種別" error={errors.scheduleTypeId?.message}>
              <Select aria-invalid={!!errors.scheduleTypeId} {...register("scheduleTypeId")}>
                <option value="">未指定</option>
                {scheduleTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="ステータス" required error={errors.status?.message}>
              <Select aria-invalid={!!errors.status} {...register("status")}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="案件番号"
            htmlFor={caseInputId}
            error={errors.caseId?.message ?? caseSearchError ?? undefined}
          >
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-s top-1/2 h-4 w-4 -translate-y-1/2 text-text-grey"
                aria-hidden="true"
              />
              <Input
                id={caseInputId}
                value={caseQuery}
                onChange={(event) => {
                  setCaseQuery(event.target.value);
                  if (selectedCase) {
                    setSelectedCase(null);
                    setValue("caseId", null, { shouldDirty: true, shouldValidate: true });
                  }
                }}
                aria-invalid={!!errors.caseId || !!caseSearchError}
                className="pl-l"
                placeholder="案件番号を入力"
              />
              {selectedCase && (
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  className="absolute right-xs top-1/2 -translate-y-1/2"
                  onClick={clearCase}
                  aria-label="案件選択を解除"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  解除
                </Button>
              )}
              {!selectedCase && (caseOptions.length > 0 || isSearchingCases) && (
                <div className="absolute z-overlap mt-xs max-h-[calc(var(--spacing-xxl)*6)] w-full overflow-auto rounded-s border border-border bg-white shadow-s">
                  {caseOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="block w-full border-b border-border px-s py-s text-left text-s hover:bg-grey-7 focus:bg-main-soft"
                      onClick={() => selectCase(option)}
                    >
                      <span className="block font-semibold text-text-black">
                        {option.caseNumber}
                      </span>
                      <span className="block truncate text-text-grey">{option.caseName}</span>
                    </button>
                  ))}
                  {isSearchingCases && <p className="px-s py-s text-s text-text-grey">検索中…</p>}
                </div>
              )}
            </div>
          </Field>

          <Field label="場所" error={errors.location?.message}>
            <Input aria-invalid={!!errors.location} {...register("location")} />
          </Field>

          <Field label="メモ" error={errors.memo?.message}>
            <Textarea aria-invalid={!!errors.memo} rows={4} {...register("memo")} />
          </Field>

          {submitError && (
            <div
              className="rounded-s border border-danger bg-danger-soft p-s text-s text-danger"
              role="alert"
            >
              {submitError}
            </div>
          )}
        </CardBody>
        <CardFooter>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
            キャンセル
          </Button>
          <Button
            type="submit"
            loading={pending}
            loadingLabel={mode === "edit" ? "保存中…" : "登録中…"}
          >
            {mode === "edit" ? "保存する" : "登録する"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
