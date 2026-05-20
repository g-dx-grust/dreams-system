"use client";

import { useCallback, useRef, useState } from "react";

/*
 * 郵便番号 → 住所自動補完フック（zipcloud API）。
 * see: docs/phase2/05_persons_master.md §住所自動補完
 *
 * 仕様上 zipcloud はフロントから直接呼び出す。外部 API 障害時もフォームは
 * 手入力で完結できるよう、エラーは非致命で返す。
 */

export type ZipSearchResult = {
  pref: string;
  city: string;
  town: string;
};

type ZipcloudResponse = {
  status: number;
  message: string | null;
  results:
    | {
        address1: string;
        address2: string;
        address3: string;
      }[]
    | null;
};

const ENDPOINT = "https://zipcloud.ibsnet.co.jp/api/search";

function normalizeZip(input: string): string {
  return input.replace(/[^\d]/g, "").slice(0, 7);
}

export function useZipSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 同じ郵便番号への多重リクエストを抑止
  const lastQueryRef = useRef<string | null>(null);

  const search = useCallback(
    async (rawZip: string): Promise<ZipSearchResult | null> => {
      const zip = normalizeZip(rawZip);
      if (zip.length !== 7) {
        setError("郵便番号は7桁で入力してください");
        return null;
      }

      lastQueryRef.current = zip;
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`${ENDPOINT}?zipcode=${zip}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as ZipcloudResponse;

        // リクエスト中に別の検索が走った場合、結果を破棄
        if (lastQueryRef.current !== zip) return null;

        if (json.status !== 200) {
          setError(json.message ?? "住所の取得に失敗しました");
          return null;
        }
        const first = json.results?.[0];
        if (!first) {
          setError("該当する住所が見つかりませんでした");
          return null;
        }
        return {
          pref: first.address1,
          city: first.address2,
          town: first.address3,
        };
      } catch {
        if (lastQueryRef.current === zip) {
          setError("住所検索サービスに接続できませんでした");
        }
        return null;
      } finally {
        if (lastQueryRef.current === zip) {
          setIsLoading(false);
        }
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
    lastQueryRef.current = null;
  }, []);

  return { search, reset, isLoading, error };
}
