import * as React from "react";
import { cn } from "@/lib/cn";

export type RadioProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/*
 * トークン化したラジオ（accent-main＋フォーカスリングは globals.css の :focus-visible）。
 * see: DESIGN.md §8.4
 */
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="radio"
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer accent-main disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  ),
);
Radio.displayName = "Radio";
