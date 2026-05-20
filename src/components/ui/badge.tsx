import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/*
 * ステータスラベル。業務 UI の視認性を確保するため、
 * 色は G-DX トークンの範囲のみ使用する。
 */
const badgeVariants = cva(
  "inline-flex h-[22px] items-center whitespace-nowrap rounded-s px-xs text-xs font-semibold leading-none",
  {
    variants: {
      tone: {
        neutral: "bg-grey-7 text-text-grey",
        info: "bg-main-soft text-main",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
