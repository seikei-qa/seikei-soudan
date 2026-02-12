// ===== Firebase 設定（あなたのやつに置き換え）=====
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyByAjXDKu5doIYKDL3uuU0zqMENxhStFWg",
  authDomain: "skinlog-a06a9.firebaseapp.com",
  projectId: "skinlog-a06a9",
  storageBucket: "skinlog-a06a9.firebasestorage.app",
  messagingSenderId: "784247637066",
  appId: "1:784247637066:web:ba77376f09feb60aedd2b3",
  measurementId: "G-7HET8V5RJ1"
};

// Initialize Firebase

const analytics = getAnalytics(app);
// =========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, doc, getDoc,
  serverTimestamp, runTransaction, updateDoc, increment,
  collectionGroup, limit,
  setDoc, deleteDoc, where
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

// ===== util =====
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

// ===== 通知（indexで見る） =====
// notifications: { ownerUid(target), type, message, qid, aid, rid, createdAt, read }
export async function createNotification(targetUid, payload){
  await ensureAnonAuth();
  const docData = {
    ownerUid: targetUid,
    targetUid: targetUid,
    type: payload.type || "info",
    message: payload.message || "",
    qid: payload.qid || null,
    aid: payload.aid || null,
    rid: payload.rid || null,
    createdAt: serverTimestamp(),
    read: false
  };
  return addDoc(collection(db, "notifications"), docData);
}

export async function listMyNotifications(maxN = 30){
  await ensureAnonAuth();
  // ownerUid == currentUid で取る（速度＆将来安定）
  const qy = query(
    collection(db, "notifications"),
    where("ownerUid","==", currentUid),
    orderBy("createdAt","desc"),
    limit(maxN)
  );
  const snap = await getDocs(qy);
  const out=[];
  snap.forEach(d=>out.push({id:d.id, data:d.data()}));
  return out;
}

export async function markNotificationRead(nid){
  await ensureAnonAuth();
  await updateDoc(doc(db,"notifications",nid), { read:true });
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
      tx.set(likeRef, { ownerUid: currentUid, createdAt: serverTimestamp() });
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

// ===== 保存（ウォッチ） =====
// 保存先：questions/{qid}/watchers/{uid}
export async function isWatching(qid){
  await ensureAnonAuth();
  const ref = doc(db, "questions", qid, "watchers", currentUid);
  const snap = await getDoc(ref);
  return snap.exists();
}

export async function toggleWatchQuestion(qid){
  await ensureAnonAuth();
  const ref = doc(db, "questions", qid, "watchers", currentUid);
  const snap = await getDoc(ref);

  if(snap.exists()){
    await deleteDoc(ref);
    return { watching:false };
  }else{
    await setDoc(ref, {
      ownerUid: currentUid,
      createdAt: serverTimestamp()
    });
    return { watching:true };
  }
}

async function listWatchersUids(qid, limitN = 500){
  const qy = query(collection(db, "questions", qid, "watchers"), limit(limitN));
  const snap = await getDocs(qy);
  const uids = [];
  snap.forEach(d => uids.push(d.id)); // docId = uid
  return uids;
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

  // 通知：質問者へ（自分が質問者なら送らない）
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

    // ★通知：保存（ウォッチ）している人へ（質問者は二重通知を避ける）
    const watchers = await listWatchersUids(qid, 500);
    for(const uid of watchers){
      if(uid === currentUid) continue;
      if(q.ownerUid && uid === q.ownerUid) continue;
      await createNotification(uid, {
        type: "watch_answer",
        qid,
        aid: res.id,
        message: "保存した質問に新しい回答がつきました"
      });
    }
  }catch(e){
    console.warn("notify(answer/watch) failed", e);
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

// ===== ベストアンサー設定（質問者が実行） =====
export async function setBestAnswer(qid, aid){
  await ensureAnonAuth();
  const qRef = doc(db,"questions",qid);
  const aRef = doc(db,"questions",qid,"answers",aid);

  return runTransaction(db, async (tx)=>{
    const qSnap = await tx.get(qRef);
    if(!qSnap.exists()) throw new Error("question not found");
    const q = qSnap.data();
    if(q.ownerUid !== currentUid) throw new Error("not owner");

    const prev = q.bestAnswerId;
    if(prev && prev !== aid){
      const prevRef = doc(db,"questions",qid,"answers",prev);
      tx.update(prevRef, { best:false });
    }
    tx.update(qRef, { bestAnswerId: aid, updatedAt: serverTimestamp() });
    tx.update(aRef, { best:true, updatedAt: serverTimestamp() });

    return { ok:true };
  }).then(async (r)=>{
    // 通知：回答者へ
    try{
      const aSnap = await getDoc(aRef);
      const a = aSnap.data() || {};
      if(a.ownerUid && a.ownerUid !== currentUid){
        await createNotification(a.ownerUid, {
          type:"best",
          qid, aid,
          message:"あなたの回答がベストアンサーに選ばれました"
        });
      }
    }catch(e){
      console.warn("notify(best) failed", e);
    }
    return r;
  });
}

// ===== お礼コメント（質問者が回答に付ける） =====
export async function setThanks(qid, aid, text){
  await ensureAnonAuth();
  const qRef = doc(db,"questions",qid);
  const aRef = doc(db,"questions",qid,"answers",aid);

  return runTransaction(db, async (tx)=>{
    const qSnap = await tx.get(qRef);
    if(!qSnap.exists()) throw new Error("question not found");
    const q = qSnap.data();
    if(q.ownerUid !== currentUid) throw new Error("not owner");

    tx.update(aRef, { thanksText: text || "", thanksAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return { ok:true };
  }).then(async (r)=>{
    // 通知：回答者へ
    try{
      const aSnap = await getDoc(aRef);
      const a = aSnap.data() || {};
      if(a.ownerUid && a.ownerUid !== currentUid){
        await createNotification(a.ownerUid, {
          type:"thanks",
          qid, aid,
          message:"あなたの回答にお礼コメントが付きました"
        });
      }
    }catch(e){
      console.warn("notify(thanks) failed", e);
    }
    return r;
  });
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
      tx.set(hRef, { ownerUid: currentUid, createdAt: serverTimestamp() });
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

  // 通知：回答者へ（返信が付いた）
  try{
    const aSnap = await getDoc(doc(db,"questions",qid,"answers",aid));
    const a = aSnap.data() || {};
    if(a.ownerUid && a.ownerUid !== currentUid){
      await createNotification(a.ownerUid, {
        type:"reply",
        qid, aid, rid: res.id,
        message:"あなたの回答に返信がつきました"
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
  const qy = query(collectionGroup(db, "answers"), orderBy("createdAt","desc"), limit(sampleSize));
  const snap = await getDocs(qy);
  const out=[];
  snap.forEach(d=>out.push({id:d.id, data:d.data(), path:d.ref.path}));
  return out;
}
