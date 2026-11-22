import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { AuthUser } from '../common/types';
import { WorkspaceService } from './workspace.service';

type MeetingLike = Parameters<WorkspaceService['viewMeetingFor']>[0];

function isMeeting(value: unknown): value is MeetingLike {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).roomCode === 'string' &&
    Array.isArray((value as Record<string, unknown>).participants)
  );
}

/**
 * Every meeting the API returns goes through WorkspaceService.viewMeetingFor, so private chat
 * messages and passcodes never leak to people who should not see them, whichever endpoint
 * (room, join, chat, host action, list, guest routes) produced the meeting.
 */
@Injectable()
export class MeetingViewInterceptor implements NestInterceptor {
  constructor(private readonly workspace: WorkspaceService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser; headers: Record<string, unknown> }>();
    let viewer: AuthUser | { id: string } | null = req.user ?? null;
    if (!viewer) {
      const token = req.headers?.['x-meeting-guest-token'];
      if (typeof token === 'string' && token) {
        try {
          viewer = { id: this.workspace.verifyGuestToken(token).guestId };
        } catch {
          viewer = null;
        }
      }
    }

    return next.handle().pipe(
      map((body: unknown) => {
        if (isMeeting(body)) return this.workspace.viewMeetingFor(body, viewer);
        if (Array.isArray(body) && body.length > 0 && body.every(isMeeting)) {
          return body.map((m) => this.workspace.viewMeetingFor(m, viewer));
        }
        if (body && typeof body === 'object' && isMeeting((body as Record<string, unknown>).room)) {
          // Guest join: { guestToken, guestUser, room }
          const b = body as { room: MeetingLike; guestUser?: { id?: string } };
          const guestViewer = viewer ?? (b.guestUser?.id ? { id: b.guestUser.id } : null);
          return { ...b, room: this.workspace.viewMeetingFor(b.room, guestViewer) };
        }
        return body;
      }),
    );
  }
}
