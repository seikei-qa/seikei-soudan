// ===== Firebase 設定（あなたのやつ）=====
const firebaseConfig = {
  apiKey: "AIzaSyByAjXDKu5doIYKDL3uuU0zqMENxhStFWg",
  authDomain: "skinlog-a06a9.firebaseapp.com",
  projectId: "skinlog-a06a9",
  storageBucket: "skinlog-a06a9.firebasestorage.app",
  messagingSenderId: "784247637066",
  appId: "1:784247637066:web:ba77376f09feb60aedd2b3"
};
// ===============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, doc, getDoc,
  serverTimestamp, runTransaction, updateDoc, increment,
  collectionGroup, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup, linkWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export let currentUid = null;
export let currentUser = null;

export function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
export function tokenize(str){
  return (str || "").toLowerCase().split(/\s+/).map(s=>s.trim()).filter(Boolean);
}
export function andMatch(hay, tokens){
  if(!tokens.length) return true;
  const h = (hay || "").toLowerCase();
  return tokens.every(t => h.includes(t));
}
export function containsDanger(text){
  const danger = ["詐欺","医療ミス","違法","殺す","死ね","最悪","悪徳","ぼったくり","金返せ","訴える","犯罪","逮捕","潰れろ"];
  const s = String(text || "");
  return danger.some(w => s.includes(w));
}

export async function ensureAnonAuth(){
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      try{
        if(user){
          currentUser = user;
          currentUid = user.uid;
          return resolve(user);
        }
        const res = await signInAnonymously(auth);
        currentUser = res.user;
        currentUid = res.user.uid;
        resolve(res.user);
      }catch(e){
        reject(e);
      }
    });
  });
}

// 任意：Googleログイン（匿名ユーザーをGoogleに“昇格”）
export async function optionalGoogleLogin(){
  await ensureAnonAuth();
  const provider = new GoogleAuthProvider();
  try{
    if(currentUser?.isAnonymous){
      const res = await linkWithPopup(currentUser, provider);
      currentUser = res.user;
      currentUid = res.user.uid;
      return { ok:true, mode:"linked" };
    }else{
      const res = await signInWithPopup(auth, provider);
      currentUser = res.user;
      currentUid = res.user.uid;
      return { ok:true, mode:"signedin" };
    }
  }catch(e){
    console.error(e);
    return { ok:false, error: e?.message || String(e) };
  }
}

// ===== メンテ設定 =====
let _siteCache = null;
export async function getSiteConfig(){
  await ensureAnonAuth();
  if(_siteCache) return _siteCache;
  const ref = doc(db, "settings", "site");
  const snap = await getDoc(ref);
  if(!snap.exists()){
    _siteCache = { maintenance:false, message:"" };
    return _siteCache;
  }
  const d = snap.data() || {};
  _siteCache = { maintenance: !!d.maintenance, message: d.message || "" };
  return _siteCache;
}

// ===== 通知（追加）=====
// notifications: { ownerUid, targetUid, type, qid, aid, rid, message, createdAt, read:false }
export async function createNotification(targetUid, payload){
  await ensureAnonAuth();
  if(!targetUid) return null;

  // 重要：ownerUidをtargetUidにしておくと
  // 「自分の通知だけ更新/削除OK」のルールで運用できる
  const docu = {
    ownerUid: targetUid,
    targetUid,
    type: payload?.type || "info",
    qid: payload?.qid || null,
    aid: payload?.aid || null,
    rid: payload?.rid || null,
    message: payload?.message || "",
    createdAt: serverTimestamp(),
    read: false
  };
  return addDoc(collection(db, "notifications"), docu);
}

export async function listMyNotifications(limitN = 30){
  await ensureAnonAuth();

  // MVP: 全件をcreatedAt descで取って、targetUid==自分だけ返す（小規模ならOK）
  const qy = query(collection(db, "notifications"), orderBy("createdAt","desc"), limit(limitN));
  const snap = await getDocs(qy);

  const out = [];
  snap.forEach(d=>{
    const data = d.data() || {};
    if(data.targetUid === currentUid){
      out.push({ id:d.id, data });
    }
  });
  return out;
}

export async function markNotificationRead(nid){
  await ensureAnonAuth();
  await updateDoc(doc(db,"notifications",nid), { read:true, readAt: serverTimestamp() });
}

// ===== 質問 =====
export async function createQuestion(payload){
  await ensureAnonAuth();
  payload.ownerUid = currentUid;
  payload.createdAt = serverTimestamp();
  payload.updatedAt = null;
  payload.deleted = false;
  payload.likeCount = 0;
  payload.answerCount = 0;
  payload.bestAnswerId = null;
  return addDoc(collection(db, "questions"), payload);
}

