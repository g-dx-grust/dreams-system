"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileUp, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadTemplateNewVersion } from "@/server/templates";
import { PageHeader } from "@/components/ui/page-header";

export default function NewVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const result = await uploadTemplateNewVersion(Number(id), fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/templates/${result.data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="新バージョンをアップロード" />
      <Card>
        <CardHeader>
          <CardTitle>新しいファイルで上書き登録</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="flex w-full max-w-[32rem] flex-col gap-m">
            <div className="flex flex-col gap-xs rounded-s border border-border bg-grey-5 px-m py-s text-s text-text-grey">
              {[
                { icon: FileUp, label: "新ファイルを登録" },
                { icon: History, label: "旧バージョンは履歴に移動" },
                { icon: ClipboardCheck, label: "移行後にマッピングを確認" },
              ].map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="flex items-center gap-s">
                    <Icon size={16} />
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>

            <Field label="新しいファイル" hint=".docx または .xlsx のみ（最大10MB）" required>
              <input
                type="file"
                name="file"
                accept=".docx,.xlsx"
                required
                className="block w-full text-s"
              />
            </Field>

            <p className="text-s text-text-grey">
              現在のバージョンは無効化され、マッピング設定は新バージョンに引き継がれます。
            </p>

            {error && <p className="text-s text-danger">{error}</p>}

            <div className="flex gap-xs">
              <Button type="submit" variant="primary" loading={submitting}>
                アップロードする
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.back()}>
                キャンセル
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
