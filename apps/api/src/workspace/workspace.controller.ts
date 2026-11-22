import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Sse,
  UseGuards,
  UseInterceptors,
  type RawBodyRequest,
  type MessageEvent,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PERMISSIONS } from '../rbac/permissions';
import { WorkspaceService } from './workspace.service';
import { WorkspaceTenantGuard } from './workspace-tenant.guard';
import { MeetingViewInterceptor } from './meeting-view.interceptor';

@Controller()
@UseGuards(WorkspaceTenantGuard)
@UseInterceptors(MeetingViewInterceptor)
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
  deleteClient(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.deleteClient(id, actor);
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
  deleteProject(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.deleteProject(id, actor);
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
  deleteTask(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.deleteTask(id, actor);
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
  @RequirePermissions(PERMISSIONS.TASKS_WRITE)
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
  @RequirePermissions(PERMISSIONS.USERS_READ)
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

  @Post('chat/channels/:id/read')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  markChatChannelRead(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.markChatChannelRead(actor, id);
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

  @Get('meetings/public/ice-config')
  @Public()
  @SkipThrottle()
  getPublicIceConfig() {
    return this.workspace.getMeetingIceConfig();
  }

  @Get('meetings/public/:code')
  @Public()
  @SkipThrottle()
  getPublicMeetingInfo(@Param('code') code: string) {
    return this.workspace.getPublicMeetingInfo(code);
  }

  @Post('meetings/public/:code/join')
  @Public()
  @SkipThrottle()
  joinPublicMeetingAsGuest(
    @Param('code') code: string,
    @Body() body: { fullName: string; passcode?: string; micOn?: boolean; camOn?: boolean },
  ) {
    return this.workspace.joinPublicMeetingAsGuest(code, body);
  }

  // ─── Live meeting push stream ("doorbell": tells the call to fetch now) ────
  @Sse('meetings/public/:id/stream')
  @Public()
  @SkipThrottle()
  streamGuestMeeting(
    @Headers('x-meeting-guest-token') guestToken: string,
    @Param('id') id: string,
  ): Observable<MessageEvent> {
    return this.meetingStream(id, () => this.workspace.requireGuestMeetingStreamAccess(guestToken, id));
  }

  @Sse('meetings/:id/stream')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  streamMeeting(@CurrentUser() actor: AuthUser, @Param('id') id: string): Observable<MessageEvent> {
    return this.meetingStream(id, () => this.workspace.requireMeetingStreamAccess(actor, id));
  }

  private meetingStream(id: string, checkAccess: () => Promise<void>): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let unsub: () => void = () => undefined;
      let ping: ReturnType<typeof setInterval> | null = null;
      checkAccess()
        .then(() => {
          if (closed) return;
          subscriber.next({ data: { kind: 'ready' } });
          unsub = this.workspace.onMeetingActivity(id, (kind) => {
            if (!closed) subscriber.next({ data: { kind } });
          });
          ping = setInterval(() => {
            if (!closed) subscriber.next({ data: { kind: 'ping' } });
          }, 15_000);
        })
        .catch((err: Error) => {
          if (closed) return;
          subscriber.next({ data: { kind: 'denied', message: err.message } });
          subscriber.complete();
        });
      return () => {
        closed = true;
        unsub();
        if (ping) clearInterval(ping);
      };
    });
  }

  @Get('meetings/public/:id/room')
  @Public()
  @SkipThrottle()
  getGuestMeetingRoom(
    @Headers('x-meeting-guest-token') guestToken: string,
    @Param('id') id: string,
  ) {
    return this.workspace.getGuestMeetingRoom(guestToken, id);
  }

  @Get('meetings/public/:id/sfu-token')
  @Public()
  @SkipThrottle()
  getGuestSfuToken(
    @Headers('x-meeting-guest-token') guestToken: string,
    @Param('id') id: string,
  ) {
    return this.workspace.getGuestSfuToken(guestToken, id);
  }

  @Patch('meetings/public/:id/participant')
  @Public()
  @SkipThrottle()
  guestUpdateParticipant(
    @Headers('x-meeting-guest-token') guestToken: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.guestUpdateParticipant(guestToken, id, body);
  }

  @Post('meetings/public/:id/chat')
  @Public()
  @SkipThrottle()
  guestPostChat(
    @Headers('x-meeting-guest-token') guestToken: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspace.guestPostChat(guestToken, id, body);
  }

  @Post('meetings/public/:id/signal')
  @Public()
  @SkipThrottle()
  guestSendSignal(
    @Headers('x-meeting-guest-token') guestToken: string,
    @Param('id') id: string,
    @Body()
    body: {
      toUserId?: string;
      type?: string;
      payload?: unknown;
      batch?: Array<{ toUserId?: string; type: string; payload?: unknown }>;
    },
  ) {
    return this.workspace.guestSendSignal(guestToken, id, body);
  }

  @Get('meetings/public/:id/signals')
  @Public()
  @SkipThrottle()
  guestPollSignals(
    @Headers('x-meeting-guest-token') guestToken: string,
    @Param('id') id: string,
    @Query('after') after?: string,
  ) {
    return this.workspace.guestPollSignals(guestToken, id, Number(after) || 0);
  }

  @Post('meetings/public/:id/leave')
  @Public()
  @SkipThrottle()
  guestLeaveMeeting(
    @Headers('x-meeting-guest-token') guestToken: string,
    @Param('id') id: string,
  ) {
    return this.workspace.guestLeaveMeeting(guestToken, id);
  }

  @Get('meetings/:id/sfu-token')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  getMeetingSfuToken(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Query('roomOverride') roomOverride?: string,
  ) {
    return this.workspace.getMeetingSfuToken(actor, id, roomOverride);
  }

  @Get('meetings/:id/room')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  getMeetingRoom(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.getMeetingRoomFor(actor, id);
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
    @Body() body?: { micOn?: boolean; camOn?: boolean; passcode?: string },
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
    @Body() body: { roomCode: string; micOn?: boolean; camOn?: boolean; passcode?: string },
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
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  hostMeetingAction(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      action:
        | 'mute'
        | 'mute-all'
        | 'admit'
        | 'admit-all'
        | 'waiting-room-message'
        | 'remove'
        | 'approve-screenshare'
        | 'toggle-cohost'
        | 'ask-unmute'
        | 'stop-video'
        | 'spotlight'
        | 'lower-all-hands'
        | 'rename'
        | 'transfer-host'
        | 'update-security'
        | 'panic-suspend'
        | 'recording-status';
      targetUserId?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.workspace.hostMeetingAction(actor, id, body);
  }

  @Post('meetings/:id/rename-self')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  renameSelfInMeeting(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: { newName: string },
  ) {
    return this.workspace.renameSelfInMeeting(actor, id, body.newName);
  }

  @Post('meetings/:id/polls')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  manageMeetingPoll(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      action: 'create' | 'vote' | 'close';
      question?: string;
      options?: string[];
      multipleChoice?: boolean;
      pollId?: string;
      optionIds?: string[];
    },
  ) {
    return this.workspace.manageMeetingPoll(actor, id, body);
  }

  @Post('meetings/:id/qa')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  manageMeetingQa(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      action: 'ask' | 'upvote' | 'answer';
      question?: string;
      qaId?: string;
      answerText?: string;
    },
  ) {
    return this.workspace.manageMeetingQa(actor, id, body);
  }

  @Post('meetings/:id/breakouts')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  manageBreakoutRooms(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      action: 'configure' | 'open' | 'broadcast' | 'close-all' | 'join-room' | 'leave-room';
      rooms?: Array<{ id?: string; name: string; participantIds?: string[] }>;
      durationMinutes?: number;
      message?: string;
      roomId?: string;
    },
  ) {
    return this.workspace.manageBreakoutRooms(actor, id, body);
  }

  @Get('meetings/:id/attendance')
  @SkipThrottle()
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  getMeetingAttendance(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.getMeetingAttendance(actor, id);
  }

  // ─── Reports ──────────────────────────────────────────────────────────────
  @Get('reports/summary')
  @RequirePermissions(PERMISSIONS.USERS_READ)
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

  @Get('finance/invoices')
  @RequirePermissions(PERMISSIONS.FINANCIALS_READ)
  listInvoices() {
    return this.workspace.listInvoices();
  }

  @Post('finance/invoices')
  @RequirePermissions(PERMISSIONS.FINANCIALS_WRITE)
  createInvoice(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.createInvoice(actor, body);
  }

  @Patch('finance/invoices/:id/status')
  @RequirePermissions(PERMISSIONS.FINANCIALS_WRITE)
  updateInvoiceStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' },
  ) {
    return this.workspace.updateInvoiceStatus(actor, id, body.status);
  }

  // ─── Assets ───────────────────────────────────────────────────────────────
  @Get('assets')
  @RequirePermissions(PERMISSIONS.USERS_READ)
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
  @SkipThrottle()
  listNotifications(@CurrentUser() actor: AuthUser) {
    return this.workspace.listNotifications(actor, true);
  }

  @Sse('notifications/stream')
  @SkipThrottle()
  streamNotifications(@CurrentUser() actor: AuthUser): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const seenIds = new Set<string>();
      let closed = false;

      const emitNew = (items: Awaited<ReturnType<WorkspaceService['listNotifications']>>, initial: boolean) => {
        if (closed) return;
        if (initial) {
          for (const item of items) seenIds.add(item.id);
          subscriber.next({ data: { kind: 'snapshot', notifications: items.slice(0, 30) } });
          return;
        }
        const fresh = items.filter((item) => !seenIds.has(item.id));
        if (fresh.length > 0) {
          for (const item of fresh) seenIds.add(item.id);
          subscriber.next({ data: { kind: 'new', notifications: fresh } });
        }
      };

      void this.workspace
        .listNotifications(actor, true)
        .then((list) => emitNew(list, true))
        .catch(() => undefined);

      // Zero-millisecond in-process push
      const unsubscribe = this.workspace.onNotificationEvent(({ organizationId, notification }) => {
        if (closed) return;
        if (organizationId && actor.organizationId && organizationId !== actor.organizationId) return;
        if (!this.workspace.isNotificationVisibleToActor(notification, actor)) return;
        if (seenIds.has(notification.id)) return;
        seenIds.add(notification.id);
        subscriber.next({
          data: {
            kind: 'new',
            notifications: [{ ...notification, read: notification.readByIds.includes(actor.id) }],
          },
        });
      });

      // Cross-instance serverless fast sync every 1.2s + heartbeat
      const pollTimer = setInterval(() => {
        if (closed) return;
        void this.workspace
          .listNotifications(actor, true)
          .then((list) => emitNew(list, false))
          .catch(() => undefined);
      }, 1200);

      const pingTimer = setInterval(() => {
        if (!closed) subscriber.next({ data: { kind: 'ping', ts: Date.now() } });
      }, 15_000);

      return () => {
        closed = true;
        unsubscribe();
        clearInterval(pollTimer);
        clearInterval(pingTimer);
      };
    });
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
      monthlyBasicSalaryLkr?: number;
      fixedAllowancesLkr?: number;
      epfNumber?: string;
      bankName?: string;
      bankBranch?: string;
      bankAccountNo?: string;
      avatarUrl?: string;
    },
  ) {
    return this.workspace.adminUpdateProfile(actor, userId, body);
  }

  // ─── My Day ───────────────────────────────────────────────────────────────
  @Get('my-day')
  getMyDay(@CurrentUser() actor: AuthUser) {
    return this.workspace.getMyDay(actor);
  }

  @Post('my-day/tasks/:id/block')
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  blockMyTask(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.workspace.blockMyTask(actor, id, body?.reason);
  }

  @Post('my-day/standup')
  @RequirePermissions(PERMISSIONS.CHAT_USE)
  postStandup(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.postStandup(actor, body ?? {});
  }

  @Post('my-day/reflection')
  submitReflection(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.submitInternReflection(actor, body ?? {});
  }

  @Post('my-day/approvals/bulk')
  bulkDecideApprovals(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.workspace.bulkDecideApprovals(actor, body ?? {});
  }

  // ─── Meeting deletion (Super Admin only; checked in the service) ──────────
  @Delete('meetings/ended')
  deleteEndedMeetings(@CurrentUser() actor: AuthUser, @Query('olderThanDays') olderThanDays?: string) {
    return this.workspace.deleteEndedMeetings(actor, { olderThanDays });
  }

  @Delete('meetings/:id')
  deleteMeeting(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.deleteMeeting(actor, id);
  }

  @Get('dashboard/role-insights')
  getRoleInsights(@CurrentUser() actor: AuthUser) {
    return this.workspace.getRoleInsights(actor);
  }

  // ─── Global Zero-Refresh Live Workspace SSE Stream ────────────────────────
  @Sse('workspace/live-stream')
  @SkipThrottle()
  streamWorkspaceLive(@CurrentUser() actor: AuthUser): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let lastVer = this.workspace.getWorkspaceVersion();
      subscriber.next({ data: { kind: 'connected', version: lastVer } });

      const unsub = this.workspace.onWorkspaceMutated(({ organizationId, version }) => {
        if (closed) return;
        if (organizationId && actor.organizationId && organizationId !== actor.organizationId) return;
        lastVer = version;
        subscriber.next({ data: { kind: 'mutated', version } });
      });

      const ping = setInterval(() => {
        if (!closed) {
          subscriber.next({ data: { kind: 'ping', version: lastVer } });
        }
      }, 15_000);

      return () => {
        closed = true;
        unsub();
        clearInterval(ping);
      };
    });
  }

  // ─── Sri Lanka Workforce Leave Balances, Holidays & Payroll ───────────────
  @Get('leave/summary')
  getLeaveSummary(@CurrentUser() actor: AuthUser) {
    return this.workspace.getLeaveSummaryAndHolidays(actor);
  }

  @Get('workforce/sri-lanka-payroll')
  getSriLankaPayroll(@CurrentUser() actor: AuthUser) {
    return this.workspace.getSriLankaPayrollSummary(actor);
  }

  @Post('workforce/timesheets/submit')
  submitWeeklyTimesheet(
    @CurrentUser() actor: AuthUser,
    @Body() body: { weekLabel?: string; notes?: string },
  ) {
    return this.workspace.submitWeeklyTimesheet(actor, body ?? {});
  }

  // ─── GitHub PR Webhook (Jira Enterprise Integration) ──────────────────────
  @Post('integrations/github/webhook')
  @Public()
  @SkipThrottle()
  githubWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: Record<string, unknown>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    return this.workspace.handleGithubWebhook(body ?? {}, signature, req.rawBody);
  }

  // ─── External Client Portal ───────────────────────────────────────────────
  @Post('clients/:id/portal-link')
  @RequirePermissions(PERMISSIONS.PROJECTS_WRITE)
  getClientPortalLink(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.getOrCreateClientPortalLink(actor, id);
  }

  @Post('clients/:id/portal-link/rotate')
  @RequirePermissions(PERMISSIONS.PROJECTS_WRITE)
  rotateClientPortalLink(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.workspace.rotateClientPortalLink(actor, id);
  }

  @Get('clients/portal/:token')
  @Public()
  @SkipThrottle()
  getPublicClientPortal(@Param('token') token: string) {
    return this.workspace.getPublicClientPortal(token);
  }
}

