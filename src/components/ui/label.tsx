import * as React from "react";
import { cn } from "@/lib/cn";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  required?: boolean;
};

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, children, required, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("block text-s text-text-grey", className)}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-xxs text-xs text-danger" aria-label="必須項目">
          *
        </span>
      )}
    </label>
  ),
);
Label.displayName = "Label";
