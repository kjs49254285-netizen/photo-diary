/* ============================================================
   firebase.js — Firebase backend (Auth + Firestore only)

   저장 구조:
   - users/{uid}/photos/{photoId}   ← 사진 메타데이터 + 압축 base64
   - users/{uid}/diaries/{diaryId}  ← 일기 전체 내용

   ※ Firestore 문서 최대 크기: 1MB
      Utils.compressImage가 800px/0.65 quality로 압축 → 평균 50~150KB

   Firebase Console 설정:
   ① Authentication → Sign-in method → 익명 → 사용 설정
   ② Firestore 보안 규칙:
      match /users/{uid}/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
   ============================================================ */

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";

import { getAuth, signInAnonymously }
  from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import {
  getFirestore,
  collection, doc,
  getDocs, getDoc, setDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

/* ── Firebase 설정 ── */
const firebaseConfig = {
  apiKey:            "AIzaSyAoJ4zAQHm49tUwRNBjiZQGO7x3ZJKDmUA",
  authDomain:        "photo-diary-78efd.firebaseapp.com",
  projectId:         "photo-diary-78efd",
  storageBucket:     "photo-diary-78efd.firebasestorage.app",
  messagingSenderId: "665863116382",
  appId:             "1:665863116382:web:5fa0b96a1f16c9343146cf",
};

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

let uid = null;

/* ── Firestore 경로 헬퍼 ── */
const col    = (name)     => collection(db, 'users', uid, name);
const docRef = (name, id) => doc(col(name), id);

/* ── 사진 CRUD ── */

async function getPhotos() {
  const snap = await getDocs(col('photos'));
  return snap.docs.map(d => d.data());
}

async function getPhoto(id) {
  const snap = await getDoc(docRef('photos', id));
  return snap.exists() ? snap.data() : null;
}

/**
 * 압축된 base64 사진을 Firestore에 직접 저장.
 * - 700KB 초과 시 2차 압축으로 Firestore 1MB 제한 회피
 * - 저장 실패 시 사용자가 이해할 수 있는 메시지로 에러를 re-throw
 */
async function savePhoto(photo) {
  let data = photo.data;

  // 700KB 초과 시 2차 압축 (Firestore 1MB 안전 마진)
  if (data.length > 700_000) {
    data = await Utils.compressDataUrl(data, 600, 0.55);
  }

  const saved = { ...photo, data };

  try {
    await setDoc(docRef('photos', photo.id), saved);
  } catch (err) {
    // Firestore 에러를 사용자가 이해할 수 있는 메시지로 변환
    if (err.code === 'permission-denied') {
      throw new Error('Firestore 권한 없음 — Firebase Console에서 보안 규칙을 설정해주세요');
    }
    if (err.code === 'not-found') {
      throw new Error('Firestore 데이터베이스가 없어요 — Firebase Console에서 Firestore를 생성해주세요');
    }
    if (err.code === 'unavailable') {
      throw new Error('인터넷 연결을 확인해주세요');
    }
    throw err;
  }

  return saved;
}

async function deletePhoto(id) {
  await deleteDoc(docRef('photos', id));
}

/* ── 일기 CRUD ── */

async function getDiaries() {
  const snap = await getDocs(col('diaries'));
  return snap.docs.map(d => d.data());
}

async function getDiary(id) {
  const snap = await getDoc(docRef('diaries', id));
  return snap.exists() ? snap.data() : null;
}

async function saveDiary(diary) {
  await setDoc(docRef('diaries', diary.id), diary);
}

async function deleteDiary(id) {
  await deleteDoc(docRef('diaries', id));
}

/* ── 앱 초기화 ── */

const _overlay  = document.getElementById('loading-overlay');
const _loadText = document.getElementById('loading-text');
if (_overlay)  _overlay.classList.remove('hidden');
if (_loadText) _loadText.textContent = 'Firebase에 연결 중...';

try {
  const cred = await signInAnonymously(auth);
  uid = cred.user.uid;

  window.DB = {
    init: async () => {},
    getPhotos, getPhoto, savePhoto, deletePhoto,
    getDiaries, getDiary, saveDiary, deleteDiary,
  };

  if (_overlay) _overlay.classList.add('hidden');
  window.App.init();

} catch (err) {
  console.error('Firebase 초기화 실패:', err);
  if (_overlay) _overlay.classList.add('hidden');

  document.getElementById('app').innerHTML = `
    <div style="
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; height:100dvh;
      font-family:-apple-system,sans-serif; padding:32px; text-align:center; gap:14px;
    ">
      <span style="font-size:44px">⚠️</span>
      <p style="font-size:18px; font-weight:700; color:#2B2B2B;">연결에 실패했어요</p>
      <p style="font-size:14px; color:#767676; line-height:1.6;">
        인터넷 연결을 확인하고<br>아래 버튼을 눌러 다시 시도해주세요
      </p>
      <p style="font-size:12px; color:#CCC;">${err.message}</p>
      <button onclick="location.reload()" style="
        margin-top:8px; padding:13px 28px;
        background:#FF8C69; color:white; border:none; border-radius:12px;
        font-size:15px; font-weight:600; cursor:pointer;
      ">다시 시도</button>
    </div>`;
}
