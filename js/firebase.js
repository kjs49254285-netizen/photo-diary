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

  // Firebase DB로 window.DB를 교체
  window.DB = {
    init: async () => {},
    getPhotos, getPhoto, savePhoto, deletePhoto,
    getDiaries, getDiary, saveDiary, deleteDiary,
  };

  if (_overlay) _overlay.classList.add('hidden');
  // Firebase 연결 성공 → Firebase DB로 앱 시작
  window._startApp();

} catch (err) {
  console.warn('Firebase 연결 실패, 로컬 저장소로 전환합니다:', err.message);
  if (_overlay) _overlay.classList.add('hidden');

  // window.DB는 이미 db.js(IndexedDB)로 설정되어 있음 → 그대로 사용
  // 사용자에게 안내 후 앱 시작
  setTimeout(() => {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = '⚠️ Firebase 미연결 — 데이터가 이 기기에만 저장됩니다';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 4000);
    }
  }, 500);

  window._startApp();
}
