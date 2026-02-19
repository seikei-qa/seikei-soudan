import fs from "fs";
import path from "path";
import admin from "firebase-admin";

const ROOT = process.cwd();
const OUT_DIR = ROOT; // ここが seikei-soudan ルートになる前提
const Q_DIR = path.join(OUT_DIR, "q");

function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p, { recursive:true }); }
function escHtml(s=""){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
function snippet(s="", n=120){
  const t = String(s).replace(/\s+/g," ").trim();
  return t.length > n ? t.slice(0,n) + "…" : t;
}
function pageHtml({ id, title, body }){
  const t = title?.trim() || "質問詳細";
  const desc = snippet(body, 130);
  const url = `https://seikei-qa.github.io/seikei-soudan/q/${id}.html`;
  const qUrl = `https://seikei-qa.github.io/seikei-soudan/q.html?id=${encodeURIComponent(id)}`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(t)} | 整形相談室</title>
<meta name="description" content="${escHtml(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${escHtml(t)} | 整形相談室">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
</head>
<script>
  // 人間が開いたら0.2秒で質問UIへ
  setTimeout(() => {
    location.replace("/seikei-soudan/q.html?id=__ID__");
  }, 200);
</script>

<noscript>
  <p>
    JavaScriptが無効です：
    <a href="/seikei-soudan/q.html?id=__ID__">質問ページを開く</a>
  </p>
</noscript>
<body>
<main style="max-width:900px;margin:24px auto;padding:0 14px;font-family:system-ui,-apple-system,Segoe UI,Roboto,'Noto Sans JP',sans-serif;">
  <h1 style="font-size:20px;line-height:1.3;">${escHtml(t)}</h1>
  <p style="color:#666;line-height:1.7;">${escHtml(desc)}</p>
  <p style="margin-top:16px;">
    <a href="${qUrl}">▶ この質問を開く（回答を見る/投稿する）</a>
  </p>
</main>
</body>
</html>`;
}

async function fetchAllQuestions(db){
  // createdAt で降順に全部引く（多い場合はページング）
  const col = db.collection("questions");
  let q = col.orderBy("createdAt","desc").limit(1000);
  let out = [];
  let last = null;

  while(true){
    const snap = await q.get();
    if(snap.empty) break;

    for(const doc of snap.docs){
      const data = doc.data() || {};
      if(data.deleted) continue;
      out.push({ id: doc.id, data });
    }

    if(snap.size < 1000) break;
    last = snap.docs[snap.docs.length - 1];
    q = col.orderBy("createdAt","desc").startAfter(last).limit(1000);
  }
  return out;
}

async function run(){
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if(!sa) throw new Error("FIREBASE_SERVICE_ACCOUNT が未設定です（GitHub Secrets）");

  const cred = JSON.parse(sa);
  if(!admin.apps.length){
    admin.initializeApp({ credential: admin.credential.cert(cred) });
  }
  const db = admin.firestore();

  ensureDir(Q_DIR);

  const rows = await fetchAllQuestions(db);
  const qs = rows.map(x=>({
    id: x.id,
    title: x.data?.title || "",
    body: x.data?.body || ""
  }));

  for(const q of qs){
    fs.writeFileSync(path.join(Q_DIR, `${q.id}.html`), pageHtml(q), "utf-8");
  }

  const urls = qs.map(q => `https://seikei-qa.github.io/seikei-soudan/q/${q.id}.html`);
  const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;
  fs.writeFileSync(path.join(OUT_DIR, "sitemap.xml"), sm, "utf-8");

  console.log(`OK: ${qs.length} 件生成しました -> ${Q_DIR}`);
}

run();
