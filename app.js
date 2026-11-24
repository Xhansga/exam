'use strict';
/* =========================================================
   UjianKu – ujian pilihan ganda statis (tanpa server)
   - Mode guru   : URL biasa
   - Mode siswa  : URL dengan #u=<data ujian terkompresi>
   - Pratinjau   : #p=<data ujian> (tidak menyimpan apa pun)
   ========================================================= */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const LET = 'ABCDEFGH';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rid = () => Math.random().toString(36).slice(2, 10);
const show = (el, on = true) => { el.hidden = !on; };

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Tersalin'); }
  catch { toast('Gagal menyalin. Salin manual dari kotak teks.'); }
}

/* ---------- Kodek: JSON -> deflate -> base64url ---------- */
const b64u = {
  enc(bytes) {
    let s = ''; bytes.forEach(b => s += String.fromCharCode(b));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }
};
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
async function encode(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  return b64u.enc(await pipe(raw, new CompressionStream('deflate-raw')));
}
async function decode(str) {
  const raw = await pipe(b64u.dec(str.trim()), new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(raw));
}

/* =========================================================
   ROUTER
   ========================================================= */
window.addEventListener('DOMContentLoaded', () => {
  const m = location.hash.match(/^#([up])=(.+)$/);
  if (m) initStudent(m[2], m[1] === 'p');
  else initTeacher();
});

/* =========================================================
   MODE GURU
   ========================================================= */
const DRAFT_KEY = 'ujianku.draft.v1';
const blankQ = () => ({ text: '', options: ['', '', '', ''], answer: -1 });
const blankDraft = () => ({
  title: '', subject: '', duration: 60, maxViol: 3,
  shuffleQ: true, shuffleO: true, showScore: true, webhook: '',
  questions: [blankQ()]
});
let draft;

function initTeacher() {
  show($('#teacher'));
  try { draft = { ...blankDraft(), ...JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') }; }
  catch { draft = blankDraft(); }
  if (!Array.isArray(draft.questions) || !draft.questions.length) draft.questions = [blankQ()];

  // Tab
  $$('.tabs button').forEach(b => b.addEventListener('click', () => {
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('.tab').forEach(t => show(t, t.id === 'tab-' + b.dataset.tab));
  }));

  // Pengaturan
  $$('[data-s]').forEach(inp => {
    const k = inp.dataset.s;
    if (inp.type === 'checkbox') inp.checked = !!draft[k]; else inp.value = draft[k] ?? '';
    inp.addEventListener('input', () => {
      draft[k] = inp.type === 'checkbox' ? inp.checked
               : inp.type === 'number' ? Math.max(0, Number(inp.value) || 0) : inp.value;
      saveDraft();
    });
  });

  // Daftar soal (delegasi event)
  const box = $('#questions');
  box.addEventListener('input', e => {
    const t = e.target, card = t.closest('.qcard'); if (!card) return;
    const q = draft.questions[+card.dataset.q];
    if (t.dataset.f === 'text') q.text = t.value;
    if (t.dataset.f === 'opt') q.options[+t.dataset.o] = t.value;
    saveDraft();
  });
  box.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.f === 'answer') {
      const card = t.closest('.qcard');
      draft.questions[+card.dataset.q].answer = +t.value;
      $$('.opt', card).forEach((o, i) => o.classList.toggle('right', i === +t.value));
      saveDraft();
    }
  });
  box.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const qi = +btn.closest('.qcard').dataset.q, q = draft.questions[qi];
    switch (btn.dataset.act) {
      case 'del':
        if (draft.questions.length === 1) draft.questions[0] = blankQ();
        else draft.questions.splice(qi, 1);
        break;
      case 'dup': draft.questions.splice(qi + 1, 0, JSON.parse(JSON.stringify(q))); break;
      case 'addopt':
        if (q.options.length >= 6) return toast('Maksimal 6 pilihan');
        q.options.push(''); break;
      case 'delopt': {
        if (q.options.length <= 2) return toast('Minimal 2 pilihan');
        const o = +btn.dataset.o;
        q.options.splice(o, 1);
        if (q.answer === o) q.answer = -1; else if (q.answer > o) q.answer--;
        break;
      }
    }
    saveDraft(); renderQuestions();
  });

  const addQ = () => {
    draft.questions.push(blankQ()); saveDraft(); renderQuestions();
    const cards = $$('.qcard'); cards[cards.length - 1]?.querySelector('textarea').focus();
  };
  $('#btnAddTop').onclick = addQ;
  $('#btnAddBottom').onclick = addQ;

  // Impor teks
  $('#btnImport').onclick = () => $('#importDlg').showModal();
  $('#btnDoImport').onclick = () => {
    const list = parseBulk($('#importText').value);
    if (!list.length) { toast('Tidak ada soal yang terbaca. Periksa format.'); return; }
    const onlyBlank = draft.questions.length === 1 && !draft.questions[0].text.trim();
    draft.questions = onlyBlank ? list : draft.questions.concat(list);
    $('#importText').value = '';
    saveDraft(); renderQuestions(); toast(list.length + ' soal diimpor');
  };

  $('#btnReset').onclick = () => {
    if (!confirm('Hapus seluruh pengaturan dan soal di perangkat ini?')) return;
    draft = blankDraft(); saveDraft(); location.reload();
  };
  $('#btnLink').onclick = buildLink;
  $('#btnCopy').onclick = () => copyText($('#linkOut').value);
  $('#linkOut').addEventListener('focus', e => e.target.select());

  // Hasil
  $('#btnDecode').onclick = decodeResults;
  $('#btnCsv').onclick = exportCsv;

  renderQuestions();
}

