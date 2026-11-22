'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  CheckSquare,
  Clock,
  Copy,
  Download,
  Edit2,
  Hash,
  Lock,
  Megaphone,
  MessageSquarePlus,
  MessagesSquare,
  MoreHorizontal,
  Paperclip,
  Pin,
  Plus,
  Reply,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useAuth, useLang } from '@/components/providers';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, del, liveGet, patch, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ROLE_LABELS, type Role } from '@/lib/permissions';
import { useLiveSync } from '@/lib/use-live-sync';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatChannel {
  id: string;
  name: string;
  displayName?: string;
  type: 'PROJECT' | 'DEPARTMENT' | 'GROUP' | 'DIRECT' | 'MANAGEMENT' | 'ANNOUNCEMENT' | 'PRIVATE' | 'EXTERNAL';
  category?: string;
  privacy?: string;
  description: string;
  projectName: string | null;
  peerUserId?: string | null;
  peerAvatarUrl?: string | null;
  lastMessage?: { body: string; senderId: string; senderName: string; createdAt: string } | null;
  unreadCount?: number;
}

interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderAvatarUrl?: string | null;
  body: string;
  createdAt: string;
  replyToId?: string | null;
  replyPreview?: string | null;
  pinned?: boolean;
  editedAt?: string | null;
  deleted?: boolean;
  reactions?: Record<string, string[]>;
  linkedTaskId?: string | null;
  linkedMeetingCode?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  /** Client-only: optimistic message still being sent, or failed. */
  localState?: 'sending' | 'failed';
}

interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: string;
  title?: string;
  department?: string;
  avatarUrl?: string | null;
}

type ListFilter = 'ALL' | 'UNREAD' | 'DIRECT' | 'GROUPS';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '👀'];
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const GROUP_GAP_MS = 5 * 60_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TZ = 'Asia/Colombo';
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });

