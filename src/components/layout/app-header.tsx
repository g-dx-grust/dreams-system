import Link from "next/link";
import { signOut } from "@/server/auth";
import type { AppUser } from "@/lib/permissions";

export function AppHeader({ user }: { user: AppUser }) {
  return (
    <header className="border-b border-border bg-white">
      <div
        className="flex items-center justify-between gap-m px-l"
        style={{ height: "var(--height-app-header)" }}
      >
        <div className="flex min-w-0 items-center gap-m">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-s bg-main text-m font-bold text-white">
            G
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-quaternary">G-DX</p>
            <Link
              href="/"
              className="block truncate text-m font-semibold leading-tight text-text-black"
            >
              案件管理・帳票転記システム
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-m">
          <div className="hidden text-right leading-tight md:block">
            <p className="text-xs text-text-quaternary">ログイン中</p>
            <p className="text-s font-semibold text-text-black">{user.fullName || user.email}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="h-9 rounded-s border border-border bg-white px-m text-s font-medium text-text-black transition-colors hover:bg-grey-7"
            >
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