export async function listQuestions(){
  await ensureAnonAuth();
  const qy = query(collection(db,"questions"), orderBy("createdAt","desc"));
  const snap = await getDocs(qy);
  const out=[];
  snap.forEach(d=>out.push({id:d.id, data:d.data()}));
  return out;
}

export async function getQuestion(qid){
  await ensureAnonAuth();
  const ref = doc(db,"questions",qid);
  const snap = await getDoc(ref);
  if(!snap.exists()) return null;
  return {id: snap.id, data: snap.data()};
}

export async function updateQuestion(qid, patch){
  await ensureAnonAuth();
  patch.updatedAt = serverTimestamp();
  await updateDoc(doc(db,"questions",qid), patch);
}

export async function softDeleteQuestion(qid){
  await ensureAnonAuth();
  await updateDoc(doc(db,"questions",qid), { deleted:true, deletedAt: serverTimestamp() });
}

// ===== 回答 =====
export async function listAnswers(qid){
  await ensureAnonAuth();
  const qy = query(collection(db,"questions",qid,"answers"), orderBy("createdAt","asc"));
  const snap = await getDocs(qy);
  const out=[];
  snap.forEach(d=>out.push({id:d.id, data:d.data()}));
  return out;
}

export async function addAnswer(qid, payload){
  await ensureAnonAuth();

  payload.ownerUid = currentUid;
  payload.createdAt = serverTimestamp();
  payload.updatedAt = null;
  payload.deleted = false;
  payload.helpfulCount = 0;
  payload.best = false;
  payload.thanksText = "";
  payload.thanksAt = null;

  const res = await addDoc(collection(db,"questions",qid,"answers"), payload);
  await updateDoc(doc(db,"questions",qid), { answerCount: increment(1) });

  // 通知：質問者へ（自分が質問者なら通知しない）
  try{
    const qSnap = await getDoc(doc(db,"questions",qid));
    const q = qSnap.data() || {};
    if(q.ownerUid && q.ownerUid !== currentUid){
      await createNotification(q.ownerUid, {
        type: "answer",
        qid,
        aid: res.id,
        message: "あなたの質問に回答がつきました"
      });
    }
  }catch(e){
    console.warn("notify(answer) failed", e);
  }

  return res;
}

export async function updateAnswer(qid, aid, patch){
  await ensureAnonAuth();
  patch.updatedAt = serverTimestamp();
  await updateDoc(doc(db,"questions",qid,"answers",aid), patch);
}

export async function softDeleteAnswer(qid, aid){
  await ensureAnonAuth();
  await updateDoc(doc(db,"questions",qid,"answers",aid), { deleted:true, deletedAt: serverTimestamp() });
  await updateDoc(doc(db,"questions",qid), { answerCount: increment(-1) });
}

// ベストアンサー設定（質問者が実行）
export async function setBestAnswer(qid, aid){
  await ensureAnonAuth();
  const qRef = doc(db,"questions",qid);
  const aRef = doc(db,"questions",qid,"answers",aid);

  const result = await runTransaction(db, async (tx)=>{
    const qSnap = await tx.get(qRef);
    if(!qSnap.exists()) throw new Error("question not found");
    const q = qSnap.data();
    if(q.ownerUid !== currentUid) throw new Error("not owner");

    const prev = q.bestAnswerId;
    if(prev && prev !== aid){
      const prevRef = doc(db,"questions",qid,"answers",prev);
      tx.update(prevRef, { best:false, updatedAt: serverTimestamp() });
    }
    tx.update(qRef, { bestAnswerId: aid, updatedAt: serverTimestamp() });
    tx.update(aRef, { best:true, updatedAt: serverTimestamp() });
    return { ok:true };
  });

  // 通知：ベストアンサーに選ばれた（回答者へ）
  try{
    const aSnap = await getDoc(aRef);
    const a = aSnap.data() || {};
    if(a.ownerUid && a.ownerUid !== currentUid){
      await createNotification(a.ownerUid, {
        type: "best",
        qid,
        aid,
        message: "あなたの回答がベストアンサーに選ばれました"
      });
    }
  }catch(e){
    console.warn("notify(best) failed", e);
  }

  return result;
}

