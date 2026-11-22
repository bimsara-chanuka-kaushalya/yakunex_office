import { buildMyDay, formatStandup, type MyDayInput } from './my-day';
import type { TaskItem } from './workspace.service';

const task = (over: Partial<TaskItem>): TaskItem => ({
  id: 't',
  projectId: 'p1',
  projectCode: 'P1',
  projectName: 'Portal',
  sprintId: null,
  sprintName: null,
  code: 'P1-1',
  title: 'Task',
  description: '',
  status: 'TODO',
  priority: 'MEDIUM',
  storyPoints: 1,
  estimatedHours: 0,
  actualHours: 0,
  assigneeName: 'Kasun Silva',
  assigneeEmail: '',
  dueDate: '',
  labels: [],
  ...over,
});

function input(over: Partial<MyDayInput> = {}): MyDayInput {
  return {
    viewer: { id: 'u1', fullName: 'Kasun Silva', email: 'kasun@x.lk', role: 'STAFF' },
    now: new Date('2026-11-23T06:00:00Z'), // Monday 11:30 Colombo
    today: '2026-11-23',
    workDayStart: '08:30',
    tasks: [],
    projects: [],
    sprints: [],
    bugs: [],
    timeEntries: [],
    attendance: [],
    leaveRequests: [],
    interns: [],
    meetings: [],
    approvals: [],
    people: [],
    unreadNotifications: 0,
    ...over,
  };
}

