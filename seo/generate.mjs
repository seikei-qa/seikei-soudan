import fs from "fs";
import path from "path";

const SITE = "https://seikei-qa.github.io/seikei-soudan";

// 使う質問データ（引数があればそれ、なければ ./questions.json）
const src = process.argv[2] || "questions.json";
if (!fs.existsSync(src)) {
  console.error(`質問データが見つかりません: ${src}`);
  console.error(`例: node seo/generate.mjs C:\\Users\\Owner\\Downloads\\questions.json`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(src, "utf8"));

const outDir = "q";
fs.mkdirSync(outDir, { recursive: true });

const esc = (s = "") => String(s)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const strip = (s = "") => String(s).replace(/\s+/g, " ").trim();

const urls = [];

for (const q of data) {
  const id = q?.id;
  if (!id) continue;

  const title = strip(q.title || "質問");
  const body = strip(q.body || "");
  const desc = body.slice(0, 130);

  const pageUrl = `${SITE}/q/${id}.html`;

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | 整形相談Q&A</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(pageUrl)}">
</head>
<body>
<main>
  <h1>${esc(title)}</h1>
  <p>${esc(desc)}</p>
  <p><a href="/seikei-soudan/q.html?id=${encodeURIComponent(id)}">回答を見る</a></p>
</main>

<script>
  // 人間がクリックして開いたら知恵袋UIへ
  setTimeout(() => {
    location.replace("/seikei-soudan/q.html?id=${encodeURIComponent(id)}");
  }, 200);
</script>

<noscript>
  <p><a href="/seikei-soudan/q.html?id=${encodeURIComponent(id)}">質問ページを開く</a></p>
</noscript>
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, `${id}.html`), html, "utf8");
  urls.push(pageUrl);
}

// sitemap.xml
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
fs.writeFileSync("sitemap.xml", sitemap, "utf8");

console.log(`OK: ${urls.length} 件生成しました -> ${process.cwd()}`);
