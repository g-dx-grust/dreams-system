"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/cn";

const LARK_PROVIDER =
  (process.env.NEXT_PUBLIC_SUPABASE_LARK_PROVIDER ?? "custom:lark") as `custom:${string}`;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";
const PASSWORD_LOGIN_ENABLED =
  IS_DEVELOPMENT || process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN !== "false";
const highlights = [
  {
    title: "案件管理",
    description: "提出先、締切、担当者、進捗を案件単位で整理します。",
  },
  {
    title: "帳票転記",
    description: "人物・土地・金額の情報を様式へまとめて反映します。",
  },
  {
    title: "監査対応",
    description: "誰がいつ操作したかを履歴として追跡できます。",
  },
] as const;

export default function LoginPage() {
  const [larkPending, setLarkPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailPending, setEmailPending] = useState(false);

  const signInWithLark = async () => {
    setLarkPending(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: LARK_PROVIDER,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (err) {
      setError("ログインに失敗しました。もう一度お試しください。");
      setLarkPending(false);
    }
  };

  const signInWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailPending(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError("メールアドレスまたはパスワードが正しくありません。");
      setEmailPending(false);
      return;
    }
    // App Router のクライアント遷移よりフルリロードの方が、
    // サーバー側で最新の auth cookie を確実に参照できる。
    window.location.assign("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div
          className="mx-auto flex items-center justify-between gap-m px-l"
          style={{ maxWidth: "var(--width-content-max)", height: "var(--height-app-header)" }}
        >
          <div className="flex min-w-0 items-center gap-m">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-s bg-main text-s font-medium text-white">
              G
            </div>
            <div className="min-w-0">
              <p className="text-xxs text-text-quaternary">G-DX</p>
              <p className="truncate text-m font-medium leading-tight text-text-black">案件管理・帳票転記システム</p>
            </div>
          </div>
          <p className="hidden text-s text-text-grey lg:block">社内向けシステム</p>
        </div>
      </header>

      <main className="mx-auto px-l py-xxl" style={{ maxWidth: "var(--width-content-max)" }}>
        <div className="grid gap-l lg:grid-cols-[minmax(0,1.3fr)_420px]">
          <section className="space-y-l">
            <div className="rounded-m border border-border bg-white shadow-s">
              <div className="border-b border-border px-l py-l">
                <p className="text-xs font-medium text-main">G-DX</p>
                <h1 className="mt-xs text-xxl font-medium leading-tight text-text-black">
                  測量・許認可業務の情報を、一つの画面体系で管理する
                </h1>
                <p className="mt-s max-w-[42rem] text-m text-text-grey">
                  案件、関係者、土地情報、金額、帳票生成を分断せずにつなぎ、入力の重複と確認漏れを減らします。
                </p>
              </div>
              <div className="grid sm:grid-cols-3">
                {highlights.map((item, index) => (
                  <div
                    key={item.title}
                    className={cn(
                      "px-l py-m",
                      index < highlights.length - 1 &&
                        "border-t border-border sm:border-t-0 sm:border-r",
                    )}
                  >
                    <p className="text-s font-medium text-text-black">{item.title}</p>
                    <p className="mt-xs text-s text-text-grey">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-m border border-border bg-white shadow-s">
              <div className="border-b border-border px-l py-m">
                <h2 className="text-l font-medium text-text-black">利用条件</h2>
              </div>
              <div className="space-y-s px-l py-m text-s text-text-grey">
                <p>・ログインには社内で許可された Lark アカウントが必要です。</p>
                <p>・案件や帳票の操作履歴は監査ログに記録されます。</p>
                <p>・メールアドレスとパスワードでのログインも利用できます。</p>
              </div>
            </div>
          </section>

          <section className="rounded-m border border-border bg-white shadow-m">
            <div className="border-b border-border px-l py-l">
              <h2 className="text-l font-medium text-text-black">ログイン</h2>
              <p className="mt-xs text-s text-text-grey">
                Lark アカウント、またはメールアドレスとパスワードでログインしてください。
              </p>
            </div>

            <div className="space-y-l px-l py-l">
              <Button
                type="button"
                onClick={signInWithLark}
                disabled={larkPending || emailPending}
                className="w-full"
              >
                {larkPending ? "ログイン中…" : "Lark でログインする"}
              </Button>

              {PASSWORD_LOGIN_ENABLED && (
                <div className="rounded-s border border-border bg-column p-m">
                  <div className="mb-m flex items-center justify-between gap-m border-b border-border pb-s">
                    <h3 className="text-s font-medium text-text-black">メールアドレスでログイン</h3>
                    <span className="text-xs text-text-grey">メールアドレス / パスワード</span>
                  </div>

                  <form onSubmit={signInWithEmail} className="space-y-m">
                    <Field label="メールアドレス">
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="user@example.com"
                        required
                      />
                    </Field>
                    <Field label="パスワード">
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="パスワード"
                        required
                      />
                    </Field>
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={larkPending || emailPending}
                      loading={emailPending}
                      className="w-full"
                    >
                      メールアドレスでログインする
                    </Button>
                  </form>
                </div>
              )}

              {error && (
                <p
                  className="rounded-s border border-danger bg-danger/10 px-s py-s text-s text-danger"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
