import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/*
 * dreaMs ボタン規定: Primary / Secondary / Danger / Text の 4 種のみ。
 * see: DESIGN.md §8.1
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-s text-m font-semibold leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary:
          "bg-main text-white hover:bg-main-hover active:bg-main-darken disabled:bg-grey-20 disabled:text-text-disabled",
        secondary:
          "border border-border bg-white text-text-black hover:bg-grey-7 disabled:bg-grey-7 disabled:text-text-disabled",
        danger:
          "bg-danger text-white hover:opacity-90 active:opacity-80 disabled:bg-grey-20 disabled:text-text-disabled",
        text: "bg-transparent text-main hover:underline underline-offset-2",
      },
      size: {
        sm: "h-7 px-s text-s",
        md: "h-8 px-m",
        lg: "h-10 px-l",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    /** ローディング中に表示するラベル。未指定時は children をそのまま表示 */
    loadingLabel?: React.ReactNode;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, loadingLabel, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="ui-spinner" aria-hidden="true" />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  ),
);
Button.displayName = "Button";
