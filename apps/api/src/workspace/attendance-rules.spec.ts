import { Role, UserStatus } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import type { PrismaService } from '../prisma/prisma.service';
import { colomboClock, isWorkDay, normalizeRules, readZone } from './attendance-rules';
import { WorkspaceService } from './workspace.service';

describe('attendance rules (pure)', () => {
  it('reads Colombo local time', () => {
    expect(colomboClock(new Date('2026-11-23T03:00:00Z'))).toMatchObject({ date: '2026-11-23', time: '08:30', weekday: 1 });
    expect(colomboClock(new Date('2026-11-22T20:00:00Z')).date).toBe('2026-11-23'); // 01:30 next day
  });

  it('treats weekends and holidays as non-work days', () => {
    const r = normalizeRules({});
    expect(isWorkDay('2026-11-23', r, new Set())).toBe(true); // Monday
    expect(isWorkDay('2026-11-22', r, new Set())).toBe(false); // Sunday
    expect(isWorkDay('2026-11-24', r, new Set(['2026-11-24']))).toBe(false); // Poya
  });

  it('does not raise false alarms from GPS error near the edge', () => {
    expect(readZone(30, 10, 50)).toBe('INSIDE');
    expect(readZone(70, 25, 50)).toBe('INSIDE'); // could be inside given ±25 m
    expect(readZone(120, 20, 50)).toBe('OUTSIDE');
    expect(readZone(400, 300, 50)).toBe('UNCERTAIN'); // poor fix keeps the last state
  });

  it('cleans invalid settings back to safe defaults', () => {
    const r = normalizeRules({ radiusMeters: 5, lateAfter: '8.30', reminderTimes: ['08:30', 'x', '08:15'], roles: ['intern', 'SUPER_ADMIN'] });
    expect(r).toMatchObject({ radiusMeters: 20, lateAfter: '08:30', reminderTimes: ['08:15', '08:30'], roles: ['INTERN'] });
  });
});

describe('attendance rules (service)', () => {
  const OFFICE = { lat: 6.9271, lon: 79.8612 };
  // ~0.00045° latitude ≈ 50 m
  const at = (metersNorth: number) => ({ latitude: OFFICE.lat + metersNorth / 111_320, longitude: OFFICE.lon, accuracyMeters: 10 });
  const intern: AuthUser = {
    id: 'usr_int',
    organizationId: 'org_test',
    companyId: 'YNX-INT-1',
    email: 'intern@yakunex.local',
    fullName: 'Dilini Fernando',
    role: Role.INTERN,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
  };
  const staff: AuthUser = { ...intern, id: 'usr_stf', email: 'staff@yakunex.local', fullName: 'Kasun Silva', role: Role.STAFF };

  function makeService() {
    const prismaStub = { isConnected: () => false } as unknown as PrismaService;
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return new WorkspaceService(prismaStub, audit as unknown as AuditService);
  }

  afterEach(() => jest.useRealTimers());

  it('interns must clock in inside the 50 m zone with location on', () => {
    const svc = makeService();
    expect(() => svc.clockIn(intern, {})).toThrow(/LOCATION_REQUIRED/);
    expect(() => svc.clockIn(intern, at(200))).toThrow(/OUTSIDE_ZONE/);
    expect(svc.clockIn(intern, { ...at(10), workMode: 'REMOTE' }).workMode).toBe('OFFICE');
    // Other roles are not restricted.
    expect(svc.clockIn(staff, { workMode: 'REMOTE' }).workMode).toBe('REMOTE');
  });

  it('records a short leave when an intern starts after 08:30 on a work day', () => {
    jest.useFakeTimers({ now: new Date('2026-11-23T03:20:00Z') }); // Mon 08:50 Colombo
    const svc = makeService();
    const rec = svc.clockIn(intern, at(5));
    expect(rec.isLate).toBe(true);
    const leave = svc.listLeave().find((l) => l.id === rec.shortLeaveId);
    expect(leave).toMatchObject({ type: 'SHORT', status: 'APPROVED', days: 0, startDate: '2026-11-23' });
  });

  it('is not late at 08:20', () => {
    jest.useFakeTimers({ now: new Date('2026-11-23T02:50:00Z') }); // 08:20
    const svc = makeService();
    const rec = svc.clockIn(intern, at(5));
    expect(rec.isLate).toBe(false);
    expect(rec.shortLeaveId).toBeFalsy();
  });

  it('alerts on leaving, escalates after 5 minutes, and closes the exit on return', () => {
    jest.useFakeTimers({ now: new Date('2026-11-23T02:50:00Z') });
    const svc = makeService();
    svc.clockIn(intern, at(5));

    const left = svc.updateLiveLocation(intern, at(150));
    expect(left).toMatchObject({ zone: 'OUTSIDE', event: 'LEFT', unauthorized: false });

    jest.setSystemTime(new Date('2026-11-23T02:53:00Z')); // 3 min
    expect(svc.sweepAttendanceRules()).toBe(0);
    jest.setSystemTime(new Date('2026-11-23T02:55:30Z')); // 5.5 min
    svc.updateLiveLocation(intern, at(160)); // still outside (keeps tracking alive)
    expect(svc.sweepAttendanceRules()).toBe(1);

    const back = svc.updateLiveLocation(intern, at(10));
    expect(back).toMatchObject({ zone: 'INSIDE', event: 'RETURNED' });
    const rec = svc.listAttendance(intern).todayRecord!;
    expect(rec.geofenceBreaches).toHaveLength(1);
    expect(rec.geofenceBreaches![0]).toMatchObject({ unauthorized: true, minutesOutside: 6 });
  });

  it('does not count a walk outside during a break', () => {
    jest.useFakeTimers({ now: new Date('2026-11-23T02:50:00Z') });
    const svc = makeService();
    svc.clockIn(intern, at(5));
    svc.toggleBreak(intern);
    expect(svc.updateLiveLocation(intern, at(300)).event).toBeNull();
    jest.setSystemTime(new Date('2026-11-23T03:20:00Z'));
    expect(svc.sweepAttendanceRules()).toBe(0);
  });

  it('tells HR when tracking goes silent', () => {
    jest.useFakeTimers({ now: new Date('2026-11-23T02:50:00Z') });
    const svc = makeService();
    svc.clockIn(intern, at(5));
    jest.setSystemTime(new Date('2026-11-23T03:01:00Z')); // 11 min, no location
    expect(svc.sweepAttendanceRules()).toBe(1);
    expect(svc.sweepAttendanceRules()).toBe(0); // only once per silence
  });
});
