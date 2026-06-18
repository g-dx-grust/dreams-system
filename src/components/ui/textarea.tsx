import * as React from "react";
import { cn } from "@/lib/cn";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows = 4, "aria-invalid": ariaInvalid, ...props }, ref) => {
    const invalid = ariaInvalid === true || ariaInvalid === "true";
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={ariaInvalid}
        className={cn(
          "w-full rounded-s border bg-white px-s py-xs text-m text-text-black outline-none transition-[border-color,box-shadow] placeholder:text-text-quaternary hover:border-border-strong disabled:bg-grey-7 disabled:text-text-disabled",
          invalid ? "border-danger focus:border-danger" : "border-border focus:border-main",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
