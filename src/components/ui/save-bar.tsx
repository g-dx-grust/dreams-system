import * as React from "react";
import { cn } from "@/lib/cn";

/*
 * フォーム下端に固定する保存バー。長スクロールで保存導線を見失わないようにする。
 * 1 フォーム 1 プライマリ。see: DESIGN.md §8.10
 */
export function SaveBar({
  children,
  info,
  className,
}: {
  /** 右側に置くアクション群（[キャンセル][保存する] 等） */
  children: React.ReactNode;
  /** 左側の補助情報（「未保存の変更があります」等） */
  info?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-m mt-m flex items-center justify-between gap-m border-t border-border bg-white px-m py-s",
        "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <div className="min-w-0 text-s text-text-grey">{info}</div>
      <div className="flex shrink-0 items-center gap-s">{children}</div>
    </div>
  );
}
