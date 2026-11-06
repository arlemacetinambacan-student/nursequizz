// =========================================================
// Admin Portal Logic — Auth, Grading, Access Management
// =========================================================

let currentToken = sessionStorage.getItem('nurse_admin_token') || sessionStorage.getItem('nurse_teacher_token') || null;
let currentAdmin = null;
let allSubmissions = [];
let allQuestions = [];
let currentEditingSubmission = null;
let temporaryGrades = {};
let toastTimeout = null;

// DOM Elements
const loginSection = document.getElementById('adminLoginSection');
const dashboardSection = document.getElementById('adminDashboardSection');
const sessionNav = document.getElementById('adminSessionNav');
const activeAdminName = document.getElementById('activeAdminName');
const gradingModal = document.getElementById('gradingModal');
const toastNotice = document.getElementById('toastWarning');
const toastMessage = document.getElementById('toastMessage');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  if (currentToken) {
    try {
      const stored = sessionStorage.getItem('nurse_admin_user') || sessionStorage.getItem('nurse_teacher_user');
      currentAdmin = JSON.parse(stored || '{}');
      showDashboardView();
      loadDashboardData();
    } catch (e) {
      handleAdminLogout();
    }
  } else {
    showLoginView();
  }
});

function showToast(msg) {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastMessage.textContent = msg;
  toastNotice.classList.add('show');
  toastTimeout = setTimeout(() => {
    toastNotice.classList.remove('show');
  }, 3000);
}

// ---------------------------------------------------------
// View Switching & Authentication
// ---------------------------------------------------------
function showLoginView() {
  loginSection.style.display = 'block';
  dashboardSection.style.display = 'none';
  if (sessionNav) sessionNav.style.display = 'none';
}

function showDashboardView() {
  loginSection.style.display = 'none';
  dashboardSection.style.display = 'block';
  if (sessionNav) sessionNav.style.display = 'flex';
  if (currentAdmin && currentAdmin.name && activeAdminName) {
    activeAdminName.textContent = `${currentAdmin.name} (${currentAdmin.role || 'Admin'})`;
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  const loginBtn = document.getElementById('loginBtn');

  if (!username || !pin) return;

  try {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Verifying...';

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, pin })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentication failed');

    currentToken = data.token;
    currentAdmin = data.admin || data.teacher;

    sessionStorage.setItem('nurse_admin_token', currentToken);
    sessionStorage.setItem('nurse_admin_user', JSON.stringify(currentAdmin));

    showDashboardView();
    loadDashboardData();
    showToast('Signed in to Admin Dashboard.');
  } catch (err) {
    alert(err.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In to Admin Dashboard →';
  }
}

async function handleAdminLogout() {
  if (currentToken) {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
    } catch (e) {}
  }

  currentToken = null;
  currentAdmin = null;
  sessionStorage.removeItem('nurse_admin_token');
  sessionStorage.removeItem('nurse_admin_user');
  sessionStorage.removeItem('nurse_teacher_token');
  sessionStorage.removeItem('nurse_teacher_user');
  showLoginView();
  showToast('Logged out.');
}

