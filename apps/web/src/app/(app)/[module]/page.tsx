'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { findNavItem } from '@/lib/nav';
import {
  BugsView,
  ClientsView,
  DocumentsView,
  ProjectsView,
  SprintsView,
  TasksView,
} from '@/components/modules/delivery-views';
import {
  AttendanceView,
  InternsView,
  LeaveView,
  TimeTrackerView,
} from '@/components/modules/workforce-views';
import {
  AuditLogsView,
  ChatView,
  MeetingsView,
  ReportsView,
  SettingsView,
} from '@/components/modules/collab-control-views';

export default function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = use(params);
  const item = findNavItem(module);

  if (!item) notFound();

  switch (module) {
    case 'projects':
      return <ProjectsView />;
    case 'tasks':
      return <TasksView />;
    case 'sprints':
      return <SprintsView />;
    case 'clients':
      return <ClientsView />;
    case 'bugs':
      return <BugsView />;
    case 'documents':
      return <DocumentsView />;
    case 'time-tracker':
      return <TimeTrackerView />;
    case 'attendance':
      return <AttendanceView />;
    case 'leave':
      return <LeaveView />;
    case 'interns':
      return <InternsView />;
    case 'chat':
      return <ChatView />;
    case 'meetings':
      return <MeetingsView />;
    case 'reports':
      return <ReportsView />;
    case 'audit-logs':
      return <AuditLogsView />;
    case 'settings':
      return <SettingsView />;
    default:
      notFound();
  }
}
