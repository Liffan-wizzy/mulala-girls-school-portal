import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { ParentPortal, RoleRouter, SecretaryManagement, TeacherPortal } from './SchoolPortals';

type Student = { id: string; name: string; form: string; stream?: string; guardian: string; email: string; balance: number; average: number; attendance: number; status: string };
type Applicant = { id: string; name: string; requestedForm: string; guardian: string; date: string; status: 'Pending' | 'Under review' | 'Accepted' | 'Declined' };
type Enquiry = { id: string; name: string; email: string; phone: string; topic: string; message: string; date: string; status: 'New' | 'In progress' | 'Responded' | 'Closed' };
type Payment = { id: string; student: string; studentId?: string; reference: string; date: string; amount: number; method: string };
type FeeItem = { label: string; amount: number };
type AcademicMark = { subject: string; score: number };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type Page = 'Overview' | 'Admissions' | 'Students' | 'Enquiries' | 'School management' | 'Academics & reports' | 'Fees & payments' | 'Settings';

const starterStudents: Student[] = [
    { id: 'MGH-2026-001', name: 'Amina Wanjiku', form: 'Form 4', guardian: 'Joseph Wanjiku', email: 'j.wanjiku@example.com', balance: 12500, average: 78, attendance: 96, status: 'Active' },
    { id: 'MGH-2026-002', name: 'Faith Mutua', form: 'Form 3', guardian: 'Grace Mutua', email: 'g.mutua@example.com', balance: 0, average: 84, attendance: 98, status: 'Active' },
    { id: 'MGH-2026-003', name: 'Lydia Naliaka', form: 'Form 2', guardian: 'Peter Naliaka', email: 'p.naliaka@example.com', balance: 8400, average: 71, attendance: 93, status: 'Active' },
    { id: 'MGH-2026-004', name: 'Esther Chebet', form: 'Form 1', guardian: 'Mary Chebet', email: 'm.chebet@example.com', balance: 22000, average: 89, attendance: 99, status: 'Active' },
    { id: 'MGH-2026-005', name: 'Naomi Mwende', form: 'Form 4', guardian: 'Daniel Mwende', email: 'd.mwende@example.com', balance: 5600, average: 66, attendance: 90, status: 'Active' },
];
const starterApplicants: Applicant[] = [
    { id: 'APP-26041', name: 'Mercy Atieno', requestedForm: 'Form 1', guardian: 'Rose Atieno', date: '2026-09-24', status: 'Pending' },
    { id: 'APP-26040', name: 'Brenda Kilonzo', requestedForm: 'Form 2', guardian: 'James Kilonzo', date: '2026-09-23', status: 'Under review' },
    { id: 'APP-26039', name: 'Irene Wairimu', requestedForm: 'Form 1', guardian: 'Lucy Wairimu', date: '2026-09-22', status: 'Pending' },
];
const starterPayments: Payment[] = [
    { id: 'PAY-3048', student: 'Faith Mutua', reference: 'MPESA-8Q1D4K', date: '2026-09-26', amount: 18000, method: 'M-Pesa' },
    { id: 'PAY-3047', student: 'Amina Wanjiku', reference: 'BANK-48310', date: '2026-09-25', amount: 12000, method: 'Bank transfer' },
    { id: 'PAY-3046', student: 'Lydia Naliaka', reference: 'MPESA-2B9H7A', date: '2026-09-24', amount: 9000, method: 'M-Pesa' },
];
const starterFees: FeeItem[] = [];
const subjectNames = ['English', 'Mathematics', 'Biology', 'Chemistry', 'History', 'Kiswahili'];
const currency = (value: number) => `KES ${value.toLocaleString('en-KE')}`;
const readLocal = <T,>(key: string, fallback: T): T => {
    try { const value = localStorage.getItem(`mulala-${key}`); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
const persistDemoData = (key: string, value: unknown, remote: boolean) => {
    const storageKey = `mulala-${key}`;
    if (remote) { localStorage.removeItem(storageKey); return; }
    localStorage.setItem(storageKey, JSON.stringify(value));
};

function App() {
    const path = window.location.pathname;
    if (path === '/enquire' || path === '/enquire/') return <ParentEnquiryPage />;
    if (path.startsWith('/share/')) return <SharedReportPage token={decodeURIComponent(path.slice('/share/'.length).split('/')[0])} />;
    if (['/admin', '/admin/', '/teacher', '/teacher/', '/parent', '/parent/', '/portal', '/portal/'].includes(path)) {
        const expected = path.startsWith('/teacher') ? 'TEACHER' : path.startsWith('/parent') ? 'PARENT' : undefined;
        return <RoleRouter expected={expected} secretary={<AdminApp />} teacher={<TeacherPortal />} parent={<ParentPortal />} />;
    }
    return <PublicHomePage />;
}

function AdminApp() {
    const [page, setPage] = useState<Page>('Overview');
    const [students, setStudents] = useState<Student[]>(() => readLocal('students', starterStudents));
    const [applicants, setApplicants] = useState<Applicant[]>(() => readLocal('applicants', starterApplicants));
    const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
    const [payments, setPayments] = useState<Payment[]>(() => readLocal('payments', starterPayments));
    const [fees, setFees] = useState<FeeItem[]>(() => readLocal('fees', starterFees));
    const [secretaryPhone, setSecretaryPhone] = useState(() => readLocal('secretary-phone', ''));
    const [paymentDetails, setPaymentDetails] = useState(() => readLocal('payment-details', { provider: '', accountName: '', accountNumber: '', instructions: '' }));
    const [mapUrl, setMapUrl] = useState('');
    const [marksByStudent, setMarksByStudent] = useState<Record<string, AcademicMark[]>>(() => readLocal('marks', {}));
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [modal, setModal] = useState<'admission' | 'payment' | 'student' | 'fee' | 'marks' | null>(null);
    const [shareLink, setShareLink] = useState('');
    const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [search, setSearch] = useState('');
    const [notice, setNotice] = useState('');
    const [remote, setRemote] = useState(false);

    useEffect(() => { persistDemoData('students', students, remote); }, [students, remote]);
    useEffect(() => { persistDemoData('applicants', applicants, remote); }, [applicants, remote]);
    useEffect(() => { persistDemoData('payments', payments, remote); }, [payments, remote]);
    useEffect(() => { persistDemoData('fees', fees, remote); }, [fees, remote]);
    useEffect(() => { persistDemoData('secretary-phone', secretaryPhone, remote); }, [secretaryPhone, remote]);
    useEffect(() => { persistDemoData('payment-details', paymentDetails, remote); }, [paymentDetails, remote]);
    useEffect(() => { persistDemoData('marks', marksByStudent, remote); }, [marksByStudent, remote]);
    useEffect(() => {
        const onBeforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
        const onInstalled = () => { setIsInstalled(true); setInstallPrompt(null); };
        setIsInstalled(window.matchMedia('(display-mode: standalone)').matches);
        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onInstalled);
        return () => { window.removeEventListener('beforeinstallprompt', onBeforeInstall); window.removeEventListener('appinstalled', onInstalled); };
    }, []);
    useEffect(() => {
        let active = true;
        fetch('/api/students').then(async (response) => {
            if (!response.ok) throw new Error('API is not connected');
            const data = await response.json() as Student[];
            if (active && Array.isArray(data)) { setStudents(data); setRemote(true); }
        }).catch(() => { if (active) setRemote(false); });
        fetch('/api/settings').then(async (response) => {
            if (response.ok) { const data = await response.json() as { secretaryPhone?: string; paymentDetails?: typeof paymentDetails; mapUrl?: string }; if (active) { setSecretaryPhone(data.secretaryPhone || ''); if (data.paymentDetails) setPaymentDetails(data.paymentDetails); setMapUrl(data.mapUrl || ''); } }
        }).catch(() => undefined);
        fetch('/api/admissions').then(async (response) => {
            if (response.ok) { const data = await response.json() as Applicant[]; if (active && Array.isArray(data)) setApplicants(data); }
        }).catch(() => undefined);
        fetch('/api/enquiries').then(async (response) => {
            if (response.ok) { const data = await response.json() as Enquiry[]; if (active && Array.isArray(data)) setEnquiries(data); }
        }).catch(() => undefined);
        fetch('/api/finance').then(async (response) => {
            if (response.ok) { const data = await response.json() as { payments?: Payment[]; fees?: FeeItem[] }; if (active) { if (data.payments) setPayments(data.payments); if (data.fees) setFees(data.fees); } }
        }).catch(() => undefined);
        fetch('/api/marks').then(async (response) => {
            if (response.ok) {
                const records = await response.json() as Array<{ studentId: string; term: string; subject: string; score: number }>;
                if (active && Array.isArray(records)) {
                    const grouped: Record<string, AcademicMark[]> = {};
                    for (const record of records.filter((mark) => mark.term === 'Term 3 2026')) (grouped[record.studentId] ??= []).push({ subject: record.subject, score: record.score });
                    setMarksByStudent(grouped);
                }
            }
        }).catch(() => undefined);
        return () => { active = false; };
    }, []);

    const totalOutstanding = students.reduce((sum, student) => sum + student.balance, 0);
    const totalFees = fees.reduce((sum, item) => sum + item.amount, 0);
    const filteredStudents = useMemo(() => students.filter((student) => `${student.name} ${student.id} ${student.form}`.toLowerCase().includes(search.toLowerCase())), [students, search]);
    const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3400); };
    const post = async (path: string, body: unknown) => {
        if (!remote) return;
        try { const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) throw new Error('Request failed'); }
        catch { notify('Cloud save failed. The change is not confirmed; reconnect and try again.'); }
    };
    const patch = async (path: string, body: unknown) => {
        if (!remote) return;
        try { const response = await fetch(`/api/${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) throw new Error('Request failed'); }
        catch { notify('Cloud update failed. The change is not confirmed; reconnect and try again.'); }
    };

    function submitAdmission(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        const item: Applicant = { id: `APP-${Date.now().toString().slice(-5)}`, name: String(form.get('name')), requestedForm: String(form.get('form')), guardian: String(form.get('guardian')), date: new Date().toISOString().slice(0, 10), status: 'Pending' };
        setApplicants((current) => [item, ...current]); void post('admissions', item); setModal(null); notify('Application received and added to the admissions queue.');
    }
    function submitPayment(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); const form = new FormData(event.currentTarget); const studentName = String(form.get('student')); const amount = Number(form.get('amount'));
        const student = students.find((item) => item.name === studentName);
        if (!student) { notify('Select a valid student record.'); return; }
        const payment: Payment = { id: `PAY-${Date.now().toString().slice(-5)}`, student: student.name, studentId: student.id, reference: String(form.get('reference') || 'OFFLINE'), date: new Date().toISOString().slice(0, 10), amount, method: String(form.get('method')) };
        setPayments((current) => [payment, ...current]); setStudents((current) => current.map((student) => student.name === studentName ? { ...student, balance: Math.max(0, student.balance - amount) } : student)); void post('payments', payment); setModal(null); notify('Payment recorded. This does not charge a bank or mobile wallet.');
    }
    function submitStudent(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); const form = new FormData(event.currentTarget); const student: Student = { id: String(form.get('id')), name: String(form.get('name')), form: String(form.get('form')), stream: String(form.get('stream') || ''), guardian: String(form.get('guardian')), email: String(form.get('email')), balance: Number(form.get('balance') || 0), average: 0, attendance: 100, status: 'Active' };
        setStudents((current) => [student, ...current]); void post('students', student); setModal(null); notify('Student record added.');
    }
    function changeAdmission(item: Applicant, status: Applicant['status']) {
        setApplicants((current) => current.map((applicant) => applicant.id === item.id ? { ...applicant, status } : applicant)); void patch(`admissions/${item.id}`, { status });
        if (status === 'Accepted') { const id = `MGH-${new Date().getFullYear()}-${String(students.length + 1).padStart(3, '0')}`; const student: Student = { id, name: item.name, form: item.requestedForm, stream: '', guardian: item.guardian, email: '', balance: 0, average: 0, attendance: 100, status: 'Active' }; setStudents((current) => [student, ...current]); void post('students', student); }
        notify(`Application marked ${status.toLowerCase()}.`);
    }
    function changeEnquiry(item: Enquiry, status: Enquiry['status']) {
        setEnquiries((current) => current.map((enquiry) => enquiry.id === item.id ? { ...enquiry, status } : enquiry));
        void patch(`enquiries/${item.id}`, { status });
    }
    function saveFee(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); const form = new FormData(event.currentTarget); const fee: FeeItem = { label: String(form.get('label')), amount: Number(form.get('amount')) }; setFees((current) => [...current, fee]); void post('fees', fee); setModal(null); notify('Fee item added to the structure.');
    }
    function saveMarks(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        notify('Teachers submit marks for secretary approval in School management.');
    }
    async function createReportShare() {
        if (!selectedStudent || !remote) { notify('Online report sharing will be available after the school database and Access login are connected.'); return; }
        try {
            const response = await fetch('/api/report-shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: selectedStudent.id, term: 'Term 3 2026' }) });
            const data = await response.json() as { url?: string; error?: string };
            if (!response.ok || !data.url) throw new Error(data.error || 'Unable to create a report link.');
            setShareLink(data.url);
            try { await navigator.clipboard?.writeText(data.url); } catch { /* The link remains visible for manual copying. */ }
            notify('Private report link created. It expires in 7 days.');
        } catch (error) { notify(error instanceof Error ? error.message : 'Unable to create a report link.'); }
    }
    async function installPortal() {
        if (!installPrompt) return;
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        setInstallPrompt(null);
        if (choice.outcome === 'accepted') notify('Mulala Girls Portal was installed on this device.');
    }
    async function saveSchoolSettings() {
        if (!remote) { notify('Connect the school Cloudflare database to save settings online.'); return; }
        try {
            const response = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secretaryPhone, paymentDetails, mapUrl }) });
            if (!response.ok) throw new Error('Settings could not be saved to the school database.');
            notify('School contact and payment details saved online.');
        } catch (error) { notify(error instanceof Error ? error.message : 'Cloud save failed.'); }
    }
    function exportCsv() {
        const rows = [['Student ID', 'Student', 'Form', 'Guardian', 'Academic average', 'Attendance %', 'Fee balance'], ...students.map((student) => [student.id, student.name, student.form, student.guardian, String(student.average), String(student.attendance), String(student.balance)])];
        const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = 'mulala-student-report.csv'; link.click(); URL.revokeObjectURL(url); notify('Report downloaded as CSV.');
    }
    function showReport(student: Student) { setSelectedStudent(student); setShareLink(''); }

    const navItems: { label: Page; mark: string }[] = [
        { label: 'Overview', mark: '⌂' }, { label: 'Admissions', mark: '＋' }, { label: 'Students', mark: '♙' }, { label: 'Enquiries', mark: '✉' }, { label: 'School management', mark: '⚒' }, { label: 'Academics & reports', mark: '▤' }, { label: 'Fees & payments', mark: '◇' }, { label: 'Settings', mark: '⚙' },
    ];
    const statusClass = (status: string) => `status status-${status.toLowerCase().replaceAll(' ', '-')}`;
    const selectedMarks = selectedStudent ? marksByStudent[selectedStudent.id] ?? [] : [];
    return <div className="app-shell">
        <aside className="sidebar">
            <div className="brand"><div className="brand-mark">M</div><div><strong>Mulala Girls</strong><span>HIGH SCHOOL</span></div><button className="mobile-close" onClick={() => document.body.classList.remove('menu-open')} aria-label="Close menu">×</button></div>
            <div className="school-chip"><span className="online-dot" /> SCHOOL PORTAL <span className="demo-label">{remote ? 'LIVE' : 'DEMO'}</span></div>
            <div className="side-label">WORKSPACE</div>
            <nav>{navItems.map((item) => <button key={item.label} className={`nav-item ${page === item.label ? 'active' : ''}`} onClick={() => { setPage(item.label); document.body.classList.remove('menu-open'); }}><span className="nav-icon">{item.mark}</span>{item.label}{item.label === 'Admissions' && applicants.filter((a) => a.status === 'Pending').length > 0 && <span className="nav-count">{applicants.filter((a) => a.status === 'Pending').length}</span>}</button>)}</nav>
            <div className="sidebar-spacer" />
            <div className="sidebar-help"><div className="help-icon">i</div><strong>Need a hand?</strong><p>School office contact details can be added in settings.</p><button onClick={() => setPage('Settings')}>School settings <span>→</span></button><a href="/enquire">Parent enquiry page <span>→</span></a></div>
            <div className="sidebar-user"><div className="user-avatar">AD</div><div><strong>School Admin</strong><span>Administrator</span></div><span className="user-more">•••</span></div>
        </aside>

        <main className="main-area">
            <header className="topbar"><button className="mobile-menu" onClick={() => document.body.classList.add('menu-open')} aria-label="Open menu">☰</button><div className="breadcrumbs">Mulala Girls High School <span>/</span> <strong>{page}</strong></div><div className="top-actions"><span className="secure-note"><span>●</span> Secure school workspace</span><button className="bell" aria-label="Notifications" onClick={() => notify(`${applicants.filter((a) => a.status === 'Pending').length} admissions need review.`)}>♧<i /></button><div className="user-avatar top-avatar">AD</div></div></header>
            <div className="page-content">
                {page === 'Overview' && <>
                    <div className="welcome-row"><div><div className="eyebrow">SUNDAY, SEPTEMBER 27, 2026 <span className="eyebrow-line" /></div><h1>Good morning, Admin <span className="wave">✦</span></h1><p className="subheading">Here’s what’s happening at Mulala Girls today.</p></div><button className="primary-button" onClick={() => setModal('admission')}><span>＋</span> New admission</button></div>
                    <div className="stats-grid">
                        <StatCard label="Enrolled students" value={students.length.toLocaleString()} change="Active learners" icon="♙" tone="green" />
                        <StatCard label="New applications" value={applicants.filter((item) => item.status === 'Pending' || item.status === 'Under review').length.toString()} change="Awaiting review" icon="↗" tone="lavender" />
                        <StatCard label="Fees collected" value={currency(payments.reduce((sum, item) => sum + item.amount, 0))} change="Recorded this term" icon="▤" tone="peach" />
                        <StatCard label="Outstanding balance" value={currency(totalOutstanding)} change="Across active students" icon="◇" tone="blue" />
                    </div>
                    <div className="dashboard-grid">
                        <section className="panel performance-panel"><div className="panel-heading"><div><h2>Academic performance</h2><p>Term 3 · 2026 student average</p></div><button className="text-button" onClick={() => setPage('Academics & reports')}>View reports <span>→</span></button></div><div className="chart-area"><div className="chart-y"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div className="chart"><div className="chart-gridline line-1" /><div className="chart-gridline line-2" /><div className="chart-gridline line-3" /><div className="chart-gridline line-4" /><div className="chart-bars">{['Form 1', 'Form 2', 'Form 3', 'Form 4'].map((form, index) => <div className="bar-group" key={form}><div className="bar-track"><div className={`bar bar-${index}`} style={{ height: `${[72, 78, 81, 76][index]}%` }}><span>{[72, 78, 81, 76][index]}%</span></div></div><span className="bar-label">{form}</span></div>)}</div></div></div><div className="chart-legend"><span><i className="legend-dot" /> Current term average</span><span className="muted-legend">Class performance overview</span></div></section>
                        <section className="panel admission-panel"><div className="panel-heading"><div><h2>Admissions</h2><p>Latest applications</p></div><button className="icon-link" onClick={() => setPage('Admissions')}>↗</button></div><div className="mini-list">{applicants.slice(0, 4).map((item, index) => <div className="mini-row" key={item.id}><div className={`person-avatar person-${index}`}>{item.name.split(' ').map((s) => s[0]).join('').slice(0, 2)}</div><div className="person-info"><strong>{item.name}</strong><span>{item.requestedForm} · {item.date}</span></div><span className={statusClass(item.status)}>{item.status}</span></div>)}{applicants.length === 0 && <div className="empty-state">New applications will appear here.</div>}</div><button className="panel-footer-link" onClick={() => setPage('Admissions')}>Review all applications <span>→</span></button></section>
                    </div>
                    <div className="lower-grid"><section className="panel roster-panel"><div className="panel-heading"><div><h2>Student overview</h2><p>Quick look at recently updated records</p></div><button className="text-button" onClick={() => setPage('Students')}>View all students <span>→</span></button></div><StudentTable students={students.slice(0, 4)} onSelect={showReport} compact /></section><section className="panel media-panel"><div className="panel-heading"><div><h2>School moments</h2><p>Photo spaces · add your images later</p></div><span className="photo-count">03 SPACES</span></div><div className="photo-spaces"><div className="photo-slot campus-slot"><span className="photo-plus">＋</span><span>Campus photo</span></div><div className="photo-slot"><span className="photo-plus">＋</span><span>School life</span></div><div className="photo-slot"><span className="photo-plus">＋</span><span>Achievements</span></div></div><p className="photo-caption">These are placeholders. Replace with school-approved photos when ready.</p></section></div>
                </>}

                {page === 'Admissions' && <><PageHeading eyebrow="ENROLLMENT" title="Admissions" description="Receive applications and manage each applicant through review." action={<button className="primary-button" onClick={() => setModal('admission')}><span>＋</span> Add application</button>} /><div className="stats-strip"><span><strong>{applicants.length}</strong> total applications</span><span><strong>{applicants.filter((a) => a.status === 'Pending').length}</strong> pending review</span><span><strong>{applicants.filter((a) => a.status === 'Accepted').length}</strong> accepted</span></div><section className="panel table-panel"><div className="table-toolbar"><div><h2>Application queue</h2><p>Review new student applications</p></div><SearchBox value={search} onChange={setSearch} placeholder="Search applicants..." /></div><div className="table-wrap"><table><thead><tr><th>APPLICANT</th><th>APPLICATION ID</th><th>FORM</th><th>GUARDIAN</th><th>DATE RECEIVED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{applicants.filter((a) => `${a.name} ${a.id} ${a.guardian}`.toLowerCase().includes(search.toLowerCase())).map((item) => <tr key={item.id}><td><div className="table-person"><div className="person-avatar">{item.name.split(' ').map((s) => s[0]).join('').slice(0, 2)}</div><strong>{item.name}</strong></div></td><td className="id-cell">{item.id}</td><td>{item.requestedForm}</td><td>{item.guardian}</td><td>{item.date}</td><td><span className={statusClass(item.status)}>{item.status}</span></td><td><select className="action-select" value={item.status} onChange={(event) => changeAdmission(item, event.target.value as Applicant['status'])}><option>Pending</option><option>Under review</option><option>Accepted</option><option>Declined</option></select></td></tr>)}</tbody></table>{applicants.length === 0 && <div className="empty-state">No applications yet. Add the first one to get started.</div>}</div></section></>}

                {page === 'Students' && <><PageHeading eyebrow="SCHOOL ROSTER" title="Students" description="Manage student profiles, guardians, and enrollment details." action={<button className="primary-button" onClick={() => setModal('student')}><span>＋</span> Add student</button>} /><div className="stats-strip"><span><strong>{students.length}</strong> enrolled students</span><span><strong>{students.filter((s) => s.form === 'Form 4').length}</strong> Form 4 learners</span><span><strong>{students.filter((s) => s.balance > 0).length}</strong> with fee balance</span></div><section className="panel table-panel"><div className="table-toolbar"><div><h2>Student directory</h2><p>Click a student to view their performance report</p></div><SearchBox value={search} onChange={setSearch} placeholder="Search name, ID or form..." /></div><StudentTable students={filteredStudents} onSelect={showReport} /></section></>}

                {page === 'Enquiries' && <><PageHeading eyebrow="PARENT & GUARDIAN MESSAGES" title="School enquiries" description="Review questions sent through the public parent enquiry form." /><div className="stats-strip"><span><strong>{enquiries.length}</strong> total enquiries</span><span><strong>{enquiries.filter((item) => item.status === 'New').length}</strong> new</span><span><strong>{enquiries.filter((item) => item.status === 'In progress').length}</strong> in progress</span></div><section className="panel table-panel"><div className="table-toolbar"><div><h2>Enquiry inbox</h2><p>Only authorized school staff can view these messages.</p></div><SearchBox value={search} onChange={setSearch} placeholder="Search enquiries..." /></div><div className="table-wrap"><table className="enquiry-table"><thead><tr><th>FROM</th><th>TOPIC</th><th>MESSAGE</th><th>RECEIVED</th><th>STATUS</th></tr></thead><tbody>{enquiries.filter((item) => `${item.name} ${item.email} ${item.topic} ${item.message}`.toLowerCase().includes(search.toLowerCase())).map((item) => <tr key={item.id}><td><div className="enquiry-contact"><strong>{item.name}</strong><a href={`mailto:${item.email}`}>{item.email}</a>{item.phone && <span>{item.phone}</span>}</div></td><td>{item.topic}</td><td className="enquiry-message">{item.message}</td><td>{item.date}</td><td><select className="action-select" value={item.status} onChange={(event) => changeEnquiry(item, event.target.value as Enquiry['status'])}><option>New</option><option>In progress</option><option>Responded</option><option>Closed</option></select></td></tr>)}</tbody></table>{enquiries.length === 0 && <div className="empty-state">No parent enquiries yet. New messages will appear here.</div>}</div></section></>}

                {page === 'School management' && <SecretaryManagement />}

                {page === 'Academics & reports' && <><PageHeading eyebrow="LEARNING & PROGRESS" title="Academics & reports" description="Review performance summaries and prepare student reports for families." action={<button className="secondary-button" onClick={exportCsv}>↓ Export roster</button>} /><div className="notice-banner"><span className="notice-symbol">✓</span><div><strong>Family report access is protected</strong><span>Student reports should only be shared through an authenticated parent or student account.</span></div><span className="secure-pill">PRIVATE</span></div><div className="report-layout"><section className="panel table-panel"><div className="table-toolbar"><div><h2>Student performance</h2><p>Term 3 · 2026 academic averages</p></div><SearchBox value={search} onChange={setSearch} placeholder="Find a student..." /></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>FORM</th><th>AVERAGE</th><th>ATTENDANCE</th><th>REPORT</th></tr></thead><tbody>{filteredStudents.map((student) => <tr key={student.id}><td><div className="table-person"><div className="person-avatar">{student.name.split(' ').map((s) => s[0]).join('').slice(0, 2)}</div><div><strong>{student.name}</strong><small>{student.id}</small></div></div></td><td>{student.form}</td><td><div className="score-cell"><span>{student.average}%</span><div className="score-track"><i style={{ width: `${student.average}%` }} /></div></div></td><td>{student.attendance}%</td><td><button className="table-action" onClick={() => showReport(student)}>Open report ↗</button></td></tr>)}</tbody></table></div></section><aside className="panel report-side"><div className="report-side-icon">▤</div><h3>Share progress with families</h3><p>Open a student's report to review their marks, then print or save a private copy for an authorized guardian.</p><div className="report-side-rule" /><span className="side-meta">REPORT PERIOD</span><strong>Term 3 · 2026</strong><span className="side-meta">SUBJECTS TRACKED</span><strong>6 core subjects</strong><button className="secondary-button full-button" onClick={exportCsv}>Download class summary</button></aside></div></>}

                {page === 'Fees & payments' && <><PageHeading eyebrow="SCHOOL FINANCE" title="Fees & payments" description="Track fee balances and record payments received by the school." action={<button className="primary-button" onClick={() => setModal('payment')}><span>＋</span> Record payment</button>} /><div className="stats-grid finance-stats"><StatCard label="Total fee balance" value={currency(totalOutstanding)} change="Due from active students" icon="◇" tone="blue" /><StatCard label="Payments recorded" value={currency(payments.reduce((sum, p) => sum + p.amount, 0))} change="Current records" icon="↙" tone="green" /><StatCard label="Annual fee structure" value={currency(totalFees)} change="Editable in settings" icon="▤" tone="peach" /><StatCard label="Students with balance" value={students.filter((s) => s.balance > 0).length.toString()} change={`Of ${students.length} students`} icon="♙" tone="lavender" /></div><div className="finance-grid"><section className="panel table-panel"><div className="table-toolbar"><div><h2>Fee balances</h2><p>Current outstanding balance by student</p></div><SearchBox value={search} onChange={setSearch} placeholder="Search students..." /></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>FORM</th><th>GUARDIAN</th><th>FEE BALANCE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{filteredStudents.map((student) => <tr key={student.id}><td><div className="table-person"><div className="person-avatar">{student.name.split(' ').map((s) => s[0]).join('').slice(0, 2)}</div><div><strong>{student.name}</strong><small>{student.id}</small></div></div></td><td>{student.form}</td><td>{student.guardian}</td><td className="balance-cell">{currency(student.balance)}</td><td><span className={student.balance > 0 ? 'status status-pending' : 'status status-accepted'}>{student.balance > 0 ? 'Balance due' : 'Cleared'}</span></td><td><button className="table-action" onClick={() => { setSelectedStudent(student); setModal('payment'); }}>Record payment</button></td></tr>)}</tbody></table></div></section><section className="panel payments-panel"><div className="panel-heading"><div><h2>Recent payments</h2><p>Latest entries to the ledger</p></div><span className="photo-count">{payments.length} ENTRIES</span></div><div className="payment-list">{payments.slice(0, 5).map((payment) => <div className="payment-row" key={payment.id}><div className="payment-mark">↙</div><div className="payment-main"><strong>{payment.student}</strong><span>{payment.method} · {payment.date}</span><small>{payment.reference}</small></div><strong className="payment-amount">+{currency(payment.amount)}</strong></div>)}</div></section></div><div className="disclaimer"><span>i</span> Payments are recorded manually here. Online card/mobile-money collection is not enabled until a payment provider is connected.</div></>}

                {page === 'Settings' && <><PageHeading eyebrow="SCHOOL PROFILE" title="Settings" description="Add contact details and enter official finance information when it is ready." /><div className="settings-grid"><section className="panel settings-panel"><div className="settings-title"><div className="settings-icon">☎</div><div><h2>School contact</h2><p>Contact details shown on school notices and reports</p></div></div><label className="field-label" htmlFor="secretary-phone">Secretary phone number</label><div className="input-with-prefix"><span>+254</span><input id="secretary-phone" type="tel" placeholder="Enter number when ready" value={secretaryPhone} onChange={(event) => setSecretaryPhone(event.target.value)} /></div><p className="field-hint">Left blank until you provide the secretary’s number. Do not enter a personal number without permission.</p></section><section className="panel settings-panel"><div className="settings-title"><div className="settings-icon warm">◇</div><div><h2>School payment account</h2><p>Account details can be entered later</p></div></div><label className="field-label">Bank, M-Pesa or payment provider<input className="form-input" placeholder="Add provider later" value={paymentDetails.provider} onChange={(event) => setPaymentDetails({ ...paymentDetails, provider: event.target.value })} /></label><label className="field-label">Account name<input className="form-input" placeholder="School account name" value={paymentDetails.accountName} onChange={(event) => setPaymentDetails({ ...paymentDetails, accountName: event.target.value })} /></label><label className="field-label">Account number / Paybill<input className="form-input" placeholder="Add account details later" value={paymentDetails.accountNumber} onChange={(event) => setPaymentDetails({ ...paymentDetails, accountNumber: event.target.value })} /></label><label className="field-label">Payment instructions<input className="form-input" placeholder="Optional reference or account instructions" value={paymentDetails.instructions} onChange={(event) => setPaymentDetails({ ...paymentDetails, instructions: event.target.value })} /></label><p className="field-hint">These fields only save display details. Online payment collection is not enabled.</p></section><section className="panel settings-panel"><div className="settings-title"><div className="settings-icon warm">▤</div><div><h2>Annual fee structure</h2><p>Amounts in Kenyan shillings · enter the approved schedule when available</p></div><button className="secondary-button compact-button" onClick={() => setModal('fee')}>＋ Add item</button></div>{fees.length ? <><div className="fee-list">{fees.map((fee, index) => <div className="fee-row" key={`${fee.label}-${index}`}><span>{fee.label}</span><strong>{currency(fee.amount)}</strong></div>)}</div><div className="fee-total"><span>Annual total</span><strong>{currency(totalFees)}</strong></div></> : <div className="empty-state">No fee items entered yet. Add the official school fee structure when ready.</div>}<p className="field-hint">No fee amounts have been prefilled. Use the approved fee schedule only.</p></section><section className="panel settings-panel photo-settings"><div className="settings-title"><div className="settings-icon">▧</div><div><h2>School photos</h2><p>Image spaces are ready for your approved school photos.</p></div></div><div className="photo-space-large"><span>＋</span><strong>School crest or campus photo</strong><small>Placeholder only · add approved images later</small></div><div className="photo-mini-spaces"><span>＋ Student photo</span><span>＋ School life photo</span></div><p className="field-hint">Avoid uploading identifiable student images until consent and access controls are in place.</p></section></div></>}
            </div>
        </main>

        {page === 'Settings' && <button className="settings-save-floating primary-button" onClick={() => void saveSchoolSettings()}>Save school settings</button>}
        {installPrompt && !isInstalled && <button className="install-floating secondary-button" onClick={installPortal}>＋ Install school app</button>}
        {notice && <div className="toast"><span>✓</span>{notice}</div>}
        {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><div className="modal-card"><div className="modal-heading"><div><span className="eyebrow">MULALA GIRLS HIGH SCHOOL</span><h2>{modal === 'admission' ? 'New application' : modal === 'payment' ? 'Record a payment' : modal === 'student' ? 'Add student record' : modal === 'marks' ? 'Enter academic marks' : 'Add fee item'}</h2></div><button className="modal-close" onClick={() => setModal(null)} aria-label="Close">×</button></div>
            {modal === 'admission' && <form onSubmit={submitAdmission}><FormField label="Applicant's full name" name="name" required placeholder="e.g. Jane Mwikali" /><label className="field-label">Form applying for<select className="form-input" name="form"><option>Form 1</option><option>Form 2</option><option>Form 3</option><option>Form 4</option></select></label><FormField label="Parent / guardian name" name="guardian" required placeholder="Guardian's full name" /><p className="modal-hint">Store application details securely. Supporting documents can be added once secure file storage is configured.</p><ModalActions onCancel={() => setModal(null)} submit="Add to admissions" /></form>}
            {modal === 'payment' && <form onSubmit={submitPayment}><label className="field-label">Student<select className="form-input" name="student" required defaultValue={selectedStudent?.name || ''}><option value="" disabled>Select student</option>{students.map((student) => <option key={student.id}>{student.name}</option>)}</select></label><FormField label="Amount received (KES)" name="amount" required type="number" min="1" placeholder="0" /><label className="field-label">Payment method<select className="form-input" name="method"><option>M-Pesa</option><option>Bank transfer</option><option>Cash</option><option>Other</option></select></label><FormField label="Transaction / receipt reference" name="reference" placeholder="Optional reference" /><p className="modal-hint">This records a payment already received; it does not initiate a transfer or charge.</p><ModalActions onCancel={() => setModal(null)} submit="Save payment" /></form>}
            {modal === 'student' && <form onSubmit={submitStudent}><FormField label="Student ID" name="id" required placeholder="e.g. MGH-2026-006" /><FormField label="Full name" name="name" required placeholder="Student full name" /><label className="field-label">Form<select className="form-input" name="form"><option>Form 1</option><option>Form 2</option><option>Form 3</option><option>Form 4</option></select></label><FormField label="Parent / guardian" name="guardian" required placeholder="Guardian name" /><FormField label="Guardian email" name="email" type="email" placeholder="name@example.com" /><FormField label="Fee balance (KES)" name="balance" type="number" min="0" placeholder="0" /><ModalActions onCancel={() => setModal(null)} submit="Add student" /></form>}
            {modal === 'fee' && <form onSubmit={saveFee}><FormField label="Fee item" name="label" required placeholder="e.g. Laboratory" /><FormField label="Annual amount (KES)" name="amount" required type="number" min="0" placeholder="0" /><p className="modal-hint">Enter an amount from the school's approved fee schedule.</p><ModalActions onCancel={() => setModal(null)} submit="Add fee item" /></form>}
            {modal === 'marks' && selectedStudent && <form onSubmit={saveMarks}><p className="modal-hint">Enter this student's Term 3, 2026 results. Leave a subject blank if no result is available.</p>{subjectNames.map((subject) => <label className="field-label" key={subject}>{subject} (%)<input className="form-input" name={subject} type="number" min="0" max="100" placeholder="0–100" defaultValue={marksByStudent[selectedStudent.id]?.find((mark) => mark.subject === subject)?.score ?? ''} /></label>)}<ModalActions onCancel={() => setModal(null)} submit="Save marks" /></form>}
        </div></div>}
        {selectedStudent && modal !== 'payment' && modal !== 'marks' && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedStudent(null); }}><div className="modal-card report-modal"><div className="modal-heading"><div><span className="eyebrow">TERM 3 · 2026 PERFORMANCE REPORT</span><h2>{selectedStudent.name}</h2><p className="report-student-id">{selectedStudent.id} · {selectedStudent.form}</p></div><button className="modal-close" onClick={() => setSelectedStudent(null)} aria-label="Close">×</button></div><div className="report-summary"><div><span>Overall average</span><strong>{selectedStudent.average}%</strong></div><div><span>Attendance</span><strong>{selectedStudent.attendance}%</strong></div><div><span>Class</span><strong>{selectedStudent.form}</strong></div></div><h3 className="report-section-title">Subject results <span>Term 3 · 2026</span></h3><div className="subject-list">{selectedMarks.length ? selectedMarks.map((mark) => <div className="subject-row" key={mark.subject}><span>{mark.subject}</span><div className="score-track"><i style={{ width: `${mark.score}%` }} /></div><strong>{mark.score}%</strong></div>) : <div className="empty-state">No marks entered for this term yet.</div>}</div><div className="report-private"><span>🔒</span> Private link access is limited to these marks and expires after 7 days. Send only to the verified guardian.</div>{shareLink && <div className="share-link-box"><input aria-label="Private family report link" readOnly value={shareLink} /><button className="secondary-button compact-button" onClick={() => { void navigator.clipboard?.writeText(shareLink); notify('Report link copied.'); }}>Copy</button></div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setSelectedStudent(null)}>Close</button>{selectedMarks.length > 0 && <button type="button" className="secondary-button" onClick={() => void createReportShare()}>Create private link</button>}<button type="button" className="secondary-button" onClick={() => setModal('marks')}>Enter / update marks</button><button type="button" className="primary-button" onClick={() => window.print()}>Print / save report <span>↗</span></button></div></div></div>}
    </div>;
}

type SharedReport = { student: { name: string; form: string; average: number; attendance: number }; term: string; expiresAt: string; marks: AcademicMark[] };
function SharedReportPage({ token }: { token: string }) {
    const [report, setReport] = useState<SharedReport | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        fetch(`/api/shared-reports/${encodeURIComponent(token)}`).then(async (response) => {
            const data = await response.json() as SharedReport | { error?: string };
            if (!response.ok) throw new Error('error' in data ? data.error || 'Report link unavailable.' : 'Report link unavailable.');
            if (active) setReport(data as SharedReport);
        }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Report link unavailable.'); });
        return () => { active = false; };
    }, [token]);
    return <main className="family-report-page"><article className="family-report-card"><div className="family-brand"><div className="brand-mark">M</div><div><strong>Mulala Girls High School</strong><span>PRIVATE FAMILY REPORT</span></div></div>{error ? <div className="family-error"><h1>Report unavailable</h1><p>{error}</p><p>Ask the school to create a new report link if you believe this is a mistake.</p></div> : !report ? <div className="family-loading">Opening your secure report…</div> : <><div className="eyebrow">{report.term} · ACADEMIC PROGRESS</div><h1>{report.student.name}</h1><p className="family-subtitle">{report.student.form} · Prepared for an authorized family member</p><div className="report-summary"><div><span>Overall average</span><strong>{report.student.average}%</strong></div><div><span>Attendance</span><strong>{report.student.attendance}%</strong></div><div><span>Subjects</span><strong>{report.marks.length}</strong></div></div><h2>Subject results</h2><div className="subject-list">{report.marks.map((mark) => <div className="subject-row" key={mark.subject}><span>{mark.subject}</span><div className="score-track"><i style={{ width: `${mark.score}%` }} /></div><strong>{mark.score}%</strong></div>)}</div><p className="family-expiry">This private link expires {new Date(report.expiresAt).toLocaleString()}.</p><button className="primary-button" onClick={() => window.print()}>Print / save report</button></>}</article></main>;
}

function StatCard({ label, value, change, icon, tone }: { label: string; value: string; change: string; icon: string; tone: string }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-label">{label}</div><strong className="stat-value">{value}</strong><div className="stat-change"><span>↗</span> {change}</div></div>; }
function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="subheading">{description}</p></div>{action}</div>; }
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="search-box"><span>⌕</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><kbd>⌘ K</kbd></label>; }
function StudentTable({ students, onSelect, compact = false }: { students: Student[]; onSelect: (student: Student) => void; compact?: boolean }) { return <div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>FORM</th>{!compact && <th>GUARDIAN</th>}<th>AVERAGE</th><th>FEE BALANCE</th><th>REPORT</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td><div className="table-person"><div className="person-avatar">{student.name.split(' ').map((s) => s[0]).join('').slice(0, 2)}</div><div><strong>{student.name}</strong><small>{student.id}</small></div></div></td><td>{student.form}</td>{!compact && <td>{student.guardian}</td>}<td><span className="average-pill">{student.average}%</span></td><td className="balance-cell">{currency(student.balance)}</td><td><button className="table-action" onClick={() => onSelect(student)}>View report ↗</button></td></tr>)}</tbody></table>{students.length === 0 && <div className="empty-state">No students match your search.</div>}</div>; }
function FormField({ label, name, placeholder, required = false, type = 'text', min }: { label: string; name: string; placeholder: string; required?: boolean; type?: string; min?: string }) { return <label className="field-label">{label}<input className="form-input" name={name} type={type} min={min} placeholder={placeholder} required={required} /></label>; }
function ModalActions({ onCancel, submit }: { onCancel: () => void; submit: string }) { return <div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button">{submit} <span>→</span></button></div>; }

export default App;

function PublicHomePage() {
    const [mapUrl, setMapUrl] = useState('');
    useEffect(() => { fetch('/api/public-settings').then(async (response) => { if (response.ok) { const settings = await response.json() as { mapUrl?: string }; setMapUrl(settings.mapUrl || ''); } }).catch(() => undefined); }, []);
    return <main className="public-home-page"><header className="public-home-header"><div className="family-brand"><div className="brand-mark">M</div><div><strong>Mulala Girls High School</strong><span>SCHOOL PORTAL</span></div></div><div className="public-login-actions"><a className="secondary-button" href="/portal">Staff sign in <span>→</span></a><a className="secondary-button" href="/parent">Parent sign in <span>→</span></a></div></header><section className="public-home-content"><div className="public-home-copy"><span className="eyebrow">WELCOME TO MULALA GIRLS</span><h1>How can we help your family?</h1><p>For admissions questions, school information, or other general enquiries, send a message to the school office. Our team will follow up using the contact details you provide.</p><a className="primary-button" href="/enquire">Send a school enquiry <span>→</span></a>{mapUrl && <a className="public-map-link" href={mapUrl} target="_blank" rel="noopener noreferrer">View school location on map ↗</a>}<p className="public-home-note">Please do not include sensitive student records or private academic or financial information in a general enquiry.</p></div><div className="public-home-card"><div className="report-side-icon">✉</div><h2>Parent & guardian support</h2><p>Ask about admissions, school life, or general information. Your message is sent securely to the school team.</p><a href="/enquire">Open enquiry form <span>→</span></a></div></section><footer className="public-home-footer">Mulala Girls High School · Official school information is provided by the school office. Photos and fee schedule remain placeholders until approved.</footer></main>;
}

function ParentEnquiryPage() {
    const [sending, setSending] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');
    async function submitEnquiry(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSending(true);
        setError('');
        const form = new FormData(event.currentTarget);
        try {
            const response = await fetch('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), email: form.get('email'), phone: form.get('phone'), topic: form.get('topic'), message: form.get('message'), website: form.get('website') }) });
            const data = await response.json() as { error?: string };
            if (!response.ok) throw new Error(data.error || 'Your message could not be sent. Please try again.');
            setSubmitted(true);
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Your message could not be sent. Please try again.'); }
        finally { setSending(false); }
    }
    return <main className="parent-enquiry-page"><header className="public-home-header"><a className="family-brand" href="/"><div className="brand-mark">M</div><div><strong>Mulala Girls High School</strong><span>PARENT & GUARDIAN ENQUIRIES</span></div></a><a className="secondary-button" href="/">Home</a></header><section className="parent-enquiry-layout"><div className="parent-enquiry-intro"><span className="eyebrow">WE’RE HERE TO HELP</span><h1>Send a school enquiry</h1><p>Use this form to ask a general question about admissions, school life, or information about the school. A member of the school team can follow up using your email address.</p><div className="parent-enquiry-reminder"><strong>Need information about a current student?</strong><span>Please contact the school office through an approved, private channel. Do not send student marks, fee balances, identity documents, or other sensitive details here.</span></div></div><section className="parent-enquiry-card">{submitted ? <div className="enquiry-success"><div className="enquiry-success-icon">✓</div><h2>Thank you for contacting us</h2><p>Your enquiry has been sent to the school team. Please allow time for a response using the email address you provided.</p><a href="/" className="secondary-button">Back to school portal</a></div> : <form onSubmit={submitEnquiry}><label className="field-label">Your name<input className="form-input" name="name" autoComplete="name" maxLength={120} required placeholder="Full name" /></label><label className="field-label">Email address<input className="form-input" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" /></label><label className="field-label">Phone number <span className="optional-label">Optional</span><input className="form-input" name="phone" type="tel" autoComplete="tel" maxLength={40} placeholder="Phone number" /></label><label className="field-label">What is your enquiry about?<select className="form-input" name="topic" required defaultValue=""><option value="" disabled>Select a topic</option><option>Admissions</option><option>Fees and payments</option><option>School life</option><option>Academic information</option><option>Other</option></select></label><label className="field-label">Your message<textarea className="form-input enquiry-textarea" name="message" maxLength={2000} required placeholder="How can the school help?" /></label><label className="enquiry-honeypot" aria-hidden="true">Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" /></label><p className="modal-hint">This form is for general enquiries only. Do not include confidential student information.</p>{error && <p className="enquiry-error" role="alert">{error}</p>}<button className="primary-button enquiry-submit" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send enquiry'} <span>→</span></button></form>}</section></section><footer className="public-home-footer">Mulala Girls High School · Your message is visible only to authorized school staff.</footer></main>;
}
