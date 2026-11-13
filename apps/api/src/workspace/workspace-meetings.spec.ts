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
});
