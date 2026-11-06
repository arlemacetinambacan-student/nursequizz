// =========================================================
// Teacher Portal Logic — Auth, Grading, Access Management
// =========================================================

let currentToken = sessionStorage.getItem('nurse_teacher_token') || null;
let currentTeacher = null;
let allSubmissions = [];
let allQuestions = [];
let currentEditingSubmission = null;
let temporaryGrades = {};
let toastTimeout = null;

// DOM Elements
const loginSection = document.getElementById('teacherLoginSection');
const dashboardSection = document.getElementById('teacherDashboardSection');
const sessionNav = document.getElementById('teacherSessionNav');
const activeTeacherName = document.getElementById('activeTeacherName');
const gradingModal = document.getElementById('gradingModal');
const toastNotice = document.getElementById('toastWarning');
const toastMessage = document.getElementById('toastMessage');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  if (currentToken) {
    try {
      currentTeacher = JSON.parse(sessionStorage.getItem('nurse_teacher_user') || '{}');
      showDashboardView();
      loadDashboardData();
      loadTeacherList();
    } catch (e) {
      handleTeacherLogout();
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
  sessionNav.style.display = 'none';
}

function showDashboardView() {
  loginSection.style.display = 'none';
  dashboardSection.style.display = 'block';
  sessionNav.style.display = 'flex';
  if (currentTeacher && currentTeacher.name) {
    activeTeacherName.textContent = `${currentTeacher.name} (${currentTeacher.role || 'Teacher'})`;
  }
}

async function handleTeacherLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  const loginBtn = document.getElementById('loginBtn');

  if (!username || !pin) return;

  try {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Verifying...';

    const res = await fetch('/api/teacher/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, pin })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentication failed');

    currentToken = data.token;
    currentTeacher = data.teacher;

    sessionStorage.setItem('nurse_teacher_token', currentToken);
    sessionStorage.setItem('nurse_teacher_user', JSON.stringify(currentTeacher));

    showDashboardView();
    loadDashboardData();
    loadTeacherList();
    showToast('Signed in successfully.');
  } catch (err) {
    alert(err.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In to Dashboard →';
  }
}

async function handleTeacherLogout() {
  if (currentToken) {
    try {
      await fetch('/api/teacher/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
    } catch (e) {}
  }

  currentToken = null;
  currentTeacher = null;
  sessionStorage.removeItem('nurse_teacher_token');
  sessionStorage.removeItem('nurse_teacher_user');
  showLoginView();
  showToast('Logged out.');
}

// ---------------------------------------------------------
// Navigation Tabs
// ---------------------------------------------------------
function switchTab(tab) {
  const tabs = ['submissions', 'access', 'key'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const content = document.getElementById(`tabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (content) content.style.display = (t === tab) ? 'block' : 'none';
  });

  if (tab === 'access') loadTeacherList();
  if (tab === 'key') renderAnswerKeyTab();
}

// ---------------------------------------------------------
// Load Dashboard Data
// ---------------------------------------------------------
async function loadDashboardData() {
  try {
    const res = await fetch('/api/teacher/dashboard-data', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (res.status === 401) {
      handleTeacherLogout();
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
    document.getElementById('statAverageScore').textContent = '0.0 / 15';
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
  document.getElementById('statAverageScore').textContent = `${avg} / 15`;
  document.getElementById('statPendingReview').textContent = pendingCount;
}

function populateSectionFilter() {
  const select = document.getElementById('sectionFilterSelect');
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
  const sectionFilter = document.getElementById('sectionFilterSelect').value;

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
      integrityPill += ` <span class="badge badge-info" title="Quiz auto-submitted because 15 mins expired">⏰ Time Expired</span>`;
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
          <strong style="font-size: 1.05rem; color: #b45309;">${s.totalScore || 0} / 15</strong>
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

function renderGradingItems() {
  const container = document.getElementById('gradingItemsList');
  container.innerHTML = '';

  allQuestions.forEach((q, index) => {
    const studentAns = (currentEditingSubmission.answers && currentEditingSubmission.answers[q.id]) 
      ? currentEditingSubmission.answers[q.id].trim() 
      : '';
    const currentScore = (temporaryGrades[q.id] !== undefined) ? Number(temporaryGrades[q.id]) : 0;
    const isCorrect = currentScore === 1;

    const div = document.createElement('div');
    div.className = `grading-item ${isCorrect ? 'correct' : 'incorrect'}`;
    div.id = `grade_item_container_${q.id}`;

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <span class="question-num">Item ${index + 1} of 15</span>
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
        ${q.text}
      </p>

      <div class="answer-comparison-box">
        <div>
          <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #64748b;">Student Answer:</span>
          <div style="font-size: 1rem; font-weight: 600; color: ${studentAns ? '#0f172a' : '#94a3b8'}; margin-top: 0.2rem;">
            ${studentAns ? escapeHTML(studentAns) : '<em>(Left Blank)</em>'}
          </div>
        </div>

        <div>
          <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #64748b;">Accepted Keys:</span>
          <div style="margin-top: 0.2rem; display: flex; flex-wrap: wrap; gap: 0.35rem;">
            ${(q.acceptedAnswers || []).map(a => `<span class="badge" style="background:#fef3c7; color:#92400e;">${escapeHTML(a)}</span>`).join('')}
          </div>
        </div>
      </div>
    `;

    container.appendChild(div);
  });
}

function setQuestionGrade(questionId, score) {
  temporaryGrades[questionId] = score;

  // Update button classes
  const btn0 = document.getElementById(`btn_score_0_${questionId}`);
  const btn1 = document.getElementById(`btn_score_1_${questionId}`);
  const card = document.getElementById(`grade_item_container_${questionId}`);

  if (btn0 && btn1 && card) {
    btn0.className = `score-btn ${score === 0 ? 'active-0' : ''}`;
    btn1.className = `score-btn ${score === 1 ? 'active-1' : ''}`;
    card.className = `grading-item ${score === 1 ? 'correct' : 'incorrect'}`;
  }

  updateModalScoreDisplay();
}

function updateModalScoreDisplay() {
  let sum = 0;
  Object.keys(temporaryGrades).forEach(qid => {
    sum += Number(temporaryGrades[qid]) || 0;
  });
  document.getElementById('gradingScoreDisplay').textContent = `${sum} / 15`;
}

// 1-Click Auto-Suggest Match
function autoSuggestAllScores() {
  if (!currentEditingSubmission) return;

  allQuestions.forEach(q => {
    const studentAns = (currentEditingSubmission.answers && currentEditingSubmission.answers[q.id]) 
      ? normalizeText(currentEditingSubmission.answers[q.id]) 
      : '';

    const isMatch = (q.acceptedAnswers || []).some(acc => {
      const accNorm = normalizeText(acc);
      return studentAns === accNorm || (accNorm.length > 5 && studentAns.includes(accNorm));
    });

    setQuestionGrade(q.id, (isMatch && studentAns.length > 0) ? 1 : 0);
  });

  showToast('Auto-suggest match applied. You may override any item.');
}

async function saveGradingResult() {
  if (!currentEditingSubmission) return;

  const notes = document.getElementById('gradingTeacherNotes').value.trim();

  try {
    const res = await fetch(`/api/teacher/grade/${currentEditingSubmission.id}`, {
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
  if (!confirm(`Are you sure you want to delete the submission for "${name}"?\n\nThis will allow the student to retake the examination.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/teacher/submissions/${id}`, {
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
// Teacher Access Management (Add/Remove Authorized Teachers)
// ---------------------------------------------------------
async function loadTeacherList() {
  try {
    const res = await fetch('/api/teacher/access-list', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    if (!res.ok) return;

    const data = await res.json();
    const teachers = data.teachers || [];

    document.getElementById('statTotalTeachers').textContent = teachers.length;

    const tbody = document.getElementById('teacherListTableBody');
    if (teachers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #64748b;">No other teachers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = teachers.map(t => {
      const isMe = currentTeacher && (currentTeacher.id === t.id || currentTeacher.username === t.username);
      return `
        <tr>
          <td>
            <strong>${escapeHTML(t.name)}</strong>
            ${isMe ? ' <span class="badge badge-info" style="font-size:0.7rem;">(You)</span>' : ''}
          </td>
          <td><code style="background:#f1f5f9; padding:2px 5px; border-radius:4px;">${escapeHTML(t.username)}</code></td>
          <td><span class="badge" style="background:#fef3c7; color:#92400e;">${escapeHTML(t.role)}</span></td>
          <td>
            ${isMe ? '<span style="color:#94a3b8; font-size:0.8rem;">Active</span>' : `
              <button type="button" class="btn btn-secondary btn-sm" style="color:#dc2626;" onclick="deleteTeacherAccess('${t.id}', '${escapeHTML(t.name)}')">
                Revoke Access
              </button>
            `}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error fetching teacher list:', err);
  }
}

async function handleAddTeacher(e) {
  e.preventDefault();
  const name = document.getElementById('newTeacherName').value.trim();
  const username = document.getElementById('newTeacherUsername').value.trim();
  const pin = document.getElementById('newTeacherPin').value.trim();
  const role = document.getElementById('newTeacherRole').value;
  const btn = document.getElementById('addTeacherBtn');

  if (!name || !username || !pin) return;

  try {
    btn.disabled = true;
    btn.textContent = 'Granting Access...';

    const res = await fetch('/api/teacher/access-add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ name, username, pin, role })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add teacher');

    showToast(`Access granted to ${name}.`);
    document.getElementById('addTeacherForm').reset();
    loadTeacherList();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Grant Teacher Access';
  }
}

async function deleteTeacherAccess(teacherId, teacherName) {
  if (!confirm(`Are you sure you want to revoke teacher access for "${teacherName}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/teacher/access-delete/${teacherId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove teacher');

    showToast(`Access revoked for ${teacherName}.`);
    loadTeacherList();
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

  container.innerHTML = allQuestions.map((q, idx) => `
    <div class="nurse-card" style="padding: 1.25rem; margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span class="question-num">Item ${idx + 1}</span>
      </div>
      <p style="font-weight: 500; color: #1e293b; margin-bottom: 0.75rem;">${q.text}</p>
      
      <div style="background-color: #fffdf5; border: 1px solid #fde68a; padding: 0.75rem 1rem; border-radius: var(--radius-md);">
        <span style="font-size: 0.8rem; font-weight: 700; color: #92400e; text-transform: uppercase;">Accepted Answers:</span>
        <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.4rem;" id="key_badges_${q.id}">
          ${(q.acceptedAnswers || []).map(a => `<span class="badge" style="background:#fef3c7; color:#92400e;">${escapeHTML(a)}</span>`).join('')}
        </div>

        <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
          <input type="text" id="add_synonym_inp_${q.id}" class="form-input" style="padding: 0.4rem 0.75rem; font-size: 0.85rem;" placeholder="Add new accepted synonym variation...">
          <button type="button" class="btn btn-secondary btn-sm" onclick="addKeyVariation(${q.id})">
            + Add Variant
          </button>
        </div>
      </div>
    </div>
  `).join('');
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
    const res = await fetch('/api/teacher/update-answers', {
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
  fetch('/api/teacher/export-csv', {
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

