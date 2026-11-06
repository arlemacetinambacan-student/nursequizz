const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./lib/submissions-store');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Never serve the server data file, even if a student guesses the path.
app.use((req, res, next) => {
  const url = decodeURIComponent(req.path || '').toLowerCase();
  if (url.includes('db.json') || url.startsWith('/data')) {
    return res.status(404).end();
  }
  next();
});

// In-memory active teacher sessions: { token: { teacherId, username, name, expiresAt } }
const activeSessions = new Map();

// Helper to safely read and write local quiz config / questions / teachers
function getDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db.json:', err);
    return { config: {}, questions: [], teachers: [], submissions: [] };
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing db.json:', err);
    return false;
  }
}

function quizDateInManila(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function normalizeAnswer(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[\.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ');
}

function passwordMatches(pin, teacher) {
  if (!pin || !teacher || !teacher.pinHash || !teacher.pinSalt) return false;
  const actual = crypto.scryptSync(String(pin), teacher.pinSalt, 32);
  const expected = Buffer.from(teacher.pinHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization required. Please log in.' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const session = activeSessions.get(token);

  if (!session || session.expiresAt < Date.now()) {
    if (session) activeSessions.delete(token);
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }

  session.expiresAt = Date.now() + 4 * 60 * 60 * 1000;
  req.admin = session;
  req.teacher = session;
  next();
}

// ==================== ROUTES ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/teacher', (req, res) => {
  res.redirect('/admin');
});

// Quiz info for students: never expose accepted answers
app.get('/api/quiz/info', (req, res) => {
  const db = getDB();
  const safeQuestions = (db.questions || []).map(q => ({
    id: q.id,
    part: q.part,
    type: q.type || 'identification',
    points: q.points || 1,
    title: q.title || '',
    direction: q.direction || '',
    text: q.text
  }));

  res.json({
    config: db.config,
    questions: safeQuestions,
    storage: store.getStorageMode()
  });
});

// One-time quiz check: block start if this name already submitted
app.post('/api/quiz/check-eligibility', async (req, res) => {
  try {
    const { studentName, section } = req.body || {};
    if (!studentName || !String(studentName).trim()) {
      return res.status(400).json({ error: 'Student name is required.' });
    }
    if (!section || !String(section).trim()) {
      return res.status(400).json({ error: 'Section is required.' });
    }

    const existing = await store.findByName(studentName);
    if (existing) {
      return res.status(409).json({
        allowed: false,
        error: 'You have already completed this quiz. Each student may take it only once. Please contact your instructor if you need a retake.'
      });
    }

    return res.json({ allowed: true });
  } catch (err) {
    console.error('Eligibility check error:', err);
    return res.status(500).json({ error: 'Unable to verify eligibility. Please try again.' });
  }
});

// Student quiz submission
app.post('/api/quiz/submit', async (req, res) => {
  try {
    const { studentName, section, date, answers, startedAt, submittedAt, tabSwitches, autoSubmitted } = req.body;

    if (!studentName || !section) {
      return res.status(400).json({ error: 'Student Name and Section are required.' });
    }

    // Hard block retakes (even if someone bypasses the start check)
    const existing = await store.findByName(studentName);
    if (existing) {
      return res.status(409).json({
        error: 'You have already completed this quiz. Each student may take it only once.'
      });
    }

    const db = getDB();
    const now = new Date();

    const grades = {};
    let totalScore = 0;
    let hasEssayPending = false;

    (db.questions || []).forEach(q => {
      const rawStudentAnswer = (answers && answers[q.id]) ? String(answers[q.id]) : '';
      const maxPts = Number(q.points) || (q.type === 'essay' ? 5 : 1);

      if (q.type === 'essay') {
        grades[q.id] = 0;
        hasEssayPending = true;
      } else {
        const studentNorm = normalizeAnswer(rawStudentAnswer);
        const isMatch = (q.acceptedAnswers || []).some(acc => {
          const accNorm = normalizeAnswer(acc);
          return studentNorm === accNorm || (accNorm.length > 5 && studentNorm.includes(accNorm));
        });

        if (isMatch && studentNorm.length > 0) {
          grades[q.id] = maxPts;
          totalScore += maxPts;
        } else {
          grades[q.id] = 0;
        }
      }
    });

    const submissionId = 'SUB-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 899 + 100);

    const newSubmission = {
      id: submissionId,
      studentName: studentName.trim(),
      section: section.trim(),
      date: quizDateInManila(now),
      startedAt: startedAt || now.toISOString(),
      submittedAt: submittedAt || now.toISOString(),
      tabSwitches: Number(tabSwitches) || 0,
      autoSubmitted: Boolean(autoSubmitted),
      answers: answers || {},
      grades: grades,
      totalScore: totalScore,
      graded: false,
      teacherNotes: ''
    };

    await store.createSubmission(newSubmission);

    res.json({
      success: true,
      message: hasEssayPending
        ? 'Quiz submitted successfully! Your instructor will review Part II (Essay) and finalize your score.'
        : 'Quiz submitted successfully!',
      submissionId: submissionId,
      studentName: newSubmission.studentName,
      submittedAt: newSubmission.submittedAt
    });
  } catch (err) {
    if (err.code === 'ALREADY_SUBMITTED') {
      return res.status(409).json({
        error: 'You have already completed this quiz. Each student may take it only once.'
      });
    }
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Failed to save submission. Please try again or inform your instructor.' });
  }
});

// Admin / Teacher Authentication
app.post(['/api/admin/login', '/api/teacher/login'], (req, res) => {
  const { username, pin } = req.body;

  if (!username || !pin) {
    return res.status(400).json({ error: 'Please enter both Username and Access Passcode/PIN.' });
  }

  const db = getDB();
  const foundTeacher = (db.teachers || []).find(
    t => t.username.toLowerCase() === username.trim().toLowerCase() && passwordMatches(pin.trim(), t)
  );

  if (!foundTeacher) {
    return res.status(401).json({ error: 'Invalid username or access passcode.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const sessionData = {
    teacherId: foundTeacher.id,
    name: foundTeacher.name,
    username: foundTeacher.username,
    role: foundTeacher.role || 'Admin',
    expiresAt: Date.now() + 4 * 60 * 60 * 1000
  };

  activeSessions.set(token, sessionData);

  res.json({
    success: true,
    token: token,
    admin: {
      id: foundTeacher.id,
      name: foundTeacher.name,
      username: foundTeacher.username,
      role: foundTeacher.role
    },
    teacher: {
      id: foundTeacher.id,
      name: foundTeacher.name,
      username: foundTeacher.username,
      role: foundTeacher.role
    }
  });
});

app.post(['/api/admin/logout', '/api/teacher/logout'], requireAdminAuth, (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  activeSessions.delete(token);
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.get(['/api/admin/dashboard-data', '/api/teacher/dashboard-data'], requireAdminAuth, async (req, res) => {
  try {
    const db = getDB();
    const submissions = await store.listSubmissions();
    res.json({
      config: db.config,
      questions: db.questions,
      submissions,
      storage: store.getStorageMode()
    });
  } catch (err) {
    console.error('Dashboard data error:', err);
    res.status(500).json({ error: 'Failed to load dashboard data.' });
  }
});

app.post(['/api/admin/grade/:id', '/api/teacher/grade/:id'], requireAdminAuth, async (req, res) => {
  try {
    const submissionId = req.params.id;
    const { grades, teacherNotes } = req.body;

    let totalScore = 0;
    if (grades && typeof grades === 'object') {
      Object.keys(grades).forEach(key => {
        totalScore += Number(grades[key]) || 0;
      });
    }

    const updated = await store.updateSubmission(submissionId, {
      grades,
      totalScore,
      teacherNotes: teacherNotes || '',
      graded: true,
      gradedBy: req.admin ? req.admin.name : 'Admin',
      gradedAt: new Date().toISOString()
    });

    if (!updated) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    res.json({
      success: true,
      message: 'Grade saved successfully.',
      submission: updated
    });
  } catch (err) {
    console.error('Grade error:', err);
    res.status(500).json({ error: 'Failed to save grade.' });
  }
});

app.delete(['/api/admin/submissions/:id', '/api/teacher/submissions/:id'], requireAdminAuth, async (req, res) => {
  try {
    const ok = await store.deleteSubmission(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Submission not found.' });
    }
    res.json({ success: true, message: 'Submission deleted. Student may retake the quiz.' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete submission.' });
  }
});

app.post(['/api/admin/update-answers', '/api/teacher/update-answers'], requireAdminAuth, (req, res) => {
  const { questionId, acceptedAnswers } = req.body;
  const db = getDB();

  const q = (db.questions || []).find(item => item.id === Number(questionId));
  if (!q) {
    return res.status(404).json({ error: 'Question not found.' });
  }

  if (Array.isArray(acceptedAnswers)) {
    q.acceptedAnswers = acceptedAnswers.map(a => a.trim()).filter(Boolean);
  }

  // Note: answer-key edits persist locally; on Vercel they reset on redeploy (questions live in db.json).
  saveDB(db);
  res.json({ success: true, message: 'Answer key updated.', question: q });
});

app.get(['/api/admin/export-csv', '/api/teacher/export-csv'], requireAdminAuth, async (req, res) => {
  try {
    const db = getDB();
    const submissions = await store.listSubmissions();
    const questions = db.questions || [];

    const headers = ['Submission ID', 'Student Name', 'Section', 'Date', 'Time Taken', 'Tab Switches', 'Total Score (out of 20)', 'Graded Status'];
    questions.forEach(q => {
      headers.push(`Q${q.id} Answer`);
      headers.push(`Q${q.id} Score`);
    });

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = submissions.map(s => {
      const row = [
        escapeCSV(s.id),
        escapeCSV(s.studentName),
        escapeCSV(s.section),
        escapeCSV(s.date),
        escapeCSV(s.submittedAt ? new Date(s.submittedAt).toLocaleTimeString() : ''),
        escapeCSV(s.tabSwitches || 0),
        escapeCSV(`${s.totalScore || 0}/20`),
        escapeCSV(s.graded ? 'Finalized' : 'Preliminary')
      ];

      questions.forEach(q => {
        row.push(escapeCSV(s.answers && s.answers[q.id] ? s.answers[q.id] : ''));
        row.push(escapeCSV(s.grades && s.grades[q.id] !== undefined ? s.grades[q.id] : 0));
      });

      return row.join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Nutrition_Quiz_Submissions.csv"');
    res.send(csvContent);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Failed to export CSV.' });
  }
});

// Export for Vercel serverless; listen only when run directly (npm start)
module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Nursing Quiz Server is running at http://localhost:${PORT}`);
    console.log(`Student Quiz Link: http://localhost:${PORT}/`);
    console.log(`Admin Portal Link:  http://localhost:${PORT}/admin`);
    console.log(`Submission storage: ${store.getStorageMode()}`);
  });
}