function dayLabel(iso: string): string {
  const key = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-LK', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TZ });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

/** WhatsApp-style list time: 14:05 today, "Yesterday", weekday this week, else a short date. */
function listTimeLabel(iso: string): string {
  const key = dayKey(iso);
  if (key === dayKey(new Date().toISOString())) return timeLabel(iso);
  if (key === dayKey(new Date(Date.now() - 86_400_000).toISOString())) return 'Yesterday';
  if (Date.now() - Date.parse(iso) < 6 * 86_400_000) {
    return new Date(iso).toLocaleDateString('en-LK', { weekday: 'short', timeZone: TZ });
  }
  return new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', timeZone: TZ });
}

function channelTitle(ch?: ChatChannel | null): string {
  if (!ch) return '';
  return ch.displayName || ch.name;
}

function isGroupish(ch: ChatChannel) {
  return ch.type !== 'DIRECT';
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/** Renders text with clickable links (no HTML injection: plain text nodes + anchors only). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all underline decoration-1 underline-offset-2 hover:opacity-80">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function ChannelIcon({ ch, size = 'md' }: { ch: ChatChannel; size?: 'sm' | 'md' }) {
  if (ch.type === 'DIRECT') {
    return <Avatar src={ch.peerAvatarUrl ?? undefined} name={channelTitle(ch)} size={size} />;
  }
  const Icon = ch.privacy === 'CONFIDENTIAL' ? Lock : ch.type === 'ANNOUNCEMENT' ? Megaphone : ch.type === 'GROUP' ? Users : Hash;
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-strong dark:text-gold',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatView() {
  const { user } = useAuth();
  const { lang } = useLang();
  const toast = useToast();

  const [channels, setChannels] = useState<ChatChannel[] | null>(null);
  // `/chat?channel=<id>` (e.g. from My Day "Ask mentor") opens that conversation directly.
  const [activeId, setActiveId] = useState<string>(
    () => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('channel')) || '',
  );
  // On phones the list and the conversation are separate screens.
  const [mobileShowConversation, setMobileShowConversation] = useState(
    () => typeof window !== 'undefined' && Boolean(new URLSearchParams(window.location.search).get('channel')),
  );
  const [serverMessages, setServerMessages] = useState<ChatMessage[] | null>(null);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);

  const [listSearch, setListSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('ALL');
  const [searchOpen, setSearchOpen] = useState(false);
  const [msgSearch, setMsgSearch] = useState('');

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null);
  const [unreadMarker, setUnreadMarker] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(0);

  const [groupModal, setGroupModal] = useState(false);
  const [dmModal, setDmModal] = useState(false);
  const [dmSearch, setDmSearch] = useState('');
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    type: 'GROUP' as ChatChannel['type'],
    category: 'TECHNICAL',
    privacy: 'PUBLIC' as 'PUBLIC' | 'ROLE_RESTRICTED' | 'CONFIDENTIAL',
    memberIds: [] as string[],
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const atBottomRef = useRef(true);
  const lastCountRef = useRef(0);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // ── Data ────────────────────────────────────────────────────────────────────
  const loadChannels = useCallback(async () => {
    try {
      const list = await liveGet<ChatChannel[]>('/chat/channels');
      const safe = Array.isArray(list) ? list : [];
      setChannels(safe);
      setActiveId((prev) => (prev && safe.some((c) => c.id === prev) ? prev : safe[0]?.id ?? ''));
    } catch {
      setChannels((prev) => prev ?? []);
    }
  }, []);

  const loadMessages = useCallback(async (channelId: string) => {
    if (!channelId) return;
    try {
      const msgs = await liveGet<ChatMessage[]>(`/chat/channels/${channelId}/messages`);
      // Ignore answers for a channel the user already left.
      if (activeIdRef.current === channelId) setServerMessages(Array.isArray(msgs) ? msgs : []);
    } catch {
      if (activeIdRef.current === channelId) setServerMessages((prev) => prev ?? []);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadChannels(), loadMessages(activeIdRef.current)]);
  }, [loadChannels, loadMessages]);

  // Other people's messages, reactions and edits arrive through the shared live sync.
  useLiveSync(refresh);

  useEffect(() => {
    void loadChannels();
    api<{ employees?: Array<{ id: string; fullName?: string; name?: string; email: string; role: string; title?: string | null; avatarUrl?: string | null; department?: { name: string } | string | null }> }>(
      '/organization',
    )
      .then((res) => {
        const raw = Array.isArray(res?.employees) ? res.employees : [];
        setMembers(
          raw.map((u) => ({
            id: u.id,
            name: u.fullName || u.name || u.email,
            email: u.email,
            role: u.role,
            title: u.title ?? undefined,
            avatarUrl: u.avatarUrl ?? null,
            department: typeof u.department === 'object' && u.department ? u.department.name : (u.department ?? undefined) || undefined,
          })),
        );
      })
      .catch(() => setMembers([]));
  }, [loadChannels]);

  const activeChannel = useMemo(() => channels?.find((c) => c.id === activeId) ?? null, [channels, activeId]);

  // Switching conversation: reset per-conversation state and remember where "new" starts.
  useEffect(() => {
    if (!activeId) return;
    setServerMessages(null);
    setPending([]);
    setReplyTo(null);
    setEditing(null);
    setMenuFor(null);
    setNewBelow(0);
    setSearchOpen(false);
    setMsgSearch('');
    atBottomRef.current = true;
    lastCountRef.current = 0;
    void loadMessages(activeId);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('channel', activeId);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* ignore */
    }
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (!activeChannel) return;
    const unread = activeChannel.unreadCount ?? 0;
    setUnreadMarker(unread > 0 ? `${activeChannel.id}:${unread}` : null);
    // Only when the conversation opens — not on every live refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel?.id]);

  const messages = useMemo(() => {
    const base = serverMessages ?? [];
    const known = new Set(base.map((m) => m.id));
    return [...base, ...pending.filter((p) => !known.has(p.id))];
  }, [serverMessages, pending]);

  // Mark read while the conversation is on screen and something new arrived.
  useEffect(() => {
    if (!activeChannel || !serverMessages) return;
    if ((activeChannel.unreadCount ?? 0) === 0) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const id = activeChannel.id;
    setChannels((prev) => prev?.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)) ?? prev);
    void post(`/chat/channels/${id}/read`, {}).catch(() => undefined);
  }, [activeChannel, serverMessages]);

  // ── Scrolling ───────────────────────────────────────────────────────────────
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottomRef.current = true;
    setNewBelow(0);
  }, []);

  useLayoutEffect(() => {
    const count = messages.length;
    const prev = lastCountRef.current;
    lastCountRef.current = count;
    if (count === 0) return;
    if (prev === 0) {
      // First paint of a conversation: jump to the first unread message, else to the bottom.
      const marker = scrollRef.current?.querySelector('[data-unread-marker]');
      if (marker instanceof HTMLElement) {
        marker.scrollIntoView({ block: 'center' });
        atBottomRef.current = false;
      } else {
        scrollToBottom();
      }
      return;
    }
    if (count > prev) {
      const last = messages[messages.length - 1];
      if (atBottomRef.current || last?.senderId === user?.id) scrollToBottom(true);
      else setNewBelow((n) => n + (count - prev));
    }
  }, [messages, scrollToBottom, user?.id]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = near;
    if (near) setNewBelow(0);
  };

  const jumpTo = (id: string) => {
    const el = scrollRef.current?.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-gold');
      setTimeout(() => el.classList.remove('ring-2', 'ring-gold'), 1400);
    }
  };

  // ── Composer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  function readFile(file: File) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error('Attachments must be under 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setAttachment({ name: file.name || 'image.png', dataUrl: reader.result });
    };
    reader.readAsDataURL(file);
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(e.clipboardData.files ?? [])[0];
    if (file && file.type.startsWith('image/')) {
      e.preventDefault();
      readFile(file);
    }
  }

  async function sendMessage(payload: { body: string; replyTo: ChatMessage | null; attachment: typeof attachment }, retryId?: string) {
    if (!activeChannel || !user) return;
    const channelId = activeChannel.id;
    const tempId = retryId ?? `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: ChatMessage = {
      id: tempId,
      channelId,
      senderId: user.id,
      senderName: user.fullName,
      senderRole: user.role,
      senderAvatarUrl: user.avatarUrl ?? null,
      body: payload.body,
      createdAt: new Date().toISOString(),
      replyToId: payload.replyTo?.id ?? null,
      replyPreview: payload.replyTo ? `${payload.replyTo.senderName}: ${payload.replyTo.body.slice(0, 60)}` : null,
      attachmentUrl: payload.attachment?.dataUrl ?? null,
      attachmentName: payload.attachment?.name ?? null,
      localState: 'sending',
    };
    setPending((prev) => [...prev.filter((m) => m.id !== tempId), optimistic]);
    try {
      const saved = await post<ChatMessage>(`/chat/channels/${channelId}/messages`, {
        body: payload.body || `Attachment: ${payload.attachment?.name ?? 'File'}`,
        replyToId: payload.replyTo?.id,
        attachmentUrl: payload.attachment?.dataUrl,
        attachmentName: payload.attachment?.name,
      });
      if (activeIdRef.current === channelId) {
        // Swap the optimistic bubble for the stored message in place (no flicker, no duplicate).
        setServerMessages((prev) => (prev && !prev.some((m) => m.id === saved.id) ? [...prev, saved] : prev));
      }
      setPending((prev) => prev.filter((m) => m.id !== tempId));
    } catch (err) {
      setPending((prev) => prev.map((m) => (m.id === tempId ? { ...m, localState: 'failed' } : m)));
      toast.error(err instanceof Error ? err.message : 'Message not sent.');
    }
  }

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (editing) {
      if (!body) return;
      const target = editing;
      setEditing(null);
      setText('');
      setServerMessages((prev) => prev?.map((m) => (m.id === target.id ? { ...m, body, editedAt: new Date().toISOString() } : m)) ?? prev);
      try {
        await patch(`/chat/messages/${target.id}`, { body });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to edit message.');
        void loadMessages(activeId);
      }
      return;
    }
    if (!body && !attachment) return;
    const payload = { body, replyTo, attachment };
    setText('');
    setReplyTo(null);
    setAttachment(null);
    composerRef.current?.focus();
    await sendMessage(payload);
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void onSubmit();
    } else if (e.key === 'Escape') {
      setReplyTo(null);
      if (editing) {
        setEditing(null);
        setText('');
      }
    } else if (e.key === 'ArrowUp' && !text && !editing) {
      // Up arrow on an empty composer edits your last message, like Slack.
      const mine = [...(serverMessages ?? [])].reverse().find((m) => m.senderId === user?.id && !m.deleted);
      if (mine) {
        e.preventDefault();
        startEdit(mine);
      }
    }
  }

  function startEdit(m: ChatMessage) {
    setReplyTo(null);
    setEditing(m);
    setText(m.body);
    setMenuFor(null);
    setTimeout(() => composerRef.current?.focus(), 0);
  }

  function startReply(m: ChatMessage) {
    setEditing(null);
    setReplyTo(m);
    setMenuFor(null);
    composerRef.current?.focus();
  }

  // ── Message actions (optimistic) ────────────────────────────────────────────
  async function onReact(m: ChatMessage, emoji: string) {
    setMenuFor(null);
    if (!user) return;
    setServerMessages((prev) =>
      prev?.map((x) => {
        if (x.id !== m.id) return x;
        const reactions = { ...(x.reactions ?? {}) };
        const users = new Set(reactions[emoji] ?? []);
        if (users.has(user.id)) users.delete(user.id);
        else users.add(user.id);
        reactions[emoji] = Array.from(users);
        return { ...x, reactions };
      }) ?? prev,
    );
    try {
      await post(`/chat/messages/${m.id}/react`, { emoji });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to react.');
      void loadMessages(activeId);
    }
  }

  async function onTogglePin(m: ChatMessage) {
    setMenuFor(null);
    setServerMessages((prev) => prev?.map((x) => (x.id === m.id ? { ...x, pinned: !x.pinned } : x)) ?? prev);
    try {
      await patch(`/chat/messages/${m.id}/pin`, {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to pin.');
      void loadMessages(activeId);
    }
  }

  async function onToTask(m: ChatMessage) {
    setMenuFor(null);
    try {
      await post(`/chat/messages/${m.id}/to-task`, {});
      toast.success('Task created from this message.');
      void loadMessages(activeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to create a task.');
    }
  }

  async function onDelete(m: ChatMessage) {
    setConfirmDelete(null);
    setServerMessages((prev) => prev?.filter((x) => x.id !== m.id) ?? prev);
    try {
      await del(`/chat/messages/${m.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete.');
      void loadMessages(activeId);
    }
  }

  async function onCopy(m: ChatMessage) {
    setMenuFor(null);
    await navigator.clipboard?.writeText(m.body).catch(() => undefined);
    toast.success('Copied');
  }

  async function onStartMeeting() {
    if (!activeChannel) return;
    try {
      const mt = await post<{ roomCode: string }>(`/chat/channels/${activeChannel.id}/meeting`, {
        title: `${channelTitle(activeChannel)} Sync`,
        agenda: `Huddle for ${channelTitle(activeChannel)}`,
      });
      window.open(`/meet?room=${encodeURIComponent(mt.roomCode)}`, '_blank', 'noopener');
      void loadMessages(activeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to start a meeting.');
    }
  }

  async function onStartDm(m: OrgMember) {
    try {
      const ch = await post<ChatChannel>('/chat/direct', { targetUserId: m.id, targetUserName: m.name });
      setDmModal(false);
      setDmSearch('');
      await loadChannels();
      openChannel(ch.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to start a chat.');
    }
  }

  async function onCreateGroup(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await post<ChatChannel>('/chat/channels', groupForm);
      setGroupModal(false);
      setGroupForm({ name: '', description: '', type: 'GROUP', category: 'TECHNICAL', privacy: 'PUBLIC', memberIds: [] });
      toast.success(`Group "${created.name}" created.`);
      await loadChannels();
      openChannel(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to create the group.');
    }
  }

  function openChannel(id: string) {
    setActiveId(id);
    setMobileShowConversation(true);
  }

  // ── Derived lists ───────────────────────────────────────────────────────────
  const listItems = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return [...(channels ?? [])]
      .filter((c) => {
        if (listFilter === 'UNREAD' && !(c.unreadCount ?? 0)) return false;
        if (listFilter === 'DIRECT' && c.type !== 'DIRECT') return false;
        if (listFilter === 'GROUPS' && !isGroupish(c)) return false;
        if (!q) return true;
        return `${channelTitle(c)} ${c.description} ${c.lastMessage?.body ?? ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const ta = a.lastMessage?.createdAt ?? '';
        const tb = b.lastMessage?.createdAt ?? '';
        if (ta !== tb) return tb.localeCompare(ta);
        return channelTitle(a).localeCompare(channelTitle(b));
      });
  }, [channels, listSearch, listFilter]);

  const totalUnread = (channels ?? []).reduce((n, c) => n + (c.unreadCount ?? 0), 0);
  const pinned = messages.filter((m) => m.pinned && !m.deleted);
  const shown = useMemo(() => {
    const q = msgSearch.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => `${m.body} ${m.senderName}`.toLowerCase().includes(q));
  }, [messages, msgSearch]);

  const unreadCountAtOpen = unreadMarker ? Number(unreadMarker.split(':')[1]) : 0;
  const firstUnreadId = useMemo(() => {
    if (!unreadCountAtOpen || !serverMessages) return null;
    const others = serverMessages.filter((m) => m.senderId !== user?.id);
    return others[Math.max(0, others.length - unreadCountAtOpen)]?.id ?? null;
  }, [serverMessages, unreadCountAtOpen, user?.id]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const filters: Array<{ key: ListFilter; label: string }> = [
    { key: 'ALL', label: 'All' },
    { key: 'UNREAD', label: totalUnread ? `Unread · ${totalUnread}` : 'Unread' },
    { key: 'DIRECT', label: 'People' },
    { key: 'GROUPS', label: 'Groups' },
  ];

  return (
    <div className="-mx-1 sm:mx-0">
      <div className="grid h-[calc(100dvh-8.5rem)] min-h-[520px] overflow-hidden rounded-[20px] bg-surface shadow-card md:grid-cols-[340px_1fr]">
        {/* ── Conversation list ───────────────────────────────────────────── */}
        <aside className={cn('min-h-0 flex-col border-line/70 md:flex md:border-r', mobileShowConversation ? 'hidden' : 'flex')}>
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h2 className="font-display text-[22px] font-bold tracking-tight text-ink">Chats</h2>
            <div className="flex items-center gap-1.5">
              <IconButton title="New chat with a person" onClick={() => setDmModal(true)}>
                <MessageSquarePlus className="h-4 w-4" />
              </IconButton>
              <button
                type="button"
                onClick={() => setGroupModal(true)}
                title="New group"
                aria-label="New group"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-gold-ink shadow-2xs transition hover:brightness-105 active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2 px-3 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                placeholder="Search chats and messages"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                className="h-9 w-full rounded-full bg-ink/[0.06] pl-8 pr-3 text-[13px] text-ink placeholder:text-muted/80 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-gold/30 dark:bg-white/[0.08]"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setListFilter(f.key)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition',
                    listFilter === f.key ? 'bg-gold/20 text-gold-strong dark:text-gold' : 'bg-ink/[0.05] text-muted hover:text-ink dark:bg-white/[0.06]',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
            {channels === null &&
              Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 px-2.5 py-2.5">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </li>
              ))}
            {channels !== null && listItems.length === 0 && (
              <li className="px-4 py-10 text-center text-[13px] text-muted">
                {listFilter === 'UNREAD' ? 'You are all caught up.' : 'No chats match.'}
              </li>
            )}
            {listItems.map((ch) => {
              const active = ch.id === activeId;
              const unread = ch.unreadCount ?? 0;
              const last = ch.lastMessage;
              const who = last ? (last.senderId === user?.id ? 'You' : ch.type === 'DIRECT' ? '' : last.senderName.split(' · ')[0].split(' ')[0]) : '';
              return (
                <li key={ch.id}>
                  <button
                    type="button"
                    onClick={() => openChannel(ch.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-left transition-colors',
                      active ? 'bg-gold/15 dark:bg-gold/20' : 'hover:bg-ink/[0.04] dark:hover:bg-white/[0.05]',
                    )}
                  >
                    <ChannelIcon ch={ch} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate text-[14px] text-ink', unread ? 'font-bold' : 'font-semibold')}>
                          {channelTitle(ch)}
                        </span>
                        {last && (
                          <span className={cn('shrink-0 text-[11px]', unread ? 'font-semibold text-gold-strong dark:text-gold' : 'text-muted')}>
                            {listTimeLabel(last.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('truncate text-[12.5px]', unread ? 'text-ink' : 'text-muted')}>
                          {last ? (
                            <>
                              {who && <span className="font-medium">{who}: </span>}
                              {last.body}
                            </>
                          ) : (
                            <span className="italic">{ch.description || 'No messages yet'}</span>
                          )}
                        </p>
                        {unread > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gold px-1.5 text-[11px] font-bold tabular-nums text-gold-ink">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── Conversation ────────────────────────────────────────────────── */}
        <section className={cn('min-h-0 flex-col bg-[#f4f1ec] dark:bg-[#0d1418] md:flex', mobileShowConversation ? 'flex' : 'hidden')}>
          {!activeChannel ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <MessagesSquare className="mb-3 h-10 w-10 text-gold" />
              <p className="text-[15px] font-semibold text-ink">Pick a chat to start</p>
              <p className="mt-1 max-w-xs text-[13px] text-muted">Message a colleague, a team or a project group.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <header className="material flex items-center gap-2 border-b border-line/70 px-2 py-2 sm:px-4">
                <button
                  type="button"
                  onClick={() => setMobileShowConversation(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-ink/[0.06] md:hidden"
                  aria-label="Back to chats"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <ChannelIcon ch={activeChannel} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-[15px] font-semibold text-ink">{channelTitle(activeChannel)}</h3>
                    {activeChannel.privacy === 'CONFIDENTIAL' && <Lock className="h-3.5 w-3.5 shrink-0 text-gold" />}
                  </div>
                  <p className="truncate text-[12px] text-muted">
                    {activeChannel.type === 'DIRECT' ? 'Direct message' : activeChannel.description}
                  </p>
                </div>
                <IconButton title="Search in this chat" onClick={() => setSearchOpen((v) => !v)} active={searchOpen}>
                  <Search className="h-4 w-4" />
                </IconButton>
                {user?.role !== 'INTERN' && (
                  <IconButton title="Start a video meeting here" onClick={onStartMeeting}>
                    <Video className="h-4 w-4" />
                  </IconButton>
                )}
              </header>

              {searchOpen && (
                <div className="material flex items-center gap-2 border-b border-line/60 px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-muted" />
                  <input
                    autoFocus
                    type="search"
                    value={msgSearch}
                    onChange={(e) => setMsgSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && (setSearchOpen(false), setMsgSearch(''))}
                    placeholder="Search messages"
                    className="h-8 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted/80"
                  />
                  {msgSearch && <span className="text-[12px] text-muted">{shown.length} found</span>}
                </div>
              )}

              {pinned.length > 0 && !msgSearch && (
                <button
                  type="button"
                  onClick={() => jumpTo(pinned[pinned.length - 1].id)}
                  className="material flex items-center gap-2 border-b border-line/60 px-4 py-2 text-left text-[12.5px] hover:bg-ink/[0.03]"
                >
                  <Pin className="h-3.5 w-3.5 shrink-0 text-gold" />
                  <span className="shrink-0 font-semibold text-ink">Pinned{pinned.length > 1 ? ` (${pinned.length})` : ''}</span>
                  <span className="truncate text-muted">{pinned[pinned.length - 1].body}</span>
                </button>
              )}

              {/* Messages */}
              <div className="relative min-h-0 flex-1">
                <div
                  ref={scrollRef}
                  onScroll={onScroll}
                  onClick={() => setMenuFor(null)}
                  className="h-full overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
                  aria-live="polite"
                >
                  {serverMessages === null ? (
                    <div className="space-y-3">
                      {[60, 40, 70, 30].map((w, i) => (
                        <div key={i} className={cn('flex', i % 2 ? 'justify-end' : 'justify-start')}>
                          <div style={{ width: `${w}%` }}>
                            <Skeleton className="h-10 rounded-2xl" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : shown.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <div className="rounded-2xl bg-surface/90 px-6 py-5 shadow-card">
                        <MessagesSquare className="mx-auto mb-2 h-7 w-7 text-gold" />
                        <p className="text-[14px] font-semibold text-ink">{msgSearch ? 'No messages match' : 'No messages yet'}</p>
                        <p className="mt-1 text-[12.5px] text-muted">{msgSearch ? 'Try another word.' : 'Say hello 👋'}</p>
                      </div>
                    </div>
                  ) : (
                    shown.map((m, i) => {
                      const prev = shown[i - 1];
                      const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                      const grouped =
                        !newDay && prev && prev.senderId === m.senderId && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_GAP_MS;
                      return (
                        <Fragment key={m.id}>
                          {newDay && (
                            <div className="sticky top-0 z-[1] my-3 flex justify-center">
                              <span className="rounded-full bg-surface/95 px-3 py-1 text-[11.5px] font-medium text-muted shadow-2xs backdrop-blur">
                                {dayLabel(m.createdAt)}
                              </span>
                            </div>
                          )}
                          {m.id === firstUnreadId && !msgSearch && (
                            <div data-unread-marker className="my-3 flex items-center gap-3">
                              <span className="h-px flex-1 bg-gold/40" />
                              <span className="text-[11.5px] font-semibold text-gold-strong dark:text-gold">{unreadCountAtOpen} unread</span>
                              <span className="h-px flex-1 bg-gold/40" />
                            </div>
                          )}
                          <MessageBubble
                            m={m}
                            own={m.senderId === user?.id}
                            grouped={Boolean(grouped)}
                            isGroupChat={activeChannel.type !== 'DIRECT'}
                            roleLabel={ROLE_LABELS[m.senderRole as Role]?.[lang] ?? m.senderRole}
                            myId={user?.id ?? ''}
                            menuOpen={menuFor === m.id}
                            onMenu={(open) => setMenuFor(open ? m.id : null)}
                            onReact={(emoji) => onReact(m, emoji)}
                            onReply={() => startReply(m)}
                            onEdit={() => startEdit(m)}
                            onPin={() => onTogglePin(m)}
                            onTask={() => onToTask(m)}
                            onCopy={() => onCopy(m)}
                            onDelete={() => {
                              setMenuFor(null);
                              setConfirmDelete(m);
                            }}
                            onJumpToReply={() => m.replyToId && jumpTo(m.replyToId)}
                            onRetry={() =>
                              sendMessage(
                                { body: m.body, replyTo: null, attachment: m.attachmentUrl ? { name: m.attachmentName ?? 'file', dataUrl: m.attachmentUrl } : null },
                                m.id,
                              )
                            }
                            onDiscard={() => setPending((p) => p.filter((x) => x.id !== m.id))}
                          />
                        </Fragment>
                      );
                    })
                  )}
                </div>
                {newBelow > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToBottom(true)}
                    className="absolute bottom-3 right-4 flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-[12px] font-semibold text-gold-ink shadow-card"
                  >
                    <ArrowDown className="h-3.5 w-3.5" /> {newBelow} new
                  </button>
                )}
              </div>

              {/* Reply / edit / attachment strip */}
              {(replyTo || editing || attachment) && (
                <div className="material flex items-center gap-3 border-t border-line/60 px-4 py-2 text-[12.5px]">
                  <span className="h-8 w-1 shrink-0 rounded-full bg-gold" />
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <>
                        <p className="font-semibold text-gold-strong dark:text-gold">Editing message</p>
                        <p className="truncate text-muted">{editing.body}</p>
                      </>
                    ) : replyTo ? (
                      <>
                        <p className="font-semibold text-gold-strong dark:text-gold">Replying to {replyTo.senderId === user?.id ? 'yourself' : replyTo.senderName.split(' · ')[0]}</p>
                        <p className="truncate text-muted">{replyTo.body}</p>
                      </>
                    ) : null}
                    {attachment && (
                      <p className="flex items-center gap-1.5 truncate text-ink">
                        <Paperclip className="h-3.5 w-3.5 text-gold" /> {attachment.name}
                      </p>
                    )}
                  </div>
                  {attachment?.dataUrl.startsWith('data:image/') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachment.dataUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  )}
                  <button
                    type="button"
                    aria-label="Cancel"
                    onClick={() => {
                      if (editing) setText('');
                      setEditing(null);
                      setReplyTo(null);
                      setAttachment(null);
                    }}
                    className="rounded-full p-1 text-muted hover:bg-ink/[0.06] hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Composer */}
              <form onSubmit={onSubmit} className="material flex items-end gap-2 border-t border-line/70 px-2 py-2 sm:px-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) readFile(f);
                  }}
                />
                <IconButton title="Attach a file or photo" onClick={() => fileRef.current?.click()} disabled={Boolean(editing)}>
                  <Paperclip className="h-4 w-4" />
                </IconButton>
                <textarea
                  ref={composerRef}
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onComposerKey}
                  onPaste={onPaste}
                  placeholder={editing ? 'Edit your message' : `Message ${channelTitle(activeChannel)}`}
                  aria-label="Message"
                  className="max-h-40 min-h-[40px] flex-1 resize-none rounded-[20px] bg-surface px-4 py-2.5 text-[14px] leading-5 text-ink shadow-2xs ring-1 ring-line/60 placeholder:text-muted/80 focus:outline-none focus:ring-2 focus:ring-gold/50 dark:bg-raised"
                />
                <button
                  type="submit"
                  aria-label={editing ? 'Save edit' : 'Send'}
                  disabled={!text.trim() && !attachment}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-gold-ink shadow-xs transition active:scale-95 disabled:opacity-40"
                >
                  {editing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
              <p className="hidden bg-transparent px-4 pb-1 text-[10.5px] text-muted/80 sm:block">
                Enter to send · Shift+Enter for a new line · ↑ to edit your last message · paste an image to attach it
              </p>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this message?"
        description="It will be removed for everyone in this chat."
        confirmLabel="Delete"
        tone="danger"
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => (confirmDelete ? onDelete(confirmDelete) : undefined)}
      />

      <Modal open={dmModal} title="New chat" onClose={() => setDmModal(false)}>
        <div className="space-y-3">
          <Input autoFocus placeholder="Search by name, title or department" value={dmSearch} onChange={(e) => setDmSearch(e.target.value)} />
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {members
              .filter((m) => m.id !== user?.id && `${m.name} ${m.title ?? ''} ${m.department ?? ''} ${m.role}`.toLowerCase().includes(dmSearch.toLowerCase()))
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onStartDm(m)}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-ink/[0.05]"
                >
                  <Avatar src={m.avatarUrl ?? undefined} name={m.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{m.name}</p>
                    <p className="truncate text-[12px] text-muted">{[m.title, m.department].filter(Boolean).join(' · ') || m.role}</p>
                  </div>
                </button>
              ))}
          </div>
        </div>
      </Modal>

      <Modal open={groupModal} title="New group" onClose={() => setGroupModal(false)}>
        <form onSubmit={onCreateGroup} className="space-y-4">
          <Field label="Name" htmlFor="grp-name">
            <Input id="grp-name" required value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. lankamed-portal" />
          </Field>
          <Field label="What is it for?" htmlFor="grp-desc">
            <Input id="grp-desc" required value={groupForm.description} onChange={(e) => setGroupForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Type" htmlFor="grp-type">
              <Select id="grp-type" value={groupForm.type} onChange={(e) => setGroupForm((f) => ({ ...f, type: e.target.value as ChatChannel['type'] }))}>
                <option value="GROUP">Team group</option>
                <option value="PROJECT">Project</option>
                <option value="DEPARTMENT">Department</option>
                <option value="MANAGEMENT">Management</option>
                <option value="ANNOUNCEMENT">Announcements</option>
              </Select>
            </Field>
            <Field label="Category" htmlFor="grp-cat">
              <Select id="grp-cat" value={groupForm.category} onChange={(e) => setGroupForm((f) => ({ ...f, category: e.target.value }))}>
                <option value="ANNOUNCEMENTS">Announcements</option>
                <option value="MANAGEMENT">Management</option>
                <option value="DEPARTMENT">Departments</option>
                <option value="TECHNICAL">Technical &amp; projects</option>
                <option value="CONFIDENTIAL">Private &amp; confidential</option>
              </Select>
            </Field>
            <Field label="Who can see it" htmlFor="grp-priv">
              <Select id="grp-priv" value={groupForm.privacy} onChange={(e) => setGroupForm((f) => ({ ...f, privacy: e.target.value as typeof f.privacy }))}>
                <option value="PUBLIC">Everyone</option>
                <option value="ROLE_RESTRICTED">Members &amp; roles</option>
                <option value="CONFIDENTIAL">Invite only</option>
              </Select>
            </Field>
          </div>
          {members.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-muted">Members ({groupForm.memberIds.length} selected)</p>
              <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-line p-1.5">
                {members
                  .filter((m) => m.id !== user?.id)
                  .map((m) => {
                    const on = groupForm.memberIds.includes(m.id);
                    return (
                      <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-ink/[0.04]">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setGroupForm((f) => ({ ...f, memberIds: on ? f.memberIds.filter((x) => x !== m.id) : [...f.memberIds, m.id] }))
                          }
                        />
                        <Avatar src={m.avatarUrl ?? undefined} name={m.name} size="xs" />
                        <span className="flex-1 truncate text-ink">{m.name}</span>
                        <span className="truncate text-[11.5px] text-muted">{m.title ?? m.role}</span>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setGroupModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Create group</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function IconButton({
  title,
  onClick,
  children,
  active,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-ink/[0.06] hover:text-ink disabled:opacity-40 dark:hover:bg-white/[0.08]',
        active && 'bg-gold/15 text-gold-strong dark:text-gold',
      )}
    >
      {children}
    </button>
  );
}

function MessageBubble({
  m,
  own,
  grouped,
  isGroupChat,
  roleLabel,
  myId,
  menuOpen,
  onMenu,
  onReact,
  onReply,
  onEdit,
  onPin,
  onTask,
  onCopy,
  onDelete,
  onJumpToReply,
  onRetry,
  onDiscard,
}: {
  m: ChatMessage;
  own: boolean;
  grouped: boolean;
  isGroupChat: boolean;
  roleLabel: string;
  myId: string;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onPin: () => void;
  onTask: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onJumpToReply: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const local = Boolean(m.localState);
  // Open the menu downwards when the message is near the top of the visible area.
  const [openDown, setOpenDown] = useState(false);
  const showName = !own && isGroupChat && !grouped;
  const reactions = Object.entries(m.reactions ?? {}).filter(([, users]) => Array.isArray(users) && users.length > 0);
  const isImage = Boolean(m.attachmentUrl?.startsWith('data:image/'));
  const autoBody = m.attachmentName && m.body === `Attachment: ${m.attachmentName}`;

  return (
    <div
      data-msg-id={m.id}
      className={cn('group flex items-end gap-2 rounded-2xl transition-shadow', own ? 'justify-end' : 'justify-start', grouped ? 'mt-0.5' : 'mt-3')}
    >
      {!own && isGroupChat && (
        <div className="w-8 shrink-0">
          {!grouped && <Avatar src={m.senderAvatarUrl ?? undefined} name={m.senderName} size="sm" />}
        </div>
      )}

      <div className={cn('relative flex max-w-[85%] flex-col sm:max-w-[68%]', own ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'relative rounded-[18px] px-3 py-1.5 shadow-2xs',
            own ? 'bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]' : 'bg-surface text-ink',
            own ? (grouped ? 'rounded-tr-[18px]' : 'rounded-tr-[6px]') : grouped ? 'rounded-tl-[18px]' : 'rounded-tl-[6px]',
            m.localState === 'failed' && 'ring-1 ring-danger',
          )}
        >
          {showName && (
            <p className="mb-0.5 text-[12px] font-semibold text-gold-strong dark:text-gold">
              {m.senderName.split(' · ')[0]} <span className="font-normal text-muted">· {roleLabel}</span>
            </p>
          )}

          {m.replyPreview && (
            <button
              type="button"
              onClick={onJumpToReply}
              className="mb-1 block w-full rounded-lg border-l-[3px] border-gold bg-black/[0.05] px-2 py-1 text-left text-[12px] opacity-90 hover:bg-black/[0.08] dark:bg-white/[0.08]"
            >
              <span className="line-clamp-2">{m.replyPreview}</span>
            </button>
          )}

          {m.attachmentUrl && (
            <div className="mb-1">
              {isImage ? (
                <a href={m.attachmentUrl} download={m.attachmentName || 'image.png'} className="block overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.attachmentUrl} alt={m.attachmentName || 'Image'} loading="lazy" className="max-h-72 w-auto max-w-full rounded-xl object-cover" />
                </a>
              ) : (
                <a
                  href={m.attachmentUrl}
                  download={m.attachmentName || 'attachment'}
                  className="flex items-center gap-2.5 rounded-xl bg-black/[0.05] px-3 py-2 text-[13px] font-medium hover:bg-black/[0.08] dark:bg-white/[0.08]"
                >
                  <Download className="h-4 w-4 shrink-0 text-gold" />
                  <span className="max-w-[220px] truncate">{m.attachmentName || 'Download file'}</span>
                </a>
              )}
            </div>
          )}

          {!autoBody && (
            <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.4]">
              <Linkified text={m.body} />
              {/* Spacer as wide as the time stamp, so it never overlaps the last line */}
              <span
                className="inline-block"
                style={{ width: (own ? 74 : 54) + (m.editedAt ? 36 : 0) + (m.pinned ? 14 : 0) }}
                aria-hidden
              />
            </p>
          )}

          <span className={cn('float-right -mt-3.5 ml-2 flex items-center gap-1 text-[10.5px] opacity-70', autoBody && 'mt-0')}>
            {m.pinned && <Pin className="h-2.5 w-2.5" />}
            {m.editedAt && <span>edited</span>}
            {timeLabel(m.createdAt)}
            {own &&
              (m.localState === 'sending' ? (
                <Clock className="h-3 w-3" aria-label="Sending" />
              ) : m.localState === 'failed' ? (
                <AlertCircle className="h-3 w-3 text-danger" aria-label="Not sent" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5 text-info" aria-label="Sent" />
              ))}
          </span>
        </div>

        {(m.linkedTaskId || m.linkedMeetingCode) && (
          <div className="mt-0.5 flex gap-1.5 text-[11px]">
            {m.linkedTaskId && <Badge tone="success">Task created</Badge>}
            {m.linkedMeetingCode && (
              <a href={`/meet?room=${encodeURIComponent(m.linkedMeetingCode)}`} target="_blank" rel="noopener noreferrer">
                <Badge tone="info">Join {m.linkedMeetingCode}</Badge>
              </a>
            )}
          </div>
        )}

        {reactions.length > 0 && (
          <div className={cn('-mt-1 flex flex-wrap gap-1', own ? 'justify-end' : 'justify-start')}>
            {reactions.map(([emoji, users]) => {
              const mine = users.includes(myId);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] shadow-2xs ring-1',
                    mine ? 'bg-gold/15 ring-gold/60' : 'bg-surface ring-line/60 dark:bg-raised',
                  )}
                >
                  <span>{emoji}</span>
                  {users.length > 1 && <span className="text-[10.5px] tabular-nums text-muted">{users.length}</span>}
                </button>
              );
            })}
          </div>
        )}

        {m.localState === 'failed' && (
          <div className="mt-1 flex gap-2 text-[11.5px]">
            <button type="button" onClick={onRetry} className="flex items-center gap-1 font-semibold text-danger hover:underline">
              <RotateCcw className="h-3 w-3" /> Retry
            </button>
            <button type="button" onClick={onDiscard} className="text-muted hover:underline">
              Discard
            </button>
          </div>
        )}
      </div>

      {/* Actions: hover on desktop, always reachable through the ⋯ button on touch screens */}
      {!local && (
        <div className={cn('relative self-center', own ? 'order-first' : '')}>
          <button
            type="button"
            aria-label="Message actions"
            onClick={(e) => {
              e.stopPropagation();
              const box = e.currentTarget.closest('[aria-live]')?.getBoundingClientRect();
              const top = e.currentTarget.getBoundingClientRect().top;
              setOpenDown(top - (box?.top ?? 0) < 300);
              onMenu(!menuOpen);
            }}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-ink/[0.07] hover:text-ink',
              menuOpen ? 'opacity-100' : 'opacity-60 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100',
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'absolute z-20 w-52 overflow-hidden rounded-2xl bg-surface shadow-pop ring-1 ring-line/60 dark:bg-raised',
                openDown ? 'top-8' : 'bottom-8',
                own ? 'right-0' : 'left-0',
              )}
            >
              <div className="flex justify-between border-b border-line/60 px-2 py-1.5">
                {QUICK_REACTIONS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => onReact(emoji)} className="rounded-full p-1 text-[17px] transition hover:scale-125">
                    {emoji}
                  </button>
                ))}
              </div>
              <MenuItem icon={Reply} label="Reply" onClick={onReply} />
              <MenuItem icon={Copy} label="Copy text" onClick={onCopy} />
              <MenuItem icon={Pin} label={m.pinned ? 'Unpin' : 'Pin'} onClick={onPin} />
              <MenuItem icon={CheckSquare} label="Make it a task" onClick={onTask} />
              {own && <MenuItem icon={Edit2} label="Edit" onClick={onEdit} />}
              {own && <MenuItem icon={Trash2} label="Delete" onClick={onDelete} danger />}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Reply; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-ink/[0.05]', danger ? 'text-danger' : 'text-ink')}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