// お礼コメント（質問者が回答に付ける）
export async function setThanks(qid, aid, text){
  await ensureAnonAuth();
  const qRef = doc(db,"questions",qid);
  const aRef = doc(db,"questions",qid,"answers",aid);

  const result = await runTransaction(db, async (tx)=>{
    const qSnap = await tx.get(qRef);
    if(!qSnap.exists()) throw new Error("question not found");
    const q = qSnap.data();
    if(q.ownerUid !== currentUid) throw new Error("not owner");

    tx.update(aRef, { thanksText: text || "", thanksAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return { ok:true };
  });

  // 通知：お礼が来た（回答者へ）
  try{
    const aSnap = await getDoc(aRef);
    const a = aSnap.data() || {};
    if(a.ownerUid && a.ownerUid !== currentUid){
      await createNotification(a.ownerUid, {
        type: "thanks",
        qid,
        aid,
        message: "あなたの回答にお礼コメントがつきました"
      });
    }
  }catch(e){
    console.warn("notify(thanks) failed", e);
  }

  return result;
}

// ===== 共感（質問） =====
export async function toggleLikeQuestion(qid){
  await ensureAnonAuth();
  const likeRef = doc(db,"questions",qid,"likes",currentUid);
  const qRef = doc(db,"questions",qid);

  return runTransaction(db, async (tx)=>{
    const likeSnap = await tx.get(likeRef);
    if(likeSnap.exists()){
      tx.delete(likeRef);
      tx.update(qRef, { likeCount: increment(-1) });
      return { liked:false };
    }else{
      tx.set(likeRef, { createdAt: serverTimestamp() });
      tx.update(qRef, { likeCount: increment(1) });
      return { liked:true };
    }
  });
}

export async function isLiked(qid){
  await ensureAnonAuth();
  const snap = await getDoc(doc(db,"questions",qid,"likes",currentUid));
  return snap.exists();
}

// ===== 参考になった（回答） =====
export async function toggleHelpful(qid, aid){
  await ensureAnonAuth();
  const hRef = doc(db,"questions",qid,"answers",aid,"helpful",currentUid);
  const aRef = doc(db,"questions",qid,"answers",aid);

  return runTransaction(db, async (tx)=>{
    const hSnap = await tx.get(hRef);
    if(hSnap.exists()){
      tx.delete(hRef);
      tx.update(aRef, { helpfulCount: increment(-1) });
      return { helpful:false };
    }else{
      tx.set(hRef, { createdAt: serverTimestamp() });
      tx.update(aRef, { helpfulCount: increment(1) });
      return { helpful:true };
    }
  });
}

export async function isHelpful(qid, aid){
  await ensureAnonAuth();
  const snap = await getDoc(doc(db,"questions",qid,"answers",aid,"helpful",currentUid));
  return snap.exists();
}

// ===== 返信 =====
export async function listReplies(qid, aid){
  await ensureAnonAuth();
  const qy = query(collection(db,"questions",qid,"answers",aid,"replies"), orderBy("createdAt","asc"));
  const snap = await getDocs(qy);
  const out=[];
  snap.forEach(d=>out.push({id:d.id, data:d.data()}));
  return out;
}

export async function addReply(qid, aid, payload){
  await ensureAnonAuth();
  payload.ownerUid = currentUid;
  payload.createdAt = serverTimestamp();
  payload.updatedAt = null;
  payload.deleted = false;

  const res = await addDoc(collection(db,"questions",qid,"answers",aid,"replies"), payload);

  // 通知：回答者へ（自分が回答者なら通知しない）
  try{
    const aSnap = await getDoc(doc(db,"questions",qid,"answers",aid));
    const a = aSnap.data() || {};
    if(a.ownerUid && a.ownerUid !== currentUid){
      await createNotification(a.ownerUid, {
        type: "reply",
        qid,
        aid,
        rid: res.id,
        message: "あなたの回答に返信がつきました"
      });
    }
  }catch(e){
    console.warn("notify(reply) failed", e);
  }

  return res;
}

export async function updateReply(qid, aid, rid, patch){
  await ensureAnonAuth();
  patch.updatedAt = serverTimestamp();
  await updateDoc(doc(db,"questions",qid,"answers",aid,"replies",rid), patch);
}

// ソフト削除（返信）
export async function softDeleteReply(qid, aid, rid){
  await ensureAnonAuth();
  await updateDoc(doc(db,"questions",qid,"answers",aid,"replies",rid), { deleted:true, deletedAt: serverTimestamp() });
}

// ===== 通報 =====
export async function createReport(payload){
  await ensureAnonAuth();
  payload.reporterUid = currentUid;
  payload.createdAt = serverTimestamp();
  return addDoc(collection(db,"reports"), payload);
}

// ===== URLコピー =====
export async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch{
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand("copy"); }catch{}
    ta.remove();
    return true;
  }
}

// ===== ランキング（collectionGroup answers を集計） =====
export async function getLeaderboardSample(sampleSize = 500){
  await ensureAnonAuth();
  // 直近の回答をサンプルして集計（小規模サイトなら十分機能する）
  const qy = query(collectionGroup(db, "answers"), orderBy("createdAt","desc"), limit(sampleSize));
  const snap = await getDocs(qy);
  const out=[];
  snap.forEach(d=>out.push({id:d.id, data:d.data(), path:d.ref.path}));
  return out;
}
