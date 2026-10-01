# X投稿候補生成 Phase 1

このツールは `public/index.html` の掲載情報を読み取り、`output/x_queue.json` と `output/x_review.html` を生成します。確認ページでは `ready` の本文をワンクリックでコピーでき、`hold` の理由を一覧できます。サイトのHTMLやデプロイ設定は変更しません。X APIへの接続・投稿もしません。

## 実行

```sh
npm run x:queue
```

日付を明示する場合：

```sh
npm run x:queue -- --date 2026-10-01
```

Cloudflare Workersへの公開完了を目視確認してから `--published` を加えると、他の必須条件を満たした候補が `ready` になります。

```sh
npm run x:queue -- --date 2026-10-01 --published
```

`ready` は人間の確認に回せる状態であり、投稿承認や自動投稿を意味しません。出力の `body` を確認し、手動でXへ投稿してください。

## 判定

- 価格確認：同じ作品カード内の掲載価格と確認済み表示を読み取ります。確認記載がなければ `hold`。
- 終了日確認：ページに明記された日付だけを読み取ります。時刻がない場合は `end_time_verified: false` のままとし、時刻を補いません。
- 商品リンク：同じ作品カード内にあるAmazon.co.jpの `/dp/{ASIN}` URLと `tag=saleshoka-22` の組み合わせだけを確認済みと扱います。短縮URL、Amazon検索・一覧URLは作品個別リンクとして扱いません。候補本文にはAmazon URLを出しません。
- サイトリンク：canonicalとWorkers URLの一致を確認し、Xリンクには `utm_source=x`、`utm_medium=social`、投稿種別と日付のcampaignを付けます。
- 公開確認：スクリプトはデプロイ状態を照会できないため、公開後に利用者が `--published` を明示します。指定がなければ `hold`。
- 古いページ日付：対象日とページの日付が一致しなければ、すべて `hold`。
- キャンペーン候補は本文だけを作り、価格や割引率を追加しません。作品選定や条件確認情報を機械的に補えないため、Phase 1では `hold` です。

`output/x_queue.json` は生成物としてGit管理対象外です。確認ページはブラウザーで `output/x_review.html` を開いて使用します。候補の元情報は日次更新で使う既存HTMLに置いたままにします。構造化データへのサイト移行は行いません。
