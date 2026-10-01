import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const INPUT = resolve(ROOT, "public/index.html");
const OUTPUT = resolve(ROOT, "output/x_queue.json");
const SITE = "https://saleshoka.saleshoka.workers.dev/";

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] ?? fallback;
}
function tokyoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type).value;
  return part("year") + "-" + part("month") + "-" + part("day");
}
function decode(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function textOf(html) {
  return decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}
function field(html, selector) {
  const match = html.match(new RegExp('<[^>]*class="[^"]*' + selector + '[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>', "i"));
  return match ? textOf(match[1]) : "";
}
function attr(html, selector, name) {
  const tag = html.match(new RegExp('<a[^>]*class="[^"]*' + selector + '[^"]*"[^>]*>', "i"));
  if (!tag) return "";
  const match = tag[0].match(new RegExp("\\b" + name + '="([^"]*)"', "i"));
  return match ? decode(match[1]) : "";
}
function verifiedProductLink(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return ["amazon.co.jp", "www.amazon.co.jp"].includes(url.hostname)
      && /^\/dp\/[A-Z0-9]{10}$/i.test(url.pathname)
      && url.searchParams.get("tag") === "saleshoka-22";
  } catch { return false; }
}
function readBooks(html) {
  return [...html.matchAll(/<article class="book">([\s\S]*?)<\/article>/gi)]
    .map((match) => {
      const card = match[1];
      const title = textOf((card.match(/<h3>([\s\S]*?)<\/h3>/i) || [])[1] || "");
      const author = field(card, "author");
      const reason = field(card, "reason");
      const priceText = field(card, "price");
      const note = field(card, "price-note");
      const label = field(card, "book-label");
      const rawLink = attr(card, "action", "href");
      const amountMatch = priceText.match(/\d[\d,]*/);
      const price = amountMatch ? Number(amountMatch[0].replace(/,/g, "")) : null;
      const endText = label + " " + note;
      const endMatch = endText.match(/(\d{1,2})[\/.](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
      const endDateVerified = Boolean(endMatch && /まで|終了日確認済み/.test(endText));
      return {
        title, author, reason, price, price_text: priceText || null,
        price_verified: /確認済み/.test(note) && price !== null,
        end_date_text: endMatch ? endMatch[1] + "/" + endMatch[2] : null,
        end_date_verified: endDateVerified,
        end_time_text: endMatch && endMatch[3] ? endMatch[3] + ":" + endMatch[4] : null,
        end_time_verified: Boolean(endDateVerified && endMatch && endMatch[3]),
        product_link_verified: verifiedProductLink(rawLink),
        product_id: rawLink.match(/\/dp\/([A-Z0-9]{10})(?:[/?#]|$)/i)?.[1]?.toUpperCase() || null
      };
    }).filter((book) => book.title);
}
function campaignItems(html) {
  return [...html.matchAll(/<a class="campaign" href="[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      title: textOf((match[1].match(/<h3>([\s\S]*?)<\/h3>/i) || [])[1] || ""),
      summary: textOf((match[1].match(/<p>([\s\S]*?)<\/p>/i) || [])[1] || "")
    })).filter((item) => item.title);
}
function campaignUrl(date, key) {
  return SITE + "?utm_source=x&utm_medium=social&utm_campaign=" + key + "_" + date.replace(/-/g, "");
}
function candidate(type, date, products, body, checks, extra = {}) {
  const blockers = [];
  if (!checks.price_verified && type !== "campaign") blockers.push("掲載元で価格確認済みの記載がありません");
  if (!checks.link_verified) blockers.push("作品とAmazon個別商品リンクの対応を確認できません");
  if (!checks.article_url_verified) blockers.push("セール書架URLを確認できません");
  if (!checks.site_published) blockers.push("Cloudflareへの公開完了を確認してから --published を指定してください");
  return {
    type, body, site_url: campaignUrl(date, type),
    utm: { source: "x", medium: "social", campaign: type + "_" + date.replace(/-/g, "") },
    products: products.map((item) => ({ title: item.title, author: item.author || null, product_id: item.product_id || null })),
    price_verified: checks.price_verified,
    end_date_verified: products.length ? products.every((item) => item.end_date_verified) : null,
    end_time_verified: products.length ? products.every((item) => item.end_time_verified) : null,
    link_verified: { article_url: checks.article_url_verified, product_link: type === "campaign" ? null : checks.link_verified },
    site_published: checks.site_published,
    status: blockers.length ? "hold" : "ready", hold_reasons: blockers, ...extra
  };
}

const date = option("--date", tokyoDate());
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD");
const published = process.argv.includes("--published");
const html = await readFile(INPUT, "utf8");
const pageDate = html.match(/THE DAILY BOOK EDIT\s*[·|]\s*(\d{4})\.(\d{2})\.(\d{2})/i);
const sourceDate = pageDate ? pageDate[1] + "-" + pageDate[2] + "-" + pageDate[3] : null;
const sourceIsCurrent = sourceDate === date;
const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] || "";
let articleUrlVerified = false;
try { articleUrlVerified = new URL(canonical).origin === new URL(SITE).origin; } catch {}
const books = readBooks(html);
const campaigns = campaignItems(html);
const queue = [];
function withPublication(checks) {
  return { ...checks, article_url_verified: articleUrlVerified, site_published: published && sourceIsCurrent };
}
const pricedBooks = books.filter((item) => item.price_verified && item.product_link_verified);
if (pricedBooks.length) {
  const lines = pricedBooks.map((item) => "・" + item.title + "　" + item.price_text);
  queue.push(candidate("daily", date, pricedBooks,
    "📚 今日見るKindleセール\n\n" + lines.join("\n")
      + "\n\n掲載作品から、今日チェックしたい本を選びました。"
      + "\n👇詳細はこちら\n" + campaignUrl(date, "daily") + "\n\n#Kindleセール",
    withPublication({ price_verified: pricedBooks.length === books.length, link_verified: pricedBooks.length === books.length }),
    { source_page_date: sourceDate, source_date_current: sourceIsCurrent }));
}
for (const book of books) {
  queue.push(candidate("single", date, [book],
    "📚 " + book.title + "。\n\n" + (book.price_text || "価格は販売ページでご確認ください")
      + (book.reason ? "\n\n" + book.reason : "")
      + "\n\n👇セール書架で詳細を確認\n" + campaignUrl(date, "single_" + (book.product_id || "item"))
      + "\n\n#Kindleセール",
    withPublication({ price_verified: book.price_verified, link_verified: book.product_link_verified }),
    { source_page_date: sourceDate, source_date_current: sourceIsCurrent }));
}
for (const book of books.filter((item) => item.end_date_verified && item.end_date_text)) {
  const [month, day] = book.end_date_text.split("/").map(Number);
  const target = date.split("-").map(Number);
  if (month !== target[1] || day !== target[2]) continue;
  const expiry = book.end_time_verified
    ? "終了 " + book.end_date_text + " " + book.end_time_text + "（掲載情報で確認）"
    : "終了日 " + book.end_date_text + "（終了時刻は未確認）";
  queue.push(candidate("ending", date, [book],
    "⏰ 今日までのKindleセール\n\n『" + book.title + "』\n" + (book.price_text || "") + "\n" + expiry
      + "\n\n👇セール書架\n" + campaignUrl(date, "ending_" + (book.product_id || "item"))
      + "\n\n#Kindleセール",
    withPublication({ price_verified: book.price_verified, link_verified: book.product_link_verified }),
    { source_page_date: sourceDate, source_date_current: sourceIsCurrent }));
}
campaigns.forEach((item, index) => {
  const key = "campaign_" + String(index + 1).padStart(2, "0");
  queue.push(candidate("campaign", date, [],
    "📚 " + item.title + "。\n\nセール書架で、掲載中の注目作品を紹介しています。"
      + "\n\n👇作品を確認\n" + campaignUrl(date, key) + "\n\n#Kindleセール",
    withPublication({ price_verified: null, link_verified: true }),
    { campaign_title: item.title, source_page_date: sourceDate, source_date_current: sourceIsCurrent }));
});
for (const item of queue) {
  if (!sourceIsCurrent) {
    item.status = "hold";
    item.hold_reasons.unshift("サイト掲載日 " + (sourceDate || "不明") + " が生成日 " + date + " と一致しません");
  }
}
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, JSON.stringify({
  generated_at: new Date().toISOString(), source: "public/index.html",
  source_page_date: sourceDate, posting_mode: "manual_only", candidates: queue
}, null, 2) + "\n", "utf8");
console.log("Generated " + queue.length + " X candidates at output/x_queue.json");
