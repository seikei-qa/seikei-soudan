const firebaseConfig = {
  apiKey: "AIzaSyByAjXDKu5doIYKDL3uuU0zqMENxhStFWg",
  authDomain: "skinlog-a06a9.firebaseapp.com",
  projectId: "skinlog-a06a9",
  storageBucket: "skinlog-a06a9.firebasestorage.app",
  messagingSenderId: "784247637066",
  appId: "1:784247637066:web:ba77376f09feb60aedd2b3"
};

// Firebase v10 (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
  return (str || "")
    .toLowerCase()
    .split(/\s+/)
    .map(s=>s.trim())
    .filter(Boolean);
}

// AND検索：入力された全トークンが含まれるか
export function andMatch(hay, tokens){
  if(!tokens.length) return true;
  const h = (hay || "").toLowerCase();
  return tokens.every(t => h.includes(t));
}

// 危険ワード：断定・攻撃を減らす（完全防御ではなく“抑止”）
export function containsDanger(text){
  const danger = [
    "詐欺","医療ミス","違法","殺す","死ね","最悪","悪徳","ぼったくり","金返せ",
    "訴える","潰れろ","消えろ","犯罪","逮捕"
  ];
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

// ===== データ構造 =====
// questions (collection)
//  - title, body, category, region, tags[], displayName?, social?, createdAt, ownerUid
// questions/{qid}/answers (subcollection)
//  - body, displayName?, social?, createdAt, ownerUid
// =====================

export async function createQuestion(payload){
  await ensureAnonAuth();
  payload.ownerUid = currentUid;
  payload.createdAt = serverTimestamp();
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
  return addDoc(collection(db,"questions",qid,"answers"), payload);
}
