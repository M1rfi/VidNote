/**
 * VidNote Frontend v2.1
 * Современный интерфейс и работа через Hugging Face Space.
 */

// ────────────────────────────────────────────────────────────────────────────
// КОНФИГУРАЦИЯ
// ────────────────────────────────────────────────────────────────────────────
const API_BASE = 'https://b33nix-vidnote-backend.hf.space/api/v1';

// ── DOM ──────────────────────────────────────────────────────────────────────
const linkInput = document.getElementById('linkInput');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const fileChip = document.getElementById('fileChip');
const fileChipName = document.getElementById('fileChipName');
const modeBtns = document.querySelectorAll('.mode-btn');
const submitBtn = document.getElementById('submitBtn');
const loadingState = document.getElementById('loadingState');
const loadingText = document.getElementById('loadingText');
const progressBar = document.getElementById('progressBar');
const resultState = document.getElementById('resultState');
const resultContent = document.getElementById('resultContent');
const resultLabel = document.getElementById('resultLabel');
const copyBtn = document.getElementById('copyBtn');
const errorBanner = document.getElementById('errorBanner');
const errorText = document.getElementById('errorText');
const statusDot = document.getElementById('backendStatusDot');
const statusText = document.getElementById('backendStatusText');
const exportPdfBtn = document.getElementById('exportPdf');
const exportWordBtn = document.getElementById('exportWord');

// ── State ─────────────────────────────────────────────────────────────────────
let currentFile = null;
let currentMode = 'brief';
let currentTab = 'url';  // 'url' | 'file'
let isProcessing = false;
let pollTimer = null;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    checkBackend();
    setInterval(checkBackend, 20_000);

    // Inject jsPDF
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(script);
});

async function checkBackend() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${API_BASE.replace('/api/v1', '')}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            statusDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]';
            statusText.textContent = 'Сервер онлайн';
            statusText.className = 'text-emerald-500/80';
        } else {
            throw new Error();
        }
    } catch {
        statusDot.className = 'w-1.5 h-1.5 rounded-full bg-red-500/50';
        statusText.textContent = 'Сервер недоступен';
        statusText.className = 'text-red-400/50';
    }
}

// ── Tab switching ──────────────────────────────────────────────────────────────
window.switchTab = function (tab) {
    currentTab = tab;
    document.getElementById('urlPanel').classList.toggle('hidden', tab !== 'url');
    document.getElementById('filePanel').classList.toggle('hidden', tab !== 'file');
    document.getElementById('tabUrl').classList.toggle('active', tab === 'url');
    document.getElementById('tabFile').classList.toggle('active', tab === 'file');

    // Стили активных табов (Tailwind классы)
    const tabs = ['tabUrl', 'tabFile'];
    tabs.forEach(id => {
        const el = document.getElementById(id);
        if (el.classList.contains('active')) {
            el.classList.add('bg-indigo-600', 'text-white', 'shadow-lg');
            el.classList.remove('text-gray-400', 'hover:bg-white/5');
        } else {
            el.classList.remove('bg-indigo-600', 'text-white', 'shadow-lg');
            el.classList.add('text-gray-400', 'hover:bg-white/5');
        }
    });

    hideError();
};

// Вызываем один раз для инициализации стилей
window.switchTab('url');

// ── Mode selector ──────────────────────────────────────────────────────────────
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
    });
});

// ── File handling ──────────────────────────────────────────────────────────────
if (fileInput) fileInput.addEventListener('change', e => selectFile(e.target.files[0]));

if (dropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
        dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); })
    );
    ['dragenter', 'dragover'].forEach(ev =>
        dropZone.addEventListener(ev, () => dropZone.classList.add('border-indigo-500', 'bg-indigo-500/5'))
    );
    ['dragleave', 'drop'].forEach(ev =>
        dropZone.addEventListener(ev, () => dropZone.classList.remove('border-indigo-500', 'bg-indigo-500/5'))
    );
    dropZone.addEventListener('drop', e => {
        const f = e.dataTransfer.files[0];
        if (f) selectFile(f);
    });
}

function selectFile(f) {
    if (!f) return;
    currentFile = f;
    fileChipName.textContent = f.name;
    fileChip.classList.remove('hidden');
    hideError();
}

window.clearFile = function () {
    currentFile = null;
    if (fileInput) fileInput.value = '';
    fileChip.classList.add('hidden');
};

