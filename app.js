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
  serverTimestamp, runTransaction, updateDoc, increment, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export let currentUid = null;

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
          currentUid = user.uid;
          return resolve(user);
        }
        const res = await signInAnonymously(auth);
        currentUid = res.user.uid;
        resolve(res.user);
      }catch(e){
        reject(e);
      }
    });
  });
}

// ===== メンテナンス設定 =====
// settings/site { maintenance: true/false, message: "..." }
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

// ===== 質問 =====
export async function createQuestion(payload){
  await ensureAnonAuth();
  payload.ownerUid = currentUid;
  payload.createdAt = serverTimestamp();
  payload.updatedAt = null;
  payload.deleted = false;
  payload.likeCount = 0;
  payload.answerCount = 0;
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

// ソフト削除
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

  const res = await addDoc(collection(db,"questions",qid,"answers"), payload);
  await updateDoc(doc(db,"questions",qid), { answerCount: increment(1) });
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
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand("copy"); }catch{}
    ta.remove();
    return true;
  }
}
