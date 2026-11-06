// =========================================================
// Online Quiz Client Logic — 1-by-1 Sequential Flow & Anti-Cheat
// =========================================================

let quizData = null;
let timerInterval = null;
let totalSecondsRemaining = 15 * 60; // 15 minutes
let quizStarted = false;
let quizSubmitted = false;
let studentDetails = { name: '', section: '', date: '' };
let startedAtTimestamp = null;
let tabSwitchCount = 0;
let toastTimeout = null;

// 1-by-1 Sequential Progression State
let currentQuestionIndex = 0;
let studentAnswers = {};

// DOM Elements
const gateSection = document.getElementById('studentGateSection');
const mainSection = document.getElementById('quizMainSection');
const completedSection = document.getElementById('quizCompletedSection');
const timerPill = document.getElementById('quizTimerPill');
const timerDisplay = document.getElementById('timerDisplay');

// Question Elements
const questionStepLabel = document.getElementById('questionStepLabel');
const progressFillBar = document.getElementById('progressFillBar');
const currentQuestionBadge = document.getElementById('currentQuestionBadge');
const currentQuestionPts = document.getElementById('currentQuestionPts');
const currentQuestionText = document.getElementById('currentQuestionText');
const currentAnswerLabel = document.getElementById('currentAnswerLabel');
const answerFieldWrapper = document.getElementById('answerFieldWrapper');
let currentAnswerInput = document.getElementById('currentAnswerInput');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');

// Modals & Toasts
const toastNotice = document.getElementById('toastWarning');
const toastMessage = document.getElementById('toastMessage');
const submitModal = document.getElementById('submitModal');
const submitModalText = document.getElementById('submitModalText');
const timesUpModal = document.getElementById('timesUpModal');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Pre-fill today's date in local time
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('quizDateInput');
  if (dateInput) dateInput.value = today;

  // Initialize anti-cheating protections
  initAntiCheatProtection();

  // Load Quiz Questions
  loadQuizInfo();

  // Listen for Enter key on answer input to quickly proceed
  if (currentAnswerInput) {
    currentAnswerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleNextStep();
      }
    });
  }
});

// ---------------------------------------------------------
// Anti-Cheat & Copy-Paste Prevention Implementation
// ---------------------------------------------------------
function initAntiCheatProtection() {
  // 1. Block Copy, Cut, Paste globally
  document.addEventListener('copy', (e) => {
    e.preventDefault();
    triggerWarningToast('Copying question or quiz text is disabled.');
  });

  document.addEventListener('cut', (e) => {
    e.preventDefault();
    triggerWarningToast('Cutting text is disabled.');
  });

  document.addEventListener('paste', (e) => {
    e.preventDefault();
    triggerWarningToast('Pasting is disabled. Please type your answers directly.');
  });

  // 2. Block Right-Click Context Menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    triggerWarningToast('Right-click context menu is disabled.');
  });

  // 3. Block Keyboard Shortcuts (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+U, F12, Inspect)
  document.addEventListener('keydown', (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // Block Ctrl+C, Ctrl+V, Ctrl+X
    if (isCtrl && ['c', 'v', 'x'].includes(key)) {
      e.preventDefault();
      triggerWarningToast('Copy/Paste shortcuts (Ctrl+C, Ctrl+V, Ctrl+X) are disabled.');
      return;
    }

    // Block Ctrl+U (view-source), Ctrl+S (save), Ctrl+P (print)
    if (isCtrl && ['u', 's', 'p'].includes(key)) {
      e.preventDefault();
      triggerWarningToast('This action is disabled during the quiz.');
      return;
    }

    // Block F12 and Ctrl+Shift+I / J / C (DevTools)
    if (e.key === 'F12' || (isCtrl && e.shiftKey && ['i', 'j', 'c'].includes(key))) {
      e.preventDefault();
      triggerWarningToast('Developer inspection is disabled.');
      return;
    }
  });

  // 4. Tab Switch Detection
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && quizStarted && !quizSubmitted) {
      tabSwitchCount++;
      triggerWarningToast(`Warning: Tab switch detected! (Attempt #${tabSwitchCount}). Stay on this tab.`);
    }
  });

  // 5. Window Blur Detection
  window.addEventListener('blur', () => {
    if (quizStarted && !quizSubmitted) {
      triggerWarningToast('Quiz focus lost! Please keep your attention on this window.');
    }
  });
}

function triggerWarningToast(msg) {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastMessage.textContent = msg;
  toastNotice.classList.add('show');
  toastTimeout = setTimeout(() => {
    toastNotice.classList.remove('show');
  }, 3200);
}

// ---------------------------------------------------------
// Load Quiz Data from Server
// ---------------------------------------------------------
async function loadQuizInfo() {
  try {
    const res = await fetch('/api/quiz/info');
    if (!res.ok) throw new Error('Failed to load quiz');
    quizData = await res.json();

    if (quizData.config) {
      if (quizData.config.durationMinutes) {
        totalSecondsRemaining = quizData.config.durationMinutes * 60;
      }
    }
  } catch (err) {
    console.error('Quiz loading error:', err);
    triggerWarningToast('Unable to load quiz questions. Please refresh.');
  }
}

