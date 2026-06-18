# 新様式受け入れフォルダ

共有された新しい様式は、まずこの配下に日付フォルダを作って置く。

例:

```bash
docs/template-intake/20260603/
```

このフォルダ内の実ファイルは `.gitignore` で除外する。取り込み前の原本を誤ってコミットしないため。

棚卸し:

```bash
pnpm templates:scan -- --source-dir "docs/template-intake/20260603"
```
