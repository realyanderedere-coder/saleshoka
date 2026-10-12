# セール書架 週次運営分析

## 調査結果（2026-10-13）

調査時のmain: `72b7c3fcd46e8956535725b55532e9e1fdb3fe33`。
既存 `.github/workflows/deploy.yml` はmainの全pushと手動実行でWorkersをデプロイする。
既存HTMLにはCloudflare Web Analytics beaconがある。設置の存在は確認済みだが、ブラウザーからの送信成功・ダッシュボードの蓄積状態は未検証。
GitHub Secret名一覧では `CLOUDFLARE_ACCOUNT_ID` とデプロイ用 `CLOUDFLARE_API_TOKEN` のみ。値は取得しない。

公式資料はWeb AnalyticsのVisits・Page Views、ページと参照元のディメンション、参照元のGraphQL取得を説明している。
APIの動的スキーマはintrospection、アカウントごとの利用可否はsettings.enabledで確認する。
実装候補はアカウント配下の `rumPageloadEventsAdaptiveGroups` の `count`（Page Views）、`sum.visits`、`dimensions.requestPath`、`dimensions.refererHost`、`avg.sampleInterval`。
このアカウントの認証付きスキーマ・フィールド定義と実データ取得は、分析専用トークン未設定のため未検証。公式静的ページだけで具体的フィールドと契約上の利用可否を保証しない。
実行時に必要フィールド、フィルター、settings.enabledを検証し、実クエリが成功した場合だけレポートを生成する。不可なら失敗し、代替のHTTPリクエスト数をPVと呼ばない。

## 設定手順

1. CloudflareでカスタムAPIトークンを作成。権限は **Account → Account Analytics → Read**、リソースはこのサイトの対象アカウントだけ。有効期限を設定し、定期更新する。Global API Keyや既存デプロイトークンを流用しない。
2. GitHubリポジトリ → Settings → Secrets and variables → Actions → New repository secret。名前を `CLOUDFLARE_ANALYTICS_API_TOKEN` にし、トークンを直接登録。チャット、ファイル、コミットに貼らない。
3. 既存 `CLOUDFLARE_ACCOUNT_ID` が計測対象アカウントであることを管理画面で確認。値はログに出さない。
4. PRをmainへ反映後、Actions → Weekly Web Analytics → Run workflow。mainへの反映は既存設定により通常のDeployも起動するが、そのワークフロー自体は変更しない。
5. Summaryと `weekly-web-analytics` artifactを確認。トークン未設定では「未設定」という状態レポートのみ。成功表示でも、status.mdだけの場合は取得成功ではない。
6. 初回実取得ではCloudflareダッシュボードを同じホスト・同じJST期間に合わせ、PV・Visitsとページ/参照元を照合。差異があれば期間、フィルター、サンプリングと定義を確認してから運営判断に使用する。

毎週月曜10:17 JST（GitHub側で遅延し得る）。手動実行でも前週の月曜00:00〜翌月曜00:00。取得範囲はホスト `saleshoka.saleshoka.workers.dev` に限定し、同一アカウント内の他サイトを混在させない。
レポートはActions Summaryと90日保持のartifactのみ。公開サイト・Gitへの書き戻し・メール・X投稿なし。リポジトリが公開ならSummary/Artifactの閲覧範囲に注意する。
依存パッケージ追加なし。GitHub権限はcontents:readのみ。PRでは秘密情報を渡さずテストのみ。

## 解釈と障害対応

Visitsは人数やCookieセッションではなく外部または直接リンクからの到着。参照元はホストのみで、参照元パスやクエリ文字列を保存しない。
上位20件は全件一覧ではない。APIが返す集計値をそのまま記載し、sampleIntervalを再乗算しない。過去7日を超える期間と動的サンプリングの影響があり、厳密な実数と断定しない。
広告ブロック・未送信の閲覧は含まれない。Amazonクリック、売上、X表示回数、読者の個人識別は対象外。
403やGraphQLエラーはトークンの権限・対象アカウント・有効期限、settingsとクエリ期間上限を確認。レスポンス本文・ヘッダー・トークンはログに出さない。
空の集計は計測レコードなしとして示し、障害や設定不足をゼロアクセスに変換しない。

## 検証

`node --test scripts/weekly-analytics.test.mjs`

スキーマ探索、日付境界・年跨ぎ、HTTP/GraphQL失敗と秘密情報抑止、欠落/非数値指標、空データ、サンプリング値の非再乗算、Markdownのラベル処理を確認。
分析トークン設定後の実API・ダッシュボード照合は別途必要。

## 公式確認元

- https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/
- https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/
- https://developers.cloudflare.com/web-analytics/faq/
- https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/
- https://developers.cloudflare.com/analytics/graphql-api/features/discovery/introspection/
- https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/