// ---------------------------------------------------------
// Navigation Tabs
// ---------------------------------------------------------
function switchTab(tab) {
  const tabs = ['submissions', 'key'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const content = document.getElementById(`tabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (content) content.style.display = (t === tab) ? 'block' : 'none';
  });

  if (tab === 'key') renderAnswerKeyTab();
}

// ---------------------------------------------------------
// Load Dashboard Data
// ---------------------------------------------------------
async function loadDashboardData() {
  try {
    const res = await fetch('/api/admin/dashboard-data', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (res.status === 401) {
      handleAdminLogout();
      return;
    }

    const data = await res.json();
    allQuestions = data.questions || [];
    allSubmissions = data.submissions || [];

    updateMetricCards();
    populateSectionFilter();
    renderSubmissionsTable(allSubmissions);
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
    showToast('Failed to refresh data.');
  }
}

function updateMetricCards() {
  const total = allSubmissions.length;
  document.getElementById('statTotalSubmissions').textContent = total;

  if (total === 0) {
    document.getElementById('statAverageScore').textContent = '0.0 / 20';
    document.getElementById('statPendingReview').textContent = '0';
    return;
  }

  let totalPointsSum = 0;
  let pendingCount = 0;

  allSubmissions.forEach(s => {
    totalPointsSum += (s.totalScore || 0);
    if (!s.graded) pendingCount++;
  });

  const avg = (totalPointsSum / total).toFixed(1);
  document.getElementById('statAverageScore').textContent = `${avg} / 20`;
  document.getElementById('statPendingReview').textContent = pendingCount;
}

function populateSectionFilter() {
  const select = document.getElementById('sectionFilterSelect');
  if (!select) return;
  const currentVal = select.value;
  const sections = [...new Set(allSubmissions.map(s => s.section).filter(Boolean))].sort();

  select.innerHTML = '<option value="ALL">All Sections</option>';
  sections.forEach(sec => {
    const opt = document.createElement('option');
    opt.value = sec;
    opt.textContent = sec;
    select.appendChild(opt);
  });

  if (sections.includes(currentVal)) {
    select.value = currentVal;
  }
}

// ---------------------------------------------------------
// Render Submissions Table & Filtering
// ---------------------------------------------------------
function filterSubmissions() {
  const search = document.getElementById('studentSearchInput').value.trim().toLowerCase();
  const sectionSelect = document.getElementById('sectionFilterSelect');
  const sectionFilter = sectionSelect ? sectionSelect.value : 'ALL';

  const filtered = allSubmissions.filter(s => {
    const matchesSearch = s.studentName.toLowerCase().includes(search) || s.section.toLowerCase().includes(search);
    const matchesSection = sectionFilter === 'ALL' || s.section === sectionFilter;
    return matchesSearch && matchesSection;
  });

  renderSubmissionsTable(filtered);
}

function renderSubmissionsTable(list) {
  const tbody = document.getElementById('submissionsTableBody');

  if (!list || list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #64748b; padding: 2.5rem;">
          No student submissions found. When students take the quiz, their answers will appear here in real-time.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(s => {
    // Integrity badge
    let integrityPill = '';
    if (s.tabSwitches > 0) {
      integrityPill = `<span class="badge badge-red" title="Examinee switched tabs ${s.tabSwitches} times">⚠️ ${s.tabSwitches} Tab Switch${s.tabSwitches > 1 ? 'es' : ''}</span>`;
    } else {
      integrityPill = `<span class="badge badge-green">✓ Clean (0 switches)</span>`;
    }

    if (s.autoSubmitted) {
      integrityPill += ` <span class="badge badge-info" title="Last item time ran out and the quiz was submitted automatically">⏰ Time Expired</span>`;
    }

    // Status badge
    const statusPill = s.graded 
      ? `<span class="badge badge-green">Finalized</span>` 
      : `<span class="badge" style="background:#fef3c7; color:#92400e; border-color:#fde68a;">Preliminary</span>`;

    return `
      <tr>
        <td>
          <strong style="color: #0f172a; font-size: 0.95rem;">${escapeHTML(s.studentName)}</strong>
          <div style="font-size: 0.75rem; color: #64748b; font-family: monospace;">${escapeHTML(s.id)}</div>
        </td>
        <td><span class="badge badge-info">${escapeHTML(s.section)}</span></td>
        <td>${escapeHTML(s.date || '—')}</td>
        <td>${integrityPill}</td>
        <td>
          <strong style="font-size: 1.05rem; color: #b45309;">${s.totalScore || 0} / 20</strong>
        </td>
        <td>${statusPill}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-primary btn-sm" onclick="openGradingModal('${s.id}')">
            Review & Grade
          </button>
          <button type="button" class="btn btn-secondary btn-sm" style="color: #dc2626;" onclick="deleteSubmission('${s.id}', '${escapeHTML(s.studentName)}')">
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ---------------------------------------------------------
// Grading & Detailed Review Modal
// ---------------------------------------------------------
function openGradingModal(submissionId) {
  const sub = allSubmissions.find(s => s.id === submissionId);
  if (!sub) return;

  currentEditingSubmission = sub;
  temporaryGrades = Object.assign({}, sub.grades || {});

  document.getElementById('gradingStudentName').textContent = sub.studentName;
  document.getElementById('gradingStudentSection').textContent = sub.section;
  document.getElementById('gradingStudentDate').textContent = sub.date;
  
  const tabAlert = sub.tabSwitches > 0 
    ? `<span style="color:#dc2626; font-weight:600;">⚠️ ${sub.tabSwitches} tab switch(es) detected</span>` 
    : `<span style="color:#059669; font-weight:600;">✓ Clean (0 tab switches)</span>`;
  document.getElementById('gradingTabSwitches').innerHTML = tabAlert;

  document.getElementById('gradingTeacherNotes').value = sub.teacherNotes || '';

  renderGradingItems();
  updateModalScoreDisplay();
  gradingModal.classList.add('active');
}

function closeGradingModal() {
  gradingModal.classList.remove('active');
  currentEditingSubmission = null;
  temporaryGrades = {};
}

function getQuestionStateClass(q, score) {
  const maxPts = Number(q.points) || (q.type === 'essay' ? 5 : 1);
  if (score <= 0) return 'incorrect';
  if (score >= maxPts) return 'correct';
  return 'partial';
}

function renderGradingItems() {
  const container = document.getElementById('gradingItemsList');
  container.innerHTML = '';
  const totalItems = allQuestions.length;

  allQuestions.forEach((q, index) => {
    const studentAns = (currentEditingSubmission.answers && currentEditingSubmission.answers[q.id])
      ? String(currentEditingSubmission.answers[q.id]).trim()
      : '';
    const currentScore = (temporaryGrades[q.id] !== undefined) ? Number(temporaryGrades[q.id]) : 0;
    const isEssay = q.type === 'essay';
    const maxPts = Number(q.points) || (isEssay ? 5 : 1);
    const stateClass = getQuestionStateClass(q, currentScore);

    const div = document.createElement('div');
    div.className = `grading-item ${stateClass}${isEssay ? ' essay-item' : ''}`;
    div.id = `grade_item_container_${q.id}`;

    if (isEssay) {
      const scoreButtons = [0, 1, 2, 3, 4, 5].map(pts => {
        let activeClass = '';
        if (currentScore === pts) {
          activeClass = pts === 0 ? 'active-0' : (pts === 5 ? 'active-1' : 'active-partial');
        }
        return `<button type="button" class="score-btn essay-score-btn ${activeClass}" id="btn_score_${pts}_${q.id}" onclick="setQuestionGrade(${q.id}, ${pts})">${pts}</button>`;
      }).join('');

      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
          <span class="question-num">Part II. Essay — ${maxPts} points</span>
          <div class="score-toggle-group" style="flex-wrap: wrap;">
            <span style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-right: 0.25rem;">Essay Score:</span>
            ${scoreButtons}
            <span style="font-size: 0.8rem; color: #64748b;">/ ${maxPts}</span>
          </div>
        </div>

        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 0.55rem 0.75rem; border-radius: 4px; font-size: 0.85rem; color: #92400e; margin-bottom: 0.75rem;">
          <strong>Direction:</strong> ${escapeHTML(q.direction || 'Answer in your own words. Explain clearly and provide a relevant example if possible.')}
        </div>

        <p style="font-size: 0.95rem; color: #1e293b; margin-bottom: 0.65rem; font-weight: 600;">
          ${escapeHTML(q.text)}
        </p>

        <div class="answer-comparison-box" style="grid-template-columns: 1fr;">
          <div>
            <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #64748b;">Student Essay Response:</span>
            <div style="font-size: 0.95rem; font-weight: 500; color: ${studentAns ? '#0f172a' : '#94a3b8'}; margin-top: 0.35rem; white-space: pre-wrap; line-height: 1.55;">
              ${studentAns ? escapeHTML(studentAns) : '<em>(Left Blank)</em>'}
            </div>
          </div>
        </div>
        <p style="font-size: 0.8rem; color: #64748b; margin-top: 0.35rem;">
          Manual review required. Award 0–${maxPts} points based on clarity, relevance, and use of examples.
        </p>
      `;
    } else {
      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span class="question-num">Item ${index + 1} of ${totalItems - 1} (Part I)</span>
          <div class="score-toggle-group">
            <span style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-right: 0.25rem;">Score:</span>
            <button type="button" class="score-btn ${currentScore === 0 ? 'active-0' : ''}" id="btn_score_0_${q.id}" onclick="setQuestionGrade(${q.id}, 0)">
              0 pts
            </button>
            <button type="button" class="score-btn ${currentScore === 1 ? 'active-1' : ''}" id="btn_score_1_${q.id}" onclick="setQuestionGrade(${q.id}, 1)">
              1 pt
            </button>
          </div>
        </div>

        <p style="font-size: 0.95rem; color: #1e293b; margin-bottom: 0.65rem;">
          ${escapeHTML(q.text)}
        </p>

        <div class="answer-comparison-box">
          <div>
            <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #64748b;">Student Answer:</span>
            <div style="font-size: 1rem; font-weight: 600; color: ${studentAns ? '#0f172a' : '#94a3b8'}; margin-top: 0.2rem;">
              ${studentAns ? escapeHTML(studentAns) : '<em>(Left Blank)</em>'}
            </div>
          </div>

          <div>
            <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #64748b;">Correct Answer Key:</span>
            <div style="margin-top: 0.2rem; display: flex; flex-wrap: wrap; gap: 0.35rem;">
              ${(q.acceptedAnswers || []).map((a, i) =>
                `<span class="badge" style="background:${i === 0 ? '#dcfce7' : '#fef3c7'}; color:${i === 0 ? '#166534' : '#92400e'};">${escapeHTML(a)}${i === 0 ? ' ★' : ''}</span>`
              ).join('')}
            </div>
          </div>
        </div>
      `;
    }

    container.appendChild(div);
  });
}

function setQuestionGrade(questionId, score) {
  temporaryGrades[questionId] = score;

  const q = allQuestions.find(item => item.id === questionId);
  const card = document.getElementById(`grade_item_container_${questionId}`);
  if (!q || !card) {
    updateModalScoreDisplay();
    return;
  }

  const isEssay = q.type === 'essay';
  const maxPts = Number(q.points) || (isEssay ? 5 : 1);

  if (isEssay) {
    for (let pts = 0; pts <= maxPts; pts++) {
      const btn = document.getElementById(`btn_score_${pts}_${questionId}`);
      if (!btn) continue;
      let activeClass = '';
      if (score === pts) {
        activeClass = pts === 0 ? 'active-0' : (pts === maxPts ? 'active-1' : 'active-partial');
      }
      btn.className = `score-btn essay-score-btn ${activeClass}`;
    }
  } else {
    const btn0 = document.getElementById(`btn_score_0_${questionId}`);
    const btn1 = document.getElementById(`btn_score_1_${questionId}`);
    if (btn0) btn0.className = `score-btn ${score === 0 ? 'active-0' : ''}`;
    if (btn1) btn1.className = `score-btn ${score === 1 ? 'active-1' : ''}`;
  }

  card.className = `grading-item ${getQuestionStateClass(q, score)}${isEssay ? ' essay-item' : ''}`;
  updateModalScoreDisplay();
}

function updateModalScoreDisplay() {
  let sum = 0;
  Object.keys(temporaryGrades).forEach(qid => {
    sum += Number(temporaryGrades[qid]) || 0;
  });
  const totalPoints = (allQuestions || []).reduce((acc, q) => acc + (Number(q.points) || (q.type === 'essay' ? 5 : 1)), 0) || 20;
  document.getElementById('gradingScoreDisplay').textContent = `${sum} / ${totalPoints}`;
}

// 1-Click Auto-Suggest Match (identification only; essay stays manual)
function autoSuggestAllScores() {
  if (!currentEditingSubmission) return;

  allQuestions.forEach(q => {
    if (q.type === 'essay') return;

    const studentAns = (currentEditingSubmission.answers && currentEditingSubmission.answers[q.id])
      ? normalizeText(currentEditingSubmission.answers[q.id])
      : '';

    const isMatch = (q.acceptedAnswers || []).some(acc => {
      const accNorm = normalizeText(acc);
      return studentAns === accNorm || (accNorm.length > 5 && studentAns.includes(accNorm));
    });

    setQuestionGrade(q.id, (isMatch && studentAns.length > 0) ? 1 : 0);
  });

  showToast('Auto-suggest applied to Part I. Essay still needs manual scoring (0–5).');
}

async function saveGradingResult() {
  if (!currentEditingSubmission) return;

  const notes = document.getElementById('gradingTeacherNotes').value.trim();

  try {
    const res = await fetch(`/api/admin/grade/${currentEditingSubmission.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        grades: temporaryGrades,
        teacherNotes: notes
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save grade');

    showToast('Grade finalized successfully.');
    closeGradingModal();
    loadDashboardData();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteSubmission(id, name) {
  if (!confirm(`Are you sure you want to delete the submission for "${name}"?\n\nThis will allow the student to retake the quiz.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/submissions/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');

    showToast(`Submission for ${name} removed.`);
    loadDashboardData();
  } catch (err) {
    alert(err.message);
  }
}

// ---------------------------------------------------------
// Answer Key Management Tab
// ---------------------------------------------------------
function renderAnswerKeyTab() {
  const container = document.getElementById('answerKeysContainer');
  if (!allQuestions || allQuestions.length === 0) {
    container.innerHTML = '<p style="color:#64748b;">No questions loaded.</p>';
    return;
  }

  container.innerHTML = allQuestions.map((q, idx) => {
    if (q.type === 'essay') {
      return `
        <div class="nurse-card" style="padding: 1.25rem; margin-bottom: 1rem; border-left: 4px solid #f59e0b;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.35rem;">
            <span class="question-num">Part II. Essay (5 points)</span>
            <span class="badge" style="background:#fef3c7; color:#92400e;">Manual grading only</span>
          </div>
          <p style="font-size: 0.85rem; color: #92400e; margin-bottom: 0.5rem;">
            <strong>Direction:</strong> ${escapeHTML(q.direction || 'Answer in your own words.')}
          </p>
          <p style="font-weight: 600; color: #1e293b; margin-bottom: 0.5rem;">${escapeHTML(q.text)}</p>
          <p style="font-size: 0.85rem; color: #64748b;">
            There is no single fixed answer key for the essay. Review each student's explanation and award 0–5 points.
          </p>
        </div>
      `;
    }

    const official = (q.acceptedAnswers && q.acceptedAnswers[0]) ? q.acceptedAnswers[0] : '—';
    return `
      <div class="nurse-card" style="padding: 1.25rem; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <span class="question-num">Item ${idx + 1} — Part I Identification</span>
        </div>
        <p style="font-weight: 500; color: #1e293b; margin-bottom: 0.75rem;">${escapeHTML(q.text)}</p>

        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 0.65rem 1rem; border-radius: var(--radius-md); margin-bottom: 0.75rem;">
          <span style="font-size: 0.75rem; font-weight: 700; color: #166534; text-transform: uppercase;">Official Answer Key:</span>
          <div style="font-size: 1.05rem; font-weight: 700; color: #14532d; margin-top: 0.2rem;">${escapeHTML(official)}</div>
        </div>
        
        <div style="background-color: #fffdf5; border: 1px solid #fde68a; padding: 0.75rem 1rem; border-radius: var(--radius-md);">
          <span style="font-size: 0.8rem; font-weight: 700; color: #92400e; text-transform: uppercase;">Also Accepted (synonyms):</span>
          <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.4rem;" id="key_badges_${q.id}">
            ${(q.acceptedAnswers || []).map((a, i) =>
              `<span class="badge" style="background:${i === 0 ? '#dcfce7' : '#fef3c7'}; color:${i === 0 ? '#166534' : '#92400e'};">${escapeHTML(a)}${i === 0 ? ' ★' : ''}</span>`
            ).join('')}
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
            <input type="text" id="add_synonym_inp_${q.id}" class="form-input" style="padding: 0.4rem 0.75rem; font-size: 0.85rem;" placeholder="Add new accepted synonym variation...">
            <button type="button" class="btn btn-secondary btn-sm" onclick="addKeyVariation(${q.id})">
              + Add Variant
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function addKeyVariation(questionId) {
  const inp = document.getElementById(`add_synonym_inp_${questionId}`);
  const val = inp ? inp.value.trim() : '';
  if (!val) return;

  const q = allQuestions.find(item => item.id === questionId);
  if (!q) return;

  q.acceptedAnswers = q.acceptedAnswers || [];
  if (!q.acceptedAnswers.includes(val)) {
    q.acceptedAnswers.push(val);
  }

  try {
    const res = await fetch('/api/admin/update-answers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        questionId: questionId,
        acceptedAnswers: q.acceptedAnswers
      })
    });

    if (!res.ok) throw new Error('Failed to update answer key');

    showToast(`Added "${val}" to accepted answers for item ${questionId}.`);
    inp.value = '';
    renderAnswerKeyTab();
  } catch (err) {
    alert(err.message);
  }
}

// ---------------------------------------------------------
// CSV Export
// ---------------------------------------------------------
function exportCSV() {
  if (!currentToken) return;
  fetch('/api/admin/export-csv', {
    headers: { 'Authorization': `Bearer ${currentToken}` }
  })
  .then(res => res.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nutrition_Quiz_Submissions_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('Submissions CSV downloaded.');
  })
  .catch(err => {
    console.error('Export error:', err);
    alert('Failed to export CSV: ' + err.message);
  });
}

// Helper Utilities
function normalizeText(str) {
  if (!str) return '';
  return str.toLowerCase().trim().replace(/[\.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').replace(/\s+/g, ' ');
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

