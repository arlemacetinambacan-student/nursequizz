# Nursing Online Quiz System (Yellow & White Theme)

A clean, simple, and secure online quiz platform built for Nursing students, featuring anti-cheat protections (copy/paste disabled), a 15-minute countdown timer, and a hidden, password-protected **Admin Portal** for checking answers, grading, and adding authorized staff.

---

## 🌟 Key Updates & Features

### 🎓 1. Student Quiz Experience (`http://localhost:3000/`)
- **Strict 1-by-1 Question Progression (Anti-Screenshot Protection):**
  - Questions appear **one at a time**. Students cannot view or screenshot all 15 questions in advance.
  - **No Going Back:** Once a student proceeds to the next question, previous questions are permanently locked and cannot be revisited.
  - If a student leaves an answer blank, they are prompted to confirm before advancing.
  - On Question 15, the button becomes *"Submit Final Quiz Answers"*.
- **Registration First:**
  - Students enter their **Full Name**, **Section**, and **Date of Quiz** before proceeding.
- **⏱ 15-Minute Countdown Timer:**
  - Sleek floating timer (`15:00` → `00:00`) starts when the student clicks **"Proceed to Quiz"**.
  - Automatically submits whatever answers have been entered when time reaches `00:00`.
- **🛡 Silent Anti-Cheat (Copy & Paste Disabled):**
  - **Copy, Cut & Paste Disabled:** Both across the page and inside the answer fields.
  - **Right-Click Blocked:** Context menu disabled.
  - **Text Selection Blocked:** Question statements cannot be highlighted or copied.
  - **Keyboard Shortcuts Intercepted:** `Ctrl+C`, `Ctrl+V`, `Ctrl+X`, `Ctrl+U`, `F12`, etc.
  - **Tab Switch Detection:** Logs whenever a student leaves or minimizes the tab and flags it on the Admin dashboard.

---

### 🛡 2. Admin Portal (`http://localhost:3000/admin`)
- **Exclusive Single Admin Access:**
  - Only ONE admin account exists. The multi-admin feature has been completely removed.
  - The admin password is stored only on the server as a one-way hash. It is not included in the student page.
- **📝 Review & Grade Student Answers:**
  - View all student submissions in real time.
  - Side-by-side view: **Question**, **Student's Answer**, and **Official Accepted Keys**.
  - **⚡ 1-Click Auto-Suggest Match:** Quickly scans and suggests 1 pt or 0 pts for each item, which the admin can easily override.
  - Quick manual toggle: `[0 pts]` / `[1 pt]`.
  - Add instructor feedback/remarks.
- **🔑 Answer Key & Variations:**
  - View and customize accepted answers.
- **📥 Excel / CSV Export:**
  - Download all student scores, sections, and itemized answers with one click.

---

## 🚀 How to Launch

Double-click `start.bat` in the project folder, or run:
```powershell
npm start
```

- **Student Quiz Link:** `http://localhost:3000/`
- **Admin Portal Link:** `http://localhost:3000/admin`
