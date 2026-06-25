import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/*
 * ステータスラベル。業務 UI の視認性を確保するため、
 * 色は G-DX トークンの範囲のみ使用する。
 */
const badgeVariants = cva(
  "inline-flex h-5 items-center whitespace-nowrap rounded-s border px-xs text-xs font-semibold leading-none",
  {
    variants: {
      tone: {
        neutral: "border-border bg-grey-7 text-text-grey",
        info: "border-main/20 bg-main-soft text-main",
        success: "border-success/20 bg-success-soft text-success",
        warning: "border-warning/20 bg-warning-soft text-warning",
        danger: "border-danger/20 bg-danger-soft text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
