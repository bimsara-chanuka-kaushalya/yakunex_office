import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PERMISSIONS } from '../rbac/permissions';
import { WorkspaceService } from './workspace.service';

@Controller()
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  // ─── Clients ──────────────────────────────────────────────────────────────
  @Get('clients')
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  listClients(@CurrentUser() actor: AuthUser) {
    return this.workspace.listClients(actor);
  }

  @Post('clients')
  @RequirePermissions(PERMISSIONS.PROJECTS_WRITE)
  createClient(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createClient(actor, body);
  }

  @Delete('clients/:id')
  @RequirePermissions(PERMISSIONS.PROJECTS_WRITE)
  deleteClient(@Param('id') id: string) {
    return this.workspace.deleteClient(id);
  }

  // ─── Projects ─────────────────────────────────────────────────────────────
  @Get('projects')
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  listProjects(@CurrentUser() actor: AuthUser) {
    return this.workspace.listProjects(actor);
  }

  @Post('projects')
  @RequirePermissions(PERMISSIONS.PROJECTS_WRITE)
  createProject(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createProject(actor, body);
  }

  @Patch('projects/:id')
  @RequirePermissions(PERMISSIONS.PROJECTS_WRITE)
  updateProject(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.updateProject(actor, id, body);
  }

  @Delete('projects/:id')
  @RequirePermissions(PERMISSIONS.PROJECTS_WRITE)
  deleteProject(@Param('id') id: string) {
    return this.workspace.deleteProject(id);
  }

  // ─── Sprints ──────────────────────────────────────────────────────────────
  @Get('sprints')
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  listSprints() {
    return this.workspace.listSprints();
  }

  @Post('sprints')
  @RequirePermissions(PERMISSIONS.TASKS_WRITE)
  createSprint(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createSprint(actor, body);
  }

  @Patch('sprints/:id')
  @RequirePermissions(PERMISSIONS.TASKS_WRITE)
  updateSprint(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.workspace.updateSprint(id, body);
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────
  @Get('tasks')
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  listTasks() {
    return this.workspace.listTasks();
  }

  @Post('tasks')
  @RequirePermissions(PERMISSIONS.TASKS_WRITE)
  createTask(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createTask(actor, body);
  }

  @Patch('tasks/:id')
  @RequirePermissions(PERMISSIONS.TASKS_WRITE)
  updateTask(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.workspace.updateTask(id, body);
  }

  @Delete('tasks/:id')
  @RequirePermissions(PERMISSIONS.TASKS_WRITE)
  deleteTask(@Param('id') id: string) {
    return this.workspace.deleteTask(id);
  }

  // ─── Bugs ─────────────────────────────────────────────────────────────────
  @Get('bugs')
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  listBugs() {
    return this.workspace.listBugs();
  }

  @Post('bugs')
  @RequirePermissions(PERMISSIONS.TASKS_WRITE)
  createBug(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createBug(actor, body);
  }

  @Patch('bugs/:id')
  @RequirePermissions(PERMISSIONS.TASKS_WRITE)
  updateBug(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.workspace.updateBug(id, body);
  }

  // ─── Documents ────────────────────────────────────────────────────────────
  @Get('documents')
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  listDocuments(@CurrentUser() actor: AuthUser) {
    return this.workspace.listDocuments(actor);
  }

  @Post('documents')
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  createDocument(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createDocument(actor, body);
  }

  // ─── Time Tracker ─────────────────────────────────────────────────────────
  @Get('time-entries')
  listTimeEntries(@CurrentUser() actor: AuthUser) {
    return this.workspace.listTimeEntries(actor);
  }

  @Post('time-entries/start')
  startTimer(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.startTimer(actor, body);
  }

  @Post('time-entries/stop')
  stopTimer(@CurrentUser() actor: AuthUser) {
    return this.workspace.stopTimer(actor);
  }

  @Post('time-entries/pause')
  pauseTimer(@CurrentUser() actor: AuthUser) {
    return this.workspace.pauseTimer(actor);
  }

  @Post('time-entries/resume')
  resumeTimer(@CurrentUser() actor: AuthUser) {
    return this.workspace.resumeTimer(actor);
  }

  @Post('time-entries/switch')
  switchTimer(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.switchTimer(actor, body);
  }

  @Post('time-entries/:id/submit')
  submitTimeEntry(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.submitTimeEntry(actor, id);
  }

  @Post('time-entries/manual')
  logManualTime(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.logManualTime(actor, body);
  }

  // ─── Attendance ───────────────────────────────────────────────────────────
  @Get('attendance')
  listAttendance(@CurrentUser() actor: AuthUser) {
    return this.workspace.listAttendance(actor);
  }

  @Post('attendance/clock-in')
  clockIn(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.clockIn(actor, body);
  }

  @Post('attendance/break')
  toggleBreak(@CurrentUser() actor: AuthUser) {
    return this.workspace.toggleBreak(actor);
  }

  @Post('attendance/clock-out')
  clockOut(@CurrentUser() actor: AuthUser) {
    return this.workspace.clockOut(actor);
  }

  @Post('attendance/location')
  @SkipThrottle()
  updateLiveLocation(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.updateLiveLocation(actor, body);
  }

  @Post('attendance/kiosk')
  @RequirePermissions(PERMISSIONS.TIME_APPROVE)
  kioskAttendance(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.kioskClockAction(actor, body);
  }

  // ─── Leave ────────────────────────────────────────────────────────────────
  @Get('leave')
  listLeave(@CurrentUser() actor: AuthUser) {
    return this.workspace.listLeave(actor);
  }

  @Post('leave')
  createLeave(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createLeave(actor, body);
  }

  @Patch('leave/:id/decision')
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  decideLeave(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.decideLeave(actor, id, body);
  }

  // ─── Interns ──────────────────────────────────────────────────────────────
  @Get('interns')
  listInterns(@CurrentUser() actor: AuthUser) {
    return this.workspace.listInterns(actor);
  }

  @Patch('interns/:id/tasks/:taskId')
  toggleInternTask(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
  ) {
    return this.workspace.toggleInternTask(actor, id, taskId);
  }

  @Post('interns/:id/evaluations')
  addInternEvaluation(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.addInternEvaluation(actor, id, body);
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────
  @Get('chat/channels')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  listChatChannels(@CurrentUser() actor: AuthUser) {
    return this.workspace.listChatChannels(actor);
  }

  @Post('chat/channels')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  createChatChannel(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createChatChannel(actor, body);
  }

  @Post('chat/direct')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  startDirectChat(
    @CurrentUser() actor: AuthUser,
    @Body() body: { targetUserId: string; targetUserName?: string },
  ) {
    return this.workspace.startDirectChat(actor, body.targetUserId, body.targetUserName);
  }

  @Get('chat/channels/:id/messages')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  listChatMessages(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.listChatMessages(id, actor);
  }

  @Post('chat/channels/:id/messages')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  postChatMessage(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.postChatMessage(actor, id, body);
  }

  @Patch('chat/messages/:id')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  editChatMessage(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    return this.workspace.editChatMessage(actor, id, body.body);
  }

  @Delete('chat/messages/:id')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  deleteChatMessage(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.deleteChatMessage(actor, id);
  }

  @Post('chat/messages/:id/react')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  reactChatMessage(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: { emoji: string },
  ) {
    return this.workspace.reactChatMessage(actor, id, body.emoji);
  }

  @Patch('chat/messages/:id/pin')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  togglePinChatMessage(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.togglePinChatMessage(actor, id);
  }

  @Post('chat/messages/:id/to-task')
  @RequirePermissions(PERMISSIONS.TASKS_WRITE)
  convertMessageToTask(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.convertMessageToTask(actor, id, body);
  }

  @Post('chat/channels/:id/meeting')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  createMeetingFromChannel(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.createMeetingFromChannel(actor, id, body);
  }

  // ─── Meetings (Built-in Yakunex Hub Meet Engine) ──────────────────────────
  @Get('meetings/access-policy')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  getMeetingAccessPolicy(@CurrentUser() actor: AuthUser) {
    return this.workspace.resolveMeetingAccessPolicy(actor);
  }

  @Get('meetings')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  listMeetings(@CurrentUser() actor: AuthUser) {
    return this.workspace.listMeetings(actor.organizationId, actor);
  }

  @Get('meetings/ice-config')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  getMeetingIceConfig() {
    return this.workspace.getMeetingIceConfig();
  }

  @Get('meetings/by-code/:code')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  getMeetingByCode(@CurrentUser() actor: AuthUser, @Param('code') code: string) {
    return this.workspace.getMeetingByCode(actor, code);
  }

  @Get('meetings/:id/sfu-token')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  getMeetingSfuToken(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.getMeetingSfuToken(actor, id);
  }

  @Get('meetings/:id/room')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  getMeetingRoom(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.getMeetingRoom(id, actor.organizationId);
  }

  @Post('meetings')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  scheduleMeeting(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.scheduleMeeting(actor, body);
  }

  @Patch('meetings/:id')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  updateMeeting(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.updateMeeting(id, body, actor.organizationId, actor);
  }

  @Post('meetings/:id/join')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  joinMeetingRoom(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body?: { micOn?: boolean; camOn?: boolean },
  ) {
    return this.workspace.joinMeetingRoom(actor, id, body);
  }

  @Post('meetings/:id/leave')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  leaveMeetingRoom(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.leaveMeetingRoom(actor, id);
  }

  @Patch('meetings/:id/participant')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  updateParticipantState(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.updateParticipantState(actor, id, body);
  }

  @Post('meetings/:id/chat')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  postMeetingChat(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.postMeetingChat(actor, id, body);
  }

  @Post('meetings/join-by-code')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  joinMeetingByCode(
    @CurrentUser() actor: AuthUser,
    @Body() body: { roomCode: string; micOn?: boolean; camOn?: boolean },
  ) {
    return this.workspace.joinMeetingByCode(actor, body.roomCode, body);
  }

  @Post('meetings/:id/signal')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  sendMeetingSignal(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      toUserId?: string;
      type?: string;
      payload?: unknown;
      batch?: Array<{ toUserId?: string; type: string; payload?: unknown }>;
    },
  ) {
    return this.workspace.sendMeetingSignal(actor, id, body);
  }

  @Get('meetings/:id/signals')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  pollMeetingSignals(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Query('after') after?: string,
  ) {
    return this.workspace.pollMeetingSignals(actor, id, Number(after) || 0);
  }

  @Patch('meetings/:id/host-action')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  hostMeetingAction(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      action: 'mute' | 'mute-all' | 'admit' | 'remove' | 'approve-screenshare' | 'toggle-cohost';
      targetUserId?: string;
    },
  ) {
    return this.workspace.hostMeetingAction(actor, id, body);
  }

  // ─── Reports ──────────────────────────────────────────────────────────────
  @Get('reports/summary')
  getReportsSummary(@CurrentUser() actor: AuthUser) {
    return this.workspace.getReportsSummary(actor);
  }

  // ─── Audit Logs ───────────────────────────────────────────────────────────
  @Get('audit-logs')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  listAuditLogs(@CurrentUser() actor: AuthUser) {
    return this.workspace.listAuditLogs(actor);
  }

  // ─── Settings ─────────────────────────────────────────────────────────────
  @Get('settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  getSettings() {
    return this.workspace.getSettings();
  }

  @Put('settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  updateSettings(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.updateSettings(actor, body);
  }

  @Put('settings/role-permissions')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  updateRolePermissions(
    @CurrentUser() actor: AuthUser,
    @Body() body: { role: Role; permissions: string[] },
  ) {
    return this.workspace.updateRolePermissions(actor, body.role, body.permissions ?? []);
  }

  // ─── Organization & Hierarchy ─────────────────────────────────────────────
  @Get('organization')
  getOrganizationOverview(@CurrentUser() actor: AuthUser) {
    return this.workspace.getOrganizationOverview(actor);
  }

  @Post('organization/departments')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  createDepartment(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createDepartment(actor, body);
  }

  @Patch('organization/assign-manager')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  assignReportingManager(
    @CurrentUser() actor: AuthUser,
    @Body() body: { userId: string; managerId: string | null },
  ) {
    return this.workspace.assignReportingManager(actor, body.userId, body.managerId ?? null);
  }

  // ─── Approval Center ──────────────────────────────────────────────────────
  @Get('approvals')
  listApprovals(@CurrentUser() actor: AuthUser) {
    return this.workspace.listApprovals(actor);
  }

  @Post('approvals')
  createApproval(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createApproval(actor, body);
  }

  @Patch('approvals/:id/decision')
  decideApproval(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED' | 'RETURNED'; comment?: string; source?: string },
  ) {
    return this.workspace.decideApproval(actor, id, body);
  }

  // ─── Finance & Payroll ────────────────────────────────────────────────────
  @Get('finance')
  @RequirePermissions(PERMISSIONS.FINANCIALS_READ)
  getFinanceSummary() {
    return this.workspace.getFinanceSummary();
  }

  @Post('finance/entries')
  @RequirePermissions(PERMISSIONS.FINANCIALS_WRITE)
  createFinanceEntry(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createFinanceEntry(actor, body);
  }

  // ─── Assets ───────────────────────────────────────────────────────────────
  @Get('assets')
  listAssets() {
    return this.workspace.listAssets();
  }

  @Post('assets')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  createAsset(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createAsset(actor, body);
  }

  @Patch('assets/:id')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  updateAsset(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.updateAsset(actor, id, body);
  }

  // ─── Performance & Goals ──────────────────────────────────────────────────
  @Get('performance')
  listPerformanceReviews(@CurrentUser() actor: AuthUser) {
    return this.workspace.listPerformanceReviews(actor);
  }

  @Post('performance')
  createPerformanceReview(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createPerformanceReview(actor, body);
  }

  // ─── Notifications & Announcements ────────────────────────────────────────
  @Get('notifications')
  listNotifications(@CurrentUser() actor: AuthUser) {
    return this.workspace.listNotifications(actor);
  }

  @Post('notifications/announcements')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  createAnnouncement(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createAnnouncement(actor, body);
  }

  @Patch('notifications/:id/read')
  markNotificationRead(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.markNotificationRead(actor, id);
  }

  // ─── Employee Personal Profile ────────────────────────────────────────────
  @Get('profile')
  getMyProfile(@CurrentUser() actor: AuthUser) {
    return this.workspace.getEmployeeProfile(actor);
  }

  @Get('profile/:userId')
  getUserProfile(@CurrentUser() actor: AuthUser, @Param('userId') userId: string) {
    return this.workspace.getEmployeeProfile(actor, userId);
  }

  @Patch('profile/dp')
  updateOwnDp(@CurrentUser() actor: AuthUser, @Body() body: { avatarUrl: string }) {
    return this.workspace.updateOwnDp(actor, body.avatarUrl);
  }

  @Post('profile/request-change')
  requestProfileFieldChange(
    @CurrentUser() actor: AuthUser,
    @Body() body: { field: 'nicNumber' | 'phone'; newValue: string },
  ) {
    return this.workspace.requestProfileFieldChange(actor, body);
  }

  @Patch('profile/:userId')
  adminUpdateProfile(
    @CurrentUser() actor: AuthUser,
    @Param('userId') userId: string,
    @Body()
    body: {
      fullName?: string;
      firstName?: string;
      lastName?: string;
      nicNumber?: string;
      address?: string;
      birthday?: string;
      phone?: string;
      role?: Role;
      title?: string;
    },
  ) {
    return this.workspace.adminUpdateProfile(actor, userId, body);
  }

  @Get('dashboard/role-insights')
  getRoleInsights(@CurrentUser() actor: AuthUser) {
    return this.workspace.getRoleInsights(actor);
  }
}

