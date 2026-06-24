// ── SafeCheck AI — main.js (Google Gemini Vision) ───────────────────────────
// Gemini 1.5 Flash is FREE — get your key at https://aistudio.google.com/app/apikey

const API_KEY   = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  b64s:      [null, null, null],
  mimes:     [null, null, null],
  names:     [null, null, null],
  sizes:     [null, null, null],
  analyzing: false,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const analyzeBtn = document.getElementById('analyzeBtn');
const resultArea = document.getElementById('resultArea');
const errorBox   = document.getElementById('errorBox');
const errorMsg   = document.getElementById('errorMsg');

// ── Tab switching (called from HTML onclick) ──────────────────────────────────
window.setTab = function (i) {
  [0, 1, 2].forEach(t => {
    document.getElementById('tab' + t).style.display = t === i ? '' : 'none';
    document.getElementById('sc'  + t).classList.toggle('active', t === i);
  });
};

// ── File inputs ───────────────────────────────────────────────────────────────
function attachInput(idx) {
  const inp  = document.getElementById('inp' + idx);
  const zone = document.getElementById('uz'  + idx);
  const rem  = document.getElementById('rem' + idx);

  inp.addEventListener('change', () => {
    if (inp.files[0]) loadFile(idx, inp.files[0]);
  });

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) loadFile(idx, f);
  });

  rem.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    removeFile(idx);
  });
}

function loadFile(idx, file) {
  const reader = new FileReader();
  reader.onload = e => {
    const src = e.target.result;
    state.b64s[idx]  = src.split(',')[1];
    state.mimes[idx] = file.type;
    state.names[idx] = file.name;
    state.sizes[idx] = file.size;

    // Show preview
    document.getElementById('up'    + idx).style.display = 'none';
    document.getElementById('uprev' + idx).style.display = '';
    document.getElementById('uimg'  + idx).src            = src;
    document.getElementById('uname' + idx).textContent    = file.name;
    document.getElementById('usize' + idx).textContent    = fmtSize(file.size);

    // Update step card
    const ss = document.getElementById('ss' + idx);
    ss.textContent = 'Ready';
    document.getElementById('sc' + idx).classList.add('done');

    updateBtn();
    if (idx < 2) setTab(idx + 1);
  };
  reader.readAsDataURL(file);
}

function removeFile(idx) {
  state.b64s[idx] = state.mimes[idx] = state.names[idx] = state.sizes[idx] = null;
  document.getElementById('inp'   + idx).value           = '';
  document.getElementById('up'    + idx).style.display   = '';
  document.getElementById('uprev' + idx).style.display   = 'none';
  document.getElementById('ss'    + idx).textContent     = 'Waiting';
  document.getElementById('sc'    + idx).classList.remove('done');
  updateBtn();
}

function fmtSize(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Button state ──────────────────────────────────────────────────────────────
function updateBtn() {
  const n = state.b64s.filter(Boolean).length;
  analyzeBtn.disabled = n === 0 || state.analyzing;
  const idle = analyzeBtn.querySelector('.btn-idle');
  if (n === 0) {
    idle.innerHTML = '<i class="ti ti-shield-search"></i> Upload at least one image to start';
  } else if (n < 3) {
    idle.innerHTML = `<i class="ti ti-shield-search"></i> Analyze (${n} of 3 images uploaded)`;
  } else {
    idle.innerHTML = '<i class="ti ti-shield-search"></i> Analyze product safety';
  }
}

// ── Analysis ──────────────────────────────────────────────────────────────────
analyzeBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (state.analyzing) return;

  if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
    showError(
      'No API key set. Open the .env file and add your Gemini API key as VITE_GEMINI_API_KEY. ' +
      'Get a free key at https://aistudio.google.com/app/apikey'
    );
    return;
  }

  state.analyzing = true;
  analyzeBtn.disabled = true;
  analyzeBtn.querySelector('.btn-idle').style.display    = 'none';
  analyzeBtn.querySelector('.btn-loading').style.display = 'flex';
  hideError();
  resultArea.style.display = 'none';

  // Build Gemini parts array
  const labels = ['Ingredients label', 'Expiry date', 'Product visual condition'];
  const parts  = [];

  state.b64s.forEach((b64, i) => {
    if (!b64) return;
    parts.push({ inline_data: { mime_type: state.mimes[i], data: b64 } });
    parts.push({ text: `Image ${i + 1}: ${labels[i]}` });
  });

  const today = new Date().toLocaleDateString('en-GB');

  parts.push({
    text: `Today's date is ${today}.

You are SafeCheck AI — a product safety analyzer. Analyze the provided product image(s) and return ONLY a valid JSON object with no markdown fences, no extra explanation, no preamble. Use exactly this structure:

{
  "verdict": "SAFE" | "UNSAFE" | "CAUTION",
  "overall_score": <integer 0-100>,
  "ingredients": {
    "status": "PASS" | "FAIL" | "CAUTION" | "NOT_PROVIDED",
    "score": <integer 0-100>,
    "flagged": ["ingredient1", "ingredient2"],
    "notes": "<brief plain-English explanation>"
  },
  "expiry": {
    "status": "PASS" | "FAIL" | "CAUTION" | "NOT_PROVIDED",
    "detected_date": "<date string or null>",
    "notes": "<brief plain-English explanation>"
  },
  "visual": {
    "status": "PASS" | "FAIL" | "CAUTION" | "NOT_PROVIDED",
    "score": <integer 0-100>,
    "notes": "<brief plain-English explanation>"
  },
  "summary": "<2-3 sentence plain-language safety explanation>",
  "recommendations": ["<action 1>", "<action 2>"]
}

Rules:
- verdict = UNSAFE if any component is FAIL
- verdict = CAUTION if any component is CAUTION and none are FAIL
- verdict = SAFE only if all analyzed components are PASS
- Skip NOT_PROVIDED components from the overall verdict
- overall_score: 0 = completely unsafe, 100 = fully safe
- flagged: list specific ingredient names that are high-risk additives, allergens, or banned substances
- Keep notes concise (1-2 sentences each)
- Always return valid JSON only`
  });

  try {
    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature:     0.2,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const msg = err.error?.message || `Gemini API error ${resp.status}`;
      throw new Error(msg);
    }

    const data = await resp.json();

    // Extract text from Gemini response
    const raw   = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/gi, '').trim();

    if (!clean) throw new Error('Empty response from Gemini. Please try again.');

    const result = JSON.parse(clean);
    showResult(result);

  } catch (err) {
    if (err instanceof SyntaxError) {
      showError('Could not parse the AI response. Please try again.');
    } else {
      showError('Analysis failed: ' + err.message);
    }
  }

  state.analyzing = false;
  analyzeBtn.disabled = false;
  analyzeBtn.querySelector('.btn-idle').style.display    = 'flex';
  analyzeBtn.querySelector('.btn-loading').style.display = 'none';
  updateBtn();
}

