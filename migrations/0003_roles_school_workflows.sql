ALTER TABLE students ADD COLUMN stream TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN student_id TEXT REFERENCES students(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS accounts (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('SECRETARY', 'TEACHER', 'PARENT')),
  subject TEXT,
  form TEXT NOT NULL DEFAULT '',
  stream TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parent_students (
  parent_email TEXT NOT NULL REFERENCES accounts(email) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_email, student_id)
);

CREATE TABLE IF NOT EXISTS mark_submissions (
  id TEXT PRIMARY KEY,
  teacher_email TEXT NOT NULL REFERENCES accounts(email),
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  subject TEXT NOT NULL,
  score REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Returned')),
  feedback TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  UNIQUE (student_id, term, subject)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Late', 'Excused')),
  note TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL REFERENCES accounts(email),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, date)
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  author_email TEXT NOT NULL REFERENCES accounts(email),
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parent_messages (
  id TEXT PRIMARY KEY,
  parent_email TEXT NOT NULL REFERENCES accounts(email),
  student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  response TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Responded', 'Closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mark_submissions_status ON mark_submissions(status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance_records(student_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_messages_parent ON parent_messages(parent_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_messages_status ON parent_messages(status, created_at DESC);
