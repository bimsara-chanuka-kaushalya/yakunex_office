'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Bug,
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  FolderKanban,
  Kanban,
  List,
  ListChecks,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Repeat,
  Search,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/components/providers';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, StatCard } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { api, del, patch, post } from '@/lib/api';
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

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
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
  subtasks?: Array<{ id: string; title: string; done: boolean }>;
  comments?: Array<{ id: string; authorName: string; body: string; createdAt: string }>;
}

const KANBAN_COLUMNS: Array<{ key: TaskRow['status']; label: string }> = [
  { key: 'TODO', label: 'To Do' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'TESTING', label: 'QA Testing' },
  { key: 'COMPLETED', label: 'Completed' },
];

export function TasksView() {
  const { user, can } = useAuth();
  const canWrite = can(PERMISSIONS.TASKS_WRITE);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Task Detail Inspector state
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [editPriority, setEditPriority] = useState<TaskRow['priority']>('MEDIUM');
  const [editStatus, setEditStatus] = useState<TaskRow['status']>('TODO');
  const [editActualHours, setEditActualHours] = useState('0');
  const [editDueDate, setEditDueDate] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [newComment, setNewComment] = useState('');

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
      setSelectedTask((prev) => (prev ? (t.find((x) => x.id === prev.id) ?? null) : null));
      if (p.length > 0) {
        setProjectId((prev) => prev || p[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openTaskDetail(task: TaskRow) {
    setSelectedTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description);
    setEditAssignee(task.assigneeName);
    setEditPriority(task.priority);
    setEditStatus(task.status);
    setEditActualHours(String(task.actualHours ?? 0));
    setEditDueDate(task.dueDate ? task.dueDate.slice(0, 10) : '');
    setNewSubtask('');
    setNewComment('');
  }

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

  async function saveTaskDetails(e: FormEvent) {
    e.preventDefault();
    if (!selectedTask) return;
    await patch(`/tasks/${selectedTask.id}`, {
      title: editTitle,
      description: editDesc,
      assigneeName: editAssignee,
      priority: editPriority,
      status: editStatus,
      actualHours: Number(editActualHours) || 0,
      dueDate: editDueDate,
    });
    await load();
  }

  async function handleAddSubtask(e: FormEvent) {
    e.preventDefault();
    if (!selectedTask || !newSubtask.trim()) return;
    const next = [
      ...(selectedTask.subtasks ?? []),
      { id: `sub_${Date.now()}`, title: newSubtask.trim(), done: false },
    ];
    await patch(`/tasks/${selectedTask.id}`, { subtasks: next });
    setNewSubtask('');
    await load();
  }

  async function handleToggleSubtask(subId: string) {
    if (!selectedTask) return;
    const next = (selectedTask.subtasks ?? []).map((s) =>
      s.id === subId ? { ...s, done: !s.done } : s,
    );
    await patch(`/tasks/${selectedTask.id}`, { subtasks: next });
    await load();
  }

  async function handleAddComment(e: FormEvent) {
    e.preventDefault();
    if (!selectedTask || !newComment.trim()) return;
    const next = [
      ...(selectedTask.comments ?? []),
      {
        id: `cmt_${Date.now()}`,
        authorName: user?.fullName ?? 'Team Member',
        body: newComment.trim(),
        createdAt: new Date().toISOString(),
      },
    ];
    await patch(`/tasks/${selectedTask.id}`, { comments: next });
    setNewComment('');
    await load();
  }

  async function handleDeleteTask(id: string) {
    await del(`/tasks/${id}`);
    setSelectedTask(null);
    await load();
  }

  const filtered = tasks.filter((t) => {
    if (projectFilter && t.projectId !== projectFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (onlyMine && user) {
      const meLower = user.fullName.toLowerCase();
      if (!t.assigneeName.toLowerCase().includes(meLower) && !meLower.includes(t.assigneeName.toLowerCase())) {
        return false;
      }
    }
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

  const inProgressCount = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const reviewQaCount = tasks.filter((t) => t.status === 'IN_REVIEW' || t.status === 'TESTING').length;
  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Tasks &amp; Kanban</h2>
          <p className="mt-1 text-sm text-muted">
            Click any task to open subtasks, activity comments &amp; progress — or drag cards across columns.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="segmented" role="radiogroup" aria-label="Task view mode">
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === 'kanban'}
              onClick={() => setViewMode('kanban')}
              className="inline-flex items-center gap-1.5"
            >
              <Kanban className="h-3.5 w-3.5" /> Board
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className="inline-flex items-center gap-1.5"
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

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        <StatCard
          label="Total tasks"
          value={tasks.length}
          hint={`${filtered.length} matching current filters`}
          icon={<ListChecks className="h-4 w-4" />}
        />
        <StatCard
          label="In progress"
          value={inProgressCount}
          hint="Active engineering work"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Review & QA"
          value={reviewQaCount}
          hint="In review or QA testing"
          icon={<CheckSquare className="h-4 w-4" />}
        />
        <StatCard
          label="Completed"
          value={completedCount}
          hint={tasks.length > 0 ? `${Math.round((completedCount / tasks.length) * 100)}% completion rate` : 'No tasks yet'}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              placeholder="Search tasks by title, code or assignee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="md:w-56"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </Select>
          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="md:w-40"
          >
            <option value="">All priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
          <Button
            type="button"
            variant={onlyMine ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setOnlyMine((v) => !v)}
          >
            My tasks
          </Button>
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
                onDragOver={(e) => {
                  if (canWrite) e.preventDefault();
                }}
                onDrop={() => {
                  if (canWrite && draggedTaskId) {
                    void moveTask(draggedTaskId, col.key);
                    setDraggedTaskId(null);
                  }
                }}
                className="flex min-h-[260px] flex-col rounded-[20px] bg-ink/[0.03] p-3 dark:bg-white/[0.03]"
              >
                <div className="mb-3 flex items-center justify-between px-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {col.label}
                  </span>
                  <Badge>{colTasks.length}</Badge>
                </div>
                <div className="space-y-3">
                  {colTasks.map((task) => {
                    const subs = task.subtasks ?? [];
                    const subsDone = subs.filter((s) => s.done).length;
                    return (
                      <div
                        key={task.id}
                        draggable={canWrite}
                        onDragStart={() => setDraggedTaskId(task.id)}
                        onClick={() => openTaskDetail(task)}
                        className="cursor-pointer"
                      >
                        <Card hoverable className="p-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-medium text-muted">{task.code}</span>
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
                          <p className="mt-2 text-[14px] font-semibold leading-snug text-ink">{task.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted">{task.description}</p>
                          {subs.length > 0 && (
                            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted">
                              <CheckSquare className="h-3 w-3 text-gold-strong dark:text-gold" />
                              <span>{subsDone}/{subs.length} subtasks</span>
                              <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/[0.07] dark:bg-white/[0.1]">
                                <div
                                  className="h-full rounded-full bg-gold"
                                  style={{ width: `${Math.round((subsDone / subs.length) * 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                          <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-2.5 text-xs text-muted">
                            <div className="flex items-center gap-1.5">
                              <Avatar name={task.assigneeName} size="xs" />
                              <span className="truncate max-w-[90px]">{task.assigneeName.split(' ')[0]}</span>
                            </div>
                            <span className="font-mono text-[11px]">
                              {task.storyPoints} pts · {task.actualHours}/{task.estimatedHours}h
                            </span>
                          </div>
                        </Card>
                      </div>
                    );
                  })}
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
                <tr
                  key={task.id}
                  onClick={() => openTaskDetail(task)}
                  className="cursor-pointer transition-colors hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-mono text-xs text-muted">{task.code}</p>
                    <p className="font-medium text-ink">{task.title}</p>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted">{task.projectName}</td>
                  <td className="px-5 py-3.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Avatar name={task.assigneeName} size="xs" />
                      <span>{task.assigneeName}</span>
                    </div>
                  </td>
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
                  <td className="px-5 py-3.5 font-mono text-xs text-muted">
                    {task.actualHours}/{task.estimatedHours}h · {task.storyPoints} pts
                  </td>
                  <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                    {canWrite ? (
                      <Select
                        value={task.status}
                        onChange={(e) => moveTask(task.id, e.target.value as TaskRow['status'])}
                        className="h-9 w-36 text-xs"
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

      {/* Task Detail Inspector Modal (Subtasks, Comments, Status & Quick Edit) */}
      <Modal
        open={Boolean(selectedTask)}
        title={selectedTask ? `${selectedTask.code} · ${selectedTask.projectName}` : 'Task Details'}
        onClose={() => setSelectedTask(null)}
      >
        {selectedTask && (
          <div className="space-y-5">
            {/* Quick Status Pills */}
            {canWrite && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Move Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {KANBAN_COLUMNS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => {
                        setEditStatus(c.key);
                        void moveTask(selectedTask.id, c.key);
                      }}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-semibold transition-all',
                        selectedTask.status === c.key
                          ? 'bg-gold text-gold-ink shadow-2xs'
                          : 'bg-ink/[0.06] text-muted hover:text-ink dark:bg-white/[0.09]',
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={saveTaskDetails} className="space-y-3.5">
              <Field label="Title" htmlFor="ed-title">
                <Input
                  id="ed-title"
                  disabled={!canWrite}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </Field>
              <Field label="Description" htmlFor="ed-desc">
                <textarea
                  id="ed-desc"
                  rows={3}
                  disabled={!canWrite}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-[12px] bg-ink/[0.05] p-3 text-sm text-ink focus:bg-surface focus:outline-none focus:ring-4 focus:ring-gold/20 dark:bg-white/[0.08] dark:focus:bg-raised disabled:opacity-60"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Assignee" htmlFor="ed-asgn">
                  <Input
                    id="ed-asgn"
                    disabled={!canWrite}
                    value={editAssignee}
                    onChange={(e) => setEditAssignee(e.target.value)}
                  />
                </Field>
                <Field label="Priority" htmlFor="ed-prio">
                  <Select
                    id="ed-prio"
                    disabled={!canWrite}
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as TaskRow['priority'])}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Logged Hours" htmlFor="ed-hrs">
                  <Input
                    id="ed-hrs"
                    type="number"
                    min={0}
                    disabled={!canWrite}
                    value={editActualHours}
                    onChange={(e) => setEditActualHours(e.target.value)}
                  />
                </Field>
                <Field label="Due Date" htmlFor="ed-due">
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <Input
                      id="ed-due"
                      type="date"
                      disabled={!canWrite}
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </Field>
              </div>
              {canWrite && (
                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => void handleDeleteTask(selectedTask.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete Task
                  </Button>
                  <Button type="submit" size="sm">Save Changes</Button>
                </div>
              )}
            </form>

            {/* Subtasks Checklist */}
            <div className="border-t border-line/70 pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                <CheckSquare className="h-3.5 w-3.5 text-gold-strong dark:text-gold" />
                Subtasks ({(selectedTask.subtasks ?? []).filter((s) => s.done).length}/
                {(selectedTask.subtasks ?? []).length})
              </p>
              <div className="space-y-1.5">
                {(selectedTask.subtasks ?? []).map((sub) => (
                  <label
                    key={sub.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-ink/[0.04] px-3 py-2 text-sm dark:bg-white/[0.06]"
                  >
                    <input
                      type="checkbox"
                      checked={sub.done}
                      disabled={!canWrite}
                      onChange={() => void handleToggleSubtask(sub.id)}
                    />
                    <span className={cn(sub.done && 'line-through text-muted')}>{sub.title}</span>
                  </label>
                ))}
              </div>
              {canWrite && (
                <form onSubmit={handleAddSubtask} className="mt-2.5 flex gap-2">
                  <Input
                    placeholder="Add a subtask…"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                  />
                  <Button type="submit" size="sm" variant="secondary">Add</Button>
                </form>
              )}
            </div>

            {/* Comments */}
            <div className="border-t border-line/70 pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                <MessageSquare className="h-3.5 w-3.5 text-gold-strong dark:text-gold" />
                Comments ({(selectedTask.comments ?? []).length})
              </p>
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {(selectedTask.comments ?? []).map((c) => (
                  <div key={c.id} className="rounded-xl bg-ink/[0.04] px-3 py-2 text-xs dark:bg-white/[0.06]">
                    <div className="flex items-center justify-between text-muted">
                      <strong className="text-ink">{c.authorName}</strong>
                      <span>
                        {new Date(c.createdAt).toLocaleTimeString('en-LK', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Colombo',
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-ink">{c.body}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddComment} className="mt-2.5 flex gap-2">
                <Input
                  placeholder="Write a comment or progress update…"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <Button type="submit" size="sm" variant="secondary">Post</Button>
              </form>
            </div>
          </div>
        )}
      </Modal>

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
                <option value="">General Work</option>
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