// ---------------------------------------------------------
// Gate Form: Start Quiz Handler (one-time name lock)
// ---------------------------------------------------------
async function handleStartQuiz(e) {
  e.preventDefault();

  const nameVal = document.getElementById('studentNameInput').value.trim();
  const sectionVal = document.getElementById('studentSectionInput').value.trim();
  const dateVal = document.getElementById('quizDateInput').value;
  const startBtn = e.target.querySelector('button[type="submit"]');

  if (!nameVal || !sectionVal || !dateVal) {
    alert('Please enter your Name, Section, and Date to start the quiz.');
    return;
  }

  try {
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Checking eligibility...';
    }

    const checkRes = await fetch('/api/quiz/check-eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName: nameVal, section: sectionVal })
    });
    const checkData = await checkRes.json();

    if (!checkRes.ok || checkData.allowed === false) {
      alert(checkData.error || 'You have already completed this quiz. Each student may take it only once.');
      return;
    }
  } catch (err) {
    console.error('Eligibility check failed:', err);
    alert('Unable to verify if you already took this quiz. Please check your connection and try again.');
    return;
  } finally {
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Proceed to Quiz →';
    }
  }

  studentDetails = {
    name: nameVal,
    section: sectionVal,
    date: dateVal
  };

  document.getElementById('displayStudentName').textContent = studentDetails.name;
  document.getElementById('displayStudentSection').textContent = studentDetails.section;
  document.getElementById('displayStudentDate').textContent = studentDetails.date;

  gateSection.style.display = 'none';
  mainSection.style.display = 'block';
  timerPill.style.display = 'inline-flex';

  quizStarted = true;
  startedAtTimestamp = new Date().toISOString();
  currentQuestionIndex = 0;
  studentAnswers = {};

  renderCurrentQuestion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  startQuizTimer();
}

// ---------------------------------------------------------
// 1-by-1 Question Renderer
// ---------------------------------------------------------
function renderCurrentQuestion() {
  if (!quizData || !quizData.questions || quizData.questions.length === 0) return;

  const total = quizData.questions.length;
  const q = quizData.questions[currentQuestionIndex];

  // Update step indicators
  questionStepLabel.textContent = `Question ${currentQuestionIndex + 1} of ${total}`;
  const pct = Math.round(((currentQuestionIndex + 1) / total) * 100);
  progressFillBar.style.width = `${pct}%`;

  if (q.type === 'essay') {
    // Essay Question (Part II - 5 Points)
    currentQuestionBadge.textContent = 'Part II. Essay';
    currentQuestionPts.textContent = '5 Points';
    currentAnswerLabel.textContent = 'Your Essay Explanation:';

    currentQuestionText.innerHTML = `
      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 0.65rem 0.85rem; border-radius: 4px; font-size: 0.9rem; color: #92400e; margin-bottom: 0.85rem; line-height: 1.45;">
        <strong>Direction:</strong> Answer the following question in your own words. Explain your answer clearly and provide a relevant example if possible.
      </div>
      <div style="font-size: 1.15rem; line-height: 1.6; font-weight: 600; color: #0f172a;">
        ${q.text}
      </div>
    `;

    answerFieldWrapper.innerHTML = `
      <textarea 
        id="currentAnswerInput" 
        class="answer-input" 
        rows="7" 
        style="resize: vertical; min-height: 140px; line-height: 1.5; font-family: inherit;" 
        placeholder="Type your essay explanation here..." 
        autocomplete="off" 
        spellcheck="true"
        onpaste="return false;"
        ondrop="return false;"
      ></textarea>
    `;
  } else {
    // Identification Question (Part I - 1 Point)
    currentQuestionBadge.textContent = `Item ${currentQuestionIndex + 1}`;
    currentQuestionPts.textContent = '1 Point';
    currentAnswerLabel.textContent = 'Your Identification Answer:';
    currentQuestionText.textContent = q.text;

    answerFieldWrapper.innerHTML = `
      <input 
        type="text" 
        id="currentAnswerInput" 
        class="answer-input" 
        placeholder="Type your answer here..." 
        autocomplete="off" 
        spellcheck="false"
        onpaste="return false;"
        ondrop="return false;"
      >
    `;
  }

  // Re-bind current input element
  currentAnswerInput = document.getElementById('currentAnswerInput');
  currentAnswerInput.value = '';
  currentAnswerInput.focus();

  // For identification inputs, allow Enter key to submit to next question
  if (q.type !== 'essay') {
    currentAnswerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleNextStep();
      }
    });
  }

  // Update action button label on the final item
  if (currentQuestionIndex === total - 1) {
    nextQuestionBtn.textContent = '✓ Submit Final Quiz Answers';
    nextQuestionBtn.className = 'btn btn-primary btn-block';
  } else {
    nextQuestionBtn.textContent = 'Next Question →';
    nextQuestionBtn.className = 'btn btn-primary btn-block';
  }
}

