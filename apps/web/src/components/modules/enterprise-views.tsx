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
  Download,
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AvatarCropModal } from '@/components/ui/avatar-crop-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/components/providers';
import { api, clearApiCache, liveGet, patch, post } from '@/lib/api';
import { useLiveSync } from '@/lib/use-live-sync';
import { exportBrandedPdf } from '@/lib/pdf-export';
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
  const toast = useToast();
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

  useLiveSync(load);

  async function onCreateDept(e: FormEvent) {
    e.preventDefault();
    try {
      await post('/organization/departments', { name: deptName, code: deptCode, headTitle });
      setDeptName('');
      setDeptCode('');
      setHeadTitle('');
      setNotice('Department created.');
      toast.success('Department created.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to create department.');
    }
  }

  async function onAssignManager(e: FormEvent) {
    e.preventDefault();
    if (!selectedEmpId) return;
    try {
      await patch('/organization/assign-manager', {
        userId: selectedEmpId,
        managerId: selectedMgrId || null,
      });
      setNotice('Reporting manager updated.');
      toast.success('Reporting manager updated.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update reporting manager.');
    }
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
  const toast = useToast();
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

  useLiveSync(load);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await post('/approvals', {
        type,
        title,
        description,
        amount: amount ? Number(amount) : undefined,
      });
      setTitle('');
      setDescription('');
      setAmount('');
      toast.success('Approval request submitted.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to submit approval request.');
    }
  }

  async function onDecide(row: ApprovalRow, status: 'APPROVED' | 'REJECTED' | 'RETURNED') {
    try {
      await patch(`/approvals/${row.id}/decision`, { status, source: row.source });
      toast.success(`Request ${status.toLowerCase()}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to process approval decision.');
    }
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

interface PayrollEmployeeRow {
  userId?: string;
  userName: string;
  totalMinutes?: number;
  regularMinutes?: number;
  overtimeMinutes?: number;
  billableMinutes?: number;
  approvedMinutes?: number;
  hours?: number;
}

interface ClientInvoiceRow {
  id: string;
  invoiceNumber: string;
  clientName: string;
  projectName?: string | null;
  issueDate: string;
  dueDate: string;
  currency: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  subtotal: number;
  ssclRate: number;
  ssclAmount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE';
  notes: string;
}

export function FinanceView() {
  const { user, can } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<FinancePayload | null>(null);
  const [invoices, setInvoices] = useState<ClientInvoiceRow[]>([]);
  const [payrollRows, setPayrollRows] = useState<PayrollEmployeeRow[]>([]);
  const [hourlyRate, setHourlyRate] = useState<number>(1250);
  const [type, setType] = useState<'INCOME' | 'EXPENSE' | 'INVOICE' | 'PAYROLL'>('INCOME');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  // Client Tax Invoice Builder state
  const [invClient, setInvClient] = useState('');
  const [invProject, setInvProject] = useState('');
  const [invDesc, setInvDesc] = useState('Software Engineering & Cloud Delivery Milestone');
  const [invAmount, setInvAmount] = useState('');
  const [invApplySscl, setInvApplySscl] = useState(true);
  const [invApplyVat, setInvApplyVat] = useState(true);

  const load = useCallback(async () => {
    const [res, rep, invs] = await Promise.all([
      api<FinancePayload>('/finance'),
      api<{ timesheetSummary?: PayrollEmployeeRow[] }>('/reports/summary').catch(() => ({
        timesheetSummary: [],
      })),
      api<ClientInvoiceRow[]>('/finance/invoices').catch(() => []),
    ]);
    setData(res);
    setPayrollRows(Array.isArray(rep?.timesheetSummary) ? rep.timesheetSummary : []);
    setInvoices(Array.isArray(invs) ? invs : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveSync(load);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await post('/finance/entries', { type, category, amount: Number(amount), description });
      setCategory('');
      setAmount('');
      setDescription('');
      toast.success('Financial entry recorded.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to record financial entry.');
    }
  }

  async function onCreateInvoice(e: FormEvent) {
    e.preventDefault();
    const unitPrice = Number(invAmount);
    if (!invClient.trim() || !Number.isFinite(unitPrice) || unitPrice <= 0) return;
    try {
      await post('/finance/invoices', {
        clientName: invClient.trim(),
        projectName: invProject.trim() || null,
        currency: 'LKR',
        applySscl: invApplySscl,
        applyVat: invApplyVat,
        lineItems: [{ description: invDesc.trim() || 'IT Services', quantity: 1, unitPrice }],
      });
      setInvClient('');
      setInvProject('');
      setInvAmount('');
      toast.success('Client tax invoice issued.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to issue tax invoice.');
    }
  }

  async function onMarkInvoiceStatus(id: string, status: ClientInvoiceRow['status']) {
    try {
      await patch(`/finance/invoices/${id}/status`, { status });
      toast.success(`Invoice marked ${status}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update invoice status.');
    }
  }

  if (!data) return <Skeleton className="h-72 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Finance &amp; Payroll</h2>
          <p className="mt-1 text-sm text-muted">Authorized company revenue, expenses, invoices, and payroll ledger.</p>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            exportBrandedPdf({
              title: 'Financial Summary & Ledger Report',
              subtitle: 'Yakunex Technologies — Authorized Finance & Payroll Statement',
              generatedByEmail: user?.email,
              generatedByName: user?.fullName,
              kpis: [
                { label: 'Revenue / Invoices', value: `$${data.totalIncome.toLocaleString()}` },
                { label: 'Expenses', value: `$${data.totalExpenses.toLocaleString()}` },
                { label: 'Payroll', value: `$${data.totalPayroll.toLocaleString()}` },
                { label: 'Net Profit', value: `$${data.netProfit.toLocaleString()}` },
              ],
              columns: ['Type', 'Category', 'Description', 'Recorded By', 'Amount'],
              rows: data.entries.map((e) => [
                e.type,
                e.category,
                e.description || '—',
                e.recordedByName,
                `$${e.amount.toLocaleString()}`,
              ]),
            })
          }
        >
          <Download className="h-4 w-4" /> Export Finance PDF
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Revenue / Invoices" value={`LKR ${data.totalIncome.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Expenses" value={`LKR ${data.totalExpenses.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Payroll" value={`LKR ${data.totalPayroll.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Net Profit" value={`LKR ${data.netProfit.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
      </div>

      {/* Sri Lanka Client Tax Invoice Builder (SSCL 2.5% + VAT 18%) */}
      <Card>
        <CardHeader
          title="Client Tax Invoices (Sri Lanka SSCL 2.5% + VAT 18%)"
          description="Generate numbered Yakunex tax invoices, download Branded Invoice PDFs, and auto-post settled payments to Ledger."
          badge={<Badge tone="gold">{invoices.length} Invoice(s)</Badge>}
        />
        {can(PERMISSIONS.FINANCIALS_WRITE) && (
          <form onSubmit={onCreateInvoice} className="space-y-3 border-b border-line p-5">
            <div className="grid gap-3 md:grid-cols-4">
              <Input placeholder="Client Company Name" required value={invClient} onChange={(e) => setInvClient(e.target.value)} />
              <Input placeholder="Project Name (optional)" value={invProject} onChange={(e) => setInvProject(e.target.value)} />
              <Input placeholder="Subtotal (LKR)" type="number" min="1" required value={invAmount} onChange={(e) => setInvAmount(e.target.value)} />
              <Button type="submit"><Plus className="h-4 w-4" /> Issue Tax Invoice</Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Input
                placeholder="Line item description"
                value={invDesc}
                onChange={(e) => setInvDesc(e.target.value)}
                className="flex-1 min-w-[220px]"
              />
              <div className="flex items-center gap-4 text-xs text-muted">
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={invApplySscl} onChange={(e) => setInvApplySscl(e.target.checked)} />
                  <span>SSCL (2.5%)</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={invApplyVat} onChange={(e) => setInvApplyVat(e.target.checked)} />
                  <span>VAT (18%)</span>
                </label>
              </div>
            </div>
          </form>
        )}
        <div className="divide-y divide-line">
          {invoices.length === 0 ? (
            <p className="p-5 text-xs text-muted">No client tax invoices issued yet.</p>
          ) : (
            invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-gold-strong dark:text-gold">{inv.invoiceNumber}</span>
                    <span className="font-semibold text-ink">{inv.clientName}</span>
                    <Badge tone={inv.status === 'PAID' ? 'success' : inv.status === 'OVERDUE' ? 'danger' : 'gold'}>
                      {inv.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {inv.projectName ? `${inv.projectName} · ` : ''}
                    Subtotal LKR {inv.subtotal.toLocaleString()} + SSCL {inv.ssclRate}% + VAT {inv.vatRate}% · Due {inv.dueDate}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-ink">
                    {inv.currency} {inv.totalAmount.toLocaleString()}
                  </span>
                  {can(PERMISSIONS.FINANCIALS_WRITE) && inv.status !== 'PAID' && (
                    <Button size="sm" variant="primary" onClick={() => void onMarkInvoiceStatus(inv.id, 'PAID')}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      exportBrandedPdf({
                        title: `TAX INVOICE — ${inv.invoiceNumber}`,
                        subtitle: `Bill To: ${inv.clientName}${inv.projectName ? ` · Project: ${inv.projectName}` : ''} · Due ${inv.dueDate}`,
                        generatedByEmail: user?.email,
                        generatedByName: user?.fullName,
                        kpis: [
                          { label: 'Invoice Status', value: inv.status },
                          { label: 'Subtotal', value: `${inv.currency} ${inv.subtotal.toLocaleString()}` },
                          { label: `Tax (SSCL ${inv.ssclRate}% + VAT ${inv.vatRate}%)`, value: `${inv.currency} ${(inv.ssclAmount + inv.vatAmount).toLocaleString()}` },
                          { label: 'Grand Total', value: `${inv.currency} ${inv.totalAmount.toLocaleString()}` },
                        ],
                        columns: ['Description', 'Qty', 'Unit Price', 'Line Total'],
                        rows: [
                          ...inv.lineItems.map((li) => [
                            li.description,
                            String(li.quantity),
                            `${inv.currency} ${li.unitPrice.toLocaleString()}`,
                            `${inv.currency} ${li.amount.toLocaleString()}`,
                          ]),
                          ['SSCL Levy', `${inv.ssclRate}%`, '—', `${inv.currency} ${inv.ssclAmount.toLocaleString()}`],
                          ['Value Added Tax (VAT)', `${inv.vatRate}%`, '—', `${inv.currency} ${inv.vatAmount.toLocaleString()}`],
                          ['TOTAL PAYABLE', '—', '—', `${inv.currency} ${inv.totalAmount.toLocaleString()}`],
                        ],
                      })
                    }
                  >
                    <Download className="h-3.5 w-3.5" /> Invoice PDF
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

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

      <Card>
        <CardHeader
          title="Monthly Payroll & Payslip Generator"
          description="Calculated from Yakunex Workforce timesheet hours (Regular + 1.5x OT over 160h/month)"
          action={
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted">Base Rate ($/hr):</span>
              <Input
                type="number"
                min={1}
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Math.max(1, Number(e.target.value) || 25))}
                className="h-8 w-20 text-xs"
              />
            </div>
          }
        />
        <div className="divide-y divide-line">
          {payrollRows.length === 0 ? (
            <p className="p-6 text-sm text-muted">No timesheet hours logged yet for payroll calculation.</p>
          ) : (
            payrollRows.map((emp) => {
              const totalHours =
                typeof emp.totalMinutes === 'number'
                  ? emp.totalMinutes / 60
                  : Number(emp.hours ?? 0);
              const regularHours =
                typeof emp.regularMinutes === 'number'
                  ? emp.regularMinutes / 60
                  : Math.min(totalHours, 160);
              const otHours =
                typeof emp.overtimeMinutes === 'number'
                  ? emp.overtimeMinutes / 60
                  : Math.max(0, totalHours - 160);
              const regularPay = regularHours * hourlyRate;
              const otPay = otHours * hourlyRate * 1.5;
              const grossPay = regularPay + otPay;
              return (
                <div key={emp.userId ?? emp.userName} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                  <div>
                    <p className="font-semibold text-ink">{emp.userName}</p>
                    <p className="text-xs text-muted">
                      {totalHours.toFixed(1)}h logged ({regularHours.toFixed(1)}h reg · {otHours.toFixed(1)}h OT)
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-ink">${grossPay.toFixed(2)}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        exportBrandedPdf({
                          title: `Employee Payslip — ${emp.userName}`,
                          subtitle: `Monthly Payroll Statement · Rate $${hourlyRate}/hr`,
                          generatedByEmail: user?.email,
                          generatedByName: user?.fullName,
                          kpis: [
                            { label: 'Total Hours', value: `${totalHours.toFixed(1)}h` },
                            { label: 'Regular Pay', value: `$${regularPay.toFixed(2)}` },
                            { label: 'Overtime (1.5x)', value: `$${otPay.toFixed(2)}` },
                            { label: 'Gross Payout', value: `$${grossPay.toFixed(2)}` },
                          ],
                          columns: ['Pay Component', 'Hours / Units', 'Rate', 'Amount'],
                          rows: [
                            ['Regular Hours', `${regularHours.toFixed(1)}h`, `$${hourlyRate.toFixed(2)}/hr`, `$${regularPay.toFixed(2)}`],
                            ['Overtime Hours (1.5x)', `${otHours.toFixed(1)}h`, `$${(hourlyRate * 1.5).toFixed(2)}/hr`, `$${otPay.toFixed(2)}`],
                            ['Total Gross Compensation', `${totalHours.toFixed(1)}h`, '—', `$${grossPay.toFixed(2)}`],
                          ],
                        })
                      }
                    >
                      <Download className="h-3.5 w-3.5" /> Payslip PDF
                    </Button>
                  </div>
                </div>
              );
            })
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
  const toast = useToast();
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

  useLiveSync(load);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await post('/assets', { name, category, assignedToName: assignedToName || null });
      setName('');
      setAssignedToName('');
      toast.success('Asset registered.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to register asset.');
    }
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
  const toast = useToast();
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

  useLiveSync(load);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await post('/performance', {
        employeeName: employeeName || undefined,
        goalTitle,
        completionPercent: Number(completionPercent),
        rating: Number(rating),
        feedback,
      });
      setGoalTitle('');
      setFeedback('');
      toast.success('Performance goal saved.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save performance goal.');
    }
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
  roomCode?: string | null;
  actionUrl?: string | null;
  isLiveMeeting?: boolean;
}

