"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importCoordinatePoints } from "@/server/geo";

export function CoordinateImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setSubmitting(true);
    try {
      const result = await importCoordinatePoints(new FormData(event.currentTarget));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        `${result.data.imported} 件を取り込みました${
          result.data.skipped > 0 ? `（${result.data.skipped} 件はスキップ）` : ""
        }。`,
      );
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-m border border-border bg-white p-m">
      <div className="flex flex-col gap-s">
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">座標CSV/Excel</span>
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept=".csv,.xlsx"
            required
            className="block w-full text-s text-text-black"
          />
        </label>
        <Button type="submit" variant="secondary" size="sm" loading={submitting} loadingLabel="取り込み中…">
          <Upload className="h-4 w-4" aria-hidden="true" />
          取り込む
        </Button>
        {message && <p className="text-s text-success">{message}</p>}
        {error && (
          <p className="text-s text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
