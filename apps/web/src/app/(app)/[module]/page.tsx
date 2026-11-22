'use client';

import { use } from 'react';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { findNavItem, isModuleLockedForRole } from '@/lib/nav';
import { useAuth } from '@/components/providers';
import { LockedModuleNotice } from '@/components/ui/locked-module';
import { Skeleton } from '@/components/ui/skeleton';

function ViewLoader() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

const ProjectsView = dynamic(() => import('@/components/modules/delivery-views').then((m) => m.ProjectsView), { loading: ViewLoader });
const TasksView = dynamic(() => import('@/components/modules/delivery-views').then((m) => m.TasksView), { loading: ViewLoader });
const SprintsView = dynamic(() => import('@/components/modules/delivery-views').then((m) => m.SprintsView), { loading: ViewLoader });
const ClientsView = dynamic(() => import('@/components/modules/delivery-views').then((m) => m.ClientsView), { loading: ViewLoader });
const BugsView = dynamic(() => import('@/components/modules/delivery-views').then((m) => m.BugsView), { loading: ViewLoader });
const DocumentsView = dynamic(() => import('@/components/modules/delivery-views').then((m) => m.DocumentsView), { loading: ViewLoader });

const TimeTrackerView = dynamic(() => import('@/components/modules/workforce-views').then((m) => m.TimeTrackerView), { loading: ViewLoader });
const AttendanceView = dynamic(() => import('@/components/modules/workforce-views').then((m) => m.AttendanceView), { loading: ViewLoader });
const LeaveView = dynamic(() => import('@/components/modules/workforce-views').then((m) => m.LeaveView), { loading: ViewLoader });
const InternsView = dynamic(() => import('@/components/modules/workforce-views').then((m) => m.InternsView), { loading: ViewLoader });

const ChatView = dynamic(() => import('@/components/modules/chat/chat-view').then((m) => m.ChatView), { loading: ViewLoader });
const MeetingsView = dynamic(() => import('@/components/modules/collab-control-views').then((m) => m.MeetingsView), { loading: ViewLoader });
const ReportsView = dynamic(() => import('@/components/modules/collab-control-views').then((m) => m.ReportsView), { loading: ViewLoader });
const AuditLogsView = dynamic(() => import('@/components/modules/collab-control-views').then((m) => m.AuditLogsView), { loading: ViewLoader });
const SettingsView = dynamic(() => import('@/components/modules/collab-control-views').then((m) => m.SettingsView), { loading: ViewLoader });

const OrganizationView = dynamic(() => import('@/components/modules/enterprise-views').then((m) => m.OrganizationView), { loading: ViewLoader });
const ApprovalsView = dynamic(() => import('@/components/modules/enterprise-views').then((m) => m.ApprovalsView), { loading: ViewLoader });
const FinanceView = dynamic(() => import('@/components/modules/enterprise-views').then((m) => m.FinanceView), { loading: ViewLoader });
const AssetsView = dynamic(() => import('@/components/modules/enterprise-views').then((m) => m.AssetsView), { loading: ViewLoader });
const PerformanceView = dynamic(() => import('@/components/modules/enterprise-views').then((m) => m.PerformanceView), { loading: ViewLoader });
const NotificationsView = dynamic(() => import('@/components/modules/enterprise-views').then((m) => m.NotificationsView), { loading: ViewLoader });
const ProfileView = dynamic(() => import('@/components/modules/enterprise-views').then((m) => m.ProfileView), { loading: ViewLoader });

export default function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = use(params);
  const { user, can } = useAuth();
  const item = findNavItem(module);

  if (!item) notFound();
  if (isModuleLockedForRole(module, user?.role, can)) {
    return <LockedModuleNotice />;
  }

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
    case 'organization':
      return <OrganizationView />;
    case 'approvals':
      return <ApprovalsView />;
    case 'finance':
      return <FinanceView />;
    case 'assets':
      return <AssetsView />;
    case 'performance':
      return <PerformanceView />;
    case 'notifications':
      return <NotificationsView />;
    case 'profile':
      return <ProfileView />;
    default:
      notFound();
  }
}
