import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/*
 * 矢印はトークン外 HEX を background-svg で直書きせず、lucide の ChevronDown を
 * currentColor 系トークンで重ねる。see: DESIGN.md §8.2
 * className は幅指定（w-[...] / max-w-[...]）に使われるためラッパーに適用する。
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, "aria-invalid": ariaInvalid, disabled, ...props }, ref) => {
    const invalid = ariaInvalid === true || ariaInvalid === "true";
    return (
      <div className={cn("relative w-full", className)}>
        <select
          ref={ref}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn(
            "h-8 w-full appearance-none rounded-s border bg-white pl-s pr-l text-m text-text-black outline-none transition-[border-color,box-shadow] hover:border-border-strong disabled:bg-grey-7 disabled:text-text-disabled",
            invalid ? "border-danger focus:border-danger" : "border-border focus:border-main",
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className={cn(
            "pointer-events-none absolute right-s top-1/2 h-4 w-4 -translate-y-1/2",
            disabled ? "text-text-disabled" : "text-text-grey",
          )}
          aria-hidden="true"
        />
      </div>
    );
  },
);
Select.displayName = "Select";
