"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { syncUsersFromLark } from "@/server/lark-sync";

export function LarkSyncButton() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, startTransition] = useTransition();

  const runSync = () => {
    setError(null);
    startTransition(async () => {
      const res = await syncUsersFromLark();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      const { created, updated, deactivated, failed } = res.data;
      const parts = [`新規${created}名`, `更新${updated}名`];
      if (deactivated > 0) parts.push(`無効化${deactivated}名`);
      if (failed > 0) parts.push(`失敗${failed}名`);
      toast({
        message: `Lark同期が完了しました（${parts.join("・")}）`,
        tone: failed > 0 ? "warning" : "success",
      });
    });
  };

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Larkから同期する
      </Button>

      <ConfirmDialog
        open={open}
        title="Larkテナントと同期します"
        description={
          <>
            Larkテナントに所属する全メンバーをユーザーとして登録・更新します。
            登録されたメンバーは招待メールなしでLarkログインを利用できます。
            退職・凍結済みのメンバーは無効化されます。
            {error && (
              <span className="mt-s block rounded-s border border-danger bg-danger-soft p-s text-s text-danger">
                {error}
              </span>
            )}
          </>
        }
        confirmLabel="同期する"
        tone="primary"
        loading={isBusy}
        onConfirm={runSync}
        onCancel={() => {
          setError(null);
          setOpen(false);
        }}
      />
    </>
  );
}