function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {} }

function renderQuestions() {
  $('#qcount').textContent = `(${draft.questions.length})`;
  $('#questions').innerHTML = draft.questions.map((q, i) => `
    <article class="qcard" data-q="${i}">
      <div class="qhead">
        <strong>Soal ${i + 1}</strong><span class="spacer"></span>
        <button type="button" data-act="dup">Duplikat</button>
        <button type="button" data-act="del">Hapus</button>
      </div>
      <textarea rows="2" data-f="text" placeholder="Tulis pertanyaan di sini">${esc(q.text)}</textarea>
      <p class="hint">Tandai bulatan di samping pilihan yang benar.</p>
      ${q.options.map((o, j) => `
        <div class="opt ${q.answer === j ? 'right' : ''}">
          <input type="radio" name="ans-${i}" data-f="answer" value="${j}" ${q.answer === j ? 'checked' : ''} aria-label="Jawaban benar ${LET[j]}">
          <span class="letter">${LET[j]}</span>
          <input type="text" data-f="opt" data-o="${j}" value="${esc(o)}" placeholder="Pilihan ${LET[j]}">
          <button type="button" data-act="delopt" data-o="${j}" aria-label="Hapus pilihan ${LET[j]}">×</button>
        </div>`).join('')}
      <button type="button" class="btn ghost" data-act="addopt">Tambah pilihan</button>
    </article>`).join('');
}

/* Parser impor: blok dipisah baris kosong */
function parseBulk(text) {
  const out = [];
  text.replace(/\r/g, '').split(/\n\s*\n/).forEach(block => {
    const q = { text: '', options: [], answer: -1 };
    const stem = []; let key = null;
    block.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      let m;
      if ((m = line.match(/^(?:jawaban|kunci|answer|key)\s*[:=]\s*([A-Ha-h])\b/i))) key = LET.indexOf(m[1].toUpperCase());
      else if ((m = line.match(/^([A-Ha-h])[.)]\s*(.+)$/)) && LET.indexOf(m[1].toUpperCase()) === q.options.length) q.options.push(m[2].trim());
      else if (!q.options.length) stem.push(line.replace(/^\d+[.)]\s*/, ''));
      else q.options[q.options.length - 1] += ' ' + line; // lanjutan baris pilihan
    });
    q.text = stem.join('\n');
    if (q.text && q.options.length >= 2) {
      if (key !== null && key >= 0 && key < q.options.length) q.answer = key;
      out.push(q);
    }
  });
  return out;
}

function validate() {
  const errs = [];
  if (!draft.title.trim()) errs.push('Judul ujian belum diisi.');
  if (!(draft.duration > 0)) errs.push('Durasi harus lebih dari 0 menit.');
  draft.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.text.trim()) errs.push(`Soal ${n}: pertanyaan kosong.`);
    if (q.options.some(o => !o.trim())) errs.push(`Soal ${n}: ada pilihan yang kosong.`);
    if (q.answer < 0) errs.push(`Soal ${n}: jawaban benar belum dipilih.`);
  });
  return errs;
}

