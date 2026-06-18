"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

const LARK_PROVIDER =
  (process.env.NEXT_PUBLIC_SUPABASE_LARK_PROVIDER ?? "custom:lark") as `custom:${string}`;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";
const PASSWORD_LOGIN_ENABLED =
  IS_DEVELOPMENT || process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN !== "false";

export default function LoginPage() {
  const [larkPending, setLarkPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailPending, setEmailPending] = useState(false);

  const pending = larkPending || emailPending;

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
    <div className="flex min-h-screen items-center justify-center bg-background px-m py-xl">
      <main className="w-full max-w-[400px]">
        <div className="rounded-m border border-border bg-white">
          <div className="flex flex-col items-center gap-s border-b border-border px-l py-l text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-s bg-main text-l font-semibold text-white">
              G
            </div>
            <div>
              <h1 className="text-l font-semibold leading-tight text-text-black">
                案件管理・帳票転記システム
              </h1>
              <p className="mt-xs text-s text-text-grey">
                Lark アカウント、またはメールアドレスでログインしてください。
              </p>
            </div>
          </div>

          <div className="space-y-m px-l py-l">
            {error && (
              <p
                className="rounded-s border border-danger bg-danger-soft px-s py-s text-s text-danger"
                role="alert"
              >
                {error}
              </p>
            )}

            <Button
              type="button"
              onClick={signInWithLark}
              disabled={pending}
              loading={larkPending}
              loadingLabel="ログイン中…"
              size="lg"
              className="w-full"
            >
              Lark でログインする
            </Button>

            {PASSWORD_LOGIN_ENABLED && (
              <>
                <div className="flex items-center gap-s" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs text-text-quaternary">または</span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={signInWithEmail} className="space-y-m">
                  <Field label="メールアドレス">
                    <Input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onInput={() => error && setError(null)}
                      aria-invalid={error ? true : undefined}
                      placeholder="user@example.com"
                      required
                    />
                  </Field>
                  <Field label="パスワード">
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onInput={() => error && setError(null)}
                      aria-invalid={error ? true : undefined}
                      required
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={pending}
                    loading={emailPending}
                    loadingLabel="ログイン中…"
                    size="lg"
                    className="w-full"
                  >
                    メールアドレスでログインする
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>

        <p className="mt-m text-center text-xs text-text-quaternary">
          操作履歴は監査ログに記録されます。
        </p>
      </main>
    </div>
  );
}