// ── Submit ─────────────────────────────────────────────────────────────────────
submitBtn.addEventListener('click', async () => {
    if (isProcessing) return;

    const url = linkInput ? linkInput.value.trim() : '';

    if (currentTab === 'url' && !url) {
        showError('Пожалуйста, вставь ссылку на видео'); return;
    }
    if (currentTab === 'file' && !currentFile) {
        showError('Пожалуйста, выбери файл'); return;
    }

    hideError();
    startLoading();

    try {
        const form = new FormData();
        form.append('mode', currentMode);

        if (currentTab === 'file') {
            form.append('file', currentFile);
        } else {
            form.append('url', url);
        }

        const res = await fetch(`${API_BASE}/jobs`, { method: 'POST', body: form });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Ошибка: ${res.status}`);
        }

        const data = await res.json();

        if (data.status === 'done') {
            const jobRes = await fetch(`${API_BASE}/jobs/${data.job_id}`);
            const job = await jobRes.json();
            if (job.result) { showResult(job.result); return; }
        }

        startPolling(data.job_id);

    } catch (err) {
        stopLoading();
        showError(err.message.includes('fetch') ? 'Бэкенд недоступен. Проверь статус сервера внизу.' : err.message);
    }
});

// ── Polling ────────────────────────────────────────────────────────────────────
function startPolling(jobId) {
    let failCount = 0;
    if (pollTimer) clearInterval(pollTimer);

    pollTimer = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/jobs/${jobId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const job = await res.json();
            failCount = 0;

            const statusMap = {
                queued: [10, 'В очереди на обработку...'],
                downloading: [30, 'Загружаем аудио поток...'],
                transcribing: [60, 'Нейросеть распознаёт речь...'],
                summarizing: [85, 'Создаём краткий конспект...'],
            };

            if (statusMap[job.status]) {
                const [pct, txt] = statusMap[job.status];
                setProgress(pct, txt);
            } else if (job.status === 'done') {
                clearInterval(pollTimer);
                showResult(job.result);
            } else if (job.status === 'error') {
                clearInterval(pollTimer);
                stopLoading();
                showError(job.error_msg || 'Ошибка при обработке');
            }
        } catch (e) {
            if (++failCount >= 8) {
                clearInterval(pollTimer);
                stopLoading();
                showError('Потеряно соединение с сервером.');
            }
        }
    }, 3000);
}

// ── Result rendering ───────────────────────────────────────────────────────────
function showResult(data) {
    stopLoading();
    if (!data) { showError('Сервер вернул пустой результат'); return; }

    const labels = { brief: 'Краткое содержание', notes: 'Заметки', theses: 'Ключевые тезисы', timecodes: 'Таймкоды' };
    resultLabel.textContent = labels[currentMode] || currentMode;

    let content = '';

    if (currentMode === 'brief' && Array.isArray(data.brief)) {
        content = data.brief.join('\n\n');
    } else if (currentMode === 'notes' && Array.isArray(data.notes)) {
        content = data.notes.map(n => `[${n.time}] ${n.text}`).join('\n\n');
    } else if (currentMode === 'theses' && Array.isArray(data.theses)) {
        content = data.theses.map(t => `• ${t}`).join('\n');
    } else if (currentMode === 'timecodes' && Array.isArray(data.timecodes)) {
        content = data.timecodes.map(tc => `${tc.time} — ${tc.label}`).join('\n');
    } else {
        content = data.transcript || 'Текст не удалось сгенерировать.';
    }

    resultContent.textContent = content;
    resultState.classList.remove('hidden');
    resultState.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── UI helpers ─────────────────────────────────────────────────────────────────
function startLoading() {
    isProcessing = true;
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    resultState.classList.add('hidden');
    loadingState.classList.remove('hidden');
    setProgress(5, 'Подключение к серверу...');
}

function stopLoading() {
    isProcessing = false;
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    loadingState.classList.add('hidden');
    progressBar.style.width = '0%';
}

function setProgress(pct, txt) {
    progressBar.style.width = `${pct}%`;
    loadingText.textContent = txt;
}

function showError(msg) {
    errorText.textContent = msg;
    errorBanner.classList.remove('hidden');
    errorBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideError() {
    errorBanner.classList.add('hidden');
}

copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(resultContent.textContent);
    const btnSpan = copyBtn.querySelector('span');
    const originalText = btnSpan.textContent;
    btnSpan.textContent = 'СКОПИРОВАНО!';
    setTimeout(() => {
        btnSpan.textContent = originalText;
    }, 2000);
});

exportPdfBtn.addEventListener('click', () => {
    if (!window.jspdf) return alert('Библиотека PDF еще загружается...');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const text = resultContent.textContent;
    const title = resultLabel.textContent;

    doc.setFontSize(16);
    doc.text(title, 10, 20);
    doc.setFontSize(10);

    const splitText = doc.splitTextToSize(text, 180);
    doc.text(splitText, 10, 30);
    doc.save(`vidnote_${title.toLowerCase()}.pdf`);
});

exportWordBtn.addEventListener('click', () => {
    const text = resultContent.textContent;
    const title = resultLabel.textContent;
    const blob = new Blob([text], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vidnote_${title.toLowerCase()}.doc`;
    link.click();
});
