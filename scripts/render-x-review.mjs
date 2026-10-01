function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function checkLabel(value) {
  if (value === true) return "確認済み";
  if (value === false) return "要確認";
  return "対象外";
}

export function renderXReview(payload) {
  const candidates = payload.candidates || [];
  const ready = candidates.filter((item) => item.status === "ready");
  const held = candidates.filter((item) => item.status === "hold");
  const labels = { daily: "今日の候補", single: "1作品", ending: "終了間近", campaign: "キャンペーン" };
  const postBodies = JSON.stringify(ready.map((item) => item.body))
    .replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

  const readyCards = ready.map((item, index) => {
    const names = (item.products || []).map((product) =>
      "<li>" + escapeHtml(product.title) + (product.author ? " <small>" + escapeHtml(product.author) + "</small>" : "") + "</li>"
    ).join("");
    const productLinkCheck = item.link_verified ? item.link_verified.product_link : null;
    return [
      '<article class="card ready-card">',
      '<div class="card-head"><span class="badge ready">READY · ' + escapeHtml(labels[item.type] || item.type) + '</span></div>',
      names ? "<ul>" + names + "</ul>" : "",
      '<dl><div><dt>価格</dt><dd>' + checkLabel(item.price_verified) + '</dd></div>',
      '<div><dt>終了日</dt><dd>' + checkLabel(item.end_date_verified) + (item.end_time_verified === false ? "（時刻未確認）" : "") + '</dd></div>',
      '<div><dt>商品リンク</dt><dd>' + checkLabel(productLinkCheck) + '</dd></div></dl>',
      '<pre>' + escapeHtml(item.body) + '</pre>',
      '<div class="actions"><button class="copy" type="button" data-copy-index="' + index + '">投稿文をコピー</button>',
      '<a href="' + escapeHtml(item.site_url) + '" target="_blank" rel="noopener">セール書架を開く ↗</a></div>',
      '<p class="copy-status" aria-live="polite"></p>',
      '</article>'
    ].join("");
  }).join("");

  const heldCards = held.map((item) => {
    const names = (item.products || []).map((product) => escapeHtml(product.title)).join("、");
    const reasons = (item.hold_reasons || []).map((reason) => "<li>" + escapeHtml(reason) + "</li>").join("");
    return '<article class="card hold-card"><div class="card-head"><span class="badge hold">HOLD · ' +
      escapeHtml(labels[item.type] || item.type) + '</span></div><strong>' + escapeHtml(names || item.campaign_title || "候補") +
      "</strong><ul>" + reasons + "</ul></article>";
  }).join("");

  return [
    "<!doctype html>",
    '<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>X投稿候補の確認｜セール書架</title>",
    "<style>",
    ":root{font-family:system-ui,'Noto Sans JP',sans-serif;color:#18324a;background:#f4f5f2}*{box-sizing:border-box}body{margin:0}main{max-width:900px;margin:0 auto;padding:32px 20px 64px}",
    "h1{font-size:1.65rem;margin:0 0 8px}.sub{color:#60707c;margin:0 0 24px}.counts{display:flex;gap:10px;margin:20px 0}.count{background:#fff;border:1px solid #d9dfdf;padding:10px 14px;border-radius:8px}",
    "h2{font-size:1.15rem;margin:30px 0 12px}.card{background:#fff;border:1px solid #d9dfdf;border-radius:10px;padding:18px;margin:12px 0}.card-head{display:flex;justify-content:space-between;margin-bottom:12px}.badge{font-size:.75rem;font-weight:700;letter-spacing:.04em;padding:5px 9px;border-radius:999px}.ready{color:#17633e;background:#e4f4e9}.hold{color:#8a4a00;background:#fff1d7}",
    "ul{padding-left:22px}li{margin:5px 0}small{color:#687782}dl{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}dl div{background:#f5f7f7;padding:8px 10px;border-radius:6px}dt{font-size:.72rem;color:#65727d}dd{margin:2px 0 0;font-size:.86rem;font-weight:650}",
    "pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f8f6;border:1px solid #e5e8e5;padding:14px;border-radius:7px;font:inherit;font-size:.94rem;line-height:1.65}.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.copy{border:0;border-radius:6px;background:#143b5a;color:#fff;padding:11px 15px;font-weight:700;cursor:pointer}.actions a{color:#184e75;font-weight:650}.copy-status{min-height:1.3em;margin:8px 0 0;color:#17633e;font-size:.85rem}.hold-card ul{margin-bottom:0;color:#735321}.empty{color:#66747d;background:#fff;padding:16px;border-radius:8px}",
    "@media(max-width:560px){main{padding:24px 14px 44px}.card{padding:14px}.counts{flex-direction:column}.count{padding:8px 10px}}",
    "</style></head><body><main>",
    "<h1>X投稿候補</h1><p class=\"sub\">生成日 " + escapeHtml(payload.source_page_date || "不明") + " · readyは人が確認して手動投稿する候補です。ここから自動投稿はされません。</p>",
    '<div class="counts"><span class="count">確認できる候補 <strong>' + ready.length + '</strong></span><span class="count">保留 <strong>' + held.length + '</strong></span></div>',
    "<h2>投稿文を確認</h2>",
    ready.length ? readyCards : '<p class="empty">確認できる候補はありません。</p>',
    held.length ? "<h2>保留中</h2>" + heldCards : "",
    '<p class="sub">価格・期限を投稿直前に確認し、本文を読んでからXへ貼り付けてください。</p>',
    "<script>const posts=" + postBodies + ";document.querySelectorAll('[data-copy-index]').forEach(function(button){button.addEventListener('click',async function(){const status=button.closest('.card').querySelector('.copy-status');try{const text=posts[Number(button.dataset.copyIndex)];if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text)}else{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const copied=document.execCommand('copy');area.remove();if(!copied)throw new Error('copy failed')}status.textContent='コピーしました。Xへ貼り付けて内容を確認してください。'}catch(error){status.textContent='自動コピーできませんでした。本文を選択してコピーしてください。'}})})</script>",
    "</main></body></html>"
  ].join("\n");
}
