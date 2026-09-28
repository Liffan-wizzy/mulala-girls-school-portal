/// <reference types="@cloudflare/workers-types" />
interface Env {
    DB: D1Database;
}

type Context = { request: Request; env: Env };

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    });

const badRequest = (message: string) => json({ error: message }, 400);
function encodeUrlSafe(bytes: Uint8Array): string {
    return btoa(
        Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
    )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
async function getSessionEmail(
    request: Request,
    env: Env
): Promise<string | null> {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/school_session=([^;]+)/);

    if (!match) return null;

    const sessionHash = await hashToken(match[1]);

    const session = await env.DB.prepare(
        `SELECT account_email AS email
         FROM auth_sessions
         WHERE id = ?
         AND datetime(expires_at) > datetime('now')`
    )
        .bind(sessionHash)
        .first<{ email: string }>();

    return session?.email?.toLowerCase() || null;
}


function validForm(form: unknown): form is string { return typeof form === 'string' && ['Form 1', 'Form 2', 'Form 3', 'Form 4'].includes(form); }
function validText(value: unknown, max = 160): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }

export async function onRequest({ request, env }: Context): Promise<Response> {
    if (!env.DB) return json({ error: 'School database is not configured.' }, 503);
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const method = request.method.toUpperCase();

    // Public landing page receives only the verified public map URL.
    if (method === 'GET' && path[0] === 'public-settings' && path.length === 1) {
        const setting = await env.DB.prepare("SELECT value FROM school_settings WHERE key = 'map_url'").first<{ value: string }>();
        return json({ mapUrl: setting?.value || '' });
    }

    // This single read endpoint is intentionally public for bearer links. Its random
    // token is hashed at rest, time-limited, and scoped to term marks only.
    if (method === 'GET' && path[0] === 'shared-reports' && path.length === 2 && path[1].length >= 40 && path[1].length <= 60) {
        const tokenHash = await hashToken(path[1]);
        const share = await env.DB.prepare("SELECT sh.student_id AS studentId, sh.term, sh.expires_at AS expiresAt, s.name, s.form, COALESCE((SELECT AVG(ms.score) FROM mark_submissions ms WHERE ms.student_id = s.id AND ms.term = sh.term AND ms.status = 'Approved'), 0) AS average, s.attendance FROM report_shares sh JOIN students s ON s.id = sh.student_id WHERE sh.token_hash = ? AND sh.revoked_at IS NULL AND datetime(sh.expires_at) > datetime('now')").bind(tokenHash).first<Record<string, unknown>>();
        if (!share) return json({ error: 'This report link is invalid, expired, or has been revoked.' }, 404);
        const marks = await env.DB.prepare("SELECT m.subject, m.score FROM marks m JOIN mark_submissions ms ON ms.student_id = m.student_id AND ms.term = m.term AND ms.subject = m.subject WHERE m.student_id = ? AND m.term = ? AND ms.status = 'Approved' ORDER BY m.subject").bind(share.studentId, share.term).all();
        return json({ student: { name: share.name, form: share.form, average: share.average, attendance: share.attendance }, term: share.term, expiresAt: share.expiresAt, marks: marks.results });
    }
    // Public parents may submit a general question, but cannot read the inbox.
    if (method === 'POST' && path[0] === 'enquiries' && path.length === 1) {
        try {
            const body = await request.json() as Record<string, unknown>;
            if (typeof body.website === 'string' && body.website.trim()) return json({ ok: true }, 201);
            const topics = ['Admissions', 'Fees and payments', 'School life', 'Academic information', 'Other'];
            const name = typeof body.name === 'string' ? body.name.trim() : '';
            const email = typeof body.email === 'string' ? body.email.trim() : '';
            const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
            const topic = body.topic;
            const message = typeof body.message === 'string' ? body.message.trim() : '';
            if (!validText(name, 120) || !validText(email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length > 40 || typeof topic !== 'string' || !topics.includes(topic) || !validText(message, 2000)) return badRequest('Please provide a valid name, email, topic, and message.');
            const id = crypto.randomUUID();
            const date = new Date().toISOString().slice(0, 10);
            await env.DB.prepare('INSERT INTO enquiries (id, name, email, phone, topic, message, date) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, name, email, phone, topic, message, date).run();
            return json({ ok: true }, 201);
        } catch (error) {
            if (error instanceof SyntaxError) return badRequest('The enquiry could not be read. Please check the submitted form.');
            console.error('Parent enquiry could not be saved:', error instanceof Error ? error.message : 'unknown error');
            return json({ error: 'The enquiry could not be saved. Please try again later.' }, 500);
        }
    }
   const email = await getSessionEmail(request, env);
    if (!email) return json({ error: 'Access denied. Please sign in.' }, 401);
    const account = await env.DB.prepare('SELECT email, role, subject, form, stream, active FROM accounts WHERE email = ? AND active = 1').bind(email).first<{ email: string; role: 'SECRETARY' | 'TEACHER' | 'PARENT'; subject: string | null; form: string; stream: string; active: number }>();
    if (!account) return json({ error: 'This sign-in is not linked to an active school account. Contact the secretary.' }, 403);

    try {
        if (method === 'GET' && path[0] === 'me' && path.length === 1) return json({ email: account.email, role: account.role, subject: account.subject, form: account.form, stream: account.stream });
        if (method === 'GET' && path[0] === 'announcements' && path.length === 1) {
            const { results } = await env.DB.prepare('SELECT id, title, body, published_at AS publishedAt FROM announcements WHERE published = 1 ORDER BY published_at DESC LIMIT 100').all();
            return json(results);
        }
        if (method === 'GET' && path[0] === 'teacher' && path[1] === 'roster' && path.length === 2) {
            if (account.role !== 'TEACHER' || !account.subject || !validForm(account.form)) return json({ error: 'Teacher access is not configured.' }, 403);
            const { results } = await env.DB.prepare('SELECT id, name, form, stream FROM students WHERE form = ? AND stream = ? AND status = ? ORDER BY name').bind(account.form, account.stream, 'Active').all();
            return json({ subject: account.subject, form: account.form, stream: account.stream, students: results });
        }
        if (method === 'GET' && path[0] === 'teacher' && path[1] === 'submissions' && path.length === 2) {
            if (account.role !== 'TEACHER') return json({ error: 'Teacher access required.' }, 403);
            const { results } = await env.DB.prepare('SELECT ms.id, ms.student_id AS studentId, s.name AS studentName, ms.term, ms.subject, ms.score, ms.status, ms.feedback, ms.submitted_at AS submittedAt, ms.reviewed_at AS reviewedAt FROM mark_submissions ms JOIN students s ON s.id = ms.student_id WHERE ms.teacher_email = ? ORDER BY ms.submitted_at DESC LIMIT 500').bind(email).all();
            return json(results);
        }
        if (method === 'POST' && path[0] === 'teacher' && path[1] === 'submissions' && path.length === 2) {
            if (account.role !== 'TEACHER' || !account.subject || !validForm(account.form)) return json({ error: 'Teacher access is not configured.' }, 403);
            const body = await request.json() as { term?: unknown; scores?: unknown };
            if (!validText(body.term, 40) || !Array.isArray(body.scores) || body.scores.length < 1 || body.scores.length > 300) return badRequest('Select a term and enter at least one mark.');
            const scores = body.scores as Array<{ studentId?: unknown; score?: unknown }>;
            if (scores.some((item) => !validText(item.studentId, 40) || typeof item.score !== 'number' || !Number.isFinite(item.score) || item.score < 0 || item.score > 100) || new Set(scores.map((item) => item.studentId)).size !== scores.length) return badRequest('Each student needs one valid mark from 0 to 100.');
            const statements: D1PreparedStatement[] = [];
            for (const item of scores) {
                const student = await env.DB.prepare('SELECT id FROM students WHERE id = ? AND form = ? AND stream = ? AND status = ?').bind(item.studentId, account.form, account.stream, 'Active').first<{ id: string }>();
                if (!student) return json({ error: 'One or more students are outside your assigned class.' }, 403);
                const existing = await env.DB.prepare('SELECT id, status FROM mark_submissions WHERE student_id = ? AND term = ? AND subject = ?').bind(item.studentId, body.term, account.subject).first<{ id: string; status: string }>();
                if (existing && existing.status !== 'Returned') return json({ error: 'A mark for this student and term is already submitted or approved.' }, 409);
                if (existing) statements.push(env.DB.prepare("UPDATE mark_submissions SET score = ?, status = 'Pending', feedback = '', submitted_at = datetime('now'), reviewed_at = NULL, teacher_email = ? WHERE id = ?").bind(item.score, email, existing.id));
                else statements.push(env.DB.prepare('INSERT INTO mark_submissions (id, teacher_email, student_id, term, subject, score) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), email, item.studentId, body.term, account.subject, item.score));
            }
            await env.DB.batch(statements);
            return json({ ok: true, submitted: statements.length }, 201);
        }
        if (method === 'GET' && path[0] === 'parent' && path[1] === 'portal' && path.length === 2) {
            if (account.role !== 'PARENT') return json({ error: 'Parent access required.' }, 403);
            const requestedStudent = url.searchParams.get('studentId');
            const children = await env.DB.prepare('SELECT s.id, s.name, s.form FROM parent_students ps JOIN students s ON s.id = ps.student_id WHERE ps.parent_email = ? ORDER BY s.name').bind(email).all();
            const selectedId = children.results.some((child) => child.id === requestedStudent) ? requestedStudent : String(children.results[0]?.id || '');
            const student = await env.DB.prepare('SELECT s.id, s.name, s.form, s.stream, s.average, s.attendance, s.balance FROM parent_students ps JOIN students s ON s.id = ps.student_id WHERE ps.parent_email = ? AND s.id = ? LIMIT 1').bind(email, selectedId).first<Record<string, unknown>>();
            if (!student) return json({ error: 'No student is linked to this parent account.' }, 404);
            const studentId = String(student.id);
            const [marks, attendance, announcements, fees, payments] = await Promise.all([
                env.DB.prepare("SELECT m.term, m.subject, m.score FROM marks m JOIN mark_submissions ms ON ms.student_id = m.student_id AND ms.term = m.term AND ms.subject = m.subject WHERE m.student_id = ? AND ms.status = 'Approved' ORDER BY m.term DESC, m.subject").bind(studentId).all(),
                env.DB.prepare('SELECT date, status FROM attendance_records WHERE student_id = ? ORDER BY date DESC LIMIT 120').bind(studentId).all(),
                env.DB.prepare('SELECT id, title, body, published_at AS publishedAt FROM announcements WHERE published = 1 ORDER BY published_at DESC LIMIT 100').all(),
                env.DB.prepare('SELECT label, amount FROM fee_items ORDER BY label').all(),
                env.DB.prepare('SELECT date, amount, method, reference FROM payments WHERE student_id = ? ORDER BY date DESC LIMIT 100').bind(studentId).all(),
            ]);
            return json({ children: children.results, student, marks: marks.results, attendance: attendance.results, announcements: announcements.results, feeItems: fees.results, payments: payments.results });
        }
        if (path[0] === 'parent' && path[1] === 'messages' && path.length === 2) {
            if (account.role !== 'PARENT') return json({ error: 'Parent access required.' }, 403);
            if (method === 'GET') {
                const { results } = await env.DB.prepare('SELECT id, student_id AS studentId, subject, message, response, status, sender_role AS senderRole, created_at AS createdAt, responded_at AS respondedAt FROM parent_messages WHERE parent_email = ? ORDER BY created_at DESC LIMIT 200').bind(email).all();
                return json(results);
            }
            if (method === 'POST') {
                const body = await request.json() as { studentId?: unknown; subject?: unknown; message?: unknown };
                if (!validText(body.subject, 120) || !validText(body.message, 2000)) return badRequest('A subject and message are required.');
                const studentId = typeof body.studentId === 'string' ? body.studentId : '';
                if (studentId && !await env.DB.prepare('SELECT student_id FROM parent_students WHERE parent_email = ? AND student_id = ?').bind(email, studentId).first()) return json({ error: 'That student is not linked to your parent account.' }, 403);
                await env.DB.prepare('INSERT INTO parent_messages (id, parent_email, student_id, subject, message) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), email, studentId || null, body.subject.trim(), body.message.trim()).run();
                return json({ ok: true }, 201);
            }
        }
        if (account.role !== 'SECRETARY') return json({ error: 'This action is not permitted for your school role.' }, 403);
        if (method === 'GET' && path[0] === 'accounts' && path.length === 1) {
            const { results } = await env.DB.prepare('SELECT email, role, subject, form, stream, active FROM accounts ORDER BY role, email').all();
            const parentRows = await env.DB.prepare('SELECT parent_email AS email, student_id AS studentId FROM parent_students ORDER BY student_id').all<{ email: string; studentId: string }>();
            return json(results.map((row) => ({ ...row, studentIds: parentRows.results.filter((child) => child.email === row.email).map((child) => child.studentId) })));
        }
        if (method === 'POST' && path[0] === 'accounts' && path.length === 1) {
            const body = await request.json() as { email?: unknown; role?: unknown; subject?: unknown; form?: unknown; stream?: unknown; studentIds?: unknown; active?: unknown };
            const targetEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
            const roles = ['SECRETARY', 'TEACHER', 'PARENT'];
            const subjects = ['English', 'Mathematics', 'Biology', 'Chemistry', 'History', 'Kiswahili'];
            if (!validText(targetEmail, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail) || typeof body.role !== 'string' || !roles.includes(body.role)) return badRequest('Enter a valid email and account role.');
            if (targetEmail === email && (body.role !== 'SECRETARY' || body.active === false)) return badRequest('You cannot change or deactivate your own secretary account.');
            const subject = body.role === 'TEACHER' && typeof body.subject === 'string' && subjects.includes(body.subject) ? body.subject : null;
            if (body.role === 'TEACHER' && (!subject || !validForm(body.form) || typeof body.stream !== 'string' || body.stream.length > 80)) return badRequest('Teacher accounts need an assigned subject, form, and stream.');
            const studentIds = body.role === 'PARENT' && Array.isArray(body.studentIds) ? [...new Set(body.studentIds.filter((id): id is string => typeof id === 'string'))] : [];
            if (body.role === 'PARENT' && studentIds.length === 0) return badRequest('Link a parent account to at least one student.');
            if (studentIds.length > 20 || studentIds.some((id) => id.length > 40)) return badRequest('The parent account has invalid student links.');
            if (body.role === 'PARENT') {
                for (const studentId of studentIds) {
                    if (!await env.DB.prepare('SELECT id FROM students WHERE id = ?').bind(studentId).first()) return badRequest('A linked student record could not be found.');
                }
            }
            const statements: D1PreparedStatement[] = [env.DB.prepare('INSERT INTO accounts (email, role, subject, form, stream, active) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role, subject = excluded.subject, form = excluded.form, stream = excluded.stream, active = excluded.active').bind(targetEmail, body.role, subject, body.role === 'TEACHER' ? body.form : '', body.role === 'TEACHER' ? body.stream : '', body.active === false ? 0 : 1)];
            if (body.role === 'PARENT') {
                statements.push(env.DB.prepare('DELETE FROM parent_students WHERE parent_email = ?').bind(targetEmail));
                for (const studentId of studentIds) statements.push(env.DB.prepare('INSERT INTO parent_students (parent_email, student_id) VALUES (?, ?)').bind(targetEmail, studentId));
            } else statements.push(env.DB.prepare('DELETE FROM parent_students WHERE parent_email = ?').bind(targetEmail));
            await env.DB.batch(statements);
            return json({ ok: true }, 201);
        }
        if (method === 'PATCH' && path[0] === 'accounts' && path.length === 2) {
            const targetEmail = decodeURIComponent(path[1]).toLowerCase();
            const body = await request.json() as { active?: unknown };
            if (typeof body.active !== 'boolean') return badRequest('Choose whether the account is active.');
            if (targetEmail === email && !body.active) return badRequest('You cannot deactivate your own secretary account.');
            const result = await env.DB.prepare('UPDATE accounts SET active = ? WHERE email = ?').bind(body.active ? 1 : 0, targetEmail).run();
            return result.meta.changes ? json({ ok: true }) : json({ error: 'School account not found.' }, 404);
        }
        if (method === 'GET' && path[0] === 'mark-submissions' && path.length === 1) {
            const { results } = await env.DB.prepare('SELECT ms.id, ms.teacher_email AS teacherEmail, ms.student_id AS studentId, s.name AS studentName, s.form, s.stream, ms.term, ms.subject, ms.score, ms.status, ms.feedback, ms.submitted_at AS submittedAt FROM mark_submissions ms JOIN students s ON s.id = ms.student_id ORDER BY CASE ms.status WHEN \'Pending\' THEN 0 WHEN \'Returned\' THEN 1 ELSE 2 END, ms.submitted_at DESC LIMIT 1000').all();
            return json(results);
        }
        if (method === 'PATCH' && path[0] === 'mark-submissions' && path.length === 2) {
            const body = await request.json() as { status?: unknown; feedback?: unknown };
            if (body.status !== 'Approved' && body.status !== 'Returned') return badRequest('Choose Approved or Returned.');
            if (typeof body.feedback !== 'string' || body.feedback.length > 500) return badRequest('Review feedback must be 500 characters or fewer.');
            const submission = await env.DB.prepare('SELECT student_id AS studentId, term, subject, score, status FROM mark_submissions WHERE id = ?').bind(path[1]).first<{ studentId: string; term: string; subject: string; score: number; status: string }>();
            if (!submission) return json({ error: 'Submission not found.' }, 404);
            if (submission.status !== 'Pending') return json({ error: 'Only pending submissions can be reviewed.' }, 409);
            if (body.status === 'Approved') {
                await env.DB.batch([
                    env.DB.prepare('INSERT INTO marks (student_id, term, subject, score) VALUES (?, ?, ?, ?) ON CONFLICT(student_id, term, subject) DO UPDATE SET score = excluded.score, updated_at = datetime(\'now\')').bind(submission.studentId, submission.term, submission.subject, submission.score),
                    env.DB.prepare("UPDATE mark_submissions SET status = 'Approved', feedback = ?, reviewed_at = datetime('now') WHERE id = ? AND status = 'Pending'").bind(body.feedback, path[1]),
                ]);
                const average = await env.DB.prepare("SELECT AVG(score) AS average FROM mark_submissions WHERE student_id = ? AND term = ? AND status = 'Approved'").bind(submission.studentId, submission.term).first<{ average: number | null }>();
                await env.DB.prepare('UPDATE students SET average = ? WHERE id = ?').bind(average?.average || 0, submission.studentId).run();
            } else await env.DB.prepare("UPDATE mark_submissions SET status = 'Returned', feedback = ?, reviewed_at = datetime('now') WHERE id = ? AND status = 'Pending'").bind(body.feedback, path[1]).run();
            return json({ ok: true });
        }
        if (method === 'GET' && path[0] === 'attendance' && path.length === 1) {
            const { results } = await env.DB.prepare('SELECT ar.id, ar.student_id AS studentId, s.name AS studentName, s.form, s.stream, ar.date, ar.status, ar.note FROM attendance_records ar JOIN students s ON s.id = ar.student_id ORDER BY ar.date DESC, s.name LIMIT 1000').all();
            return json(results);
        }
        if (method === 'POST' && path[0] === 'attendance' && path.length === 1) {
            const body = await request.json() as { studentId?: unknown; date?: unknown; status?: unknown; note?: unknown };
            if (!validText(body.studentId, 40) || typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !['Present', 'Absent', 'Late', 'Excused'].includes(String(body.status)) || (typeof body.note !== 'string' || body.note.length > 300)) return badRequest('Attendance details are invalid.');
            await env.DB.prepare('INSERT INTO attendance_records (student_id, date, status, note, recorded_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status, note = excluded.note, recorded_by = excluded.recorded_by').bind(body.studentId, body.date, body.status, body.note, email).run();
            const attendance = await env.DB.prepare("SELECT 100.0 * SUM(CASE WHEN status IN ('Present', 'Late') THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN status != 'Excused' THEN 1 ELSE 0 END), 0) AS rate FROM attendance_records WHERE student_id = ?").bind(body.studentId).first<{ rate: number | null }>();
            if (attendance?.rate !== null && attendance?.rate !== undefined) await env.DB.prepare('UPDATE students SET attendance = ? WHERE id = ?').bind(attendance.rate, body.studentId).run();
            return json({ ok: true });
        }
        if (method === 'POST' && path[0] === 'announcements' && path.length === 1) {
            const body = await request.json() as { title?: unknown; body?: unknown };
            if (!validText(body.title, 160) || !validText(body.body, 3000)) return badRequest('Announcement title and message are required.');
            await env.DB.prepare('INSERT INTO announcements (id, title, body, author_email) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), body.title.trim(), body.body.trim(), email).run();
            return json({ ok: true }, 201);
        }
        if (path[0] === 'parent-messages' && path.length === 1 && method === 'GET') {
            const { results } = await env.DB.prepare('SELECT pm.id, pm.parent_email AS parentEmail, pm.student_id AS studentId, s.name AS studentName, pm.subject, pm.message, pm.response, pm.status, pm.sender_role AS senderRole, pm.created_at AS createdAt FROM parent_messages pm LEFT JOIN students s ON s.id = pm.student_id ORDER BY pm.created_at DESC LIMIT 1000').all();
            return json(results);
        }
        if (path[0] === 'parent-messages' && path.length === 1 && method === 'POST') {
            const body = await request.json() as { parentEmail?: unknown; studentId?: unknown; subject?: unknown; message?: unknown };
            const parentEmail = typeof body.parentEmail === 'string' ? body.parentEmail.trim().toLowerCase() : '';
            if (!validText(parentEmail, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail) || !validText(body.subject, 120) || !validText(body.message, 2000)) return badRequest('Choose a parent and enter a subject and message.');
            const parent = await env.DB.prepare("SELECT email FROM accounts WHERE email = ? AND role = 'PARENT' AND active = 1").bind(parentEmail).first<{ email: string }>();
            if (!parent) return json({ error: 'Choose an active parent account.' }, 404);
            const studentId = typeof body.studentId === 'string' ? body.studentId : '';
            if (studentId && !await env.DB.prepare('SELECT student_id FROM parent_students WHERE parent_email = ? AND student_id = ?').bind(parentEmail, studentId).first()) return badRequest('That student is not linked to the selected parent.');
            await env.DB.prepare("INSERT INTO parent_messages (id, parent_email, student_id, subject, message, status, sender_role, responded_at) VALUES (?, ?, ?, 'School office: ' || ?, ?, 'Responded', 'SECRETARY', datetime('now'))").bind(crypto.randomUUID(), parentEmail, studentId || null, body.subject.trim(), body.message.trim()).run();
            return json({ ok: true }, 201);
        }
        if (path[0] === 'parent-messages' && path.length === 2 && method === 'PATCH') {
            const body = await request.json() as { response?: unknown; status?: unknown };
            if (typeof body.response !== 'string' || body.response.length > 2000 || !['Responded', 'Closed'].includes(String(body.status))) return badRequest('Add a response and choose Responded or Closed.');
            const result = await env.DB.prepare("UPDATE parent_messages SET response = ?, status = ?, responded_at = datetime('now') WHERE id = ? AND sender_role = 'PARENT'").bind(body.response.trim(), body.status, path[1]).run();
            return result.meta.changes ? json({ ok: true }) : json({ error: 'Parent message not found.' }, 404);
        }
        if (method === 'GET' && path[0] === 'settings' && path.length === 1) {
            const { results } = await env.DB.prepare('SELECT key, value FROM school_settings').all<{ key: string; value: string }>();
            const values = Object.fromEntries(results.map((item) => [item.key, item.value]));
            let paymentDetails = { provider: '', accountName: '', accountNumber: '', instructions: '' };
            try { if (values.payment_details) paymentDetails = JSON.parse(values.payment_details) as typeof paymentDetails; } catch { /* Ignore invalid legacy settings. */ }
            return json({ secretaryPhone: values.secretary_phone || '', paymentDetails, mapUrl: values.map_url || '' });
        }
        if (method === 'POST' && path[0] === 'settings' && path.length === 1) {
            const body = await request.json() as { secretaryPhone?: unknown; paymentDetails?: unknown; mapUrl?: unknown };
            if (typeof body.secretaryPhone !== 'string' || body.secretaryPhone.length > 40 || !body.paymentDetails || typeof body.paymentDetails !== 'object' || typeof body.mapUrl !== 'string' || body.mapUrl.length > 1000) return badRequest('School settings are incomplete or invalid.');
            if (body.mapUrl.trim()) {
                try { if (new URL(body.mapUrl).protocol !== 'https:') return badRequest('The school map link must use HTTPS.'); }
                catch { return badRequest('Enter a valid HTTPS school map link.'); }
            }
            const details = body.paymentDetails as Record<string, unknown>;
            if (['provider', 'accountName', 'accountNumber', 'instructions'].some((key) => typeof details[key] !== 'string' || String(details[key]).length > 160)) return badRequest('Payment account details are invalid.');
            await env.DB.batch([
                env.DB.prepare('INSERT INTO school_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind('secretary_phone', body.secretaryPhone),
                env.DB.prepare('INSERT INTO school_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind('payment_details', JSON.stringify(details)),
                env.DB.prepare('INSERT INTO school_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind('map_url', body.mapUrl.trim()),
            ]);
            return json({ ok: true });
        }
        if (method === 'GET' && path[0] === 'students' && path.length === 1) {
            const { results } = await env.DB.prepare('SELECT id, name, form, stream, guardian, email, balance, average, attendance, status FROM students ORDER BY name').all();
            return json(results);
        }
        if (method === 'GET' && path[0] === 'admissions' && path.length === 1) {
            const { results } = await env.DB.prepare('SELECT id, name, requested_form AS requestedForm, guardian, date, status FROM admissions ORDER BY date DESC, created_at DESC').all();
            return json(results);
        }
        if (method === 'GET' && path[0] === 'enquiries' && path.length === 1) {
            const { results } = await env.DB.prepare('SELECT id, name, email, phone, topic, message, date, status FROM enquiries ORDER BY date DESC, created_at DESC LIMIT 500').all();
            return json(results);
        }
        if (method === 'GET' && path[0] === 'finance' && path.length === 1) {
            const [paymentRows, feeRows] = await Promise.all([
                env.DB.prepare('SELECT id, student, reference, date, amount, method FROM payments ORDER BY date DESC, created_at DESC').all(),
                env.DB.prepare('SELECT label, amount FROM fee_items ORDER BY id').all(),
            ]);
            return json({ payments: paymentRows.results, fees: feeRows.results });
        }
        if (method === 'GET' && path[0] === 'marks' && path.length === 1) {
            const { results } = await env.DB.prepare('SELECT student_id AS studentId, term, subject, score FROM marks ORDER BY student_id, term, subject').all();
            return json(results);
        }
        if (method === 'POST' && path[0] === 'students' && path.length === 1) {
            const body = await request.json() as Record<string, unknown>;
            if (!validText(body.id, 40) || !validText(body.name) || !validForm(body.form) || !validText(body.guardian) || typeof body.balance !== 'number' || body.balance < 0 || typeof body.stream !== 'string' || body.stream.length > 80) return badRequest('Student details are incomplete or invalid.');
            await env.DB.prepare('INSERT INTO students (id, name, form, stream, guardian, email, balance, average, attendance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(body.id, body.name, body.form, body.stream, body.guardian, typeof body.email === 'string' ? body.email : '', Math.round(body.balance), Number(body.average) || 0, Number(body.attendance) || 0, typeof body.status === 'string' ? body.status : 'Active').run();
            return json({ ok: true }, 201);
        }
        if (method === 'POST' && path[0] === 'admissions' && path.length === 1) {
            const body = await request.json() as Record<string, unknown>;
            if (!validText(body.id, 40) || !validText(body.name) || !validForm(body.requestedForm) || !validText(body.guardian)) return badRequest('Application details are incomplete or invalid.');
            await env.DB.prepare('INSERT INTO admissions (id, name, requested_form, guardian, date, status) VALUES (?, ?, ?, ?, ?, ?)').bind(body.id, body.name, body.requestedForm, body.guardian, typeof body.date === 'string' ? body.date : new Date().toISOString().slice(0, 10), 'Pending').run();
            return json({ ok: true }, 201);
        }
        if (method === 'PATCH' && path[0] === 'admissions' && path.length === 2) {
            const body = await request.json() as { status?: unknown };
            if (!['Pending', 'Under review', 'Accepted', 'Declined'].includes(String(body.status))) return badRequest('Invalid application status.');
            const result = await env.DB.prepare('UPDATE admissions SET status = ? WHERE id = ?').bind(body.status, path[1]).run();
            return result.meta.changes ? json({ ok: true }) : json({ error: 'Application not found.' }, 404);
        }
        if (method === 'PATCH' && path[0] === 'enquiries' && path.length === 2) {
            const body = await request.json() as { status?: unknown };
            if (!['New', 'In progress', 'Responded', 'Closed'].includes(String(body.status))) return badRequest('Invalid enquiry status.');
            const result = await env.DB.prepare('UPDATE enquiries SET status = ? WHERE id = ?').bind(body.status, path[1]).run();
            return result.meta.changes ? json({ ok: true }) : json({ error: 'Enquiry not found.' }, 404);
        }
        if (method === 'POST' && path[0] === 'payments' && path.length === 1) {
            const body = await request.json() as Record<string, unknown>;
            if (!validText(body.id, 40) || !validText(body.studentId, 40) || typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount) || body.amount <= 0 || !validText(body.method, 40)) return badRequest('Payment details are incomplete or invalid.');
            const student = await env.DB.prepare('SELECT name FROM students WHERE id = ?').bind(body.studentId).first<{ name: string }>();
            if (!student) return json({ error: 'Student not found.' }, 404);
            const statement = env.DB.prepare('INSERT INTO payments (id, student_id, student, reference, date, amount, method) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(body.id, body.studentId, student.name, typeof body.reference === 'string' ? body.reference : '', typeof body.date === 'string' ? body.date : new Date().toISOString().slice(0, 10), body.amount, body.method);
            const update = env.DB.prepare('UPDATE students SET balance = MAX(0, balance - ?) WHERE id = ?').bind(body.amount, body.studentId);
            await env.DB.batch([statement, update]);
            return json({ ok: true }, 201);
        }
        if (method === 'POST' && path[0] === 'fees' && path.length === 1) {
            const body = await request.json() as { label?: unknown; amount?: unknown };
            if (!validText(body.label, 100) || typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount) || body.amount < 0) return badRequest('Fee item is incomplete or invalid.');
            await env.DB.prepare('INSERT INTO fee_items (label, amount) VALUES (?, ?)').bind(body.label, body.amount).run();
            return json({ ok: true }, 201);
        }
        if (method === 'POST' && path[0] === 'marks' && path.length === 1) {
            return json({ error: 'Marks must be submitted by an assigned teacher and approved by the secretary.' }, 403);
        }
        if (method === 'POST' && path[0] === 'report-shares' && path.length === 1) {
            const body = await request.json() as { studentId?: unknown; term?: unknown };
            if (!validText(body.studentId, 40) || !validText(body.term, 40)) return badRequest('A student and report term are required.');
            const student = await env.DB.prepare('SELECT id FROM students WHERE id = ?').bind(body.studentId).first<{ id: string }>();
            if (!student) return json({ error: 'Student not found.' }, 404);
            const markCount = await env.DB.prepare("SELECT COUNT(*) AS total FROM marks m JOIN mark_submissions ms ON ms.student_id = m.student_id AND ms.term = m.term AND ms.subject = m.subject WHERE m.student_id = ? AND m.term = ? AND ms.status = 'Approved'").bind(body.studentId, body.term).first<{ total: number }>();
            if (!markCount?.total) return badRequest('Enter student marks before creating a family report link.');
            const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
            const token = encodeUrlSafe(tokenBytes);
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            await env.DB.prepare('INSERT INTO report_shares (id, token_hash, student_id, term, expires_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), await hashToken(token), body.studentId, body.term, expiresAt).run();
            return json({ url: new URL(`/share/${token}`, url.origin).toString(), expiresAt }, 201);
        }
        if (method === 'GET' && path[0] === 'health') return json({ ok: true });
        return json({ error: 'Not found.' }, 404);
    } catch (error) {
        console.error('School API request failed:', error instanceof Error ? error.message : 'unknown error');
        return json({ error: 'The request could not be completed.' }, 500);
    }
}
