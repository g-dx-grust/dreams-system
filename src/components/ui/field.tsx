import * as React from "react";
import { cn } from "@/lib/cn";
import { Label } from "./label";

export type FieldProps = {
  label: string;
  /** 明示する場合のみ。未指定なら useId() で自動生成し子へ注入する */
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
};

type InjectableProps = {
  id?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
};

/*
 * ラベル・補足・エラーを束ね、単一の入力子要素へ id / aria-describedby / aria-invalid を
 * 自動注入する。ラベルクリックでフォーカスが移り、SR がエラー/補足を読み上げる。
 * see: DESIGN.md §8.2
 */
export function Field({ label, htmlFor, required, error, hint, children, className }: FieldProps) {
  const generatedId = React.useId();
  const child = React.isValidElement<InjectableProps>(children) ? children : null;
  const childId = child?.props.id;
  const id = htmlFor ?? childId ?? generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [hint && !error ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  const enhancedChild = child
    ? React.cloneElement(child, {
        id: child.props.id ?? id,
        "aria-invalid": child.props["aria-invalid"] ?? (error ? true : undefined),
        "aria-describedby":
          [child.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
      })
    : children;

  return (
    <div className={cn("flex flex-col gap-xs", className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {enhancedChild}
      {hint && !error && (
        <p id={hintId} className="text-xs text-text-grey">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