export function NotificationsView() {
  const { can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    const res = await liveGet<NotificationRow[]>('/notifications');
    setRows(res);
  }, []);

  useLiveSync(load);

  useEffect(() => {
    void load();
    // Push events (below) and the shared live sync deliver changes; this is only a safety net.
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        void load();
      }
    }, 30_000);
    const onInstant = () => void load();
    if (typeof window !== 'undefined') {
      window.addEventListener('yakunex:notifications-updated', onInstant);
      window.addEventListener('yakunex:meeting-started', onInstant);
    }
    return () => {
      clearInterval(id);
      if (typeof window !== 'undefined') {
        window.removeEventListener('yakunex:notifications-updated', onInstant);
        window.removeEventListener('yakunex:meeting-started', onInstant);
      }
    };
  }, [load]);

  async function onPublish(e: FormEvent) {
    e.preventDefault();
    try {
      await post('/notifications/announcements', { title, body });
      setTitle('');
      setBody('');
      toast.success('Announcement published.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to publish announcement.');
    }
  }

  async function onMarkRead(id: string) {
    try {
      await patch(`/notifications/${id}/read`, {});
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to mark notification as read.');
    }
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
                <div className="flex items-center gap-2">
                  {n.type === 'MEETING' && n.actionUrl && (
                    <Button
                      size="sm"
                      variant={n.isLiveMeeting ? 'primary' : 'secondary'}
                      onClick={() => {
                        void onMarkRead(n.id);
                        window.open(n.actionUrl!, '_blank');
                      }}
                    >
                      {n.isLiveMeeting ? 'Join Live Now' : 'Open Room'}
                    </Button>
                  )}
                  {!n.read && (
                    <Button size="sm" variant="secondary" onClick={() => void onMarkRead(n.id)}>
                      <Check className="h-3.5 w-3.5" /> Mark Read
                    </Button>
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
  monthlyBasicSalaryLkr?: number;
  fixedAllowancesLkr?: number;
  epfNumber?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccountNo?: string;
  pendingRequests: Array<{
    id: string;
    field?: 'nicNumber' | 'phone';
    newValue?: string;
    createdAt: string;
  }>;
}

export function ProfileView() {
  const { user, can, reload } = useAuth();
  const toast = useToast();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isHrOrSuperAdmin = isSuperAdmin || can(PERMISSIONS.USERS_WRITE);

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [profile, setProfile] = useState<EmployeeProfilePayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploadingDp, setUploadingDp] = useState(false);
  const [sessions, setSessions] = useState<
    Array<{ id: string; ipAddress?: string | null; userAgent?: string | null; createdAt: string }>
  >([]);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);

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
  const [monthlyBasicSalaryLkr, setMonthlyBasicSalaryLkr] = useState('0');
  const [fixedAllowancesLkr, setFixedAllowancesLkr] = useState('0');
  const [epfNumber, setEpfNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');

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
    setMonthlyBasicSalaryLkr(String(data.monthlyBasicSalaryLkr ?? 0));
    setFixedAllowancesLkr(String(data.fixedAllowancesLkr ?? 0));
    setEpfNumber(data.epfNumber ?? '');
    setBankName(data.bankName ?? '');
    setBankBranch(data.bankBranch ?? '');
    setBankAccountNo(data.bankAccountNo ?? '');
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const endpoint = selectedUserId ? `/profile/${selectedUserId}` : '/profile';
    try {
      const data = await liveGet<EmployeeProfilePayload>(endpoint);
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
    if (!selectedUserId || selectedUserId === user?.id) {
      liveGet<Array<{ id: string; ipAddress?: string | null; userAgent?: string | null; createdAt: string }>>(
        '/auth/sessions',
      )
        .then((res) => setSessions(Array.isArray(res) ? res : []))
        .catch(() => setSessions([]));
    }
  }, [load, selectedUserId, user?.id]);

  async function onLogoutAllDevices() {
    setRevokingSessions(true);
    try {
      await post('/auth/logout-all', {});
      window.location.href = '/login';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to sign out all devices.');
    } finally {
      setRevokingSessions(false);
      setLogoutAllOpen(false);
    }
  }

  async function handleSaveCroppedDp(dataUrl: string) {
    if (!profile) return;
    setError(null);
    setNotice(null);
    setUploadingDp(true);
    try {
      const isSelf = !selectedUserId || selectedUserId === user?.id;
      const updated = isSelf
        ? await patch<EmployeeProfilePayload>('/profile/dp', { avatarUrl: dataUrl })
        : await patch<EmployeeProfilePayload>(`/profile/${profile.id}`, { avatarUrl: dataUrl });
      applyProfileState(updated);
      clearApiCache();
      setCropFile(null);
      setNotice('Profile picture updated!');
      toast.success('Profile picture updated!');
      if (isSelf) await reload();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('yakunex:workspace-mutated'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update DP.';
      setError(msg);
      toast.error(msg);
    } finally {
      setUploadingDp(false);
    }
  }

  async function saveAdminFields(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        fullName,
        firstName,
        lastName,
        nicNumber,
        address,
        birthday,
        phone,
        monthlyBasicSalaryLkr: Number(monthlyBasicSalaryLkr) || 0,
        fixedAllowancesLkr: Number(fixedAllowancesLkr) || 0,
        epfNumber,
        bankName,
        bankBranch,
        bankAccountNo,
      };
      if (isSuperAdmin) {
        payload.role = role;
        payload.title = title;
      }
      const updated = await patch<EmployeeProfilePayload>(`/profile/${profile.id}`, payload);
      applyProfileState(updated);
      setNotice(`Profile updated successfully for ${updated.fullName}.`);
      toast.success(`Saved profile changes for ${updated.fullName}.`);
      if (profile.id === user?.id) void reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <Skeleton className="h-96 rounded-2xl" />;
  const isViewingSelf = !selectedUserId || selectedUserId === user?.id;
  const canEditPersonal = isViewingSelf || isHrOrSuperAdmin;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Employee Profile</h2>
          <p className="mt-1 text-sm text-muted">
            View and manage your personal details, customize your profile picture, and review active sessions.
          </p>
        </div>
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
              {(isViewingSelf || isHrOrSuperAdmin) && (
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold-strong transition hover:bg-gold/20">
                  <Camera className="h-3.5 w-3.5" /> Change Profile Picture (DP)
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) setCropFile(f);
                    }}
                  />
                </label>
              )}
            </div>
          </div>
          <Badge tone={profile.status === 'ACTIVE' ? 'success' : 'neutral'}>{profile.status}</Badge>
        </div>
      </Card>

      {/* Full Profile Details */}
      <Card>
        <CardHeader
          title="Personal & Employment Information"
          description="Employee personal and employment record."
        />
        <form onSubmit={saveAdminFields} className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Full Name" htmlFor="pf-full">
            <Input id="pf-full" disabled={!canEditPersonal} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Name with Initials" htmlFor="pf-first">
            <Input id="pf-first" disabled={!canEditPersonal} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last Name" htmlFor="pf-last">
            <Input id="pf-last" disabled={!canEditPersonal} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          <Field label="NIC ID Number" htmlFor="pf-nic">
            <Input id="pf-nic" disabled={!canEditPersonal} value={nicNumber} onChange={(e) => setNicNumber(e.target.value)} placeholder="e.g. 200012345678" />
          </Field>
          <Field label="Contact Number" htmlFor="pf-phone">
            <Input id="pf-phone" disabled={!canEditPersonal} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+94 7X XXX XXXX" />
          </Field>
          <Field label="Birthday" htmlFor="pf-dob">
            <Input id="pf-dob" type="date" disabled={!canEditPersonal} value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Address" htmlFor="pf-addr">
              <Input id="pf-addr" disabled={!canEditPersonal} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Residential address" />
            </Field>
          </div>
          <Field label="Job Role / Designation" htmlFor="pf-title">
            <Input id="pf-title" disabled={!isSuperAdmin} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="System Role" htmlFor="pf-role">
            <Select id="pf-role" disabled={!isSuperAdmin} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin / C-Level / Legal</option>
              <option value="PROJECT_MANAGER">Management (HR / PM / BA / PO / ACC)</option>
              <option value="STAFF">Core Staff (TL / SE / QA / UI-UX / DevOps)</option>
              <option value="INTERN">Intern / Trainee</option>
            </Select>
          </Field>

          {(isViewingSelf || isHrOrSuperAdmin) && (
            <>
              <div className="md:col-span-2 mt-2 border-t border-line pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gold-strong dark:text-gold">
                  Sri Lanka Payroll, EPF &amp; Bank SLIPS Details
                </p>
              </div>
              <Field label="Monthly Basic Salary (LKR)" htmlFor="pf-sal">
                <Input id="pf-sal" type="number" min="0" disabled={!isHrOrSuperAdmin} value={monthlyBasicSalaryLkr} onChange={(e) => setMonthlyBasicSalaryLkr(e.target.value)} />
              </Field>
              <Field label="Fixed Monthly Allowances (LKR)" htmlFor="pf-allow">
                <Input id="pf-allow" type="number" min="0" disabled={!isHrOrSuperAdmin} value={fixedAllowancesLkr} onChange={(e) => setFixedAllowancesLkr(e.target.value)} />
              </Field>
              <Field label="EPF / ETF Member Number" htmlFor="pf-epf">
                <Input id="pf-epf" disabled={!isHrOrSuperAdmin} value={epfNumber} onChange={(e) => setEpfNumber(e.target.value)} placeholder="e.g. EPF-0042" />
              </Field>
              <Field label="Bank Name" htmlFor="pf-bank">
                <Input id="pf-bank" disabled={!canEditPersonal} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Commercial Bank / Sampath Bank" />
              </Field>
              <Field label="Bank Branch" htmlFor="pf-branch">
                <Input id="pf-branch" disabled={!canEditPersonal} value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="e.g. Colombo 03" />
              </Field>
              <Field label="Bank Account Number" htmlFor="pf-acc">
                <Input id="pf-acc" disabled={!canEditPersonal} value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} placeholder="e.g. 8001234567" />
              </Field>
            </>
          )}

          {canEditPersonal && (
            <div className="flex justify-end md:col-span-2">
              <Button type="submit" disabled={saving}>
                <UserCheck className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Profile Changes'}
              </Button>
            </div>
          )}
        </form>
      </Card>

      {/* Active Sessions & Remote Device Security (Self only) */}
      {(!selectedUserId || selectedUserId === user?.id) && (
        <Card>
          <CardHeader
            title="Active Sessions & Device Security"
            description="Review signed-in devices and revoke all active sessions remotely."
            action={
              <Button
                size="sm"
                variant="danger"
                disabled={revokingSessions}
                onClick={() => setLogoutAllOpen(true)}
              >
                {revokingSessions ? 'Signing out...' : 'Sign Out All Devices'}
              </Button>
            }
          />
          <div className="divide-y divide-line">
            {sessions.length === 0 ? (
              <p className="p-5 text-xs text-muted">Current browser session is active.</p>
            ) : (
              sessions.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs">
                  <div>
                    <p className="font-semibold text-ink">{(s.userAgent || 'Browser Session').slice(0, 72)}</p>
                    <p className="text-muted">IP: {s.ipAddress || '—'}</p>
                  </div>
                  <span className="font-mono text-muted">
                    {new Date(s.createdAt).toLocaleString('en-LK', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Asia/Colombo',
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      <AvatarCropModal
        open={Boolean(cropFile)}
        file={cropFile}
        saving={uploadingDp}
        onCancel={() => setCropFile(null)}
        onConfirm={handleSaveCroppedDp}
      />

      <ConfirmDialog
        open={logoutAllOpen}
        tone="danger"
        title="Sign Out All Active Devices"
        description="This immediately revokes every active refresh token and signs you out from all browsers and mobile devices, including this session."
        confirmLabel="Sign Out Everywhere"
        busy={revokingSessions}
        onClose={() => setLogoutAllOpen(false)}
        onConfirm={() => onLogoutAllDevices()}
      />
    </div>
  );
}