// ── Render result ─────────────────────────────────────────────────────────────
function showResult(r) {
  const verdict = (r.verdict || 'CAUTION').toUpperCase();
  const cls     = verdict === 'SAFE' ? 'safe' : verdict === 'UNSAFE' ? 'unsafe' : 'caution';
  const icon    = verdict === 'SAFE' ? 'ti-shield-check' : verdict === 'UNSAFE' ? 'ti-shield-x' : 'ti-shield-half';
  const label   = verdict === 'SAFE'   ? '✓ Safe to use'
                : verdict === 'UNSAFE' ? '✗ Unsafe — do not use'
                :                        '⚠ Use with caution';
  const score   = Math.min(100, Math.max(0, r.overall_score ?? 50));
  const color   = verdict === 'SAFE' ? '#1E7E4A' : verdict === 'UNSAFE' ? '#C5221F' : '#A05C0A';

  // Header
  document.getElementById('resultIconWrap').className    = 'result-icon-wrap ' + cls;
  const iconEl = document.getElementById('resultMainIcon');
  iconEl.className = `ti ${icon} result-main-icon ${cls}`;
  document.getElementById('resultVerdict').textContent   = label;
  document.getElementById('resultVerdict').className     = 'result-verdict ' + cls;
  document.getElementById('resultSummary').textContent   = r.summary || '';

  // Score ring
  const circumference = 175.9;
  const fill = document.getElementById('scoreFill');
  fill.style.stroke           = color;
  fill.style.strokeDashoffset = circumference - (score / 100) * circumference;
  document.getElementById('scoreNumber').textContent = score;

  // Breakdown cards
  renderBreakdown('ingredients', r.ingredients);
  renderBreakdown('expiry',      r.expiry);
  renderBreakdown('visual',      r.visual);

  // Recommendations
  const recsBox  = document.getElementById('recsBox');
  const recsList = document.getElementById('recsList');
  if (r.recommendations?.length > 0) {
    recsList.innerHTML    = r.recommendations.map(rec => `<li>${esc(rec)}</li>`).join('');
    recsBox.style.display = '';
  } else {
    recsBox.style.display = 'none';
  }

  resultArea.style.display = '';
  resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderBreakdown(key, data) {
  const badgeEl = document.getElementById('bb-' + key);
  const notesEl = document.getElementById('bn-' + key);
  const card    = document.getElementById('bc-' + key);

  if (!data || data.status === 'NOT_PROVIDED') {
    badgeEl.textContent = 'Not provided';
    badgeEl.className   = 'bc-badge na';
    notesEl.textContent = 'No image was provided for this check.';
    card.style.opacity  = '0.5';
    if (key === 'ingredients') document.getElementById('fl-ingredients').innerHTML = '';
    return;
  }

  card.style.opacity = '1';
  const s   = (data.status || '').toUpperCase();
  const cls = s === 'PASS' ? 'pass' : s === 'FAIL' ? 'fail' : 'caution';
  const lbl = s === 'PASS' ? '✓ Pass' : s === 'FAIL' ? '✗ Fail' : '⚠ Caution';
  badgeEl.textContent = lbl;
  badgeEl.className   = 'bc-badge ' + cls;
  notesEl.textContent = data.notes || '';

  if (key === 'ingredients') {
    const fl = document.getElementById('fl-ingredients');
    fl.innerHTML = data.flagged?.length > 0
      ? data.flagged.map(f => `<span class="flag-tag">${esc(f)}</span>`).join('')
      : '';
  }
}

// ── Reset ─────────────────────────────────────────────────────────────────────
document.getElementById('resetBtn').addEventListener('click', () => {
  [0, 1, 2].forEach(removeFile);
  resultArea.style.display = 'none';
  hideError();
  setTab(0);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function showError(msg) { errorMsg.textContent = msg; errorBox.style.display = 'flex'; }
function hideError()    { errorBox.style.display = 'none'; }
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
[0, 1, 2].forEach(attachInput);
updateBtn();
