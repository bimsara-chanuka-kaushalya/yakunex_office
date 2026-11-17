'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Award,
  Bell,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  DollarSign,
  Laptop,
  Network,
  Plus,
  Send,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/providers';
import { api, patch, post } from '@/lib/api';
import { PERMISSIONS } from '@/lib/permissions';

// ─── 1. Organization & Hierarchy View ────────────────────────────────────────
interface OrgPayload {
  departments: Array<{
    id: string;
    name: string;
    code: string;
    headTitle: string;
    description: string;
  }>;
  employees: Array<{
    id: string;
    companyId: string | null;
    fullName: string;
    email: string;
    role: string;
    title: string | null;
    status: string;
    managerId: string | null;
    department: { id: string; name: string } | null;
  }>;
  hierarchy: Array<{ level: string; leads: string; reportsTo: string | null }>;
}

export function OrganizationView() {
  const { can } = useAuth();
  const [data, setData] = useState<OrgPayload | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [headTitle, setHeadTitle] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [selectedMgrId, setSelectedMgrId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<OrgPayload>('/organization');
    setData(res);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreateDept(e: FormEvent) {
    e.preventDefault();
    await post('/organization/departments', { name: deptName, code: deptCode, headTitle });
    setDeptName('');
    setDeptCode('');
    setHeadTitle('');
    setNotice('Department created.');
    await load();
  }

  async function onAssignManager(e: FormEvent) {
    e.preventDefault();
    if (!selectedEmpId) return;
    await patch('/organization/assign-manager', {
      userId: selectedEmpId,
      managerId: selectedMgrId || null,
    });
    setNotice('Reporting manager updated.');
    await load();
  }

  if (!data) return <Skeleton className="h-80 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Organization &amp; Departments</h2>
        <p className="mt-1 text-sm text-muted">
          Yakunex Technologies hierarchy from Board / MD to Interns, departments, and reporting lines.
        </p>
      </header>

      {notice && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Departments" value={String(data.departments.length)} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Employees" value={String(data.employees.length)} icon={<Network className="h-5 w-5" />} />
        <StatCard label="Org Tiers" value={String(data.hierarchy.length)} icon={<Award className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader title="Company Organization Hierarchy" description="Executive, Management, Technical, Operations, Finance, HR & Legal structure." />
        <div className="divide-y divide-line">
          {data.hierarchy.map((node) => (
            <div key={node.level} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-sm">
              <div>
                <p className="font-semibold text-ink">{node.level}</p>
                <p className="text-xs text-muted">{node.leads}</p>
              </div>
              <Badge tone="gold">{node.reportsTo ? `Reports to ${node.reportsTo}` : 'Top Governance'}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Departments" description="Active company departments & department heads." />
          <div className="divide-y divide-line">
            {data.departments.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-semibold text-ink">
                    {d.name} <span className="font-mono text-xs text-muted">({d.code})</span>
                  </p>
                  <p className="text-xs text-muted">{d.description}</p>
                </div>
                <Badge tone="neutral">{d.headTitle}</Badge>
              </div>
            ))}
          </div>
          {can(PERMISSIONS.SETTINGS_MANAGE) && (
            <form onSubmit={onCreateDept} className="space-y-3 border-t border-line p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Add Department</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input placeholder="Name" required value={deptName} onChange={(e) => setDeptName(e.target.value)} />
                <Input placeholder="Code (e.g. RND)" required value={deptCode} onChange={(e) => setDeptCode(e.target.value)} />
                <Input placeholder="Head Title" value={headTitle} onChange={(e) => setHeadTitle(e.target.value)} />
              </div>
              <Button type="submit" size="sm">
                <Plus className="h-4 w-4" /> Create Department
              </Button>
            </form>
          )}
        </Card>

        <Card>
          <CardHeader title="Reporting Managers" description="Configure reporting manager per employee." />
          <div className="max-h-72 divide-y divide-line overflow-y-auto">
            {data.employees.map((emp) => {
              const mgr = data.employees.find((m) => m.id === emp.managerId);
              return (
                <div key={emp.id} className="flex items-center justify-between px-5 py-2.5 text-xs">
                  <div>
                    <p className="font-semibold text-ink">
                      {emp.companyId ? `${emp.companyId} · ` : ''}{emp.fullName}
                    </p>
                    <p className="text-muted">{emp.title || emp.role}</p>
                  </div>
                  <Badge tone="neutral">{mgr ? `Mgr: ${mgr.fullName}` : 'No Manager'}</Badge>
                </div>
              );
            })}
          </div>
          {can(PERMISSIONS.USERS_WRITE) && (
            <form onSubmit={onAssignManager} className="space-y-3 border-t border-line p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Assign Reporting Manager</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select value={selectedEmpId} onChange={(e) => setSelectedEmpId(e.target.value)} required>
                  <option value="">Select Employee…</option>
                  {data.employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                  ))}
                </Select>
                <Select value={selectedMgrId} onChange={(e) => setSelectedMgrId(e.target.value)}>
                  <option value="">No Manager</option>
                  {data.employees.map((mgr) => (
                    <option key={mgr.id} value={mgr.id}>{mgr.fullName}</option>
                  ))}
                </Select>
              </div>
              <Button type="submit" size="sm">Save Reporting Line</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── 2. Approval Center View ─────────────────────────────────────────────────
interface ApprovalRow {
  id: string;
  source: 'LEAVE' | 'GENERAL';
  type: string;
  title: string;
  description: string;
  requestedByName: string;
  amount?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';
  decidedByName?: string | null;
  createdAt: string;
}

export function ApprovalsView() {
  const { can } = useAuth();
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);
  const [type, setType] = useState('EXPENSE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const isApprover = can(PERMISSIONS.LEAVE_APPROVE) || can(PERMISSIONS.TIME_APPROVE) || can(PERMISSIONS.USERS_WRITE);

  const load = useCallback(async () => {
    const res = await api<ApprovalRow[]>('/approvals');
    setRows(res);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await post('/approvals', {
      type,
      title,
      description,
      amount: amount ? Number(amount) : undefined,
    });
    setTitle('');
    setDescription('');
    setAmount('');
    await load();
  }

  async function onDecide(row: ApprovalRow, status: 'APPROVED' | 'REJECTED' | 'RETURNED') {
    await patch(`/approvals/${row.id}/decision`, { status, source: row.source });
    await load();
  }

  if (!rows) return <Skeleton className="h-72 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Approval Center</h2>
        <p className="mt-1 text-sm text-muted">
          Centralized queue for Leave, Timesheet, Expense, Purchase, Document &amp; Correction approvals.
        </p>
      </header>

      <Card>
        <CardHeader title="Submit Approval Request" description="Route an expense, purchase, attendance correction, or document approval." />
        <form onSubmit={onSubmit} className="grid gap-4 p-5 md:grid-cols-4">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="EXPENSE">Expense Approval</option>
            <option value="PURCHASE">Purchase Approval</option>
            <option value="ATTENDANCE_CORRECTION">Attendance Correction</option>
            <option value="TIMESHEET">Timesheet Approval</option>
            <option value="OVERTIME">Overtime Approval</option>
            <option value="DOCUMENT">Document Approval</option>
          </Select>
          <Input placeholder="Request title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Amount (optional)" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Button type="submit"><Send className="h-4 w-4" /> Submit</Button>
          <div className="md:col-span-4">
            <Input placeholder="Description / justification" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Approval Queue" description={`${rows.filter((r) => r.status === 'PENDING').length} pending request(s)`} />
        <div className="divide-y divide-line">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted">No approval requests yet.</p>
          ) : (
            rows.map((r) => (
              <div key={`${r.source}-${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{r.type}</Badge>
                    <p className="font-semibold text-ink">{r.title}</p>
                    {r.amount !== undefined && (
                      <span className="font-mono text-xs text-gold-strong">${r.amount.toLocaleString()}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    By {r.requestedByName} · {r.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'gold'}>
                    {r.status}
                  </Badge>
                  {isApprover && r.status === 'PENDING' && (
                    <>
                      <Button size="sm" variant="primary" onClick={() => void onDecide(r, 'APPROVED')}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void onDecide(r, 'REJECTED')}>
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── 3. Finance & Payroll View ───────────────────────────────────────────────
interface FinancePayload {
  totalIncome: number;
  totalExpenses: number;
  totalPayroll: number;
  netProfit: number;
  entries: Array<{
    id: string;
    type: 'INCOME' | 'EXPENSE' | 'INVOICE' | 'PAYROLL';
    category: string;
    description: string;
    projectName?: string | null;
    amount: number;
    status: string;
    recordedByName: string;
    recordedAt: string;
  }>;
}

export function FinanceView() {
  const { can } = useAuth();
  const [data, setData] = useState<FinancePayload | null>(null);
  const [type, setType] = useState<'INCOME' | 'EXPENSE' | 'INVOICE' | 'PAYROLL'>('INCOME');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    const res = await api<FinancePayload>('/finance');
    setData(res);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await post('/finance/entries', { type, category, amount: Number(amount), description });
    setCategory('');
    setAmount('');
    setDescription('');
    await load();
  }

  if (!data) return <Skeleton className="h-72 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Finance &amp; Payroll</h2>
        <p className="mt-1 text-sm text-muted">Authorized company revenue, expenses, invoices, and payroll ledger.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Revenue / Invoices" value={`$${data.totalIncome.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Expenses" value={`$${data.totalExpenses.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Payroll" value={`$${data.totalPayroll.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Net Profit" value={`$${data.netProfit.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
      </div>

      {can(PERMISSIONS.FINANCIALS_WRITE) && (
        <Card>
          <CardHeader title="Record Financial Entry" description="Log income, invoice, expense, or payroll disbursement." />
          <form onSubmit={onCreate} className="grid gap-3 p-5 md:grid-cols-5">
            <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="INCOME">Income</option>
              <option value="INVOICE">Invoice</option>
              <option value="EXPENSE">Expense</option>
              <option value="PAYROLL">Payroll</option>
            </Select>
            <Input placeholder="Category" required value={category} onChange={(e) => setCategory(e.target.value)} />
            <Input placeholder="Amount" type="number" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Button type="submit"><Plus className="h-4 w-4" /> Record</Button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title="Ledger Entries" description={`${data.entries.length} record(s)`} />
        <div className="divide-y divide-line">
          {data.entries.length === 0 ? (
            <p className="p-6 text-sm text-muted">No financial entries recorded yet.</p>
          ) : (
            data.entries.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={entry.type === 'INCOME' || entry.type === 'INVOICE' ? 'success' : 'neutral'}>{entry.type}</Badge>
                    <span className="font-semibold text-ink">{entry.category}</span>
                  </div>
                  <p className="text-xs text-muted">{entry.description} · By {entry.recordedByName}</p>
                </div>
                <span className="font-mono font-bold text-ink">${entry.amount.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── 4. Assets View ──────────────────────────────────────────────────────────
interface AssetRow {
  id: string;
  tag: string;
  name: string;
  category: string;
  assignedToName?: string | null;
  condition: string;
  status: string;
}

export function AssetsView() {
  const { can } = useAuth();
  const [rows, setRows] = useState<AssetRow[] | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('LAPTOP');
  const [assignedToName, setAssignedToName] = useState('');

  const load = useCallback(async () => {
    const res = await api<AssetRow[]>('/assets');
    setRows(res);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await post('/assets', { name, category, assignedToName: assignedToName || null });
    setName('');
    setAssignedToName('');
    await load();
  }

  if (!rows) return <Skeleton className="h-72 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Asset Management</h2>
        <p className="mt-1 text-sm text-muted">Track company laptops, monitors, software licenses, and device assignments.</p>
      </header>

      {can(PERMISSIONS.USERS_WRITE) && (
        <Card>
          <CardHeader title="Register Asset" description="Add a new company asset and assign it to a team member." />
          <form onSubmit={onCreate} className="grid gap-3 p-5 md:grid-cols-4">
            <Input placeholder="Asset Name (e.g. MacBook Pro 14)" required value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="LAPTOP">Laptop</option>
              <option value="MONITOR">Monitor</option>
              <option value="LICENSE">Software License</option>
              <option value="MOBILE">Mobile Device</option>
              <option value="OFFICE">Office Equipment</option>
            </Select>
            <Input placeholder="Assigned To (optional)" value={assignedToName} onChange={(e) => setAssignedToName(e.target.value)} />
            <Button type="submit"><Laptop className="h-4 w-4" /> Add Asset</Button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title="Asset Registry" description={`${rows.length} asset(s)`} />
        <div className="divide-y divide-line">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted">No assets registered yet.</p>
          ) : (
            rows.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-sm">
                <div>
                  <p className="font-semibold text-ink">
                    <span className="font-mono text-xs text-gold-strong">{a.tag}</span> · {a.name}
                  </p>
                  <p className="text-xs text-muted">
                    {a.category} · {a.assignedToName ? `Assigned to ${a.assignedToName}` : 'Unassigned'}
                  </p>
                </div>
                <Badge tone={a.status === 'ASSIGNED' ? 'gold' : 'success'}>{a.status}</Badge>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── 5. Performance View ─────────────────────────────────────────────────────
interface PerformanceRow {
  id: string;
  employeeName: string;
  period: string;
  goalTitle: string;
  completionPercent: number;
  rating: number;
  feedback: string;
  reviewerName: string;
}

export function PerformanceView() {
  const [rows, setRows] = useState<PerformanceRow[] | null>(null);
  const [employeeName, setEmployeeName] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [completionPercent, setCompletionPercent] = useState('80');
  const [rating, setRating] = useState('4');
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    const res = await api<PerformanceRow[]>('/performance');
    setRows(res);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await post('/performance', {
      employeeName: employeeName || undefined,
      goalTitle,
      completionPercent: Number(completionPercent),
      rating: Number(rating),
      feedback,
    });
    setGoalTitle('');
    setFeedback('');
    await load();
  }

  if (!rows) return <Skeleton className="h-72 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Performance &amp; Goals</h2>
        <p className="mt-1 text-sm text-muted">Monthly targets, task outcomes, and manager feedback reviews.</p>
      </header>

      <Card>
        <CardHeader title="Add Goal / Review" description="Record an employee goal, completion progress, and rating (1–5)." />
        <form onSubmit={onCreate} className="grid gap-3 p-5 md:grid-cols-5">
          <Input placeholder="Employee Name (blank = Self)" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
          <Input placeholder="Goal / Deliverable" required value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} />
          <Input placeholder="% Complete" type="number" min="0" max="100" value={completionPercent} onChange={(e) => setCompletionPercent(e.target.value)} />
          <Select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="5">5 / 5 — Outstanding</option>
            <option value="4">4 / 5 — Exceeds</option>
            <option value="3">3 / 5 — Meets</option>
            <option value="2">2 / 5 — Needs Focus</option>
            <option value="1">1 / 5 — Unsatisfactory</option>
          </Select>
          <Button type="submit"><Award className="h-4 w-4" /> Save Goal</Button>
          <div className="md:col-span-5">
            <Input placeholder="Quality & outcome feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Reviews & Goals" description={`${rows.length} record(s)`} />
        <div className="divide-y divide-line">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted">No performance goals logged yet.</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
                <div>
                  <p className="font-semibold text-ink">{r.employeeName} — {r.goalTitle}</p>
                  <p className="text-xs text-muted">{r.feedback} · Reviewed by {r.reviewerName} ({r.period})</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{r.completionPercent}%</Badge>
                  <Badge tone="gold">{r.rating} / 5 ★</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── 6. Notifications & Announcements View ───────────────────────────────────
interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  authorName: string;
  read: boolean;
  createdAt: string;
}

export function NotificationsView() {
  const { can } = useAuth();
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    const res = await api<NotificationRow[]>('/notifications');
    setRows(res);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPublish(e: FormEvent) {
    e.preventDefault();
    await post('/notifications/announcements', { title, body });
    setTitle('');
    setBody('');
    await load();
  }

  async function onMarkRead(id: string) {
    await patch(`/notifications/${id}/read`, {});
    await load();
  }

  if (!rows) return <Skeleton className="h-72 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Notifications &amp; Announcements</h2>
        <p className="mt-1 text-sm text-muted">Company-wide announcements, approval alerts, and system updates.</p>
      </header>

      {can(PERMISSIONS.USERS_WRITE) && (
        <Card>
          <CardHeader title="Publish Company Announcement" description="Broadcast an official notice to all employees." />
          <form onSubmit={onPublish} className="space-y-3 p-5">
            <Field label="Announcement Title" htmlFor="ann-title">
              <Input id="ann-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q4 All-Hands Townhall" />
            </Field>
            <Field label="Message" htmlFor="ann-body">
              <Input id="ann-body" required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Announcement details..." />
            </Field>
            <Button type="submit"><Bell className="h-4 w-4" /> Publish Notice</Button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title="Inbox" description={`${rows.filter((r) => !r.read).length} unread`} />
        <div className="divide-y divide-line">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted">No notifications yet.</p>
          ) : (
            rows.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={n.read ? 'neutral' : 'gold'}>{n.type}</Badge>
                    <p className="font-semibold text-ink">{n.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted">{n.body} · By {n.authorName}</p>
                </div>
                {!n.read && (
                  <Button size="sm" variant="secondary" onClick={() => void onMarkRead(n.id)}>
                    <Check className="h-3.5 w-3.5" /> Mark Read
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── 7. Employee Personal Profile (/profile) ─────────────────────────────────
interface EmployeeProfilePayload {
  id: string;
  companyId: string | null;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  nicNumber: string;
  address: string;
  birthday: string;
  phone: string;
  avatarUrl: string | null;
  role: string;
  title: string;
  status: string;
  pendingRequests: Array<{
    id: string;
    field?: 'nicNumber' | 'phone';
    newValue?: string;
    createdAt: string;
  }>;
}

export function ProfileView() {
  const { user, can, reload } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isHrOrSuperAdmin = isSuperAdmin || can(PERMISSIONS.USERS_WRITE);

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [directory, setDirectory] = useState<Array<{ id: string; companyId: string | null; fullName: string }>>([]);
  const [profile, setProfile] = useState<EmployeeProfilePayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Admin / HR editable fields
  const [fullName, setFullName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nicNumber, setNicNumber] = useState('');
  const [address, setAddress] = useState('');
  const [birthday, setBirthday] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('STAFF');
  const [title, setTitle] = useState('');

  // User approval-request inputs for NIC & Contact Number
  const [reqNic, setReqNic] = useState('');
  const [reqPhone, setReqPhone] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('userId');
      if (q) setSelectedUserId(q);
    }
  }, []);

  const applyProfileState = useCallback((data: EmployeeProfilePayload) => {
    setProfile(data);
    setFullName(data.fullName ?? '');
    setFirstName(data.firstName ?? '');
    setLastName(data.lastName ?? '');
    setNicNumber(data.nicNumber ?? '');
    setAddress(data.address ?? '');
    setBirthday(data.birthday ?? '');
    setPhone(data.phone ?? '');
    setRole(data.role ?? 'STAFF');
    setTitle(data.title ?? '');
    setReqNic(data.nicNumber ?? '');
    setReqPhone(data.phone ?? '');
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const endpoint = selectedUserId ? `/profile/${selectedUserId}` : '/profile';
    try {
      const data = await api<EmployeeProfilePayload>(endpoint);
      applyProfileState(data);
    } catch (err) {
      if (user && (!selectedUserId || selectedUserId === user.id)) {
        const parts = (user.fullName || 'Employee').trim().split(/\s+/).filter(Boolean);
        applyProfileState({
          id: user.id,
          companyId: user.companyId ?? null,
          email: user.email,
          fullName: user.fullName,
          firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : user.fullName,
          lastName: parts.length > 1 ? parts[parts.length - 1] : '',
          nicNumber: '',
          address: '',
          birthday: '',
          phone: '',
          avatarUrl: null,
          role: user.role,
          title: '',
          status: user.status,
          pendingRequests: [],
        });
      } else {
        setError(err instanceof Error ? err.message : 'Unable to load profile.');
      }
    }
  }, [selectedUserId, user, applyProfileState]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ employees?: Array<{ id: string; companyId: string | null; fullName: string }> }>('/organization')
      .then((res) => setDirectory(Array.isArray(res?.employees) ? res.employees : []))
      .catch(() => undefined);
  }, []);

  async function compressAvatarToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read image file.'));
      reader.onload = () => {
        const rawUrl = String(reader.result ?? '');
        const img = new Image();
        img.onerror = () => resolve(rawUrl);
        img.onload = () => {
          const maxSize = 256;
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.84));
        };
        img.src = rawUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleDpFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      const dataUrl = await compressAvatarToDataUrl(file);
      const updated = await patch<EmployeeProfilePayload>('/profile/dp', { avatarUrl: dataUrl });
      applyProfileState(updated);
      setNotice('Profile picture updated!');
      void reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update DP.');
    }
  }

  async function requestFieldApproval(field: 'nicNumber' | 'phone', newValue: string) {
    setError(null);
    setNotice(null);
    try {
      await post('/profile/request-change', { field, newValue });
      setNotice(
        `${field === 'nicNumber' ? 'NIC ID Number' : 'Contact Number'} change request sent for Super Admin / HR approval.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit request.');
    }
  }

  async function saveAdminFields(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        fullName,
        firstName,
        lastName,
        nicNumber,
        address,
        birthday,
        phone,
      };
      if (isSuperAdmin) {
        payload.role = role;
        payload.title = title;
      }
      await patch(`/profile/${profile.id}`, payload);
      setNotice('Profile updated successfully.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    }
  }

  if (!profile) return <Skeleton className="h-96 rounded-2xl" />;
  const isViewingSelf = !selectedUserId || selectedUserId === user?.id;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Employee Profile</h2>
          <p className="mt-1 text-sm text-muted">
            View personal details, update your DP, or request NIC &amp; Contact Number changes.
          </p>
        </div>
        {directory.length > 0 && (
          <div className="w-72">
            <Select
              aria-label="Select employee profile"
              value={selectedUserId || user?.id || ''}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              {user && !directory.some((d) => d.id === user.id) && (
                <option value={user.id}>
                  {user.companyId ? `${user.companyId} · ` : ''}{user.fullName} (Me)
                </option>
              )}
              {directory.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.companyId ? `${emp.companyId} · ` : ''}{emp.fullName}
                  {emp.id === user?.id ? ' (Me)' : ''}
                </option>
              ))}
            </Select>
          </div>
        )}
      </header>

      {notice && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Top Identity + DP Card */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-2 border-gold/40 bg-canvas">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt={profile.fullName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-2xl font-bold text-gold-strong">
                  {profile.fullName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-2xl font-semibold text-ink">{profile.fullName}</h3>
                {profile.companyId && <Badge tone="gold">{profile.companyId}</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted">
                {profile.title || profile.role} · {profile.email}
              </p>
              {isViewingSelf && (
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold-strong transition hover:bg-gold/20">
                  <Camera className="h-3.5 w-3.5" /> Change Profile Picture (DP)
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      void handleDpFile(f);
                    }}
                  />
                </label>
              )}
            </div>
          </div>
          <Badge tone={profile.status === 'ACTIVE' ? 'success' : 'neutral'}>{profile.status}</Badge>
        </div>
      </Card>

      {/* Self-service Approval Requests for NIC & Contact Number */}
      {isViewingSelf && (
        <Card>
          <CardHeader
            title="Self-Service Update Requests (Requires Super Admin / HR Approval)"
            description="Submit a change request for your NIC ID Number or Contact Number."
          />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-line bg-canvas/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">NIC ID Number</span>
                {profile.pendingRequests.some((p) => p.field === 'nicNumber') && (
                  <Badge tone="gold">Pending Approval</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={reqNic}
                  onChange={(e) => setReqNic(e.target.value)}
                  placeholder="Enter NIC ID Number"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void requestFieldApproval('nicNumber', reqNic)}
                >
                  Request
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-line bg-canvas/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">Contact Number</span>
                {profile.pendingRequests.some((p) => p.field === 'phone') && (
                  <Badge tone="gold">Pending Approval</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={reqPhone}
                  onChange={(e) => setReqPhone(e.target.value)}
                  placeholder="Enter Contact Number"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void requestFieldApproval('phone', reqPhone)}
                >
                  Request
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Full Profile Details (Editable by Super Admin & HR, Job Role by Super Admin only) */}
      <Card>
        <CardHeader
          title="Personal & Employment Information"
          description={
            isSuperAdmin
              ? 'Super Admin Access: You can edit all employee details including Job Role.'
              : isHrOrSuperAdmin
                ? 'HR Access: You can edit personal details. Job Role can only be changed by Super Admin.'
                : 'Read-only personal record. Contact HR or Super Admin for corrections.'
          }
        />
        <form onSubmit={saveAdminFields} className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Full Name (Super Admin & HR)" htmlFor="pf-full">
            <Input id="pf-full" disabled={!isHrOrSuperAdmin} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Initials / First Name (මුලකුරු — Super Admin & HR)" htmlFor="pf-first">
            <Input id="pf-first" disabled={!isHrOrSuperAdmin} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last Name (Super Admin & HR)" htmlFor="pf-last">
            <Input id="pf-last" disabled={!isHrOrSuperAdmin} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          <Field label="NIC ID Number (Approval / Super Admin & HR)" htmlFor="pf-nic">
            <Input id="pf-nic" disabled={!isHrOrSuperAdmin} value={nicNumber} onChange={(e) => setNicNumber(e.target.value)} placeholder="e.g. 200012345678" />
          </Field>
          <Field label="Contact Number (Approval / Super Admin & HR)" htmlFor="pf-phone">
            <Input id="pf-phone" disabled={!isHrOrSuperAdmin} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+94 7X XXX XXXX" />
          </Field>
          <Field label="Birthday (Super Admin & HR)" htmlFor="pf-dob">
            <Input id="pf-dob" type="date" disabled={!isHrOrSuperAdmin} value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Address (Super Admin & HR)" htmlFor="pf-addr">
              <Input id="pf-addr" disabled={!isHrOrSuperAdmin} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Residential address" />
            </Field>
          </div>
          <Field label="Job Role / Designation (Super Admin Only)" htmlFor="pf-title">
            <Input id="pf-title" disabled={!isSuperAdmin} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="System Role (Super Admin Only)" htmlFor="pf-role">
            <Select id="pf-role" disabled={!isSuperAdmin} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin / C-Level / Legal</option>
              <option value="PROJECT_MANAGER">Management (HR / PM / BA / PO / ACC)</option>
              <option value="STAFF">Core Staff (TL / SE / QA / UI-UX / DevOps)</option>
              <option value="INTERN">Intern / Trainee</option>
            </Select>
          </Field>

          {isHrOrSuperAdmin && (
            <div className="flex justify-end md:col-span-2">
              <Button type="submit">
                <UserCheck className="h-4 w-4" /> Save Profile Changes
              </Button>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
