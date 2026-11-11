'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Bug,
  Building2,
  CheckCircle2,
  FileText,
  FolderKanban,
  Kanban,
  List,
  ListChecks,
  Mail,
  MapPin,
  Phone,
  Plus,
  Repeat,
  Search,
} from 'lucide-react';
import { useAuth } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { api, patch, post } from '@/lib/api';
import { PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/cn';

// ─── 1. PROJECTS PAGE (/projects) ────────────────────────────────────────────

interface ProjectStage {
  id: string;
  position: number;
  name: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
}

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  description: string;
  clientId: string | null;
  clientName: string;
  category: string;
  status: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  budget: number;
  currency: string;
  startDate: string;
  expectedEndDate: string;
  managerName: string;
  techStack: string[];
  progressPercent: number;
  stages: ProjectStage[];
}

const PROJECT_STATUSES = [
  'NEW_REQUEST',
  'PLANNING',
  'IN_PROGRESS',
  'TESTING',
  'CLIENT_REVIEW',
  'COMPLETED',
  'ON_HOLD',
];

export function ProjectsView() {
  const { can } = useAuth();
  const canWrite = can(PERMISSIONS.PROJECTS_WRITE);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [category, setCategory] = useState('WEB_DEVELOPMENT');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [budget, setBudget] = useState('4500000');
  const [expectedEndDate, setExpectedEndDate] = useState('2026-12-31');
  const [techStack, setTechStack] = useState('Next.js, NestJS, PostgreSQL');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await api<ProjectRow[]>('/projects'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await post('/projects', {
      name,
      clientName,
      category,
      priority,
      budget: Number(budget),
      expectedEndDate,
      techStack,
      description,
    });
    setModalOpen(false);
    setName('');
    setClientName('');
    setDescription('');
    await load();
  }

  async function updateStatus(id: string, status: string) {
    const progressPercent =
      status === 'COMPLETED' ? 100 : status === 'TESTING' ? 85 : status === 'IN_PROGRESS' ? 60 : undefined;
    await patch(`/projects/${id}`, { status, ...(progressPercent !== undefined ? { progressPercent } : {}) });
    await load();
  }

  async function cycleStage(projectId: string, stage: ProjectStage) {
    if (!canWrite) return;
    const order: ProjectStage['status'][] = ['PENDING', 'IN_PROGRESS', 'DONE'];
    const next = order[(order.indexOf(stage.status) + 1) % order.length] ?? 'DONE';
    await patch(`/projects/${projectId}`, { stageId: stage.id, stageStatus: next });
    await load();
  }

  const filtered = projects.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Projects</h2>
          <p className="mt-1 text-sm text-muted">
            End-to-end delivery lifecycle, budgets, milestones and stage gates.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> New project
          </Button>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total projects"
          value={projects.length}
          hint="Active & planned portfolio"
          icon={<FolderKanban className="h-4 w-4" />}
        />
        <StatCard
          label="In progress"
          value={projects.filter((p) => p.status === 'IN_PROGRESS').length}
          hint="Active engineering delivery"
          icon={<Repeat className="h-4 w-4" />}
        />
        <StatCard
          label="QA & client review"
          value={projects.filter((p) => p.status === 'TESTING' || p.status === 'CLIENT_REVIEW').length}
          hint="Pre-deployment verification"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Portfolio value"
          value={`LKR ${(totalBudget / 1_000_000).toFixed(1)}M`}
          hint="Contracted project budgets"
          icon={<Building2 className="h-4 w-4" />}
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              placeholder="Search by project code, title or client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="md:w-56"
          >
            <option value="">All statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((prj) => (
            <Card key={prj.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-canvas px-2 py-0.5 font-mono text-xs font-medium text-muted">
                      {prj.code}
                    </span>
                    <Badge
                      tone={
                        prj.priority === 'CRITICAL'
                          ? 'danger'
                          : prj.priority === 'HIGH'
                            ? 'warning'
                            : 'gold'
                      }
                    >
                      {prj.priority}
                    </Badge>
                    <Badge>{prj.category.replace('_', ' ')}</Badge>
                  </div>
                  <h3 className="font-display text-xl font-semibold text-ink">{prj.name}</h3>
                  <p className="max-w-3xl text-sm text-muted">{prj.description}</p>
                </div>

                <div className="flex items-center gap-3">
                  {canWrite ? (
                    <Select
                      value={prj.status}
                      onChange={(e) => updateStatus(prj.id, e.target.value)}
                      className="h-9 text-xs font-medium"
                    >
                      {PROJECT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace('_', ' ')}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone="gold">{prj.status.replace('_', ' ')}</Badge>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-4 border-t border-line pt-4 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-muted">Client</p>
                  <p className="mt-0.5 font-medium text-ink">{prj.clientName}</p>
                </div>
                <div>
                  <p className="text-muted">Project Manager</p>
                  <p className="mt-0.5 font-medium text-ink">{prj.managerName}</p>
                </div>
                <div>
                  <p className="text-muted">Budget</p>
                  <p className="mt-0.5 font-medium text-ink">
                    {prj.currency} {prj.budget.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Timeline</p>
                  <p className="mt-0.5 font-medium text-ink">
                    {prj.startDate} → {prj.expectedEndDate}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted">Delivery completion</span>
                  <span className="font-semibold text-ink">{prj.progressPercent}%</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-gold transition-all"
                    style={{ width: `${prj.progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {prj.stages.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => cycleStage(prj.id, st)}
                      title={canWrite ? 'Click to cycle stage status' : st.status}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors',
                        st.status === 'DONE'
                          ? 'border-success/30 bg-success/10 text-success'
                          : st.status === 'IN_PROGRESS'
                            ? 'border-gold/40 bg-gold/15 font-medium text-gold-strong'
                            : 'border-line bg-canvas text-muted',
                      )}
                    >
                      <span>{st.position}.</span>
                      <span>{st.name}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {prj.techStack.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-md bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title="Create new project" onClose={() => setModalOpen(false)}>
        <form onSubmit={onCreate} className="space-y-4">
          <Field label="Project name" htmlFor="prj-name">
            <Input
              id="prj-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g.Helakuru Merchant Payment Gateway"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client name" htmlFor="prj-client">
              <Input
                id="prj-client"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Ceylon Commercial Bank"
              />
            </Field>
            <Field label="Category" htmlFor="prj-cat">
              <Select
                id="prj-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="WEB_DEVELOPMENT">Web Development</option>
                <option value="MOBILE_APPLICATION">Mobile Application</option>
                <option value="AI_ML">AI & Machine Learning</option>
                <option value="UI_UX_DESIGN">UI/UX Design</option>
                <option value="IT_CONSULTING">IT Consulting</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Priority" htmlFor="prj-prio">
              <Select
                id="prj-prio"
                value={priority}
                onChange={(e) => setPriority(e.target.value as ProjectRow['priority'])}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            </Field>
            <Field label="Budget (LKR)" htmlFor="prj-budget">
              <Input
                id="prj-budget"
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </Field>
            <Field label="Target end date" htmlFor="prj-due">
              <Input
                id="prj-due"
                type="date"
                value={expectedEndDate}
                onChange={(e) => setExpectedEndDate(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Tech stack (comma-separated)" htmlFor="prj-tech">
            <Input
              id="prj-tech"
              value={techStack}
              onChange={(e) => setTechStack(e.target.value)}
            />
          </Field>
          <Field label="Description & scope" htmlFor="prj-desc">
            <Input
              id="prj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Core deliverables and milestones"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create project</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── 2. TASKS PAGE (/tasks) ──────────────────────────────────────────────────

interface TaskRow {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  sprintId: string | null;
  sprintName: string | null;
  code: string;
  title: string;
  description: string;
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'TESTING' | 'BLOCKED' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  storyPoints: number;
  estimatedHours: number;
  actualHours: number;
  assigneeName: string;
  dueDate: string;
  labels: string[];
}

const KANBAN_COLUMNS: Array<{ key: TaskRow['status']; label: string }> = [
  { key: 'TODO', label: 'To Do' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'TESTING', label: 'QA Testing' },
  { key: 'COMPLETED', label: 'Completed' },
];

export function TasksView() {
  const { can } = useAuth();
  const canWrite = can(PERMISSIONS.TASKS_WRITE);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState<TaskRow['priority']>('HIGH');
  const [storyPoints, setStoryPoints] = useState('5');
  const [estimatedHours, setEstimatedHours] = useState('8');
  const [assigneeName, setAssigneeName] = useState('');
  const [dueDate, setDueDate] = useState('2026-11-30');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([api<TaskRow[]>('/tasks'), api<ProjectRow[]>('/projects')]);
      setTasks(t);
      setProjects(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await post('/tasks', {
      title,
      description,
      projectId,
      priority,
      storyPoints: Number(storyPoints),
      estimatedHours: Number(estimatedHours),
      assigneeName,
      dueDate,
    });
    setModalOpen(false);
    setTitle('');
    setDescription('');
    await load();
  }

  async function moveTask(id: string, status: TaskRow['status']) {
    await patch(`/tasks/${id}`, { status });
    await load();
  }

  const filtered = tasks.filter((t) => {
    if (projectFilter && t.projectId !== projectFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.assigneeName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Tasks & Kanban</h2>
          <p className="mt-1 text-sm text-muted">
            Track engineering tasks, story points, estimates and sprint progress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'kanban' ? 'bg-gold/15 text-gold' : 'text-muted hover:text-ink',
              )}
            >
              <Kanban className="h-3.5 w-3.5" /> Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'list' ? 'bg-gold/15 text-gold' : 'text-muted hover:text-ink',
              )}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
          {canWrite && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" /> New task
            </Button>
          )}
        </div>
      </header>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              placeholder="Search tasks by title, code or assignee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="md:w-64"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : viewMode === 'kanban' ? (
        <div className="grid gap-4 lg:grid-cols-5">
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = filtered.filter((t) => t.status === col.key);
            return (
              <div
                key={col.key}
                className="flex flex-col rounded-2xl border border-line bg-canvas/60 p-3"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {col.label}
                  </span>
                  <Badge>{colTasks.length}</Badge>
                </div>
                <div className="space-y-3">
                  {colTasks.map((task) => (
                    <Card key={task.id} className="p-3.5 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-muted">{task.code}</span>
                        <Badge
                          tone={
                            task.priority === 'CRITICAL'
                              ? 'danger'
                              : task.priority === 'HIGH'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {task.priority}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm font-medium text-ink">{task.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{task.description}</p>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {task.labels.map((lbl) => (
                          <span
                            key={lbl}
                            className="rounded bg-canvas px-1.5 py-0.5 text-[10px] text-muted"
                          >
                            #{lbl}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-xs text-muted">
                        <span>{task.assigneeName.split(' ')[0]}</span>
                        <span>
                          {task.storyPoints} pts · {task.actualHours}/{task.estimatedHours}h
                        </span>
                      </div>
                      {canWrite && (
                        <Select
                          value={task.status}
                          onChange={(e) => moveTask(task.id, e.target.value as TaskRow['status'])}
                          className="mt-2.5 h-8 text-xs"
                        >
                          {KANBAN_COLUMNS.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-3">Task</th>
                <th className="px-5 py-3">Project</th>
                <th className="px-5 py-3">Assignee</th>
                <th className="px-5 py-3">Priority</th>
                <th className="px-5 py-3">Hours / Pts</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((task) => (
                <tr key={task.id} className="hover:bg-canvas/40">
                  <td className="px-5 py-3.5">
                    <p className="font-mono text-xs text-muted">{task.code}</p>
                    <p className="font-medium text-ink">{task.title}</p>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted">{task.projectName}</td>
                  <td className="px-5 py-3.5 text-xs">{task.assigneeName}</td>
                  <td className="px-5 py-3.5">
                    <Badge
                      tone={
                        task.priority === 'CRITICAL'
                          ? 'danger'
                          : task.priority === 'HIGH'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {task.priority}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted">
                    {task.actualHours}/{task.estimatedHours}h · {task.storyPoints} pts
                  </td>
                  <td className="px-5 py-3.5">
                    {canWrite ? (
                      <Select
                        value={task.status}
                        onChange={(e) => moveTask(task.id, e.target.value as TaskRow['status'])}
                        className="h-8 w-36 text-xs"
                      >
                        {KANBAN_COLUMNS.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge tone="gold">{task.status}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={modalOpen} title="Create task" onClose={() => setModalOpen(false)}>
        <form onSubmit={onCreate} className="space-y-4">
          <Field label="Task title" htmlFor="tsk-title">
            <Input
              id="tsk-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement webhook signature verification"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" htmlFor="tsk-prj">
              <Select
                id="tsk-prj"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assignee" htmlFor="tsk-assignee">
              <Input
                id="tsk-assignee"
                value={assigneeName}
                onChange={(e) => setAssigneeName(e.target.value)}
                placeholder="e.g. Developer or Team Member"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Priority" htmlFor="tsk-prio">
              <Select
                id="tsk-prio"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskRow['priority'])}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            </Field>
            <Field label="Story points" htmlFor="tsk-pts">
              <Input
                id="tsk-pts"
                type="number"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
              />
            </Field>
            <Field label="Est. hours" htmlFor="tsk-est">
              <Input
                id="tsk-est"
                type="number"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Due date" htmlFor="tsk-due">
            <Input
              id="tsk-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field label="Description" htmlFor="tsk-desc">
            <Input
              id="tsk-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Acceptance criteria and notes"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create task</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── 3. SPRINTS PAGE (/sprints) ──────────────────────────────────────────────

interface SprintRow {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  goal: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  startDate: string;
  endDate: string;
  retrospective: string;
  taskCount: number;
  completedTaskCount: number;
  totalPoints: number;
  completedPoints: number;
}

export function SprintsView() {
  const { can } = useAuth();
  const canWrite = can(PERMISSIONS.TASKS_WRITE);
  const [sprints, setSprints] = useState<SprintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('2026-11-15');
  const [endDate, setEndDate] = useState('2026-11-29');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSprints(await api<SprintRow[]>('/sprints'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await post('/sprints', { name, goal, startDate, endDate });
    setModalOpen(false);
    setName('');
    setGoal('');
    await load();
  }

  async function changeStatus(id: string, status: SprintRow['status']) {
    await patch(`/sprints/${id}`, { status });
    await load();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Sprints & Velocity</h2>
          <p className="mt-1 text-sm text-muted">
            Agile sprint iterations, story point velocity and retrospective notes.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Plan sprint
          </Button>
        )}
      </header>

      {loading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : (
        <div className="space-y-4">
          {sprints.map((sp) => {
            const pct =
              sp.totalPoints > 0 ? Math.round((sp.completedPoints / sp.totalPoints) * 100) : 0;
            return (
              <Card key={sp.id} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          sp.status === 'ACTIVE'
                            ? 'gold'
                            : sp.status === 'COMPLETED'
                              ? 'success'
                              : 'neutral'
                        }
                      >
                        {sp.status}
                      </Badge>
                      <span className="text-xs text-muted">{sp.projectName}</span>
                    </div>
                    <h3 className="mt-1.5 font-display text-xl font-semibold">{sp.name}</h3>
                    <p className="mt-1 text-sm text-muted">{sp.goal}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canWrite && sp.status === 'PLANNED' && (
                      <Button size="sm" onClick={() => changeStatus(sp.id, 'ACTIVE')}>
                        Start sprint
                      </Button>
                    )}
                    {canWrite && sp.status === 'ACTIVE' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => changeStatus(sp.id, 'COMPLETED')}
                      >
                        Complete sprint
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 border-t border-line pt-4 text-xs sm:grid-cols-3">
                  <div>
                    <p className="text-muted">Sprint window</p>
                    <p className="mt-0.5 font-medium text-ink">
                      {sp.startDate} → {sp.endDate}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Tasks completed</p>
                    <p className="mt-0.5 font-medium text-ink">
                      {sp.completedTaskCount} / {sp.taskCount} tasks
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Story point velocity</p>
                    <p className="mt-0.5 font-medium text-ink">
                      {sp.completedPoints} / {sp.totalPoints} pts ({pct}%)
                    </p>
                  </div>
                </div>

                {sp.retrospective && (
                  <p className="mt-3 rounded-xl bg-canvas p-3 text-xs text-muted">
                    <strong className="text-ink">Retrospective:</strong> {sp.retrospective}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} title="Plan new sprint" onClose={() => setModalOpen(false)}>
        <form onSubmit={onCreate} className="space-y-4">
          <Field label="Sprint name" htmlFor="sp-name">
            <Input
              id="sp-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sprint 15 – Core Banking Webhook Retry"
            />
          </Field>
          <Field label="Sprint goal" htmlFor="sp-goal">
            <Input
              id="sp-goal"
              required
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Primary outcome for this two-week iteration"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="sp-start">
              <Input
                id="sp-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="End date" htmlFor="sp-end">
              <Input
                id="sp-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create sprint</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── 4. CLIENTS PAGE (/clients) ──────────────────────────────────────────────

interface ClientRow {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  notes: string;
  projectCount: number;
  totalBudget: number;
}

export function ClientsView() {
  const { can } = useAuth();
  const canWrite = can(PERMISSIONS.PROJECTS_WRITE);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setClients(await api<ClientRow[]>('/clients'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await post('/clients', { name, contactName, contactEmail, contactPhone, address, notes });
    setModalOpen(false);
    setName('');
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    setAddress('');
    setNotes('');
    await load();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Clients</h2>
          <p className="mt-1 text-sm text-muted">
            Client accounts, key stakeholders and contracted delivery value.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Add client
          </Button>
        )}
      </header>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <Card key={c.id} className="flex flex-col justify-between p-6">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <Badge tone="gold">{c.projectCount} projects</Badge>
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold text-ink">{c.name}</h3>
                <p className="mt-1 text-xs text-muted">{c.notes}</p>

                <div className="mt-4 space-y-2 border-t border-line pt-4 text-xs">
                  <p className="font-medium text-ink">{c.contactName}</p>
                  <p className="flex items-center gap-2 text-muted">
                    <Mail className="h-3.5 w-3.5 text-gold" /> {c.contactEmail}
                  </p>
                  <p className="flex items-center gap-2 text-muted">
                    <Phone className="h-3.5 w-3.5 text-gold" /> {c.contactPhone}
                  </p>
                  <p className="flex items-center gap-2 text-muted">
                    <MapPin className="h-3.5 w-3.5 text-gold" /> {c.address}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-line pt-3 text-xs">
                <span className="text-muted">Contracted value</span>
                <span className="font-semibold text-ink">
                  LKR {c.totalBudget.toLocaleString()}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title="Add client organization" onClose={() => setModalOpen(false)}>
        <form onSubmit={onCreate} className="space-y-4">
          <Field label="Company name" htmlFor="cl-name">
            <Input
              id="cl-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dialog Enterprise Solutions"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary contact person" htmlFor="cl-contact">
              <Input
                id="cl-contact"
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor="cl-phone">
              <Input
                id="cl-phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+94 11 200 0000"
              />
            </Field>
          </div>
          <Field label="Contact email" htmlFor="cl-email">
            <Input
              id="cl-email"
              type="email"
              required
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </Field>
          <Field label="Address" htmlFor="cl-addr">
            <Input id="cl-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Notes & requirements" htmlFor="cl-notes">
            <Input id="cl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add client</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── 5. BUGS PAGE (/bugs) ────────────────────────────────────────────────────

interface BugRow {
  id: string;
  projectId: string;
  projectName: string;
  code: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'FIXED' | 'TESTING' | 'VERIFIED' | 'CLOSED';
  reporterName: string;
  assigneeName: string;
  createdAt: string;
}

const BUG_STATUSES: BugRow['status'][] = [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'FIXED',
  'TESTING',
  'VERIFIED',
  'CLOSED',
];

export function BugsView() {
  const { can } = useAuth();
  const canWrite = can(PERMISSIONS.TASKS_WRITE);
  const [bugs, setBugs] = useState<BugRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<BugRow['severity']>('MAJOR');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [actualResult, setActualResult] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBugs(await api<BugRow[]>('/bugs'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await post('/bugs', {
      title,
      severity,
      stepsToReproduce,
      expectedResult,
      actualResult,
    });
    setModalOpen(false);
    setTitle('');
    setStepsToReproduce('');
    setExpectedResult('');
    setActualResult('');
    await load();
  }

  async function changeStatus(id: string, status: BugRow['status']) {
    await patch(`/bugs/${id}`, { status });
    await load();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Bugs & QA Workflow</h2>
          <p className="mt-1 text-sm text-muted">
            Defect tracking, reproduction steps, severity triage and QA verification.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Report bug
          </Button>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total reported"
          value={bugs.length}
          hint="Tracked across projects"
          icon={<Bug className="h-4 w-4" />}
        />
        <StatCard
          label="Critical / Blocker"
          value={bugs.filter((b) => b.severity === 'CRITICAL' || b.severity === 'BLOCKER').length}
          hint="High-severity defects"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="Fixed / Verified"
          value={bugs.filter((b) => b.status === 'FIXED' || b.status === 'VERIFIED' || b.status === 'CLOSED').length}
          hint="Ready for release"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      {loading ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : (
        <div className="space-y-4">
          {bugs.map((bug) => (
            <Card key={bug.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted">{bug.code}</span>
                    <Badge
                      tone={
                        bug.severity === 'BLOCKER' || bug.severity === 'CRITICAL'
                          ? 'danger'
                          : bug.severity === 'MAJOR'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {bug.severity}
                    </Badge>
                    <span className="text-xs text-muted">{bug.projectName}</span>
                  </div>
                  <h3 className="mt-1.5 font-semibold text-ink">{bug.title}</h3>
                  <p className="mt-1 text-xs text-muted">
                    Reported by {bug.reporterName} · Assigned to {bug.assigneeName}
                  </p>
                </div>
                {canWrite ? (
                  <Select
                    value={bug.status}
                    onChange={(e) => changeStatus(bug.id, e.target.value as BugRow['status'])}
                    className="h-9 w-40 text-xs"
                  >
                    {BUG_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge tone="gold">{bug.status}</Badge>
                )}
              </div>
              <div className="mt-4 grid gap-3 rounded-xl bg-canvas p-3.5 text-xs md:grid-cols-3">
                <div>
                  <p className="font-semibold text-ink">Steps to reproduce</p>
                  <p className="mt-1 whitespace-pre-line text-muted">{bug.stepsToReproduce}</p>
                </div>
                <div>
                  <p className="font-semibold text-ink">Expected result</p>
                  <p className="mt-1 text-muted">{bug.expectedResult}</p>
                </div>
                <div>
                  <p className="font-semibold text-ink">Actual result</p>
                  <p className="mt-1 text-muted">{bug.actualResult}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title="Report bug" onClose={() => setModalOpen(false)}>
        <form onSubmit={onCreate} className="space-y-4">
          <Field label="Bug summary" htmlFor="bg-title">
            <Input
              id="bg-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Severity" htmlFor="bg-sev">
            <Select
              id="bg-sev"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as BugRow['severity'])}
            >
              <option value="MINOR">Minor</option>
              <option value="MAJOR">Major</option>
              <option value="CRITICAL">Critical</option>
              <option value="BLOCKER">Blocker</option>
            </Select>
          </Field>
          <Field label="Steps to reproduce" htmlFor="bg-steps">
            <Input
              id="bg-steps"
              required
              value={stepsToReproduce}
              onChange={(e) => setStepsToReproduce(e.target.value)}
            />
          </Field>
          <Field label="Expected result" htmlFor="bg-exp">
            <Input
              id="bg-exp"
              required
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
            />
          </Field>
          <Field label="Actual result" htmlFor="bg-act">
            <Input
              id="bg-act"
              required
              value={actualResult}
              onChange={(e) => setActualResult(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Submit bug report</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── 6. DOCUMENTS PAGE (/documents) ──────────────────────────────────────────

interface DocumentRow {
  id: string;
  projectName: string;
  folder: string;
  title: string;
  type: string;
  version: number;
  sizeBytes: number;
  visibility: string;
  uploadedByName: string;
  summary: string;
  updatedAt: string;
}

export function DocumentsView() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('SRS');
  const [folder, setFolder] = useState('/architecture');
  const [summary, setSummary] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await api<DocumentRow[]>('/documents'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await post('/documents', { title, type, folder, summary });
    setModalOpen(false);
    setTitle('');
    setSummary('');
    await load();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Documents & Specifications</h2>
          <p className="mt-1 text-sm text-muted">
            Versioned SRS documents, API contracts, proposals and technical deliverables.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Register document
        </Button>
      </header>

      {loading ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {docs.map((doc) => (
            <Card key={doc.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone="gold">{doc.type}</Badge>
                      <Badge>v{doc.version}</Badge>
                      <span className="font-mono text-xs text-muted">{doc.folder}</span>
                    </div>
                    <h3 className="mt-1 font-semibold text-ink">{doc.title}</h3>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">{doc.summary}</p>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                <span>
                  {doc.projectName} · Uploaded by {doc.uploadedByName}
                </span>
                <span>{(doc.sizeBytes / 1024).toFixed(0)} KB</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title="Register project document" onClose={() => setModalOpen(false)}>
        <form onSubmit={onCreate} className="space-y-4">
          <Field label="Document title" htmlFor="dc-title">
            <Input
              id="dc-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Security Architecture & Penetration Test Report"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Document type" htmlFor="dc-type">
              <Select id="dc-type" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="SRS">SRS</option>
                <option value="API_DOC">API Specification</option>
                <option value="TECHNICAL_DOC">Technical Guide</option>
                <option value="PROPOSAL">Commercial Proposal</option>
                <option value="CONTRACT">Contract</option>
                <option value="DELIVERABLE">Client Deliverable</option>
              </Select>
            </Field>
            <Field label="Folder path" htmlFor="dc-folder">
              <Input id="dc-folder" value={folder} onChange={(e) => setFolder(e.target.value)} />
            </Field>
          </div>
          <Field label="Summary & version notes" htmlFor="dc-sum">
            <Input
              id="dc-sum"
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save document</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

