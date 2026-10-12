import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const NODE = 'rumPageloadEventsAdaptiveGroups';
const HOST = 'saleshoka.saleshoka.workers.dev';
export function windowFor(now = new Date()) {
  // Last complete Monday–Sunday in JST, even when manually run midweek.
  const jst = new Date(now.getTime() + 9 * 3600000);
  const end = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate())
    - ((jst.getUTCDay() + 6) % 7) * 86400000 - 9 * 3600000;
  return { start: new Date(end - 7 * 86400000).toISOString(), end: new Date(end).toISOString() };
}
export async function graphql(query, variables, token, fetcher = fetch) {
  let response;
  try {
    response = await fetcher('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000),
    });
  } catch { throw new Error('Cloudflare connection failed (details suppressed).'); }
  if (!response.ok) throw new Error(`Cloudflare HTTP ${response.status}; check token and permissions.`);
  let body;
  try { body = await response.json(); } catch { throw new Error('Invalid Cloudflare JSON.'); }
  if (body.errors?.length || !body.data) throw new Error('Cloudflare GraphQL failed; check schema, permissions and dataset limits. Response suppressed.');
  return body.data;
}
const typeName = t => t ? t.name || typeName(t.ofType) : undefined;
export function verifySchema(types) {
  const index = new Map(types.map(t => [t.name, t]));
  const account = types.find(t => t.fields?.some(f => f.name === NODE && f.args?.some(a => a.name === 'filter')));
  const dataset = account?.fields.find(f => f.name === NODE);
  const fields = index.get(typeName(dataset?.type))?.fields || [];
  const has = (list, name) => list.some(f => f.name === name && !f.isDeprecated);
  const nested = name => index.get(typeName(fields.find(f => f.name === name)?.type))?.fields || [];
  const filter = index.get(typeName(dataset?.args?.find(a => a.name === 'filter')?.type))?.inputFields || [];
  for (const name of ['count', 'sum', 'dimensions', 'avg']) if (!has(fields, name)) throw new Error('Required RUM schema unavailable.');
  if (!has(nested('sum'), 'visits') || !has(nested('avg'), 'sampleInterval')) throw new Error('Required RUM metrics unavailable.');
  for (const name of ['requestPath', 'refererHost']) if (!has(nested('dimensions'), name)) throw new Error('Required RUM dimensions unavailable.');
  for (const name of ['datetime_geq', 'datetime_lt', 'requestHost']) if (!has(filter, name)) throw new Error('Required RUM filters unavailable.');
  return { filterType: typeName(dataset.args.find(a => a.name === 'filter').type) };
}
export function validateRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Missing RUM rows.');
  for (const row of rows) {
    if (![row.count, row.sum?.visits, row.avg?.sampleInterval].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) throw new Error('Invalid RUM metrics.');
  }
  return rows;
}
export function render(data, window) {
  const safe = value => String(value || '(empty / direct)').replace(/[\r\n|<>`]/g, ' ').slice(0, 200);
  const total = data.total[0];
  const table = (rows, dimension) => ['| Dimension | Page Views | Visits | sampleInterval |', '|---|---:|---:|---:|',
    ...rows.map(r => `| ${safe(r.dimensions?.[dimension])} | ${r.count} | ${r.sum.visits} | ${r.avg.sampleInterval} |`)].join('\n');
  return `# セール書架 週次アクセスレポート\n\n対象: ${HOST}\n\n期間（UTC・終了を含まない）: ${window.start} → ${window.end}\n\nJSTの前週月曜00:00〜翌月曜00:00。\n\n${total ? `Page Views: ${total.count}\n\nVisits: ${total.sum.visits}\n\nsampleInterval: ${total.avg.sampleInterval}` : '該当する計測レコードなし。計測稼働・対象ホスト・期間を確認してください。ゼロアクセスとは断定しません。'}\n\n## ページ別（Page Views上位20件）\n\n${table(data.pages, 'requestPath')}\n\n## Referrers（Page Views上位20件）\n\n${table(data.referrers, 'refererHost')}\n\nCloudflare RUMのAPI集計値。サンプリングを伴う可能性があり、sampleIntervalを再乗算しません。Visitsはユニーク人数ではありません。上位表は全件合計ではありません。計測遮断や未計測ページは含まれません。売上・Amazonクリック・X表示回数は取得しません。\n`;
}
export async function run(env = process.env) {
  const missing = ['CLOUDFLARE_ANALYTICS_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'].filter(k => !env[k]);
  await mkdir('reports', { recursive: true });
  if (missing.length) {
    const message = `# セール書架 週次レポート — 未設定\n\n必要なGitHub Secrets: ${missing.join(', ')}\n\nAPI未呼び出し。アクセス数は取得していません。docs/weekly-analytics.mdを参照してください。\n`;
    await writeFile('reports/status.md', message);
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, message);
    return;
  }
  const call = (q, v = {}) => graphql(q, v, env.CLOUDFLARE_ANALYTICS_API_TOKEN);
  const schema = await call(`{ __schema { types { name fields { name isDeprecated args { name type { name ofType { name ofType { name ofType { name } } } } } type { name ofType { name ofType { name ofType { name } } } } } inputFields { name type { name ofType { name } } } } } }`);
  const { filterType } = verifySchema(schema.__schema.types);
  const variables = { account: env.CLOUDFLARE_ACCOUNT_ID };
  const settings = await call(`query($account: string!) { viewer { accounts(filter: {accountTag: $account}) { settings { ${NODE} { enabled } } } } }`, variables);
  if (settings.viewer.accounts.length !== 1 || settings.viewer.accounts[0].settings[NODE]?.enabled !== true) throw new Error('RUM dataset not enabled for this account/token.');
  const window = windowFor();
  variables.filter = { datetime_geq: window.start, datetime_lt: window.end, requestHost: HOST };
  const metrics = 'count sum { visits } avg { sampleInterval }';
  const result = await call(`query($account: string!, $filter: ${filterType}!) { viewer { accounts(filter: {accountTag: $account}) {
    total: ${NODE}(limit: 1, filter: $filter) { ${metrics} }
    pages: ${NODE}(limit: 20, filter: $filter, orderBy: [count_DESC]) { ${metrics} dimensions { requestPath } }
    referrers: ${NODE}(limit: 20, filter: $filter, orderBy: [count_DESC]) { ${metrics} dimensions { refererHost } }
  } } }`, variables);
  if (result.viewer.accounts.length !== 1) throw new Error('Account response unavailable.');
  const data = result.viewer.accounts[0];
  for (const key of ['total', 'pages', 'referrers']) validateRows(data[key]);
  const report = render(data, window);
  await writeFile('reports/weekly.md', report);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, report);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(() => { console.error('Weekly analytics failed. No metrics published. Check read-only token, account access, schema and query limits.'); process.exitCode = 1; });
}
