import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
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
  listChatChannels() {
    return this.workspace.listChatChannels();
  }

  @Post('chat/channels')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  createChatChannel(@Body() body: Record<string, unknown>) {
    return this.workspace.createChatChannel(body);
  }

  @Get('chat/channels/:id/messages')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  listChatMessages(@Param('id') id: string) {
    return this.workspace.listChatMessages(id);
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

  // ─── Meetings (Built-in Yakunex Hub Meet Engine) ──────────────────────────
  @Get('meetings')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  listMeetings(@CurrentUser() actor: AuthUser) {
    return this.workspace.listMeetings(actor.organizationId);
  }

  @Get('meetings/:id/room')
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
    return this.workspace.updateMeeting(id, body, actor.organizationId);
  }

  @Post('meetings/:id/join')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  joinMeetingRoom(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body?: { micOn?: boolean; camOn?: boolean },
  ) {
    return this.workspace.joinMeetingRoom(actor, id, body);
  }

  @Post('meetings/:id/leave')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  leaveMeetingRoom(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.leaveMeetingRoom(actor, id);
  }

  @Patch('meetings/:id/participant')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  updateParticipantState(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.updateParticipantState(actor, id, body);
  }

  @Post('meetings/:id/chat')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  postMeetingChat(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.postMeetingChat(actor, id, body);
  }

  @Post('meetings/join-by-code')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  joinMeetingByCode(
    @CurrentUser() actor: AuthUser,
    @Body() body: { roomCode: string; micOn?: boolean; camOn?: boolean },
  ) {
    return this.workspace.joinMeetingByCode(actor, body.roomCode, body);
  }

  @Post('meetings/:id/signal')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  sendMeetingSignal(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: { toUserId?: string; type: string; payload: unknown },
  ) {
    return this.workspace.sendMeetingSignal(actor, id, body);
  }

  @Get('meetings/:id/signals')
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
    @Body() body: { action: 'mute' | 'mute-all'; targetUserId?: string },
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
}

