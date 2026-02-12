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
  serverTimestamp, runTransaction, setDoc, deleteDoc, updateDoc, increment
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
  const danger = ["詐欺","医療ミス","違法","殺す","死ね","最悪","悪徳","ぼったくり","金返せ","訴える","犯罪","逮捕"];
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

// ===== 質問 =====
export async function createQuestion(payload){
  await ensureAnonAuth();
  payload.ownerUid = currentUid;
  payload.createdAt = serverTimestamp();
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
  const ref = doc(db,"questions",qid);
  patch.updatedAt = serverTimestamp();
  await updateDoc(ref, patch);
}

export async function deleteQuestion(qid){
  await ensureAnonAuth();
  // ※サブコレクション削除まではしない（最初はこれでOK）
  await deleteDoc(doc(db,"questions",qid));
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
  payload.helpfulCount = 0;

  const aRef = collection(db,"questions",qid,"answers");
  const qRef = doc(db,"questions",qid);

  const res = await addDoc(aRef, payload);
  // answerCount +1
  await updateDoc(qRef, { answerCount: increment(1) });
  return res;
}

export async function updateAnswer(qid, aid, patch){
  await ensureAnonAuth();
  const ref = doc(db,"questions",qid,"answers",aid);
  patch.updatedAt = serverTimestamp();
  await updateDoc(ref, patch);
}

export async function deleteAnswer(qid, aid){
  await ensureAnonAuth();
  await deleteDoc(doc(db,"questions",qid,"answers",aid));
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
  const likeRef = doc(db,"questions",qid,"likes",currentUid);
  const snap = await getDoc(likeRef);
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
  const hRef = doc(db,"questions",qid,"answers",aid,"helpful",currentUid);
  const snap = await getDoc(hRef);
  return snap.exists();
}