// ---------------------------------------------------------
// Handle Next Step / Progression
// ---------------------------------------------------------
function handleNextStep() {
  if (quizSubmitted) return;
  const answerVal = currentAnswerInput.value.trim();
  // Proceed immediately with entered answer (or blank if student skipped)
  proceedToNextQuestion(answerVal);
}

// Save answer & advance to next question or finalize
function proceedToNextQuestion(answerText) {
  const total = quizData.questions.length;
  const currentQ = quizData.questions[currentQuestionIndex];

  // Lock in answer
  studentAnswers[currentQ.id] = answerText;

  // If this was the last question (includes Part II Essay)
  if (currentQuestionIndex >= total - 1) {
    submitModalText.innerHTML = `
      You have reached the end of the quiz (Question ${total} of ${total}).<br><br>
      Part I Identification and Part II Essay are complete.<br><br>
      Are you ready to submit your final examination?
    `;
    submitModal.classList.add('active');
    return;
  }

  // Advance to next question
  currentQuestionIndex++;
  renderCurrentQuestion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeSubmitModal() {
  submitModal.classList.remove('active');
}

function confirmFinalSubmit() {
  closeSubmitModal();
  submitQuiz(false);
}

// ---------------------------------------------------------
// 15-Minute Timer Countdown
// ---------------------------------------------------------
function startQuizTimer() {
  renderTimerString();

  timerInterval = setInterval(() => {
    totalSecondsRemaining--;

    if (totalSecondsRemaining <= 0) {
      clearInterval(timerInterval);
      totalSecondsRemaining = 0;
      renderTimerString();
      handleTimeExpired();
      return;
    }

    renderTimerString();

    // Warning states
    if (totalSecondsRemaining <= 60) {
      timerPill.classList.add('urgent');
    } else if (totalSecondsRemaining <= 180) {
      timerPill.style.borderColor = '#ea580c';
      timerPill.style.color = '#c2410c';
    }
  }, 1000);
}

function renderTimerString() {
  const mins = Math.floor(totalSecondsRemaining / 60);
  const secs = totalSecondsRemaining % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  timerDisplay.textContent = formatted;
}

// Auto-submit when time expires
function handleTimeExpired() {
  if (quizSubmitted) return;

  // Save whatever is currently typed in the active input
  if (quizData && quizData.questions && quizData.questions[currentQuestionIndex]) {
    const currentQ = quizData.questions[currentQuestionIndex];
    studentAnswers[currentQ.id] = currentAnswerInput.value.trim();
  }

  // Show times up modal
  timesUpModal.classList.add('active');

  // Automatically submit after a brief cue
  setTimeout(() => {
    timesUpModal.classList.remove('active');
    submitQuiz(true);
  }, 1800);
}

// ---------------------------------------------------------
// Final Submit API Call
// ---------------------------------------------------------
async function submitQuiz(autoSubmitted = false) {
  if (quizSubmitted) return;
  quizSubmitted = true;

  if (timerInterval) clearInterval(timerInterval);

  currentAnswerInput.disabled = true;
  nextQuestionBtn.disabled = true;
  nextQuestionBtn.textContent = 'Submitting...';

  // Make sure current input is recorded if submitted through modal
  if (quizData && quizData.questions && quizData.questions[currentQuestionIndex]) {
    const currentQ = quizData.questions[currentQuestionIndex];
    if (studentAnswers[currentQ.id] === undefined) {
      studentAnswers[currentQ.id] = currentAnswerInput.value.trim();
    }
  }

  const payload = {
    studentName: studentDetails.name,
    section: studentDetails.section,
    date: studentDetails.date,
    answers: studentAnswers,
    startedAt: startedAtTimestamp,
    submittedAt: new Date().toISOString(),
    tabSwitches: tabSwitchCount,
    autoSubmitted: Boolean(autoSubmitted)
  };

  try {
    const res = await fetch('/api/quiz/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Submission failed');

    // Display Completion Screen
    mainSection.style.display = 'none';
    timerPill.style.display = 'none';
    completedSection.style.display = 'block';

    document.getElementById('summaryName').textContent = studentDetails.name;
    document.getElementById('summarySection').textContent = studentDetails.section;
    document.getElementById('summaryDate').textContent = studentDetails.date;
    document.getElementById('summaryId').textContent = result.submissionId || 'CONFIRMED';
    
    const mins = Math.floor(totalSecondsRemaining / 60);
    const secs = totalSecondsRemaining % 60;
    document.getElementById('summaryTimeLeft').textContent = autoSubmitted ? '00:00 (Time Expired)' : `${mins}m ${secs}s`;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error('Submission error:', err);
    alert('There was an issue submitting your quiz: ' + err.message + '. Please inform your instructor.');
    nextQuestionBtn.disabled = false;
    nextQuestionBtn.textContent = 'Retry Submit';
    quizSubmitted = false;
  }
}