async function buildLink() {
  const errs = validate();
  if (errs.length) {
    toast(errs[0] + (errs.length > 1 ? ` (+${errs.length - 1} masalah lain)` : ''));
    const bad = draft.questions.findIndex(q => !q.text.trim() || q.answer < 0 || q.options.some(o => !o.trim()));
    if (bad >= 0) $$('.qcard')[bad]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (typeof CompressionStream === 'undefined') return toast('Browser Anda terlalu lama. Gunakan Chrome, Edge, Firefox, atau Safari terbaru.');
  const exam = {
    id: rid(), title: draft.title.trim(), subject: draft.subject.trim(),
    duration: draft.duration, maxViol: draft.maxViol,
    shuffleQ: draft.shuffleQ, shuffleO: draft.shuffleO, showScore: draft.showScore,
    webhook: draft.webhook.trim(),
    questions: draft.questions.map(q => ({ text: q.text.trim(), options: q.options.map(o => o.trim()), answer: q.answer }))
  };
  const code = await encode(exam);
  const base = location.origin + location.pathname;
  $('#linkOut').value = `${base}#u=${code}`;
  $('#btnPreview').href = `${base}#p=${code}`;
  const len = $('#linkOut').value.length;
  $('#linkInfo').textContent = `Panjang link: ${len.toLocaleString('id-ID')} karakter.` +
    (len > 6000 ? ' Link cukup panjang; sebagian aplikasi chat bisa memotongnya. Bagikan lewat LMS/email, atau pecah menjadi beberapa ujian.' : '');
  show($('#linkBox'));
  $('#linkBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- Rekap hasil ---------- */
let rows = [];
async function decodeResults() {
  const lines = $('#codes').value.split('\n').map(l => l.trim()).filter(Boolean);
  const seen = new Set(); rows = []; let bad = 0;
  for (const line of lines) {
    const code = line.split(/\s+/).pop();
    if (seen.has(code)) continue; seen.add(code);
    try { const r = await decode(code); if (r && r.n !== undefined) rows.push(r); else bad++; } catch { bad++; }
  }
  rows.sort((a, b) => String(a.k).localeCompare(String(b.k)) || String(a.n).localeCompare(String(b.n)));
  const tb = $('#resTable tbody');
  tb.innerHTML = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.n)}</td><td>${esc(r.k)}</td>
    <td><b>${r.s}</b></td><td>${r.c}/${r.tot}</td><td>${r.vi}</td><td>${esc(r.r || 'Selesai normal')}</td>
    <td>${new Date(r.t).toLocaleString('id-ID')}</td></tr>`).join('');
  show($('#resTable'), rows.length > 0);
  $('#btnCsv').disabled = !rows.length;
  const avg = rows.length ? (rows.reduce((a, r) => a + r.s, 0) / rows.length).toFixed(1) : 0;
  $('#resInfo').textContent = rows.length
    ? `${rows.length} siswa • rata-rata ${avg}` + (bad ? ` • ${bad} baris tidak terbaca` : '')
    : (bad ? `${bad} baris tidak terbaca. Pastikan kode utuh.` : 'Belum ada kode.');
}
function exportCsv() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['No', 'Nama', 'Kelas', 'Nilai', 'Benar', 'Total', 'Pelanggaran', 'Keterangan', 'Selesai'];
  const body = rows.map((r, i) => [i + 1, r.n, r.k, r.s, r.c, r.tot, r.vi, r.r || 'Selesai normal', new Date(r.t).toLocaleString('id-ID')].map(q).join(','));
  const blob = new Blob(['\ufeff' + [head.map(q).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'hasil-ujian.csv' });
  a.click(); URL.revokeObjectURL(a.href);
}

/* =========================================================
   MODE SISWA
   ========================================================= */
let EXAM, ST, PREVIEW = false;
let timerId = null, guardOn = false, lastViolation = 0;
const stKey = () => 'ujianku.state.' + EXAM.id;

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function saveState() { if (!PREVIEW) try { localStorage.setItem(stKey(), JSON.stringify(ST)); } catch {} }
function screen(id) { ['s-intro', 's-exam', 's-done', 's-error'].forEach(s => show($('#' + s), s === id)); }

async function initStudent(code, preview) {
  PREVIEW = preview;
  show($('#student'));
  try {
    EXAM = await decode(code);
    if (!EXAM.questions?.length) throw 0;
  } catch {
    screen('s-error'); return;
  }
  document.title = EXAM.title + ' – UjianKu';
  if (!PREVIEW) try { ST = JSON.parse(localStorage.getItem(stKey()) || 'null'); } catch { ST = null; }

  if (ST?.done) return renderDone();
  renderIntro();
}

function renderIntro() {
  screen('s-intro');
  $('#iTitle').textContent = EXAM.title + (PREVIEW ? ' (pratinjau)' : '');
  $('#iSubject').textContent = EXAM.subject || '';
  $('#iFacts').innerHTML = `<div><dt>Jumlah soal</dt><dd>${EXAM.questions.length}</dd></div><div><dt>Waktu</dt><dd>${EXAM.duration} menit</dd></div>`;
  $('#iRuleMax').textContent = EXAM.maxViol > 0
    ? `Setelah ${EXAM.maxViol} pelanggaran, ujian diselesaikan otomatis dan jawaban yang ada dikirim.`
    : 'Setiap pelanggaran dicatat dan dilaporkan ke guru.';
  const resuming = !!(ST && !ST.done);
  if (resuming) {
    $('#iName').value = ST.name; $('#iKelas').value = ST.kelas;
    $('#iName').disabled = $('#iKelas').disabled = true;
    $('#btnStart').textContent = 'Lanjutkan ujian';
    $('#iErr').textContent = 'Ujian Anda sedang berjalan. Melanjutkan setelah memuat ulang dihitung sebagai 1 pelanggaran.';
    show($('#iErr'));
  }
  const ok = !!document.documentElement.requestFullscreen;
  if (!ok) { $('#iErr').textContent = 'Perangkat/browser ini tidak mendukung layar penuh (mis. iPhone). Gunakan laptop atau Chrome di Android.'; show($('#iErr')); }
  const upd = () => {
    $('#btnStart').disabled = !ok || !$('#iAgree').checked || (!resuming && !$('#iName').value.trim());
  };
  ['input', 'change'].forEach(ev => { $('#iName').addEventListener(ev, upd); $('#iAgree').addEventListener(ev, upd); });
  upd();
  $('#btnStart').onclick = () => startExam(resuming);
}

async function enterFullscreen() {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    try { await navigator.keyboard?.lock?.(['Escape']); } catch {}
    return true;
  } catch { toast('Izinkan layar penuh untuk melanjutkan.'); return false; }
}

async function startExam(resuming) {
  if (!(await enterFullscreen())) return;
  const n = EXAM.questions.length;
  if (!resuming) {
    const idx = [...Array(n).keys()];
    ST = {
      name: $('#iName').value.trim(), kelas: $('#iKelas').value.trim(),
      order: EXAM.shuffleQ ? shuffle(idx) : idx,
      optOrder: EXAM.questions.map(q => { const o = q.options.map((_, i) => i); return EXAM.shuffleO ? shuffle(o) : o; }),
      answers: Array(n).fill(-1), flags: Array(n).fill(false),
      start: Date.now(), viol: 0, log: [], cur: 0, done: false
    };
  } else {
    ST.viol++; ST.log.push({ t: Date.now(), r: 'Memuat ulang halaman' });
  }
  saveState();
  screen('s-exam');
  $('#eTitle').textContent = EXAM.title;
  $('#eWho').textContent = `${ST.name}${ST.kelas ? ' • ' + ST.kelas : ''}`;
  startGuard();
  renderExam(); updateViol(); tick();
  timerId = setInterval(tick, 500);
  if (resuming && EXAM.maxViol > 0 && ST.viol >= EXAM.maxViol) finish('Pelanggaran melebihi batas');
}

/* ---------- Render soal ---------- */
function renderExam() {
  const n = EXAM.questions.length, qi = ST.order[ST.cur], q = EXAM.questions[qi];
  $('#qno').textContent = `Soal ${ST.cur + 1} dari ${n}`;
  show($('#qflagtag'), ST.flags[qi]);
  $('#qtext').textContent = q.text;
  $('#qopts').innerHTML = ST.optOrder[qi].map((oi, d) => `
    <button type="button" class="choice ${ST.answers[qi] === oi ? 'sel' : ''}" data-o="${oi}">
      <span class="letter">${LET[d]}</span><span>${esc(q.options[oi])}</span>
    </button>`).join('');
  $('#navGrid').innerHTML = ST.order.map((qj, p) =>
    `<button type="button" class="nb ${ST.answers[qj] >= 0 ? 'answered' : ''} ${ST.flags[qj] ? 'flagged' : ''} ${p === ST.cur ? 'current' : ''}" data-p="${p}">${p + 1}</button>`).join('');
  $('#btnPrev').disabled = ST.cur === 0;
  $('#btnNext').disabled = ST.cur === n - 1;
  $('#btnFlag').textContent = ST.flags[qi] ? 'Hapus tanda ragu-ragu' : 'Tandai ragu-ragu';
}
function go(p) { ST.cur = p; saveState(); renderExam(); }

function bindExamUI() {
  $('#qopts').addEventListener('click', e => {
    const b = e.target.closest('.choice'); if (!b) return;
    const qi = ST.order[ST.cur], o = +b.dataset.o;
    ST.answers[qi] = ST.answers[qi] === o ? -1 : o; // klik lagi = batalkan
    saveState(); renderExam();
  });
  $('#navGrid').addEventListener('click', e => { const b = e.target.closest('.nb'); if (b) go(+b.dataset.p); });
  $('#btnPrev').onclick = () => go(ST.cur - 1);
  $('#btnNext').onclick = () => go(ST.cur + 1);
  $('#btnFlag').onclick = () => { const qi = ST.order[ST.cur]; ST.flags[qi] = !ST.flags[qi]; saveState(); renderExam(); };
  $('#btnFinish').onclick = () => {
    const left = ST.answers.filter(a => a < 0).length, fl = ST.flags.filter(Boolean).length;
    $('#confirmText').textContent =
      (left ? `Masih ada ${left} soal yang belum dijawab. ` : 'Semua soal sudah dijawab. ') +
      (fl ? `${fl} soal masih ditandai ragu-ragu. ` : '') + 'Setelah diselesaikan, jawaban tidak bisa diubah.';
    show($('#confirm'));
  };
  $('#btnCancelFinish').onclick = () => show($('#confirm'), false);
  $('#btnOkFinish').onclick = () => { show($('#confirm'), false); finish(''); };
  $('#btnResume').onclick = async () => { if (await enterFullscreen()) show($('#lock'), false); };
  $('#btnCopyCode').onclick = () => copyText($('#dCode').value);
  $('#dCode').addEventListener('focus', e => e.target.select());
}
document.addEventListener('DOMContentLoaded', bindExamUI);

/* ---------- Timer ---------- */
function tick() {
  const left = ST.start + EXAM.duration * 60000 - Date.now();
  if (left <= 0) { $('#eTimer').textContent = '00:00'; finish('Waktu habis'); return; }
  const s = Math.ceil(left / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), d = s % 60;
  $('#eTimer').textContent = (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(d).padStart(2, '0');
  $('#eTimer').classList.toggle('low', left < 5 * 60000);
}
function updateViol() {
  const c = $('#eViol');
  c.textContent = `Pelanggaran ${ST.viol}${EXAM.maxViol > 0 ? '/' + EXAM.maxViol : ''}`;
  c.classList.toggle('bad', ST.viol > 0);
}

/* =========================================================
   PENJAGA UJIAN (anti-curang sebisa browser)
   ========================================================= */
const BLOCKED = e => {
  const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
  return e.key === 'F12' || e.key === 'F11' || e.key === 'F5' || e.key === 'PrintScreen' ||
    (c && ['t', 'n', 'w', 'r', 'u', 's', 'p', 'l', 'f', 'c', 'v', 'x', 'a', 'tab'].includes(k)) ||
    (c && e.shiftKey && ['i', 'j', 'c', 'n', 't'].includes(k)) ||
    (e.altKey && ['arrowleft', 'arrowright', 'tab', 'f4'].includes(k));
};
const stop = e => e.preventDefault();
const G = {
  fs()   { if (guardOn && !document.fullscreenElement) violate('Anda keluar dari layar penuh.'); },
  vis()  { if (document.hidden) violate('Anda berpindah tab atau jendela.'); },
  blur() { violate('Jendela ujian kehilangan fokus.'); },
  key(e) { if (BLOCKED(e)) { e.preventDefault(); e.stopPropagation(); } },
  pop()  { history.pushState(null, '', location.href); },
  unload(e) { e.preventDefault(); e.returnValue = ''; }
};
function startGuard() {
  if (guardOn) return;
  guardOn = true;
  history.pushState(null, '', location.href);
  document.addEventListener('fullscreenchange', G.fs);
  document.addEventListener('visibilitychange', G.vis);
  window.addEventListener('blur', G.blur);
  window.addEventListener('keydown', G.key, true);
  window.addEventListener('popstate', G.pop);
  window.addEventListener('beforeunload', G.unload);
  ['contextmenu', 'copy', 'cut', 'paste', 'dragstart', 'selectstart'].forEach(ev => document.addEventListener(ev, stop));
}
function stopGuard() {
  guardOn = false;
  document.removeEventListener('fullscreenchange', G.fs);
  document.removeEventListener('visibilitychange', G.vis);
  window.removeEventListener('blur', G.blur);
  window.removeEventListener('keydown', G.key, true);
  window.removeEventListener('popstate', G.pop);
  window.removeEventListener('beforeunload', G.unload);
  ['contextmenu', 'copy', 'cut', 'paste', 'dragstart', 'selectstart'].forEach(ev => document.removeEventListener(ev, stop));
  try { navigator.keyboard?.unlock?.(); } catch {}
}
function showLock(reason) {
  $('#lockReason').textContent = reason + ' Kembali ke layar penuh untuk melanjutkan. Waktu ujian tetap berjalan.';
  const left = EXAM.maxViol > 0 ? EXAM.maxViol - ST.viol : null;
  $('#lockLeft').textContent = left === null ? `Pelanggaran tercatat: ${ST.viol}.` : `Sisa kesempatan sebelum ujian diselesaikan otomatis: ${left}.`;
  show($('#lock'));
}
function violate(reason) {
  if (!guardOn || !ST || ST.done) return;
  const now = Date.now();
  if (now - lastViolation < 1500) { showLock(reason); return; } // beberapa event dari satu kejadian
  lastViolation = now;
  ST.viol++; ST.log.push({ t: now, r: reason }); saveState(); updateViol();
  if (EXAM.maxViol > 0 && ST.viol >= EXAM.maxViol) { finish('Pelanggaran melebihi batas'); return; }
  showLock(reason);
}

/* =========================================================
   SELESAI
   ========================================================= */
async function finish(reason) {
  if (!ST || ST.done) return;
  ST.done = true;
  clearInterval(timerId); stopGuard();
  show($('#lock'), false); show($('#confirm'), false);

  const total = EXAM.questions.length;
  const correct = EXAM.questions.reduce((n, q, i) => n + (ST.answers[i] === q.answer ? 1 : 0), 0);
  const score = Math.round(correct / total * 10000) / 100;
  ST.result = { correct, total, score, reason };
  ST.code = await encode({
    v: 1, i: EXAM.id, n: ST.name, k: ST.kelas, s: score, c: correct, tot: total,
    vi: ST.viol, r: reason, a: ST.answers, t: Date.now(), l: ST.log.map(x => x.r)
  });
  saveState();
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} }
  renderDone();
  sendWebhook();
}

function renderDone() {
  screen('s-done');
  const r = ST.result;
  $('#dWho').textContent = `${ST.name}${ST.kelas ? ' • ' + ST.kelas : ''} • ${EXAM.title}`;
  show($('#dScore'), !!EXAM.showScore);
  if (EXAM.showScore) $('#dScore').innerHTML = `${r.score}<small>${r.correct} benar dari ${r.total} soal</small>`;
  show($('#dReason'), !!r.reason);
  if (r.reason) $('#dReason').textContent = 'Ujian diselesaikan otomatis: ' + r.reason + '.';
  $('#dCode').value = ST.code;
}

async function sendWebhook() {
  if (PREVIEW || !EXAM.webhook) return;
  const note = $('#dSent'); show(note);
  note.textContent = 'Mengirim hasil ke guru…';
  try {
    await fetch(EXAM.webhook, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: ST.code });
    note.textContent = 'Hasil sudah dikirim otomatis ke guru. Simpan juga kode di bawah sebagai cadangan.';
  } catch {
    note.textContent = 'Pengiriman otomatis gagal. Kirim kode di bawah ke guru secara manual.';
  }
}
