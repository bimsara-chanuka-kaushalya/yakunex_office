import { Role, UserStatus } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from './workspace.service';

function makeService(): WorkspaceService {
  const prismaStub = { isConnected: () => false } as unknown as PrismaService;
  const auditStub = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return new WorkspaceService(prismaStub, auditStub);
}

describe('WorkspaceService meetings signaling & ICE config', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns default STUN ICE servers when no TURN env vars are configured', async () => {
    delete process.env.TURN_URLS;
    delete process.env.WEBRTC_ICE_SERVERS_JSON;
    delete process.env.CLOUDFLARE_TURN_KEY_ID;
    delete process.env.METERED_DOMAIN;

    const svc = makeService();
    const cfg = await svc.getMeetingIceConfig();
    expect(cfg.hasTurn).toBe(false);
    expect(cfg.iceServers.length).toBeGreaterThanOrEqual(5);
    expect(cfg.iceCandidatePoolSize).toBe(4);
  });

  it('includes TURN relay servers when TURN_URLS and credentials are configured', async () => {
    process.env.TURN_URLS = 'turn:turn.example.com:3478,turns:turn.example.com:5349';
    process.env.TURN_USERNAME = 'alice';
    process.env.TURN_CREDENTIAL = 'secret-pass';

    const svc = makeService();
    const cfg = await svc.getMeetingIceConfig();
    expect(cfg.hasTurn).toBe(true);
    expect(cfg.iceServers).toContainEqual({
      urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'],
      username: 'alice',
      credential: 'secret-pass',
    });
  });

  it('emits a peer-joined signal with fresh joinedAt when joining or rejoining a room', async () => {
    const svc = makeService();
    const host: AuthUser = {
      id: 'usr_host',
      organizationId: 'org_test',
      companyId: 'YNX-0001',
      email: 'host@yakunex.local',
      fullName: 'Host User',
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    };
    const guest: AuthUser = {
      id: 'usr_guest',
      organizationId: 'org_test',
      companyId: 'YNX-0002',
      email: 'guest@yakunex.local',
      fullName: 'Guest User',
      role: Role.INTERN,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    };

    const room = await svc.scheduleMeeting(host, { title: 'Test Sync', isInstant: true });
    const joined = await svc.joinMeetingRoom(guest, room.id, { micOn: true, camOn: true });
    const guestParticipant = joined.participants.find((p) => p.userId === guest.id);
    expect(guestParticipant).toBeDefined();

    const polled = await svc.pollMeetingSignals(host, room.id, 0);
    const peerJoined = polled.signals.find((s) => s.type === 'peer-joined' && s.fromUserId === guest.id);
    expect(peerJoined).toBeDefined();
    expect((peerJoined?.payload as { joinedAt?: string })?.joinedAt).toBe(guestParticipant?.joinedAt);
  });

  it('supports 20 concurrent participants joining with video + mic and batched WebRTC signaling without drops', async () => {
    const svc = makeService();
    const host: AuthUser = {
      id: 'usr_1',
      organizationId: 'org_test',
      companyId: 'YNX-0001',
      email: 'user1@yakunex.local',
      fullName: 'Host One',
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    };
    const room = await svc.scheduleMeeting(host, { title: '20-Peer Sync', instant: true });

    const guests: AuthUser[] = Array.from({ length: 19 }, (_, idx) => {
      const n = idx + 2;
      return {
        id: `usr_${n}`,
        organizationId: 'org_test',
        companyId: `YNX-00${String(n).padStart(2, '0')}`,
        email: `user${n}@yakunex.local`,
        fullName: `Member ${n}`,
        role: Role.STAFF,
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
      };
    });

    await Promise.all(
      guests.map((g) => svc.joinMeetingRoom(g, room.id, { micOn: true, camOn: true })),
    );

    const updatedRoom = await svc.getMeetingRoom(room.id, host.organizationId);
    expect(updatedRoom.participants.length).toBe(20);
    expect(updatedRoom.participants.every((p) => p.micOn && p.camOn)).toBe(true);

    const batchResult = await svc.sendMeetingSignal(host, room.id, {
      batch: guests.map((g) => ({
        toUserId: g.id,
        type: 'offer',
        payload: { sdp: `v=0-offer-for-${g.id}` },
      })),
    });
    expect(batchResult.count).toBe(19);

    for (const g of guests) {
      const polled = await svc.pollMeetingSignals(g, room.id, 0);
      const offer = polled.signals.find((s) => s.type === 'offer' && s.fromUserId === host.id && s.toUserId === g.id);
      expect(offer).toBeDefined();
    }
  });

  it('supports 100+ concurrent participants with video + mic and issues LiveKit SFU tokens when configured', async () => {
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;

    const svc = makeService();
    const host: AuthUser = {
      id: 'usr_sfu_host',
      organizationId: 'org_test',
      companyId: 'YNX-0001',
      email: 'sfu1@yakunex.local',
      fullName: 'SFU Host',
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    };
    const room = await svc.scheduleMeeting(host, { title: '100-Peer Townhall', instant: true });

    const guests: AuthUser[] = Array.from({ length: 100 }, (_, idx) => {
      const n = idx + 2;
      return {
        id: `usr_sfu_${n}`,
        organizationId: 'org_test',
        companyId: `YNX-${String(n).padStart(4, '0')}`,
        email: `sfu${n}@yakunex.local`,
        fullName: `Guest ${n}`,
        role: Role.STAFF,
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
      };
    });

    await Promise.all(
      guests.map((g) => svc.joinMeetingRoom(g, room.id, { micOn: true, camOn: true })),
    );

    const updated = await svc.getMeetingRoom(room.id, host.organizationId);
    expect(updated.participants.length).toBe(101);
    expect(updated.participants.every((p) => p.micOn && p.camOn)).toBe(true);

    const fallbackSfu = await svc.getMeetingSfuToken(host, room.id);
    expect(fallbackSfu.enabled).toBe(false);
    expect(fallbackSfu.provider).toBe('mesh');

    process.env.LIVEKIT_URL = 'wss://yakunex-test.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'devkey_yakunex_12345';
    process.env.LIVEKIT_API_SECRET = 'secret_yakunex_very_long_test_key_67890';

    const activeSfu = await svc.getMeetingSfuToken(host, room.id);
    expect(activeSfu.enabled).toBe(true);
    expect(activeSfu.provider).toBe('livekit');
    expect(activeSfu.url).toBe('wss://yakunex-test.livekit.cloud');
    expect(typeof activeSfu.token).toBe('string');
    expect((activeSfu.token ?? '').split('.').length).toBe(3);
  });
});
