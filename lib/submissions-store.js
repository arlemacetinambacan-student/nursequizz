/**
 * Submissions store: uses Supabase when env vars are set,
 * otherwise falls back to local data/db.json (good for local PC).
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function normalizeNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ');
}

function useSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function readLocalDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (err) {
    console.error('Error reading db.json:', err);
    return { config: {}, questions: [], teachers: [], submissions: [] };
  }
}

function writeLocalDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function rowToSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentName: row.student_name,
    section: row.section,
    date: row.date,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    tabSwitches: row.tab_switches || 0,
    autoSubmitted: Boolean(row.auto_submitted),
    answers: row.answers || {},
    grades: row.grades || {},
    totalScore: row.total_score || 0,
    graded: Boolean(row.graded),
    teacherNotes: row.teacher_notes || '',
    gradedBy: row.graded_by || undefined,
    gradedAt: row.graded_at || undefined
  };
}

function submissionToRow(sub) {
  return {
    id: sub.id,
    student_name: sub.studentName,
    student_name_key: normalizeNameKey(sub.studentName),
    section: sub.section,
    date: sub.date || null,
    started_at: sub.startedAt || null,
    submitted_at: sub.submittedAt || null,
    tab_switches: Number(sub.tabSwitches) || 0,
    auto_submitted: Boolean(sub.autoSubmitted),
    answers: sub.answers || {},
    grades: sub.grades || {},
    total_score: Number(sub.totalScore) || 0,
    graded: Boolean(sub.graded),
    teacher_notes: sub.teacherNotes || '',
    graded_by: sub.gradedBy || null,
    graded_at: sub.gradedAt || null
  };
}

async function listSubmissions() {
  if (!useSupabase()) {
    return readLocalDb().submissions || [];
  }

  const { data, error } = await getSupabase()
    .from('submissions')
    .select('*')
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(rowToSubmission);
}

async function findByName(studentName) {
  const key = normalizeNameKey(studentName);
  if (!key) return null;

  if (!useSupabase()) {
    const submissions = readLocalDb().submissions || [];
    return submissions.find(s => normalizeNameKey(s.studentName) === key) || null;
  }

  const { data, error } = await getSupabase()
    .from('submissions')
    .select('*')
    .eq('student_name_key', key)
    .maybeSingle();

  if (error) throw error;
  return rowToSubmission(data);
}

async function createSubmission(sub) {
  if (!useSupabase()) {
    const db = readLocalDb();
    db.submissions = db.submissions || [];
    db.submissions.unshift(sub);
    writeLocalDb(db);
    return sub;
  }

  const { data, error } = await getSupabase()
    .from('submissions')
    .insert(submissionToRow(sub))
    .select('*')
    .single();

  if (error) {
    // Unique violation = student already took the quiz
    if (error.code === '23505') {
      const err = new Error('ALREADY_SUBMITTED');
      err.code = 'ALREADY_SUBMITTED';
      throw err;
    }
    throw error;
  }

  return rowToSubmission(data);
}

async function updateSubmission(id, updates) {
  if (!useSupabase()) {
    const db = readLocalDb();
    const idx = (db.submissions || []).findIndex(s => s.id === id);
    if (idx === -1) return null;
    db.submissions[idx] = { ...db.submissions[idx], ...updates };
    writeLocalDb(db);
    return db.submissions[idx];
  }

  const patch = {};
  if (updates.grades !== undefined) patch.grades = updates.grades;
  if (updates.totalScore !== undefined) patch.total_score = updates.totalScore;
  if (updates.teacherNotes !== undefined) patch.teacher_notes = updates.teacherNotes;
  if (updates.graded !== undefined) patch.graded = updates.graded;
  if (updates.gradedBy !== undefined) patch.graded_by = updates.gradedBy;
  if (updates.gradedAt !== undefined) patch.graded_at = updates.gradedAt;

  const { data, error } = await getSupabase()
    .from('submissions')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return rowToSubmission(data);
}

async function deleteSubmission(id) {
  if (!useSupabase()) {
    const db = readLocalDb();
    const prevLen = (db.submissions || []).length;
    db.submissions = (db.submissions || []).filter(s => s.id !== id);
    if (db.submissions.length === prevLen) return false;
    writeLocalDb(db);
    return true;
  }

  const { data, error } = await getSupabase()
    .from('submissions')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

function getStorageMode() {
  return useSupabase() ? 'supabase' : 'local-json';
}

module.exports = {
  normalizeNameKey,
  listSubmissions,
  findByName,
  createSubmission,
  updateSubmission,
  deleteSubmission,
  getStorageMode
};
