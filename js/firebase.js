/* ============================================================
   firebase.js — Firebase backend (Auth + Firestore + Storage)

   Architecture:
   - Anonymous Auth  : silent sign-in, uid scopes all data
   - Firestore       : diary metadata + photo metadata (with Storage URL)
   - Firebase Storage: compressed photo images

   Data paths:
   - users/{uid}/photos/{photoId}   ← photo metadata doc (data = Storage URL)
   - users/{uid}/diaries/{diaryId}  ← diary doc
   - users/{uid}/photos/{photoId}.jpg ← image file in Storage

   Security rules needed in Firebase Console:
   ── Firestore ──
     match /users/{uid}/{document=**} {
       allow read, write: if request.auth != null && request.auth.uid == uid;
     }
   ── Storage ──
     match /users/{uid}/{allPaths=**} {
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

import {
  getStorage, ref,
  uploadString, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

/* ── Config ── */
const firebaseConfig = {
  apiKey:            "AIzaSyAoJ4zAQHm49tUwRNBjiZQGO7x3ZJKDmUA",
  authDomain:        "photo-diary-78efd.firebaseapp.com",
  projectId:         "photo-diary-78efd",
  storageBucket:     "photo-diary-78efd.firebasestorage.app",
  messagingSenderId: "665863116382",
  appId:             "1:665863116382:web:5fa0b96a1f16c9343146cf",
};

/* ── Firebase services ── */
const fbApp   = initializeApp(firebaseConfig);
const auth    = getAuth(fbApp);
const db      = getFirestore(fbApp);
const storage = getStorage(fbApp);

let uid = null;

/* ── Helpers ── */
const col     = (name) => collection(db, 'users', uid, name);
const docRef  = (name, id) => doc(col(name), id);
const imgRef  = (id) => ref(storage, `users/${uid}/photos/${id}.jpg`);

/* ── Photo CRUD ── */

async function getPhotos() {
  const snap = await getDocs(col('photos'));
  return snap.docs.map(d => d.data());
}

async function getPhoto(id) {
  const snap = await getDoc(docRef('photos', id));
  return snap.exists() ? snap.data() : null;
}

/**
 * Uploads compressed base64 image to Storage,
 * replaces photo.data with the permanent download URL,
 * saves metadata to Firestore, and returns the updated photo object.
 */
async function savePhoto(photo) {
  const storageRef = imgRef(photo.id);
  await uploadString(storageRef, photo.data, 'data_url');
  const url = await getDownloadURL(storageRef);

  const saved = { ...photo, data: url };
  await setDoc(docRef('photos', photo.id), saved);
  return saved;
}

async function deletePhoto(id) {
  try { await deleteObject(imgRef(id)); } catch (_) { /* file may not exist */ }
  await deleteDoc(docRef('photos', id));
}

/* ── Diary CRUD ── */

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

/* ── Boot sequence ── */

// Show loading overlay immediately (synchronous, before any await)
const _overlay  = document.getElementById('loading-overlay');
const _loadText = document.getElementById('loading-text');
if (_overlay)  _overlay.classList.remove('hidden');
if (_loadText) _loadText.textContent = 'Firebase에 연결 중...';

try {
  // Silent anonymous sign-in (restores existing session automatically)
  const cred = await signInAnonymously(auth);
  uid = cred.user.uid;

  // Expose the DB interface globally — same API shape as the old db.js
  window.DB = {
    init:        async () => {},   // already initialised
    getPhotos, getPhoto, savePhoto, deletePhoto,
    getDiaries, getDiary, saveDiary, deleteDiary,
  };

  if (_overlay) _overlay.classList.add('hidden');

  // Hand off to the app
  window.App.init();

} catch (err) {
  console.error('Firebase initialisation failed:', err);
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
