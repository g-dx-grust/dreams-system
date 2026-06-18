"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/*
 * ページ遷移時に上部 2px の進捗バーを出す（§9.3）。
 * App Router にルートイベントが無いため、内部リンククリックで開始し、pathname 変化で完了する。
 * 追加パッケージなしの軽量実装。router.push 等のプログラム遷移は対象外。
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      if (anchor.target === "_blank") return;
      if (href === pathname) return;
      setActive(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // 遷移完了（pathname 変化）でバーを消す。保険として一定時間で必ず消す。
  useEffect(() => {
    setActive(false);
  }, [pathname]);

  useEffect(() => {
    if (!active) return;
    const safety = setTimeout(() => setActive(false), 4000);
    return () => clearTimeout(safety);
  }, [active]);

  if (!active) return null;
  return <div className="ui-navprogress" aria-hidden="true" />;
}
