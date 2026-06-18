import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", "aria-invalid": ariaInvalid, ...props }, ref) => {
    const invalid = ariaInvalid === true || ariaInvalid === "true";
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={ariaInvalid}
        className={cn(
          "h-8 w-full rounded-s border bg-white px-s text-m text-text-black outline-none transition-[border-color,box-shadow] placeholder:text-text-quaternary hover:border-border-strong disabled:bg-grey-7 disabled:text-text-disabled",
          invalid ? "border-danger focus:border-danger" : "border-border focus:border-main",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
