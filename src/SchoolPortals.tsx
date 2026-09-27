import { FormEvent, ReactNode, useEffect, useState } from 'react';

type Role = 'SECRETARY' | 'TEACHER' | 'PARENT';
type Identity = { email: string; role: Role; subject: string | null; form: string; stream: string };
type Student = { id: string; name: string; form: string; stream: string; balance?: number; attendance?: number };
type Account = { email: string; role: Role; subject: string | null; form: string; stream: string; active: number; studentIds: string[] };
type Submission = { id: string; teacherEmail: string; studentId: string; studentName: string; form: string; stream: string; term: string; subject: string; score: number; status: 'Pending' | 'Approved' | 'Returned'; feedback: string };
type AttendanceRow = { id: number; studentId: string; studentName: string; form: string; stream: string; date: string; status: string; note: string };
type Announcement = { id: string; title: string; body: string; publishedAt: string };
type ParentMessage = { id: string; parentEmail: string; studentId: string | null; studentName: string | null; subject: string; message: string; response: string; status: string; senderRole: 'PARENT' | 'SECRETARY'; createdAt: string };

const subjects = ['English', 'Mathematics', 'Biology', 'Chemistry', 'History', 'Kiswahili'];
const forms = ['Form 1', 'Form 2', 'Form 3', 'Form 4'];
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`/api/${path}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
    return data;
}

export function RoleRouter({ expected, secretary, teacher, parent }: { expected?: Role; secretary: ReactNode; teacher: ReactNode; parent: ReactNode }) {
    const [identity, setIdentity] = useState<Identity | null>(null);
    const [error, setError] = useState('');
    useEffect(() => { api<Identity>('me').then(setIdentity).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'School sign-in is required.')); }, []);
    if (error) return <PortalMessage title="School sign-in required" detail={error} />;
    if (!identity) return <PortalMessage title="Checking your school account…" />;
    if (expected && identity.role !== expected) return <PortalMessage title="This portal is not assigned to your account" detail={`Your account role is ${identity.role}. Open the portal assigned to your role or contact the secretary.`} />;
    return identity.role === 'SECRETARY' ? <>{secretary}</> : identity.role === 'TEACHER' ? <>{teacher}</> : <>{parent}</>;
}

function PortalMessage({ title, detail }: { title: string; detail?: string }) {
    return <main className="role-message-page"><section className="panel role-message-card"><div className="brand-mark">M</div><h1>{title}</h1>{detail && <p>{detail}</p>}<a href="/">Return to school portal</a></section></main>;
}

function PortalHeader({ title, email }: { title: string; email: string }) {
    return <header className="role-portal-header"><a href="/" className="family-brand"><div className="brand-mark">M</div><div><strong>Mulala Girls High School</strong><span>{title}</span></div></a><div className="role-header-user"><span>{email}</span><a href="/cdn-cgi/access/logout">Sign out</a></div></header>;
}

export function TeacherPortal() {
    const [identity, setIdentity] = useState<Identity | null>(null);
    const [roster, setRoster] = useState<Student[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [scores, setScores] = useState<Record<string, string>>({});
    const [term, setTerm] = useState('Term 3 2026');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        Promise.all([api<Identity>('me'), api<{ students: Student[] }>('teacher/roster'), api<Submission[]>('teacher/submissions')])
            .then(([me, classData, rows]) => { setIdentity(me); setRoster(classData.students); setSubmissions(rows); })
            .catch((reason: unknown) => setNotice(reason instanceof Error ? reason.message : 'Unable to load your teaching workspace.'));
    }, []);
    async function submitMarks(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const values = Object.entries(scores).filter(([, value]) => value.trim()).map(([studentId, value]) => ({ studentId, score: Number(value) }));
        if (!values.length || values.some((item) => !Number.isFinite(item.score) || item.score < 0 || item.score > 100)) { setNotice('Enter at least one valid mark from 0 to 100.'); return; }
        setBusy(true);
        try {
            await api('teacher/submissions', 'POST', { term, scores: values });
            setSubmissions(await api<Submission[]>('teacher/submissions'));
            setScores({});
            setNotice('Marks submitted to the secretary for review.');
        } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Submission failed.'); }
        finally { setBusy(false); }
    }
    return <main className="role-portal-page"><PortalHeader title="TEACHER WORKSPACE" email={identity?.email || ''} /><div className="role-portal-content"><div className="role-page-heading"><div><span className="eyebrow">TEACHER WORKSPACE</span><h1>Marks submission</h1><p>Submit marks for your assigned subject and class. Results are not published until the secretary approves them.</p></div></div>{notice && <div className="role-notice" role="status">{notice}</div>}<section className="panel role-panel"><div className="panel-heading"><div><h2>{identity?.subject || 'Assigned subject'} · {identity?.form || 'Assigned class'}{identity?.stream ? ` · ${identity.stream}` : ''}</h2><p>Your assignment is set by the school secretary.</p></div><span className="secure-pill">ASSIGNED CLASS ONLY</span></div>{roster.length ? <form onSubmit={submitMarks}><label className="field-label role-term-field">Term<input className="form-input" value={term} onChange={(event) => setTerm(event.target.value)} maxLength={40} required /></label><div className="table-wrap"><table className="role-table"><thead><tr><th>STUDENT</th><th>FORM / STREAM</th><th>MARK (0–100)</th></tr></thead><tbody>{roster.map((student) => { const prior = submissions.find((item) => item.studentId === student.id && item.term === term && item.status !== 'Returned'); return <tr key={student.id}><td><strong>{student.name}</strong><small>{student.id}</small></td><td>{student.form}{student.stream ? ` · ${student.stream}` : ''}</td><td>{prior ? <span className={`status status-${prior.status.toLowerCase()}`}>{prior.status}</span> : <input className="form-input role-score-input" type="number" min="0" max="100" step="1" aria-label={`Mark for ${student.name}`} value={scores[student.id] || ''} onChange={(event) => setScores((current) => ({ ...current, [student.id]: event.target.value }))} />}</td></tr>; })}</tbody></table></div><div className="role-form-actions"><p className="field-hint">Returned marks can be corrected and submitted again. Approved marks cannot be changed by teachers.</p><button className="primary-button" disabled={busy}>{busy ? 'Submitting…' : 'Submit marks for review'} <span>→</span></button></div></form> : <div className="empty-state">No students are assigned to this subject, form, and stream. Contact the secretary to check your assignment.</div>}</section><section className="panel role-panel"><div className="panel-heading"><div><h2>My submissions</h2><p>Only your own submissions and review outcomes are shown.</p></div></div><div className="table-wrap"><table className="role-table"><thead><tr><th>STUDENT</th><th>TERM</th><th>SUBJECT</th><th>SCORE</th><th>STATUS / SECRETARY NOTE</th></tr></thead><tbody>{submissions.map((item) => <tr key={item.id}><td>{item.studentName}</td><td>{item.term}</td><td>{item.subject}</td><td>{item.score}</td><td><span className={`status status-${item.status.toLowerCase()}`}>{item.status}</span>{item.feedback && <small className="role-feedback">{item.feedback}</small>}</td></tr>)}</tbody></table>{!submissions.length && <div className="empty-state">You have not submitted any marks yet.</div>}</div></section></div></main>;
}

type ParentData = { children: Student[]; student: Student; marks: Array<{ term: string; subject: string; score: number }>; attendance: Array<{ date: string; status: string }>; announcements: Announcement[]; feeItems: Array<{ label: string; amount: number }>; payments: Array<{ date: string; amount: number; method: string; reference: string }> };

export function ParentPortal() {
    const [identity, setIdentity] = useState<Identity | null>(null);
    const [data, setData] = useState<ParentData | null>(null);
    const [messages, setMessages] = useState<ParentMessage[]>([]);
    const [childId, setChildId] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const loadMessages = async () => setMessages(await api<ParentMessage[]>('parent/messages'));
    useEffect(() => { api<Identity>('me').then(setIdentity).catch((reason: unknown) => setNotice(reason instanceof Error ? reason.message : 'Unable to load account.')); }, []);
    useEffect(() => {
        let active = true;
        api<ParentData>(`parent/portal${childId ? `?studentId=${encodeURIComponent(childId)}` : ''}`).then((result) => {
            if (!active) return;
            setData(result);
            if (!childId && result.student) setChildId(result.student.id);
        }).catch((reason: unknown) => { if (active) setNotice(reason instanceof Error ? reason.message : 'Unable to load student information.'); });
        return () => { active = false; };
    }, [childId]);
    useEffect(() => { loadMessages().catch((reason: unknown) => setNotice(reason instanceof Error ? reason.message : 'Unable to load messages.')); }, []);
    async function sendMessage(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        try {
            await api('parent/messages', 'POST', { studentId: childId, subject: form.get('subject'), message: form.get('message') });
            event.currentTarget.reset();
            await loadMessages();
            setNotice('Your message was sent to the school secretary.');
        } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'The message could not be sent.'); }
        finally { setBusy(false); }
    }
    const attended = data?.attendance.filter((item) => item.status === 'Present' || item.status === 'Late').length || 0;
    const attendanceDays = data?.attendance.filter((item) => item.status !== 'Excused').length || 0;
    return <main className="role-portal-page"><PortalHeader title="PARENT & GUARDIAN PORTAL" email={identity?.email || ''} /><div className="role-portal-content"><div className="role-page-heading"><div><span className="eyebrow">PRIVATE FAMILY PORTAL</span><h1>Your child’s school information</h1><p>Only student records linked to your verified parent account are shown.</p></div>{data && data.children.length > 1 && <label className="field-label child-picker">Select child<select className="form-input" value={childId} onChange={(event) => setChildId(event.target.value)}>{data.children.map((child) => <option key={child.id} value={child.id}>{child.name} · {child.form}</option>)}</select></label>}</div>{notice && <div className="role-notice" role="status">{notice}</div>}{!data ? <div className="panel empty-state">Loading your linked student’s information…</div> : <><section className="panel parent-child-card"><div><span className="eyebrow">STUDENT</span><h2>{data.student.name}</h2><p>{data.student.form}{data.student.stream ? ` · ${data.student.stream}` : ''} · {data.student.id}</p></div><div className="parent-summary"><div><span>Attendance</span><strong>{attendanceDays ? `${Math.round(attended / attendanceDays * 100)}%` : `${data.student.attendance || 0}%`}</strong></div><div><span>Fee balance</span><strong>KES {Number(data.student.balance || 0).toLocaleString('en-KE')}</strong></div><div><span>Approved subjects</span><strong>{data.marks.length}</strong></div></div></section><div className="parent-content-grid"><section className="panel role-panel"><div className="panel-heading"><div><h2>Approved results</h2><p>Only marks reviewed and approved by the secretary appear here.</p></div></div>{data.marks.length ? <div className="table-wrap"><table className="role-table"><thead><tr><th>TERM</th><th>SUBJECT</th><th>MARK</th></tr></thead><tbody>{data.marks.map((mark, index) => <tr key={`${mark.term}-${mark.subject}-${index}`}><td>{mark.term}</td><td>{mark.subject}</td><td>{mark.score}%</td></tr>)}</tbody></table></div> : <div className="empty-state">No approved marks are available yet.</div>}</section><section className="panel role-panel"><div className="panel-heading"><div><h2>Attendance</h2><p>Recent records for this student.</p></div></div>{data.attendance.length ? <div className="table-wrap"><table className="role-table"><thead><tr><th>DATE</th><th>STATUS</th></tr></thead><tbody>{data.attendance.slice(0, 14).map((item, index) => <tr key={`${item.date}-${index}`}><td>{item.date}</td><td>{item.status}</td></tr>)}</tbody></table></div> : <div className="empty-state">No attendance records have been entered yet.</div>}</section></div><div className="parent-content-grid"><section className="panel role-panel"><div className="panel-heading"><div><h2>Fee account</h2><p>Manual school ledger · no online collection enabled.</p></div></div><div className="parent-balance">Current balance <strong>KES {Number(data.student.balance || 0).toLocaleString('en-KE')}</strong></div>{data.feeItems.map((item) => <div className="fee-row" key={item.label}><span>{item.label}</span><strong>KES {item.amount.toLocaleString('en-KE')}</strong></div>)}<h3 className="role-subheading">Recorded payments</h3>{data.payments.map((payment, index) => <div className="fee-row" key={`${payment.date}-${index}`}><span>{payment.date} · {payment.method}</span><strong>KES {payment.amount.toLocaleString('en-KE')}</strong></div>)}</section><section className="panel role-panel"><div className="panel-heading"><div><h2>School announcements</h2><p>Updates published by the secretary.</p></div></div>{data.announcements.map((item) => <article className="role-announcement" key={item.id}><span>{new Date(item.publishedAt).toLocaleDateString()}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}{!data.announcements.length && <div className="empty-state">There are no announcements yet.</div>}</section></div><section className="panel role-panel"><div className="panel-heading"><div><h2>Requests & messages</h2><p>Send a private question to the secretary and read replies here.</p></div></div><form className="parent-message-form" onSubmit={sendMessage}><label className="field-label">Subject<input className="form-input" name="subject" required maxLength={120} placeholder="What do you need help with?" /></label><label className="field-label">Message<textarea className="form-input enquiry-textarea" name="message" required maxLength={2000} placeholder="Write a private message to the school." /></label><button className="primary-button" disabled={busy}>{busy ? 'Sending…' : 'Send message'} <span>→</span></button></form><div className="parent-messages-list">{messages.map((item) => <article className="role-announcement" key={item.id}><span>{new Date(item.createdAt).toLocaleDateString()} · {item.status}</span><h3>{item.subject}</h3><p>{item.message}</p>{item.response && <div className="secretary-reply"><strong>Secretary reply</strong><p>{item.response}</p></div>}</article>)}{!messages.length && <div className="empty-state">You have not sent a message yet.</div>}</div></section></>}</div></main>;
}

export function SecretaryManagement() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [messages, setMessages] = useState<ParentMessage[]>([]);
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [role, setRole] = useState<Role>('TEACHER');
    const [tab, setTab] = useState<'accounts' | 'marks' | 'attendance' | 'announcements' | 'messages' | 'direct' | 'map'>('accounts');
    const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
    const [directParentEmail, setDirectParentEmail] = useState('');
    const [mapUrl, setMapUrl] = useState('');
    const [secretaryPhone, setSecretaryPhone] = useState('');
    const [paymentDetails, setPaymentDetails] = useState({ provider: '', accountName: '', accountNumber: '', instructions: '' });
    async function refresh() {
        const data = await Promise.all([api<Account[]>('accounts'), api<Student[]>('students'), api<Submission[]>('mark-submissions'), api<AttendanceRow[]>('attendance'), api<Announcement[]>('announcements'), api<ParentMessage[]>('parent-messages'), api<{ secretaryPhone?: string; paymentDetails?: typeof paymentDetails; mapUrl?: string }>('settings')]);
        setAccounts(data[0]); setStudents(data[1]); setSubmissions(data[2]); setAttendance(data[3]); setAnnouncements(data[4]); setMessages(data[5]);
        setSecretaryPhone(data[6].secretaryPhone || ''); setPaymentDetails(data[6].paymentDetails || { provider: '', accountName: '', accountNumber: '', instructions: '' }); setMapUrl(data[6].mapUrl || '');
    }
    useEffect(() => { refresh().catch((reason: unknown) => setNotice(reason instanceof Error ? reason.message : 'Unable to load school management.')); }, []);
    async function saveAccount(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); const form = new FormData(event.currentTarget); const body: Record<string, unknown> = { email: form.get('email'), role };
        if (role === 'TEACHER') Object.assign(body, { subject: form.get('subject'), form: form.get('form'), stream: form.get('stream') });
        if (role === 'PARENT') Object.assign(body, { studentIds: selectedStudents });
        setBusy(true);
        try { await api('accounts', 'POST', body); await refresh(); event.currentTarget.reset(); setSelectedStudents([]); setNotice('School account saved. The user can sign in with the matching Cloudflare Access email.'); }
        catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Account could not be saved.'); }
        finally { setBusy(false); }
    }
    async function setAccountActive(item: Account) {
        try { await api(`accounts/${encodeURIComponent(item.email)}`, 'PATCH', { active: !item.active }); await refresh(); }
        catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Account status could not be changed.'); }
    }
    async function reviewMark(item: Submission, status: 'Approved' | 'Returned') {
        const feedback = status === 'Returned' ? window.prompt('Tell the teacher what needs correction (required):', '') : '';
        if (status === 'Returned' && !feedback?.trim()) return;
        try { await api(`mark-submissions/${item.id}`, 'PATCH', { status, feedback: feedback || '' }); await refresh(); setNotice(`Mark ${status.toLowerCase()}.`); }
        catch (reason) { setNotice(reason instanceof Error ? reason.message : 'The mark could not be reviewed.'); }
    }
    async function recordAttendance(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        try { await api('attendance', 'POST', { studentId: form.get('studentId'), date: form.get('date'), status: form.get('status'), note: form.get('note') }); await refresh(); setNotice('Attendance record saved.'); }
        catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Attendance could not be saved.'); }
    }
    async function publishAnnouncement(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        try { await api('announcements', 'POST', { title: form.get('title'), body: form.get('body') }); await refresh(); event.currentTarget.reset(); setNotice('Announcement published to parent portals.'); }
        catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Announcement could not be published.'); }
    }
    async function respondToParent(item: ParentMessage) {
        const response = window.prompt(`Reply to ${item.parentEmail}:`, item.response || '');
        if (!response?.trim()) return;
        try { await api(`parent-messages/${item.id}`, 'PATCH', { response, status: 'Responded' }); await refresh(); setNotice('Reply saved for the parent portal.'); }
        catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Reply could not be saved.'); }
    }
    async function sendDirectMessage(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        try { await api('parent-messages', 'POST', { parentEmail: form.get('parentEmail'), studentId: form.get('studentId'), subject: form.get('subject'), message: form.get('message') }); await refresh(); event.currentTarget.reset(); setDirectParentEmail(''); setNotice('Direct message is now available in the selected parent portal.'); }
        catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Direct message could not be sent.'); }
    }
    async function saveMapLink(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        try { await api('settings', 'POST', { secretaryPhone, paymentDetails, mapUrl }); setNotice('School map link saved. It is visible from the public home page.'); }
        catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Map link could not be saved.'); }
    }
    const pendingMarks = submissions.filter((item) => item.status === 'Pending');
    return <section className="secretary-management"><PageTitle title="School management" description="Secretary tools for roles, result approvals, attendance, announcements, and parent support." />{notice && <div className="role-notice" role="status">{notice}</div>}<div className="management-tabs">{([['accounts', 'Accounts & roles'], ['marks', `Review marks${pendingMarks.length ? ` (${pendingMarks.length})` : ''}`], ['attendance', 'Attendance'], ['announcements', 'Announcements'], ['messages', `Parent requests${messages.filter((item) => item.status === 'Open' && item.senderRole === 'PARENT').length ? ` (${messages.filter((item) => item.status === 'Open' && item.senderRole === 'PARENT').length})` : ''}`], ['direct', 'Direct messages'], ['map', 'School map link']] as const).map(([value, label]) => <button key={value} className={tab === value ? 'selected' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
        {tab === 'accounts' && <div className="management-grid"><section className="panel role-panel"><div className="panel-heading"><div><h2>Create or update an account</h2><p>Users sign in with Cloudflare Access; no password is stored in this school app.</p></div></div><form onSubmit={saveAccount}><label className="field-label">Cloudflare Access email<input className="form-input" name="email" type="email" required maxLength={254} placeholder="person@example.com" /></label><label className="field-label">Role<select className="form-input" value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="TEACHER">TEACHER</option><option value="PARENT">PARENT</option><option value="SECRETARY">SECRETARY</option></select></label>{role === 'TEACHER' && <><label className="field-label">Assigned subject<select className="form-input" name="subject">{subjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label><label className="field-label">Assigned form<select className="form-input" name="form">{forms.map((form) => <option key={form}>{form}</option>)}</select></label><label className="field-label">Assigned stream<input className="form-input" name="stream" maxLength={80} placeholder="Leave blank if this form has no streams" /></label></>}{role === 'PARENT' && <label className="field-label">Link student(s)<select className="form-input parent-student-select" multiple value={selectedStudents} onChange={(event) => setSelectedStudents(Array.from(event.target.selectedOptions, (option) => option.value))}>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.form}{student.stream ? ` · ${student.stream}` : ''} · ${student.id}</option>)}</select><span className="field-hint">Use Ctrl (Windows) or Command (Mac) to select multiple children.</span></label>}<button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save school account'} <span>→</span></button></form></section><section className="panel role-panel"><div className="panel-heading"><div><h2>School accounts</h2><p>Suspending an account blocks its API access immediately.</p></div></div><div className="role-account-list">{accounts.map((item) => <article className="role-account-row" key={item.email}><div><strong>{item.email}</strong><span>{item.role}{item.role === 'TEACHER' ? ` · ${item.subject} · ${item.form}${item.stream ? ` · ${item.stream}` : ''}` : item.role === 'PARENT' ? ` · linked students: ${item.studentIds.length}` : ''}</span></div><button className="secondary-button compact-button" onClick={() => void setAccountActive(item)}>{item.active ? 'Suspend' : 'Reactivate'}</button></article>)}{!accounts.length && <div className="empty-state">No accounts have been added. Bootstrap the first secretary account in D1 as documented.</div>}</div></section></div>}
        {tab === 'marks' && <section className="panel role-panel"><div className="panel-heading"><div><h2>Teacher mark submissions</h2><p>Approving publishes the score to the linked parent portal. Returning allows the teacher to correct and resubmit.</p></div><span className="secure-pill">PENDING: {pendingMarks.length}</span></div><div className="table-wrap"><table className="role-table"><thead><tr><th>TEACHER</th><th>STUDENT / CLASS</th><th>TERM / SUBJECT</th><th>SCORE</th><th>STATUS</th><th>REVIEW</th></tr></thead><tbody>{submissions.map((item) => <tr key={item.id}><td>{item.teacherEmail}</td><td>{item.studentName}<small>{item.form}{item.stream ? ` · ${item.stream}` : ''} · {item.studentId}</small></td><td>{item.term}<small>{item.subject}</small></td><td>{item.score}</td><td><span className={`status status-${item.status.toLowerCase()}`}>{item.status}</span>{item.feedback && <small className="role-feedback">{item.feedback}</small>}</td><td>{item.status === 'Pending' ? <div className="review-buttons"><button className="primary-button compact-button" onClick={() => void reviewMark(item, 'Approved')}>Approve</button><button className="secondary-button compact-button" onClick={() => void reviewMark(item, 'Returned')}>Return</button></div> : '—'}</td></tr>)}</tbody></table>{!submissions.length && <div className="empty-state">No teacher submissions yet.</div>}</div></section>}
        {tab === 'attendance' && <div className="management-grid"><section className="panel role-panel"><div className="panel-heading"><div><h2>Record attendance</h2><p>One record per student per date; saving again updates it.</p></div></div><form onSubmit={recordAttendance}><label className="field-label">Student<select className="form-input" name="studentId" required>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.form}{student.stream ? ` · ${student.stream}` : ''}</option>)}</select></label><label className="field-label">Date<input className="form-input" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label><label className="field-label">Status<select className="form-input" name="status"><option>Present</option><option>Absent</option><option>Late</option><option>Excused</option></select></label><label className="field-label">Note (optional)<input className="form-input" name="note" maxLength={300} /></label><button className="primary-button">Save attendance</button></form></section><section className="panel role-panel"><div className="panel-heading"><div><h2>Recent attendance</h2><p>Parents see only records for their linked child.</p></div></div><div className="table-wrap"><table className="role-table"><thead><tr><th>STUDENT</th><th>DATE</th><th>STATUS</th></tr></thead><tbody>{attendance.slice(0, 100).map((row) => <tr key={row.id}><td>{row.studentName}<small>{row.form}{row.stream ? ` · ${row.stream}` : ''}</small></td><td>{row.date}</td><td>{row.status}</td></tr>)}</tbody></table></div></section></div>}
        {tab === 'announcements' && <div className="management-grid"><section className="panel role-panel"><div className="panel-heading"><div><h2>Publish announcement</h2><p>Published immediately to all active parent portals.</p></div></div><form onSubmit={publishAnnouncement}><label className="field-label">Title<input className="form-input" name="title" required maxLength={160} /></label><label className="field-label">Message<textarea className="form-input enquiry-textarea" name="body" required maxLength={3000} /></label><button className="primary-button">Publish announcement <span>→</span></button></form></section><section className="panel role-panel"><div className="panel-heading"><div><h2>Published announcements</h2><p>Use WhatsApp or email to share these non-confidential notices.</p></div></div>{announcements.map((item) => <article className="role-announcement" key={item.id}><span>{new Date(item.publishedAt).toLocaleString()}</span><h3>{item.title}</h3><p>{item.body}</p><AnnouncementShareActions item={item} /></article>)}{!announcements.length && <div className="empty-state">No announcements published.</div>}</section></div>}
        {tab === 'messages' && <section className="panel role-panel"><div className="panel-heading"><div><h2>Parent requests</h2><p>Reply here; parents can read your response in their secure portal.</p></div></div><div className="parent-messages-list">{messages.filter((item) => item.senderRole === 'PARENT').map((item) => <article className="role-announcement" key={item.id}><span>{item.parentEmail} · {item.studentName || 'General'} · {new Date(item.createdAt).toLocaleString()}</span><h3>{item.subject}</h3><p>{item.message}</p>{item.response && <div className="secretary-reply"><strong>Current reply</strong><p>{item.response}</p></div>}<button className="secondary-button compact-button" onClick={() => void respondToParent(item)}>{item.status === 'Open' ? 'Reply to parent' : 'Update reply'}</button></article>)}{!messages.some((item) => item.senderRole === 'PARENT') && <div className="empty-state">No parent requests yet.</div>}</div></section>}
        {tab === 'direct' && <div className="management-grid"><section className="panel role-panel"><div className="panel-heading"><div><h2>Send a direct message</h2><p>This private message appears only in the selected parent's signed-in portal.</p></div></div><form onSubmit={sendDirectMessage}><label className="field-label">Parent account<select className="form-input" name="parentEmail" required value={directParentEmail} onChange={(event) => setDirectParentEmail(event.target.value)}><option value="">Select parent</option>{accounts.filter((item) => item.role === 'PARENT' && item.active).map((item) => <option key={item.email} value={item.email}>{item.email}</option>)}</select></label><label className="field-label">Related child (optional)<select className="form-input" name="studentId" defaultValue=""><option value="">General message</option>{accounts.find((item) => item.email === directParentEmail)?.studentIds.map((id) => { const student = students.find((entry) => entry.id === id); return student ? <option key={id} value={id}>{student.name} · {student.form} · {id}</option> : null; })}</select></label><label className="field-label">Subject<input className="form-input" name="subject" required maxLength={120} /></label><label className="field-label">Message<textarea className="form-input enquiry-textarea" name="message" required maxLength={2000} /></label><button className="primary-button">Send private message <span>→</span></button></form></section><section className="panel role-panel"><div className="panel-heading"><div><h2>Sent direct messages</h2><p>Parents can read these when they sign in; nothing is sent to email or WhatsApp automatically.</p></div></div>{messages.filter((item) => item.senderRole === 'SECRETARY').map((item) => <article className="role-announcement" key={item.id}><span>To {item.parentEmail} · {item.studentName || 'General'} · {new Date(item.createdAt).toLocaleString()}</span><h3>{item.subject}</h3><p>{item.message}</p></article>)}{!messages.some((item) => item.senderRole === 'SECRETARY') && <div className="empty-state">No direct messages sent yet.</div>}</section></div>}
        {tab === 'map' && <section className="panel role-panel"><div className="panel-heading"><div><h2>Public school map link</h2><p>Leave blank until the school confirms its map location. Photos and the approved fee schedule remain separate.</p></div></div><form className="parent-message-form" onSubmit={saveMapLink}><label className="field-label">HTTPS map URL<input className="form-input" name="mapUrl" type="url" maxLength={1000} value={mapUrl} onChange={(event) => setMapUrl(event.target.value)} placeholder="Paste the verified school map link when ready" /></label><p className="field-hint">Use a Google Maps or other HTTPS map URL supplied by the school. The link will appear on the public home page.</p>{mapUrl && <a className="map-preview-link" href={mapUrl} target="_blank" rel="noopener noreferrer">Preview current map link ↗</a>}<button className="primary-button">Save map link <span>→</span></button></form></section>}
    </section>;
}

function PageTitle({ title, description }: { title: string; description: string }) {
    return <div className="page-heading"><div><div className="eyebrow">SECRETARY WORKSPACE</div><h1>{title}</h1><p className="subheading">{description}</p></div></div>;
}

function AnnouncementShareActions({ item }: { item: Announcement }) {
    const message = `${item.title}\n\n${item.body}\n\nFor school information or portal access: ${window.location.origin}/`;
    const email = `mailto:?subject=${encodeURIComponent(item.title)}&body=${encodeURIComponent(message)}`;
    const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;
    return <div className="announcement-share-actions"><a className="secondary-button compact-button" href={whatsapp} target="_blank" rel="noopener noreferrer">Share via WhatsApp ↗</a><a className="secondary-button compact-button" href={email}>Share via email ↗</a><span>Opens a draft; the secretary reviews and sends it.</span></div>;
}
