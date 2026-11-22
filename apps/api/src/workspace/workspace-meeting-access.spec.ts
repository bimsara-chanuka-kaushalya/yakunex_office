import { ForbiddenException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from './workspace.service';

/** Regression tests for meeting access-control and state bugs found during end-to-end testing. */
describe('WorkspaceService meeting access control', () => {
  const user = (id: string, role: Role, fullName: string, companyId: string): AuthUser => ({
    id,
    organizationId: 'org_test',
    companyId,
    email: `${id}@yakunex.local`,
    fullName,
    role,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
  });
  const host = user('usr_host', Role.STAFF, 'Kasun Silva', 'YNX-STF-0001');
  const twin = user('usr_twin', Role.STAFF, 'Kasun Silva', 'YNX-STF-0002'); // same name, different person
  const outsider = user('usr_out', Role.INTERN, 'Dilini Fernando', 'YNX-INT-0003');
  const manager = user('usr_pm', Role.PROJECT_MANAGER, 'Nimal Perera', 'YNX-PM-0004');

  function makeService(): WorkspaceService {
    const prismaStub = { isConnected: () => false } as unknown as PrismaService;
    const auditStub = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return new WorkspaceService(prismaStub, auditStub);
  }

  async function liveMeeting(svc: WorkspaceService, extra: Record<string, unknown> = {}) {
    return svc.scheduleMeeting(host, { title: 'Sprint Sync', instant: true, ...extra });
  }

  it('does not give host rights to a different user with the same name', async () => {
    const svc = makeService();
    const mtg = await liveMeeting(svc);
    await svc.joinMeetingRoom(twin, mtg.id, {});
    await expect(svc.hostMeetingAction(twin, mtg.id, { action: 'mute-all' })).rejects.toThrow(ForbiddenException);
    await expect(svc.updateMeeting(mtg.id, { status: 'COMPLETED' }, 'org_test', twin)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(svc.updateMeeting(mtg.id, { title: 'Hijacked' }, 'org_test', twin)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('keeps waiting-room and removed users out of the call', async () => {
    const svc = makeService();
    const mtg = await liveMeeting(svc, { waitingRoomEnabled: true });
    const waiting = await svc.joinMeetingRoom(outsider, mtg.id, { micOn: false, camOn: true });
    expect(waiting.participants.some((p) => p.userId === outsider.id)).toBe(false);
    await expect(svc.updateParticipantState(outsider, mtg.id, { micOn: true })).rejects.toThrow(ForbiddenException);
    await expect(svc.getMeetingSfuToken(outsider, mtg.id)).rejects.toThrow(ForbiddenException);
    await expect(svc.postMeetingChat(outsider, mtg.id, { body: 'hi' })).rejects.toThrow(ForbiddenException);
    await expect(svc.sendMeetingSignal(outsider, mtg.id, { type: 'offer' })).rejects.toThrow(ForbiddenException);
    // ...but may poll signals so they learn when they are admitted.
    await expect(svc.pollMeetingSignals(outsider, mtg.id, 0)).resolves.toBeDefined();

    const admitted = await svc.hostMeetingAction(host, mtg.id, { action: 'admit', targetUserId: outsider.id });
    const p = admitted.participants.find((x) => x.userId === outsider.id);
    expect(p).toMatchObject({ micOn: false, camOn: true }); // their pre-join choice, not forced on

    await svc.hostMeetingAction(host, mtg.id, { action: 'remove', targetUserId: outsider.id });
    await expect(svc.updateParticipantState(outsider, mtg.id, { camOn: true })).rejects.toThrow(ForbiddenException);
  });

  it('hides other people\'s private messages and the passcode from guests', async () => {
    const svc = makeService();
    const mtg = await liveMeeting(svc, { passcode: '4321' });
    await svc.joinMeetingRoom(manager, mtg.id, {});
    await svc.joinMeetingRoom(twin, mtg.id, { passcode: '4321' });
    await svc.postMeetingChat(host, mtg.id, { body: 'for nimal only', recipientId: manager.id });
    const room = await svc.getMeetingRoom(mtg.id, 'org_test');

    expect(svc.viewMeetingFor(room, twin).chatMessages.some((m) => m.body === 'for nimal only')).toBe(false);
    expect(svc.viewMeetingFor(room, manager).chatMessages.some((m) => m.body === 'for nimal only')).toBe(true);
    expect(svc.viewMeetingFor(room, host).chatMessages.some((m) => m.body === 'for nimal only')).toBe(true);

    const guestView = svc.viewMeetingFor(room, { id: 'guest_abc' });
    expect(guestView.passcode).toBeNull();
    expect(guestView.hasPasscode).toBe(true);
    expect(svc.viewMeetingFor(room, host).passcode).toBe('4321');
  });

  it('does not let an attendee revive a meeting the host ended, but delivers the end signal', async () => {
    const svc = makeService();
    const mtg = await liveMeeting(svc);
    await svc.joinMeetingRoom(outsider, mtg.id, {});
    await svc.updateMeeting(mtg.id, { status: 'COMPLETED' }, 'org_test', host);

    const polled = await svc.pollMeetingSignals(outsider, mtg.id, 0);
    expect(polled.signals.some((s) => s.type === 'meeting-ended')).toBe(true);
    await expect(svc.joinMeetingRoom(outsider, mtg.id, {})).rejects.toThrow(/ended/);
    await expect(svc.updateParticipantState(outsider, mtg.id, { micOn: false })).rejects.toThrow(ForbiddenException);

    // An ended meeting is final, for the host too.
    await expect(svc.joinMeetingRoom(host, mtg.id, {})).rejects.toThrow(/ended/);
    await expect(svc.updateMeeting(mtg.id, { status: 'LIVE' }, 'org_test', host)).rejects.toThrow(/cannot be restarted/);
  });

  it('lets only a Super Admin delete meetings, and never a meeting people are in', async () => {
    const svc = makeService();
    const admin = user('usr_admin', Role.SUPER_ADMIN, 'Admin Director', 'YNX-DIR-0009');
    const live = await liveMeeting(svc);
    const ended = await liveMeeting(svc, { title: 'Old sync' });
    await svc.updateMeeting(ended.id, { status: 'COMPLETED' }, 'org_test', host);

    await expect(svc.deleteMeeting(host, ended.id)).rejects.toThrow(ForbiddenException);
    await expect(svc.deleteMeeting(manager, ended.id)).rejects.toThrow(ForbiddenException);
    await expect(svc.deleteMeeting(admin, live.id)).rejects.toThrow(/live right now/);

    await expect(svc.deleteMeeting(admin, ended.id)).resolves.toEqual({ deleted: 1 });
    const left = await svc.listMeetings('org_test');
    expect(left.map((m) => m.id)).toEqual([live.id]);

    await svc.updateMeeting(live.id, { status: 'CANCELLED' }, 'org_test', host);
    await expect(svc.deleteEndedMeetings(admin, {})).resolves.toEqual({ deleted: 1 });
    expect(await svc.listMeetings('org_test')).toEqual([]);
  });

  it('validates poll options and breakout rooms', async () => {
    const svc = makeService();
    const mtg = await liveMeeting(svc);
    await svc.joinMeetingRoom(twin, mtg.id, {});
    const withPoll = await svc.manageMeetingPoll(host, mtg.id, { action: 'create', question: 'Ship?', options: ['Yes', 'No'] });
    const pollId = withPoll.polls![0].id;
    await expect(svc.manageMeetingPoll(twin, mtg.id, { action: 'vote', pollId, optionIds: ['opt_999'] })).rejects.toThrow();
    await expect(svc.manageMeetingPoll(outsider, mtg.id, { action: 'vote', pollId, optionIds: ['opt_1'] })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(svc.manageBreakoutRooms(twin, mtg.id, { action: 'join-room', roomId: 'nope' })).rejects.toThrow();
  });

  it('rings the live doorbell for chat and signals, and only for members', async () => {
    const svc = makeService();
    const mtg = await liveMeeting(svc);
    await svc.joinMeetingRoom(twin, mtg.id, {});
    const events: string[] = [];
    const off = svc.onMeetingActivity(mtg.id, (kind) => events.push(kind));
    await svc.sendMeetingSignal(host, mtg.id, { type: 'offer', toUserId: twin.id, payload: {} });
    await svc.postMeetingChat(host, mtg.id, { body: 'hello' });
    await new Promise((r) => setTimeout(r, 200)); // room events are coalesced (80ms)
    off();
    expect(events).toContain('signal');
    expect(events).toContain('room');

    await expect(svc.requireMeetingStreamAccess(twin, mtg.id)).resolves.toBeUndefined();
    await expect(svc.requireMeetingStreamAccess(outsider, mtg.id)).rejects.toThrow(ForbiddenException);
  });

  it('shows room details and meeting chat only to people in the meeting', async () => {
    const svc = makeService();
    const mtg = await liveMeeting(svc);
    await svc.joinMeetingRoom(twin, mtg.id, {});
    await svc.postMeetingChat(host, mtg.id, { body: 'team only' });

    await expect(svc.getMeetingRoomFor(twin, mtg.id)).resolves.toMatchObject({ id: mtg.id });
    await expect(svc.getMeetingRoomFor(manager, mtg.id)).resolves.toMatchObject({ id: mtg.id }); // can control
    await expect(svc.getMeetingRoomFor(outsider, mtg.id)).rejects.toThrow(ForbiddenException);

    const outsiderList = await svc.listMeetings('org_test', outsider);
    const seen = outsiderList.find((m) => m.id === mtg.id);
    if (seen) expect(seen.chatMessages).toEqual([]);
    const memberList = await svc.listMeetings('org_test', twin);
    expect(memberList.find((m) => m.id === mtg.id)?.chatMessages.some((c) => c.body === 'team only')).toBe(true);

    // Past attendees still read the ended room (to see it ended); strangers still cannot.
    await svc.updateMeeting(mtg.id, { status: 'COMPLETED' }, 'org_test', host);
    await expect(svc.getMeetingRoomFor(twin, mtg.id)).resolves.toMatchObject({ status: 'COMPLETED' });
    await expect(svc.getMeetingRoomFor(outsider, mtg.id)).rejects.toThrow(ForbiddenException);
  });

  it('shows guests by the name they typed', async () => {
    const svc = makeService();
    const admin = user('usr_admin', Role.SUPER_ADMIN, 'Admin Director', 'YNX-DIR-0009');
    const mtg = await svc.scheduleMeeting(admin, { title: 'Client Demo', instant: true, allowExternalGuests: true });
    const joined = await svc.joinPublicMeetingAsGuest(mtg.roomCode, { fullName: 'Saman Client' });
    await svc.guestPostChat(joined.guestToken, mtg.id, { body: 'hello' });
    const room = await svc.getMeetingRoom(mtg.id, 'org_test');
    expect(room.chatMessages.at(-1)?.senderName).toBe('Saman Client (Guest)');
  });
});
