/* ============================================================
   app.js — Main application logic
   ============================================================ */

const App = (() => {

  /* ── Constants ── */
  const EMOTIONS = [
    { emoji: '😊', label: '기쁨' },
    { emoji: '🥰', label: '사랑' },
    { emoji: '🥹', label: '뿌듯함' },
    { emoji: '🤩', label: '신남' },
    { emoji: '😌', label: '평온' },
    { emoji: '😴', label: '피곤' },
    { emoji: '😢', label: '슬픔' },
    { emoji: '😤', label: '화남' },
    { emoji: '🤗', label: '감사' },
    { emoji: '😅', label: '당황' },
  ];

  const TAB_TITLES = {
    'timeline':   '포토 다이어리',
    'diary-list': '일기장',
    'calendar':   '캘린더',
  };

  /* ── State ── */
  const s = {
    photos:           [],  // all photos from DB
    diaries:          [],  // all diaries from DB
    navStack:         [],  // navigation history (screen name strings)
    currentScreen:    'timeline',
    selectionMode:    false,
    selectionDate:    null,
    selectedPhotoIds: [],
    selectedEmotion:  null,
    editingDiaryId:   null,
    calendarDate:     new Date(),
    selectedCalDate:  null,
  };

  /* ============================================================
     INIT
     ============================================================ */
  async function init() {
    await DB.init();
    s.photos  = await DB.getPhotos();
    s.diaries = await DB.getDiaries();

    setupEmotionSelector();
    renderTimeline();
    renderCalendar();

    s.navStack = ['timeline'];
    checkReminder();
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */

  /** Navigate to a main tab (clears sub-screen stack). */
  function navigate(tab) {
    if (s.selectionMode) exitSelectionMode();

    s.navStack    = [tab];
    s.currentScreen = tab;

    showScreen(tab);
    updateBottomNav(tab);
    setHeader(false, TAB_TITLES[tab], '');

    if (tab === 'diary-list') renderDiaryList();
    if (tab === 'calendar')   renderCalendar();
  }

  /** Push a sub-screen on top of the current screen. */
  function pushScreen(name, title, actionsHTML = '') {
    s.navStack.push(name);
    s.currentScreen = name;

    showScreen(name);
    setHeader(true, title, actionsHTML);
    document.getElementById('bottom-nav').classList.add('hidden');
  }

  function goBack() {
    if (s.navStack.length <= 1) return;
    s.navStack.pop();

    const prev = s.navStack[s.navStack.length - 1];
    s.currentScreen = prev;
    showScreen(prev);

    const isTab = prev in TAB_TITLES;
    setHeader(!isTab || s.navStack.length > 1, TAB_TITLES[prev] || prev, '');

    if (isTab) {
      document.getElementById('bottom-nav').classList.remove('hidden');
      updateBottomNav(prev);
      if (prev === 'diary-list') renderDiaryList();
    }
  }

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const el = document.getElementById('screen-' + name);
    if (el) el.classList.add('active');
  }

  function setHeader(showBack, title, actionsHTML) {
    const backBtn = document.getElementById('btn-back');
    backBtn.classList.toggle('hidden', !showBack);
    document.getElementById('header-title').textContent = title;
    document.getElementById('header-actions').innerHTML = actionsHTML;
  }

  function updateBottomNav(tab) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });
  }

  /* ============================================================
     TIMELINE
     ============================================================ */
  function renderTimeline() {
    const content = document.getElementById('timeline-content');
    const empty   = document.getElementById('timeline-empty');

    if (s.photos.length === 0) {
      content.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    const diaryDates = new Set(s.diaries.map(d => d.date));
    const groups     = Utils.groupByDate(s.photos);

    content.innerHTML = groups.map(({ date, photos }) => {
      const hasDiary      = diaryDates.has(date);
      const sortedPhotos  = [...photos].sort((a, b) => a.importedAt - b.importedAt);
      const isActiveGroup = s.selectionMode && s.selectionDate === date;

      return `
        <div class="timeline-group" data-date="${date}">
          <div class="timeline-date-header">
            <span class="timeline-date-label">${Utils.formatDate(date)}</span>
            ${hasDiary ? '<span class="diary-badge">📖 일기 있음</span>' : ''}
          </div>
          <div class="photo-grid ${s.selectionMode ? 'selection-active' : ''}">
            ${sortedPhotos.map(photo => {
              const isSelected = s.selectedPhotoIds.includes(photo.id);
              const isDimmed   = s.selectionMode && s.selectionDate !== date;
              return `
                <div class="photo-item
                            ${isSelected ? 'selected' : ''}
                            ${isDimmed   ? 'dimmed'   : ''}"
                     data-id="${photo.id}"
                     data-date="${photo.date}"
                     onclick="App.handlePhotoTap('${photo.id}','${photo.date}')">
                  <img src="${photo.data}" alt="" loading="lazy">
                  <div class="photo-check-overlay">
                    <div class="photo-checkbox">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke="white" stroke-width="3"
                              stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');
  }

  function handlePhotoTap(photoId, photoDate) {
    if (!s.selectionMode) {
      enterSelectionMode(photoDate);
      toggleSelect(photoId);
      return;
    }
    if (s.selectionDate !== photoDate) {
      showToast('같은 날짜의 사진만 선택할 수 있어요');
      return;
    }
    toggleSelect(photoId);
  }

  function enterSelectionMode(date) {
    s.selectionMode  = true;
    s.selectionDate  = date;
    document.getElementById('selection-bar').classList.remove('hidden');
    renderTimeline();
  }

  function exitSelectionMode() {
    s.selectionMode    = false;
    s.selectionDate    = null;
    s.selectedPhotoIds = [];
    document.getElementById('selection-bar').classList.add('hidden');
    updateSelectionBar();
    renderTimeline();
  }

  function toggleSelect(photoId) {
    const idx = s.selectedPhotoIds.indexOf(photoId);
    if (idx > -1) {
      s.selectedPhotoIds.splice(idx, 1);
      if (s.selectedPhotoIds.length === 0) {
        exitSelectionMode();
        return;
      }
    } else {
      if (s.selectedPhotoIds.length >= 10) {
        showToast('사진은 최대 10장까지 선택할 수 있어요');
        return;
      }
      s.selectedPhotoIds.push(photoId);
    }
    updateSelectionBar();
    renderTimeline();
  }

  function updateSelectionBar() {
    const n   = s.selectedPhotoIds.length;
    const btn = document.getElementById('btn-write-diary');
    document.getElementById('selection-count').textContent = `${n}장 선택`;
    if (btn) btn.disabled = n === 0;
  }

  /* ============================================================
     PHOTO IMPORT
     ============================================================ */
  function openFilePicker() {
    document.getElementById('file-input').click();
  }

  async function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    // 일기 쓰기 화면에서 사진 추가하는 경우를 감지
    const fromWriteScreen = s.currentScreen === 'diary-write';

    showLoading(`사진 처리 중... (1 / ${files.length})`);
    let done = 0;
    let firstError = null;
    const newIds = [];

    for (const file of files) {
      try {
        // 1단계: 압축
        updateLoadingText(`압축 중... ${done + 1} / ${files.length}`);
        const data = await Utils.compressImage(file);

        const photo = {
          id:         Utils.generateId('photo'),
          data,
          date:       Utils.fileDateStr(file),
          filename:   file.name,
          importedAt: Date.now(),
        };

        // 2단계: Firestore 저장
        updateLoadingText(`저장 중... ${done + 1} / ${files.length}`);
        const saved = await DB.savePhoto(photo);

        s.photos.push(saved);
        newIds.push(saved.id);
        done++;
        updateLoadingText(`완료 ${done} / ${files.length}장`);

      } catch (err) {
        console.error('사진 가져오기 오류:', err);
        if (!firstError) firstError = err;
      }
    }

    hideLoading();
    event.target.value = '';

    if (done === 0) {
      // 전체 실패 — 실제 오류 메시지를 사용자에게 표시
      const detail = firstError
        ? firstError.message
        : '알 수 없는 오류가 발생했어요';
      showToast('❌ 저장 실패: ' + detail);
      return;
    }

    // 일기 쓰기 화면에서 가져온 경우 → 선택 목록에 자동 추가
    if (fromWriteScreen && newIds.length > 0) {
      const slots = 10 - s.selectedPhotoIds.length;
      s.selectedPhotoIds.push(...newIds.slice(0, slots));
      renderWritePhotosStrip();
    }

    renderTimeline();

    const failed = files.length - done;
    if (failed > 0) {
      showToast(`${done}장 저장 완료, ${failed}장 실패`);
    } else {
      showToast(`${done}장의 사진을 가져왔어요 🎉`);
    }
  }

  /* ============================================================
     DIARY WRITE
     ============================================================ */

  /** Called from timeline (photos already selected). */
  function startWriteDiary() {
    if (s.selectedPhotoIds.length === 0) return;
    openWriteScreen();
  }

  /** Called from FAB on diary-list (text-first, no photo pre-selected). */
  function startNewDiary() {
    s.selectedPhotoIds = [];
    s.editingDiaryId   = null;
    openWriteScreen();
  }

  function openWriteScreen() {
    s.editingDiaryId  = s.editingDiaryId || null;
    s.selectedEmotion = s.editingDiaryId
      ? (s.diaries.find(d => d.id === s.editingDiaryId)?.emotion || null)
      : null;

    const diary = s.editingDiaryId ? s.diaries.find(d => d.id === s.editingDiaryId) : null;

    // Set default date
    let defaultDate = Utils.getTodayStr();
    if (s.selectedPhotoIds.length > 0) {
      const ph = s.photos.find(p => p.id === s.selectedPhotoIds[0]);
      if (ph) defaultDate = ph.date;
    } else if (diary) {
      defaultDate = diary.date;
    }

    document.getElementById('write-date').value  = diary ? diary.date  : defaultDate;
    document.getElementById('write-title').value = diary ? diary.title : '';
    document.getElementById('write-body').value  = diary ? diary.body  : '';
    document.getElementById('body-char-count').textContent = diary ? diary.body.length : 0;

    // Emotion
    document.querySelectorAll('.emotion-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.emoji === (diary?.emotion || null));
    });
    s.selectedEmotion = diary?.emotion || null;

    renderWritePhotosStrip();
    pushScreen('diary-write', diary ? '일기 수정' : '일기 쓰기');
  }

  function renderWritePhotosStrip() {
    const strip = document.getElementById('write-photos-strip');
    const pics  = s.selectedPhotoIds
      .map(id => s.photos.find(p => p.id === id))
      .filter(Boolean);

    const thumbsHTML = pics.map(p => `
      <div class="write-photo-thumb">
        <img src="${p.data}" alt="">
        <button type="button" class="write-photo-remove"
                onclick="App.removeWritePhoto('${p.id}')">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.5"
                  stroke-linecap="round"/>
          </svg>
        </button>
      </div>`).join('');

    const addBtn = `
      <div class="write-add-photo" onclick="App.openFilePicker()" title="사진 추가">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2"
                stroke-linecap="round"/>
        </svg>
        <span>사진 추가</span>
      </div>`;

    strip.innerHTML = thumbsHTML + addBtn;
  }

  function removeWritePhoto(photoId) {
    s.selectedPhotoIds = s.selectedPhotoIds.filter(id => id !== photoId);
    renderWritePhotosStrip();
  }

  function setupEmotionSelector() {
    const container = document.getElementById('emotion-selector');
    container.innerHTML = EMOTIONS.map(e => `
      <button type="button" class="emotion-btn" data-emoji="${e.emoji}"
              onclick="App.selectEmotion('${e.emoji}', this)" title="${e.label}">
        <span class="emotion-emoji">${e.emoji}</span>
        <span class="emotion-label">${e.label}</span>
      </button>`).join('');
  }

  function selectEmotion(emoji, btn) {
    s.selectedEmotion = (s.selectedEmotion === emoji) ? null : emoji;
    document.querySelectorAll('.emotion-btn').forEach(b =>
      b.classList.toggle('selected', b.dataset.emoji === s.selectedEmotion)
    );
  }

  function updateCharCount() {
    const len = document.getElementById('write-body').value.length;
    document.getElementById('body-char-count').textContent = len;
  }

  async function handleDiarySubmit(event) {
    event.preventDefault();
    const date  = document.getElementById('write-date').value;
    const title = document.getElementById('write-title').value.trim();
    const body  = document.getElementById('write-body').value.trim();

    if (!date) { showToast('날짜를 선택해주세요'); return; }

    const now = Date.now();
    const existing = s.editingDiaryId
      ? s.diaries.find(d => d.id === s.editingDiaryId)
      : null;

    const diary = {
      id:        existing?.id    || Utils.generateId('diary'),
      date,
      title:     title || '',
      body:      body  || '',
      emotion:   s.selectedEmotion,
      photoIds:  [...s.selectedPhotoIds],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await DB.saveDiary(diary);

    const idx = s.diaries.findIndex(d => d.id === diary.id);
    if (idx > -1) s.diaries[idx] = diary;
    else          s.diaries.push(diary);

    exitSelectionMode();
    renderTimeline();
    renderCalendar();

    showToast(existing ? '일기를 수정했어요 ✏️' : '일기를 저장했어요 ✨');

    // Go to detail — push 'diary-list' as back destination
    s.navStack = ['diary-list'];
    s.currentScreen = 'diary-list';
    viewDiary(diary.id);
  }

  /* ============================================================
     DIARY LIST
     ============================================================ */
  function renderDiaryList() {
    const content = document.getElementById('diary-list-content');
    const empty   = document.getElementById('diary-list-empty');

    if (s.diaries.length === 0) {
      content.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    content.classList.remove('hidden');

    const sorted = [...s.diaries].sort((a, b) => b.date.localeCompare(a.date));

    content.innerHTML = sorted.map((diary, i) => {
      const cover   = diary.photoIds.length > 0
        ? s.photos.find(p => p.id === diary.photoIds[0])
        : null;
      const preview = diary.body
        ? diary.body.slice(0, 70) + (diary.body.length > 70 ? '…' : '')
        : '';

      return `
        <div class="diary-card" style="animation-delay:${i * 0.04}s"
             onclick="App.viewDiary('${diary.id}')">
          ${cover
            ? `<div class="diary-card-photo"><img src="${cover.data}" alt=""></div>`
            : `<div class="diary-card-no-photo">${diary.emotion || '📖'}</div>`
          }
          <div class="diary-card-content">
            <div class="diary-card-date">${Utils.formatDate(diary.date)}</div>
            ${diary.title   ? `<div class="diary-card-title">${diary.title}</div>` : ''}
            ${preview       ? `<div class="diary-card-preview">${preview}</div>`   : ''}
            ${diary.emotion ? `<div class="diary-card-emotion">${diary.emotion}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  /* ============================================================
     DIARY DETAIL
     ============================================================ */
  function viewDiary(diaryId) {
    const diary = s.diaries.find(d => d.id === diaryId);
    if (!diary) return;

    const photos = diary.photoIds
      .map(id => s.photos.find(p => p.id === id))
      .filter(Boolean);

    const inner = document.getElementById('detail-inner');
    inner.innerHTML = `
      ${photos.length > 0 ? `
        <div class="detail-carousel">
          <div class="carousel-track" id="carousel-track">
            ${photos.map(p => `
              <div class="carousel-slide">
                <img src="${p.data}" alt="">
              </div>`).join('')}
          </div>
          ${photos.length > 1 ? `
            <div class="carousel-dots" id="carousel-dots">
              ${photos.map((_, i) =>
                `<span class="carousel-dot ${i === 0 ? 'active' : ''}"></span>`
              ).join('')}
            </div>` : ''}
        </div>` : ''}

      <div class="detail-content">
        <div class="detail-meta">
          <span class="detail-date">${Utils.formatDate(diary.date)}</span>
          ${diary.emotion ? `<span class="detail-emotion">${diary.emotion}</span>` : ''}
        </div>
        ${diary.title ? `<h2 class="detail-title">${diary.title}</h2>` : ''}
        ${diary.body
          ? `<p class="detail-body">${diary.body.replace(/\n/g, '<br>')}</p>`
          : `<p class="detail-no-body">내용이 없어요</p>`}

        <div class="detail-actions">
          <button class="detail-action-btn" onclick="App.editDiary('${diary.id}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                    stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                    stroke="currentColor" stroke-width="1.8"/>
            </svg>
            수정
          </button>
          <button class="detail-action-btn" onclick="App.shareDiary('${diary.id}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="1.8"/>
              <circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
              <circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="1.8"/>
              <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"
                    stroke="currentColor" stroke-width="1.8"/>
            </svg>
            공유
          </button>
          <button class="detail-action-btn danger" onclick="App.deleteDiary('${diary.id}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M19 6l-1 14H6L5 6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"
                    stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            삭제
          </button>
        </div>
      </div>`;

    if (photos.length > 1) setupCarousel();

    pushScreen('diary-detail', '일기 보기');
  }

  function setupCarousel() {
    const track = document.getElementById('carousel-track');
    if (!track) return;

    let startX  = 0;
    let current = 0;
    const slides = track.querySelectorAll('.carousel-slide');
    const dots   = document.querySelectorAll('#carousel-dots .carousel-dot');

    function goTo(idx) {
      current = Math.max(0, Math.min(idx, slides.length - 1));
      track.style.transform = `translateX(-${current * 100}%)`;
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
    }

    track.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
    }, { passive: true });

    track.addEventListener('touchend', e => {
      const dx = startX - e.changedTouches[0].clientX;
      if (Math.abs(dx) > 50) goTo(current + (dx > 0 ? 1 : -1));
    });
  }

  function editDiary(diaryId) {
    const diary = s.diaries.find(d => d.id === diaryId);
    if (!diary) return;

    s.editingDiaryId   = diaryId;
    s.selectedPhotoIds = [...diary.photoIds];
    s.selectedEmotion  = diary.emotion;

    openWriteScreen();
  }

  async function deleteDiary(diaryId) {
    showConfirm('이 일기를 삭제할까요?', async () => {
      await DB.deleteDiary(diaryId);
      s.diaries = s.diaries.filter(d => d.id !== diaryId);
      renderTimeline();
      renderCalendar();
      goBack();
      showToast('일기를 삭제했어요');
    });
  }

  function shareDiary(diaryId) {
    const diary  = s.diaries.find(d => d.id === diaryId);
    if (!diary) return;

    const photos = diary.photoIds
      .map(id => s.photos.find(p => p.id === id))
      .filter(Boolean);

    const html  = Utils.buildShareHTML(diary, photos);
    const blob  = new Blob([html], { type: 'text/html' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href      = url;
    a.download  = `일기-${diary.date}.html`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('일기 파일을 저장했어요. 파일을 공유해보세요 📤');
  }

  /* ============================================================
     CALENDAR
     ============================================================ */
  function renderCalendar() {
    const d     = s.calendarDate;
    const year  = d.getFullYear();
    const month = d.getMonth();

    document.getElementById('calendar-month-label').textContent =
      `${year}년 ${month + 1}월`;

    const diaryDates = new Set(s.diaries.map(d => d.date));
    const today      = Utils.getTodayStr();
    const firstDow   = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let cells = '';

    for (let i = 0; i < firstDow; i++) {
      cells += '<div class="calendar-cell empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const ds       = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const isToday  = ds === today;
      const isSel    = ds === s.selectedCalDate;
      const hasDiary = diaryDates.has(ds);

      cells += `
        <div class="calendar-cell
                    ${isToday  ? 'today'    : ''}
                    ${isSel    ? 'selected' : ''}
                    ${hasDiary ? 'has-diary': ''}"
             onclick="App.selectCalDate('${ds}')">
          <span class="calendar-day">${day}</span>
          ${hasDiary ? '<span class="calendar-dot"></span>' : ''}
        </div>`;
    }

    document.getElementById('calendar-grid').innerHTML = cells;

    if (s.selectedCalDate) renderCalDiaryPreview(s.selectedCalDate);
  }

  function calendarPrevMonth() {
    const d = s.calendarDate;
    s.calendarDate    = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    s.selectedCalDate = null;
    document.getElementById('calendar-diary-preview').innerHTML = '';
    renderCalendar();
  }

  function calendarNextMonth() {
    const d = s.calendarDate;
    s.calendarDate    = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    s.selectedCalDate = null;
    document.getElementById('calendar-diary-preview').innerHTML = '';
    renderCalendar();
  }

  function selectCalDate(dateStr) {
    s.selectedCalDate = dateStr;
    renderCalendar();
    renderCalDiaryPreview(dateStr);
  }

  function renderCalDiaryPreview(dateStr) {
    const preview  = document.getElementById('calendar-diary-preview');
    const diaries  = s.diaries.filter(d => d.date === dateStr);

    if (diaries.length === 0) {
      preview.innerHTML = `
        <div class="calendar-no-diary">
          <strong>${Utils.formatDateShort(dateStr)}</strong>
          <p>작성된 일기가 없어요</p>
        </div>`;
      return;
    }

    preview.innerHTML = diaries.map(diary => {
      const cover   = diary.photoIds.length > 0
        ? s.photos.find(p => p.id === diary.photoIds[0])
        : null;
      const preview = diary.body
        ? diary.body.slice(0, 70) + (diary.body.length > 70 ? '…' : '')
        : '';

      return `
        <div class="diary-card" onclick="App.viewDiaryFrom('${diary.id}','calendar')">
          ${cover
            ? `<div class="diary-card-photo"><img src="${cover.data}" alt=""></div>`
            : `<div class="diary-card-no-photo">${diary.emotion || '📖'}</div>`
          }
          <div class="diary-card-content">
            <div class="diary-card-date">${Utils.formatDate(diary.date)}</div>
            ${diary.title   ? `<div class="diary-card-title">${diary.title}</div>` : ''}
            ${preview       ? `<div class="diary-card-preview">${preview}</div>`   : ''}
            ${diary.emotion ? `<div class="diary-card-emotion">${diary.emotion}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  /** View diary while keeping `fromTab` in back history. */
  function viewDiaryFrom(diaryId, fromTab) {
    s.navStack      = [fromTab];
    s.currentScreen = fromTab;
    viewDiary(diaryId);
  }

  /* ============================================================
     REMINDER
     ============================================================ */
  function checkReminder() {
    const now       = new Date();
    const todayStr  = Utils.getTodayStr();
    const hasDiary  = s.diaries.some(d => d.date === todayStr);
    const lastShown = localStorage.getItem('reminder_date');

    if (now.getHours() >= 20 && !hasDiary && lastShown !== todayStr) {
      const todayPhotos = s.photos.filter(p => p.date === todayStr).length;
      setTimeout(() => {
        const msg = todayPhotos > 0
          ? `오늘 ${todayPhotos}장의 사진이 있어요. 일기를 남겨볼까요? 📝`
          : '오늘 하루는 어땠나요? 일기를 써보세요 📝';
        showToast(msg);
        localStorage.setItem('reminder_date', todayStr);
      }, 1500);
    }
  }

  /* ============================================================
     UI HELPERS
     ============================================================ */
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  let _modalCb = null;
  function showConfirm(msg, onConfirm) {
    document.getElementById('modal-message').textContent = msg;
    document.getElementById('modal-overlay').classList.remove('hidden');
    _modalCb = onConfirm;
    document.getElementById('modal-confirm-btn').onclick = () => {
      closeModal();
      if (_modalCb) _modalCb();
    };
  }
  function cancelModal() { closeModal(); }
  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    _modalCb = null;
  }
  function closeModalOutside(e) {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  }

  function showLoading(text) {
    document.getElementById('loading-text').textContent = text || '처리 중...';
    document.getElementById('loading-overlay').classList.remove('hidden');
  }
  function updateLoadingText(text) {
    document.getElementById('loading-text').textContent = text;
  }
  function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  return {
    init,
    navigate, goBack,
    openFilePicker, handleFileSelect,
    handlePhotoTap, exitSelectionMode,
    startWriteDiary, startNewDiary,
    removeWritePhoto, selectEmotion, updateCharCount, handleDiarySubmit,
    viewDiary, viewDiaryFrom, editDiary, deleteDiary, shareDiary,
    calendarPrevMonth, calendarNextMonth, selectCalDate,
    showToast, showConfirm, cancelModal, closeModal, closeModalOutside,
  };

})();

/* ── Expose to module scope ── */
window.App = App;

/*
 * 폴백 시작 로직
 * - firebase.js 모듈이 정상 로드되면 window._startApp()을 즉시 호출
 * - firebase.js 모듈이 완전히 실패(로드 자체 불가)하면
 *   DOMContentLoaded + 2초 후 IndexedDB(db.js)로 자동 폴백
 */
window._startApp = function () {
  if (window._appStarted) return;
  window._appStarted = true;
  App.init();
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (!window._appStarted) {
      // Firebase 모듈이 응답 없음 → IndexedDB로 폴백
      window.DB = window._indexedDB; // db.js가 설정한 IndexedDB 인터페이스
      window._startApp();
    }
  }, 2500);
});
