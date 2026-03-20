/* ============================================================
   utils.js — Date helpers, image compression
   ============================================================ */

const Utils = (() => {

  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

  /* ── ID generation ── */
  function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /* ── Date helpers ── */

  /** Date → 'YYYY-MM-DD' */
  function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** 'YYYY-MM-DD' → '2026년 3월 20일 금요일' */
  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return `${y}년 ${m}월 ${d}일 ${DAY_NAMES[dow]}요일`;
  }

  /** 'YYYY-MM-DD' → '3월 20일' (short) */
  function formatDateShort(dateStr) {
    const [, m, d] = dateStr.split('-').map(Number);
    return `${m}월 ${d}일`;
  }

  function getTodayStr() {
    return toDateStr(new Date());
  }

  /** File.lastModified → 'YYYY-MM-DD' */
  function fileDateStr(file) {
    return toDateStr(new Date(file.lastModified));
  }

  /* ── Photo grouping ── */

  /** [{date, ...}] → [{date, photos:[]}] sorted newest first */
  function groupByDate(photos) {
    const map = {};
    photos.forEach(p => {
      if (!map[p.date]) map[p.date] = [];
      map[p.date].push(p);
    });
    return Object.keys(map)
      .sort((a, b) => b.localeCompare(a))
      .map(date => ({ date, photos: map[date] }));
  }

  /* ── Image compression ── */

  /**
   * Compress a File to a base64 JPEG string.
   * Firestore 1MB 제한 대응: 기본값 800px / quality 0.65
   * @param {File}   file
   * @param {number} maxWidth  default 800px
   * @param {number} quality   default 0.65
   * @returns {Promise<string>} data URL
   */
  function compressImage(file, maxWidth = 800, quality = 0.65) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = reject;
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;

          if (width > maxWidth) {
            height = Math.round((maxWidth / width) * height);
            width  = maxWidth;
          }

          const canvas = document.createElement('canvas');
          canvas.width  = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * 이미 압축된 data URL을 추가 압축 (Firestore 1MB 초과 방지용).
   * @param {string} dataUrl  기존 base64 data URL
   * @param {number} maxWidth
   * @param {number} quality
   * @returns {Promise<string>}
   */
  function compressDataUrl(dataUrl, maxWidth = 600, quality = 0.55) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((maxWidth / width) * height);
          width  = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  }

  /* ── Share HTML generator ── */
  function buildShareHTML(diary, photos) {
    const dateLabel = formatDate(diary.date);
    const photosHTML = photos.map(p =>
      `<img src="${p.data}" style="width:100%;max-width:580px;border-radius:14px;margin:8px auto;display:block">`
    ).join('');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(diary.title || dateLabel)}</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR',sans-serif;background:#FFF9F5;margin:0;padding:0}
    .wrap{max-width:620px;margin:0 auto;padding:24px 16px 64px}
    .hd{text-align:center;padding:32px 0 24px;border-bottom:1px solid #F0E8E0;margin-bottom:24px}
    .dt{color:#FF8C69;font-size:14px;margin-bottom:8px}
    .ttl{font-size:26px;font-weight:800;color:#2B2B2B;margin:0}
    .emo{font-size:36px;margin-top:12px}
    .body{font-size:16px;line-height:1.85;color:#444;white-space:pre-wrap;margin-top:24px}
    .ft{text-align:center;margin-top:48px;color:#CCC;font-size:12px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hd">
      <div class="dt">${dateLabel}</div>
      <h1 class="ttl">${escapeHtml(diary.title || '오늘의 일기')}</h1>
      ${diary.emotion ? `<div class="emo">${diary.emotion}</div>` : ''}
    </div>
    ${photosHTML}
    ${diary.body ? `<p class="body">${escapeHtml(diary.body)}</p>` : ''}
    <p class="ft">포토 다이어리로 작성된 일기입니다</p>
  </div>
</body>
</html>`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Public API ── */
  return {
    generateId,
    toDateStr,
    formatDate,
    formatDateShort,
    getTodayStr,
    fileDateStr,
    groupByDate,
    compressImage,
    compressDataUrl,
    buildShareHTML,
  };
})();