describe('My Day', () => {
  it('lists only my open tasks, overdue first, then by priority', () => {
    const day = buildMyDay(
      input({
        tasks: [
          task({ id: 'a', code: 'A', priority: 'LOW', dueDate: '2026-11-23' }),
          task({ id: 'b', code: 'B', priority: 'CRITICAL', dueDate: '2026-11-23' }),
          task({ id: 'c', code: 'C', dueDate: '2026-11-20' }),
          task({ id: 'd', code: 'D', status: 'COMPLETED' }),
          task({ id: 'e', code: 'E', assigneeName: 'Someone Else' }),
          task({ id: 'f', code: 'F', status: 'BLOCKED' }),
        ],
      }),
    );
    expect(day.personal.todayTasks.map((t) => t.code)).toEqual(['C', 'B', 'A', 'F']);
    expect(day.personal.taskCounts).toMatchObject({ open: 4, overdue: 1, dueToday: 2, blocked: 1 });
    expect(day.manager).toBeNull();
    expect(day.cockpit).toBeNull();
  });

  it('drafts a standup from the previous working day (Friday on a Monday)', () => {
    const day = buildMyDay(
      input({
        tasks: [task({ id: 'x', code: 'X-1', title: 'Login page', status: 'IN_PROGRESS' })],
        timeEntries: [
          {
            id: 'te1',
            userId: 'u1',
            userName: 'Kasun Silva',
            projectId: 'p1',
            projectName: 'Portal',
            taskId: 'x',
            taskTitle: 'Login API',
            source: 'TIMER',
            startedAt: '2026-11-20T04:00:00Z',
            endedAt: '2026-11-20T06:00:00Z',
            durationMinutes: 120,
            billable: true,
            note: '',
            status: 'SAVED',
          },
        ],
      }),
    );
    expect(day.personal.standupDraft).toMatchObject({
      previousWorkDay: '2026-11-20',
      yesterday: ['Login API'],
      today: ['X-1 Login page'],
      blockers: [],
    });
    expect(day.personal.unsubmittedTimeEntries).toBe(1);
    expect(formatStandup('Kasun', day.personal.standupDraft)).toContain('• Login API');
  });

  it('gives managers a team pulse with leave, lateness and blockers', () => {
    const people = [
      { id: 'u2', fullName: 'Nimali Perera', role: 'STAFF', status: 'ACTIVE', createdAt: '2024-11-25T00:00:00Z', birthday: '1998-11-24' },
      { id: 'u3', fullName: 'Ruwan Jay', role: 'INTERN', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'u4', fullName: 'Old Staff', role: 'STAFF', status: 'SUSPENDED', createdAt: '2020-01-01T00:00:00Z' },
    ];
    const day = buildMyDay(
      input({
        viewer: { id: 'pm', fullName: 'Pm User', email: 'pm@x.lk', role: 'ADMIN' },
        people,
        tasks: [task({ id: 'b1', code: 'B-1', assigneeName: 'Nimali Perera', status: 'BLOCKED' })],
        attendance: [
          {
            id: 'a1',
            userId: 'u2',
            userName: 'Nimali Perera',
            userRole: 'STAFF',
            workDate: '2026-11-23',
            clockInAt: '2026-11-23T03:45:00Z',
            clockOutAt: null,
            onBreak: false,
            breakMinutes: 0,
            isLate: true,
            notes: '',
          },
        ],
        leaveRequests: [
          { id: 'l1', userId: 'u3', userName: 'Ruwan Jay', type: 'ANNUAL', startDate: '2026-11-23', endDate: '2026-11-24', days: 2, reason: '', status: 'APPROVED', approverName: 'x', decisionNote: null, createdAt: '' },
          { id: 'l2', userId: 'u2', userName: 'Nimali Perera', type: 'SICK', startDate: '2026-11-24', endDate: '2026-11-24', days: 1, reason: '', status: 'PENDING', approverName: null, decisionNote: null, createdAt: '' },
        ],
        approvals: [
          { id: 'l2', source: 'LEAVE', type: 'LEAVE (SICK)', title: '', description: '', requestedById: 'u2', requestedByName: 'Nimali Perera', status: 'PENDING', createdAt: '2026-11-22' },
          { id: 'mine', source: 'GENERAL', type: 'EXPENSE', title: '', description: '', requestedById: 'pm', requestedByName: 'Pm User', status: 'PENDING', createdAt: '2026-11-22' },
        ],
      }),
    );
    const pulse = day.manager!.teamPulse;
    expect(pulse.summary).toMatchObject({ total: 2, working: 1, onLeave: 1, late: 1, blocked: 1 });
    expect(pulse.people[0]).toMatchObject({ fullName: 'Nimali Perera', state: 'WORKING' });
    // You never approve your own request.
    expect(day.manager!.approvalInbox.map((a) => a.id)).toEqual(['l2']);

    const hr = day.hr!;
    expect(hr.leaveClashes[0]).toEqual({ date: '2026-11-24', names: ['Ruwan Jay', 'Nimali Perera'] });
    expect(hr.celebrations.map((c) => `${c.fullName}:${c.kind}`)).toEqual([
      'Nimali Perera:BIRTHDAY',
      'Nimali Perera:ANNIVERSARY',
    ]);
    expect(hr.absentToday).toEqual([]); // the only other active person is on leave
    expect(day.cockpit).toBeNull();
  });

  it('flags sprint risk and ranks risky projects for the director', () => {
    const day = buildMyDay(
      input({
        viewer: { id: 'ceo', fullName: 'Ceo', email: 'ceo@x.lk', role: 'SUPER_ADMIN' },
        sprints: [{ id: 's1', projectId: 'p1', projectName: 'Portal', name: 'S1', goal: '', status: 'ACTIVE', startDate: '2026-11-16', endDate: '2026-11-27', retrospective: '' }],
        tasks: [
          task({ id: '1', sprintId: 's1', status: 'COMPLETED', storyPoints: 2 }),
          task({ id: '2', sprintId: 's1', status: 'BLOCKED', storyPoints: 5 }),
          task({ id: '3', sprintId: 's1', status: 'TODO', storyPoints: 3, dueDate: '2026-11-20' }),
        ],
        projects: [
          { id: 'p1', code: 'P1', name: 'Portal', description: '', clientId: null, clientName: 'ABC', category: '', status: 'IN_PROGRESS', priority: 'HIGH', budget: 0, currency: 'LKR', startDate: '', expectedEndDate: '2026-11-10', managerName: '', techStack: [], progressPercent: 40, stages: [], createdAt: '' },
          { id: 'p2', code: 'P2', name: 'Calm', description: '', clientId: null, clientName: 'XYZ', category: '', status: 'IN_PROGRESS', priority: 'LOW', budget: 0, currency: 'LKR', startDate: '', expectedEndDate: '2027-06-01', managerName: '', techStack: [], progressPercent: 10, stages: [], createdAt: '' },
        ],
        finance: {
          entries: [
            { type: 'INCOME', amount: 1000, status: 'PAID', recordedAt: '2026-11-02' },
            { type: 'EXPENSE', amount: 300, status: 'PAID', recordedAt: '2026-11-05' },
            { type: 'EXPENSE', amount: 999, status: 'PAID', recordedAt: '2026-10-05' },
          ],
          invoices: [{ id: 'i1', invoiceNumber: 'INV-1', clientName: 'ABC', totalAmount: 500, status: 'SENT', dueDate: '2026-11-01', currency: 'LKR' }],
        },
      }),
    );
    const sprint = day.manager!.sprints[0];
    expect(sprint).toMatchObject({ totalPoints: 10, donePoints: 2, completionPercent: 20, blocked: 1, overdue: 1, risk: 'RED' });
    const c = day.cockpit!;
    expect(c).toMatchObject({ income: 1000, expense: 300, net: 700 });
    expect(c.overdueInvoices.map((i) => i.invoiceNumber)).toEqual(['INV-1']);
    expect(c.riskiestProjects.map((p) => p.code)).toEqual(['P1']);
    expect(c.riskiestProjects[0].reasons[0]).toBe('13d past deadline');
  });

  it('shows the intern their current training week and countdown', () => {
    const day = buildMyDay(
      input({
        viewer: { id: 'i1', fullName: 'Ruwan Jay', email: 'ruwan@x.lk', role: 'INTERN' },
        interns: [
          {
            id: 'int1',
            userId: 'i1',
            fullName: 'Ruwan Jay',
            email: 'ruwan@x.lk',
            mentorName: 'Kasun Silva',
            university: 'UoM',
            programme: 'SE',
            startDate: '2026-11-02',
            endDate: '2027-01-31',
            progressPercent: 25,
            trainingTasks: [
              { id: 'w1', weekNumber: 1, title: 'Git basics', completed: false },
              { id: 'w4', weekNumber: 4, title: 'NestJS module', completed: false },
            ],
            evaluations: [],
            reflections: [{ id: 'r', date: '2026-11-23', learned: 'x', challenge: '', nextStep: '', createdAt: '' }],
          },
        ],
      }),
    );
    expect(day.intern).toMatchObject({
      currentWeek: 4,
      mentorName: 'Kasun Silva',
      daysLeft: 69,
      reflectionSubmittedToday: true,
    });
    expect(day.intern!.thisWeek.map((t) => t.id)).toEqual(['w4']);
    expect(day.intern!.overdueTraining.map((t) => t.id)).toEqual(['w1']);
  });
});
