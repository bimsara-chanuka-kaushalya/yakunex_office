'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BarChart3,
  Check,
  CheckCheck,
  CheckSquare,
  Clock,
  Copy,
  Download,
  Edit2,
  FolderKanban,
  Hash,
  KeyRound,
  Lock,
  MessageSquarePlus,
  MessagesSquare,
  Paperclip,
  Pin,
  Plus,
  Reply,
  Search,
  Send,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import {
  MeetingStudio,
  PreJoinGreenRoom,
  type MeetingRow,
} from '@/components/modules/meeting-studio';
import { useAuth, useLang } from '@/components/providers';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { api, del, liveGet, patch, post, put } from '@/lib/api';
import { exportBrandedPdf } from '@/lib/pdf-export';
import { ROLE_LABELS, type Role } from '@/lib/permissions';
import { cn } from '@/lib/cn';

// ─── 1. TEAM CHAT PAGE (/chat) ───────────────────────────────────────────────

interface ChatChannel {
  id: string;
  name: string;
  type: 'PROJECT' | 'DEPARTMENT' | 'GROUP' | 'DIRECT' | 'MANAGEMENT' | 'ANNOUNCEMENT';
  category?: string;
  privacy?: 'PUBLIC' | 'ROLE_RESTRICTED' | 'CONFIDENTIAL' | 'DIRECT';
  department?: string | null;
  description: string;
  projectName: string | null;
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

const CHANNEL_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'ANNOUNCEMENTS', label: 'Announcements & General' },
  { key: 'MANAGEMENT', label: 'Management' },
  { key: 'DEPARTMENTS', label: 'Departments' },
  { key: 'TECHNICAL', label: 'Technical & Projects' },
  { key: 'PRIVATE', label: 'Private & Confidential' },
  { key: 'DIRECT', label: 'Direct Messages' },
];

function normalizeChannelCategory(ch: ChatChannel): string {
  if (ch.type === 'DIRECT' || ch.category === 'DIRECT') return 'DIRECT';
  if (ch.category === 'ANNOUNCEMENTS' || ch.type === 'ANNOUNCEMENT') return 'ANNOUNCEMENTS';
  if (ch.category === 'MANAGEMENT' || ch.type === 'MANAGEMENT') return 'MANAGEMENT';
  if (ch.category === 'DEPARTMENTS' || ch.category === 'DEPARTMENT' || ch.type === 'DEPARTMENT') {
    return ch.privacy === 'CONFIDENTIAL' && ch.category === 'PRIVATE' ? 'PRIVATE' : 'DEPARTMENTS';
  }
  if (ch.category === 'PRIVATE' || ch.category === 'CONFIDENTIAL' || ch.privacy === 'CONFIDENTIAL') {
    return 'PRIVATE';
  }
  return 'TECHNICAL';
}

const QUICK_REACTIONS = ['👍', '❤️', '🎉'];

export function ChatView() {
  const { user } = useAuth();
  const { lang } = useLang();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeId, setActiveId] = useState<string>('ch_general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [text, setText] = useState('');
  const [channelSearch, setChannelSearch] = useState('');
  const [msgSearch, setMsgSearch] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{ name: string; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelType, setNewChannelType] = useState<ChatChannel['type']>('GROUP');
  const [newChannelCategory, setNewChannelCategory] = useState('TECHNICAL');
  const [newChannelPrivacy, setNewChannelPrivacy] = useState<'PUBLIC' | 'ROLE_RESTRICTED' | 'CONFIDENTIAL'>('PUBLIC');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const [dmModalOpen, setDmModalOpen] = useState(false);
  const [dmSearch, setDmSearch] = useState('');

  const loadChannels = useCallback(async () => {
    try {
      const chs = await api<ChatChannel[]>('/chat/channels');
      const safe = Array.isArray(chs) ? chs : [];
      setChannels(safe);
      if (safe.length > 0) {
        setActiveId((prev) => (safe.some((c) => c.id === prev) ? prev : safe[0].id));
      }
    } catch {
      setChannels([]);
    }
  }, []);

  const loadMessages = useCallback(async (channelId: string) => {
    try {
      const msgs = await api<ChatMessage[]>(`/chat/channels/${channelId}/messages`);
      setMessages(Array.isArray(msgs) ? msgs : []);
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
    api<{
      employees?: Array<{
        id: string;
        fullName?: string;
        name?: string;
        email: string;
        role: string;
        title?: string | null;
        avatarUrl?: string | null;
        department?: { id: string; name: string } | string | null;
      }>;
    }>('/organization')
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
            department:
              typeof u.department === 'object' && u.department
                ? u.department.name
                : typeof u.department === 'string'
                  ? u.department
                  : undefined,
          })),
        );
      })
      .catch(() => setMembers([]));
  }, [loadChannels]);

  useEffect(() => {
    if (activeId) {
      setReplyTo(null);
      setEditingMsg(null);
      void loadMessages(activeId);
    }
  }, [activeId, loadMessages]);

  function onPickAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setBanner('Attachment must be under 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingAttachment({ name: file.name, dataUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() && !pendingAttachment) return;
    await post(`/chat/channels/${activeId}/messages`, {
      body: text.trim() || `Attachment: ${pendingAttachment?.name ?? 'File'}`,
      replyToId: replyTo?.id,
      attachmentUrl: pendingAttachment?.dataUrl,
      attachmentName: pendingAttachment?.name,
    });
    setText('');
    setReplyTo(null);
    setPendingAttachment(null);
    await loadMessages(activeId);
  }

  async function onCreateChannel(e: FormEvent) {
    e.preventDefault();
    const created = await post<ChatChannel>('/chat/channels', {
      name: newChannelName,
      description: newChannelDesc,
      type: newChannelType,
      category: newChannelCategory,
      privacy: newChannelPrivacy,
      memberIds: selectedMemberIds,
    });
    setModalOpen(false);
    setNewChannelName('');
    setNewChannelDesc('');
    setSelectedMemberIds([]);
    await loadChannels();
    setActiveId(created.id);
  }

  async function onStartDm(member: OrgMember) {
    const ch = await post<ChatChannel>('/chat/direct', {
      targetUserId: member.id,
      targetUserName: member.name,
    });
    setDmModalOpen(false);
    setDmSearch('');
    await loadChannels();
    setActiveId(ch.id);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingMsg || !editText.trim()) return;
    await patch(`/chat/messages/${editingMsg.id}`, { body: editText });
    setEditingMsg(null);
    setEditText('');
    await loadMessages(activeId);
  }

  async function onDeleteMessage(msgId: string) {
    await del(`/chat/messages/${msgId}`);
    await loadMessages(activeId);
  }

  async function onReact(msgId: string, emoji: string) {
    await post(`/chat/messages/${msgId}/react`, { emoji });
    await loadMessages(activeId);
  }

  async function onTogglePin(msgId: string) {
    await patch(`/chat/messages/${msgId}/pin`, {});
    await loadMessages(activeId);
  }

  async function onConvertToTask(msg: ChatMessage) {
    await post(`/chat/messages/${msg.id}/to-task`, {});
    setBanner(`Task created from message by ${msg.senderName}.`);
    await loadMessages(activeId);
  }

  async function onStartChannelMeeting() {
    if (!activeChannel) return;
    const mt = await post<MeetingRow>(`/chat/channels/${activeChannel.id}/meeting`, {
      title: `${activeChannel.name} Sync`,
      agenda: `Channel huddle for #${activeChannel.name}`,
    });
    setBanner(`Meeting started (${mt.roomCode}) — open Meetings to join.`);
    await loadMessages(activeId);
  }

  function toggleMemberSelection(id: string) {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const activeChannel = channels.find((c) => c.id === activeId);
  const filteredChannels = channelSearch.trim()
    ? channels.filter((c) => c.name.toLowerCase().includes(channelSearch.toLowerCase()))
    : channels;

  const pinnedMessages = messages.filter((m) => m.pinned && !m.deleted);
  const visibleMessages = msgSearch.trim()
    ? messages.filter(
        (m) =>
          m.body.toLowerCase().includes(msgSearch.toLowerCase()) ||
          m.senderName.toLowerCase().includes(msgSearch.toLowerCase()),
      )
    : messages;

  return (
    <div className="space-y-4">
      {banner && (
        <div className="flex items-center justify-between rounded-2xl bg-gold/15 px-4 py-2.5 text-xs font-medium text-ink shadow-2xs">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner(null)} className="text-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* WhatsApp + Apple HIG Split Shell */}
      <Card className="grid h-[calc(100dvh-10.5rem)] min-h-[600px] overflow-hidden md:grid-cols-[310px_1fr]">
        {/* Left Pane: WhatsApp Chats List + macOS Source List */}
        <aside className="flex min-h-0 flex-col border-b border-line/70 bg-sidebar/70 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h2 className="font-display text-[22px] font-bold tracking-tight text-ink">Chats</h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDmModalOpen(true)}
                title="Direct message"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink transition hover:bg-ink/[0.11] dark:bg-white/[0.1] dark:hover:bg-white/[0.16]"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                title="Create group"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-gold-ink shadow-2xs transition hover:brightness-105"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="px-3 pb-3 pt-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search chats or channels…"
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                className="h-9 w-full rounded-full bg-ink/[0.06] pl-8 pr-3 text-[13px] text-ink placeholder:text-muted/70 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-gold/30 dark:bg-white/[0.08] dark:focus:bg-raised"
              />
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
            {CHANNEL_CATEGORIES.map((cat) => {
              const items = filteredChannels.filter((c) => normalizeChannelCategory(c) === cat.key);
              if (items.length === 0) return null;
              return (
                <div key={cat.key}>
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted/80">
                    {cat.label} · {items.length}
                  </p>
                  <ul className="space-y-0.5">
                    {items.map((ch) => {
                      const isActive = ch.id === activeId;
                      return (
                        <li key={ch.id}>
                          <button
                            type="button"
                            onClick={() => setActiveId(ch.id)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left transition-all duration-150 ease-spring',
                              isActive
                                ? 'bg-gold/15 text-ink shadow-2xs dark:bg-gold/20'
                                : 'text-ink hover:bg-ink/[0.05] dark:hover:bg-white/[0.06]',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                                isActive
                                  ? 'bg-gold text-gold-ink'
                                  : 'bg-ink/[0.06] text-muted dark:bg-white/[0.1]',
                              )}
                            >
                              {ch.privacy === 'CONFIDENTIAL' ? (
                                <Lock className="h-4 w-4" />
                              ) : ch.type === 'DIRECT' ? (
                                <Users className="h-4 w-4" />
                              ) : (
                                <Hash className="h-4 w-4" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="truncate text-[13.5px] font-semibold">{ch.name}</span>
                                {ch.privacy === 'CONFIDENTIAL' && (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" title="Confidential" />
                                )}
                              </div>
                              <p className="truncate text-[11.5px] text-muted">{ch.description}</p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Pane: WhatsApp Wallpaper Canvas + Apple Frosted Header & Composer */}
        <div className="flex min-h-0 flex-col bg-[#efeae2]/75 dark:bg-[#0b141a]">
          {/* Frosted Chat Header */}
          <div className="material flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-strong dark:text-gold">
                {activeChannel?.privacy === 'CONFIDENTIAL' ? (
                  <Lock className="h-4 w-4" />
                ) : activeChannel?.type === 'DIRECT' ? (
                  <Users className="h-4 w-4" />
                ) : (
                  <Hash className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-[15px] font-semibold text-ink">
                    {activeChannel?.name ?? 'general'}
                  </h3>
                  {activeChannel?.privacy && activeChannel.privacy !== 'PUBLIC' && (
                    <Badge tone="gold">{activeChannel.privacy}</Badge>
                  )}
                  {activeChannel?.projectName && (
                    <Badge tone="neutral">{activeChannel.projectName}</Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted">{activeChannel?.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-40 sm:w-48">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search messages…"
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                  className="h-8 w-full rounded-full bg-ink/[0.06] pl-8 pr-3 text-xs text-ink placeholder:text-muted/70 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-gold/30 dark:bg-white/[0.1] dark:focus:bg-raised"
                />
              </div>
              {user?.role !== 'INTERN' && (
                <Button size="sm" variant="secondary" onClick={onStartChannelMeeting}>
                  <Video className="h-3.5 w-3.5" /> Meet
                </Button>
              )}
            </div>
          </div>

          {pinnedMessages.length > 0 && (
            <div className="material border-b border-line/60 px-5 py-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-gold-strong dark:text-gold">
                <Pin className="h-3.5 w-3.5 shrink-0" />
                <span>Pinned ({pinnedMessages.length}):</span>
                <span className="truncate font-normal text-ink">{pinnedMessages[0].body}</span>
              </div>
            </div>
          )}

          {/* Messages Feed */}
          <div
            className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6"
            style={{
              backgroundImage:
                'radial-gradient(rgb(120 120 128 / 0.12) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          >
            {visibleMessages.length === 0 ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
                <div className="material rounded-2xl px-6 py-5 shadow-card">
                  <MessagesSquare className="mx-auto mb-2 h-8 w-8 text-gold" />
                  <p className="text-sm font-semibold text-ink">
                    {msgSearch.trim()
                      ? 'No matching messages found'
                      : `No messages in #${activeChannel?.name ?? 'channel'} yet`}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Send a message below to start the conversation.
                  </p>
                </div>
              </div>
            ) : (
              visibleMessages.map((msg) => {
                const isOwn = user?.id === msg.senderId;
                const avatarSrc = isOwn ? (msg.senderAvatarUrl ?? user?.avatarUrl) : msg.senderAvatarUrl;
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'group flex items-end gap-2',
                      isOwn ? 'justify-end' : 'justify-start',
                    )}
                  >
                    {!isOwn && (
                      <Avatar
                        src={avatarSrc}
                        name={msg.senderName}
                        size="sm"
                        className="mb-1"
                      />
                    )}

                    <div
                      className={cn(
                        'relative max-w-[82%] rounded-[18px] px-3.5 py-2 shadow-2xs sm:max-w-[70%]',
                        isOwn
                          ? 'rounded-tr-[4px] bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]'
                          : 'rounded-tl-[4px] bg-surface text-ink',
                      )}
                    >
                      {/* Floating Hover Quick-Actions Pill */}
                      {!msg.deleted && (
                        <div
                          className={cn(
                            'material-thick absolute -top-7 z-10 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 shadow-card opacity-0 transition-opacity group-hover:opacity-100',
                            isOwn ? 'right-0' : 'left-0',
                          )}
                        >
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => onReact(msg.id, emoji)}
                              className="rounded-full px-1.5 py-0.5 text-xs hover:bg-ink/[0.08]"
                              title={`React ${emoji}`}
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setReplyTo(msg)}
                            className="rounded-full p-1 text-muted hover:bg-ink/[0.08] hover:text-ink"
                            title="Reply"
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onTogglePin(msg.id)}
                            className="rounded-full p-1 text-muted hover:bg-ink/[0.08] hover:text-ink"
                            title={msg.pinned ? 'Unpin' : 'Pin'}
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onConvertToTask(msg)}
                            className="rounded-full p-1 text-muted hover:bg-ink/[0.08] hover:text-ink"
                            title="Convert to Task"
                          >
                            <CheckSquare className="h-3.5 w-3.5" />
                          </button>
                          {isOwn && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMsg(msg);
                                  setEditText(msg.body);
                                }}
                                className="rounded-full p-1 text-muted hover:bg-ink/[0.08] hover:text-ink"
                                title="Edit"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteMessage(msg.id)}
                                className="rounded-full p-1 text-muted hover:bg-ink/[0.08] hover:text-danger"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {!isOwn && (
                        <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[12px] font-semibold text-gold-strong dark:text-gold">
                            {msg.senderName}
                          </span>
                          <span className="text-[10px] font-medium text-muted">
                            {ROLE_LABELS[msg.senderRole as Role]?.[lang] ?? msg.senderRole}
                          </span>
                        </div>
                      )}

                      {msg.replyPreview && (
                        <div className="mb-1.5 rounded-lg border-l-3 border-gold bg-black/[0.05] px-2.5 py-1 text-[11.5px] opacity-85 dark:bg-white/[0.08]">
                          {msg.replyPreview}
                        </div>
                      )}

                      {editingMsg?.id === msg.id ? (
                        <form onSubmit={onSaveEdit} className="mt-1 flex gap-2">
                          <Input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            autoFocus
                          />
                          <Button size="sm" type="submit">Save</Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            onClick={() => setEditingMsg(null)}
                          >
                            Cancel
                          </Button>
                        </form>
                      ) : (
                        <>
                          {msg.attachmentUrl && !msg.deleted && (
                            <div className="mb-1.5">
                              {msg.attachmentUrl.startsWith('data:image/') ? (
                                <a
                                  href={msg.attachmentUrl}
                                  download={msg.attachmentName || 'image.png'}
                                  className="block overflow-hidden rounded-xl border border-black/10 dark:border-white/10"
                                >
                                  <img
                                    src={msg.attachmentUrl}
                                    alt={msg.attachmentName || 'Attachment'}
                                    className="max-h-56 w-auto rounded-xl object-cover"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={msg.attachmentUrl}
                                  download={msg.attachmentName || 'attachment'}
                                  className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.04] px-3 py-1.5 text-xs font-medium hover:bg-black/[0.08] dark:border-white/10 dark:bg-white/[0.08]"
                                >
                                  <Download className="h-3.5 w-3.5 text-gold" />
                                  <span className="max-w-[200px] truncate">
                                    {msg.attachmentName || 'Download attachment'}
                                  </span>
                                </a>
                              )}
                            </div>
                          )}
                          <p className={cn('text-[14px] leading-snug', msg.deleted && 'italic opacity-60')}>
                            {msg.body}
                          </p>
                        </>
                      )}

                      <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5 text-[10px] opacity-70">
                        {msg.pinned && <Pin className="h-2.5 w-2.5 text-gold-strong dark:text-gold" />}
                        {msg.linkedTaskId && <span className="font-semibold text-success">Task</span>}
                        {msg.linkedMeetingCode && <span className="font-semibold">Meet {msg.linkedMeetingCode}</span>}
                        {msg.editedAt && <span>edited</span>}
                        <span>
                          {new Date(msg.createdAt).toLocaleTimeString('en-LK', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Asia/Colombo',
                          })}
                        </span>
                        {isOwn && !msg.deleted && (
                          <CheckCheck className="h-3.5 w-3.5 text-info" />
                        )}
                      </div>

                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {Object.entries(msg.reactions).map(([emoji, users]) =>
                            Array.isArray(users) && users.length > 0 ? (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => onReact(msg.id, emoji)}
                                className="inline-flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[11px] shadow-2xs ring-1 ring-line/50 hover:ring-gold dark:bg-raised"
                              >
                                <span>{emoji}</span>
                                <span className="font-mono text-[10px] text-muted">{users.length}</span>
                              </button>
                            ) : null,
                          )}
                        </div>
                      )}
                    </div>

                    {isOwn && (
                      <Avatar
                        src={avatarSrc}
                        name={msg.senderName}
                        size="sm"
                        className="mb-1"
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {replyTo && (
            <div className="material flex items-center justify-between border-t border-line/60 px-4 py-2 text-xs">
              <span className="truncate text-muted">
                Replying to <strong className="text-ink">{replyTo.senderName}</strong>: {replyTo.body}
              </span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-muted hover:text-ink">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {pendingAttachment && (
            <div className="material flex items-center justify-between border-t border-line/60 px-4 py-2 text-xs">
              <div className="flex items-center gap-2 truncate">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-gold" />
                <span className="truncate font-medium text-ink">{pendingAttachment.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setPendingAttachment(null)}
                className="text-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Frosted WhatsApp + Apple Composer Bar */}
          <form onSubmit={onSend} className="material flex items-center gap-2.5 border-t border-line/70 px-4 py-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              className="hidden"
              onChange={onPickAttachment}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach image or file"
              title="Attach image or file"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-line/60 transition hover:text-ink dark:bg-raised"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              type="text"
              placeholder={`Message #${activeChannel?.name ?? 'channel'}…`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-10 flex-1 rounded-full bg-surface px-4 text-[14px] text-ink shadow-2xs ring-1 ring-line/60 placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-gold/50 dark:bg-raised"
            />
            <button
              type="submit"
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-gold-ink shadow-xs transition-transform duration-150 ease-spring hover:brightness-105 active:scale-95"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </Card>

      <Modal open={modalOpen} title="Create organization or private group" onClose={() => setModalOpen(false)}>
        <form onSubmit={onCreateChannel} className="space-y-4">
          <Field label="Group Name" htmlFor="ch-name">
            <Input
              id="ch-name"
              required
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="e.g. prj-lankamed-portal"
            />
          </Field>
          <Field label="Group Description" htmlFor="ch-desc">
            <Input
              id="ch-desc"
              required
              value={newChannelDesc}
              onChange={(e) => setNewChannelDesc(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Group Type" htmlFor="ch-type">
              <Select
                id="ch-type"
                value={newChannelType}
                onChange={(e) => setNewChannelType(e.target.value as ChatChannel['type'])}
              >
                <option value="GROUP">Private / Team Group</option>
                <option value="PROJECT">Project Group</option>
                <option value="DEPARTMENT">Department Group</option>
                <option value="MANAGEMENT">Management Group</option>
                <option value="ANNOUNCEMENT">Announcement Group</option>
              </Select>
            </Field>
            <Field label="Sidebar Category" htmlFor="ch-cat">
              <Select
                id="ch-cat"
                value={newChannelCategory}
                onChange={(e) => setNewChannelCategory(e.target.value)}
              >
                <option value="ANNOUNCEMENTS">Announcements</option>
                <option value="MANAGEMENT">Management</option>
                <option value="DEPARTMENT">Departments</option>
                <option value="TECHNICAL">Technical &amp; Projects</option>
                <option value="CONFIDENTIAL">Private &amp; Confidential</option>
              </Select>
            </Field>
            <Field label="Group Privacy" htmlFor="ch-priv">
              <Select
                id="ch-priv"
                value={newChannelPrivacy}
                onChange={(e) =>
                  setNewChannelPrivacy(e.target.value as 'PUBLIC' | 'ROLE_RESTRICTED' | 'CONFIDENTIAL')
                }
              >
                <option value="PUBLIC">Public (All Employees)</option>
                <option value="ROLE_RESTRICTED">Role / Member Restricted</option>
                <option value="CONFIDENTIAL">Confidential (Invite Only)</option>
              </Select>
            </Field>
          </div>
          {members.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">
                Select Members ({selectedMemberIds.length} selected)
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
                {members.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-xs hover:bg-surface"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(m.id)}
                        onChange={() => toggleMemberSelection(m.id)}
                      />
                      <span className="font-medium text-ink">{m.name}</span>
                    </span>
                    <span className="text-muted">{m.title ?? m.role}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create group</Button>
          </div>
        </form>
      </Modal>

      <Modal open={dmModalOpen} title="Start direct message" onClose={() => setDmModalOpen(false)}>
        <div className="space-y-3">
          <Input
            placeholder="Search employee by name, role, or department…"
            value={dmSearch}
            onChange={(e) => setDmSearch(e.target.value)}
          />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {members
              .filter(
                (m) =>
                  m.id !== user?.id &&
                  (`${m.name} ${m.title ?? ''} ${m.department ?? ''}`)
                    .toLowerCase()
                    .includes(dmSearch.toLowerCase()),
              )
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onStartDm(m)}
                  className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-gold hover:bg-surface"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar src={m.avatarUrl} name={m.name} size="md" />
                    <div>
                      <p className="font-medium text-ink">{m.name}</p>
                      <p className="text-xs text-muted">{m.title ?? m.role}</p>
                    </div>
                  </div>
                  <Badge tone="neutral">{m.department ?? m.role}</Badge>
                </button>
              ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── 2. MEETINGS PAGE (/meetings) — ZOOM-GRADE WEBRTC STUDIO ───────────────

interface MeetingAccessPolicy {
  tier: string;
  rolesLabel: string;
  canCreate: boolean;
  createLabel: string;
  allowedScopes: string[];
  waitingRoomControl: string;
  waitingRoomLabel: string;
  canInviteExternal: boolean;
  recordingScope: string;
  externalAndRecordingLabel: string;
  screenShareRequiresApproval: boolean;
}

export function MeetingsView() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [policy, setPolicy] = useState<MeetingAccessPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Schedule form state
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [meetingScope, setMeetingScope] = useState('INTERNAL');
  const [allowedRoles, setAllowedRoles] = useState<string[]>(['ALL']);
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(false);
  const [allowExternalGuests, setAllowExternalGuests] = useState(false);
  const [recordingAllowed, setRecordingAllowed] = useState(false);

  // Join by room code & pre-join green room state
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [preJoin, setPreJoin] = useState<
    | { mode: 'existing'; meeting: MeetingRow }
    | { mode: 'instant'; title: string; agenda: string }
    | null
  >(null);
  const [activeSession, setActiveSession] = useState<{
    room: MeetingRow;
    micOn: boolean;
    camOn: boolean;
    micDeviceId?: string;
    camDeviceId?: string;
  } | null>(null);
  const handledUrlParamRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, pol] = await Promise.all([
        api<MeetingRow[]>('/meetings'),
        api<MeetingAccessPolicy>('/meetings/access-policy').catch(() => null),
      ]);
      setMeetings(list);
      if (pol) {
        setPolicy(pol);
        if (pol.allowedScopes.length > 0) {
          setMeetingScope((prev) => (pol.allowedScopes.includes(prev) ? prev : pol.allowedScopes[0]));
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Periodically refresh meeting lobby list sequentially while visible & not inside a call
  useEffect(() => {
    if (activeSession || preJoin) return;
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 6000));
        if (cancelled) break;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') continue;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) continue;
        try {
          const fresh = await liveGet<MeetingRow[]>('/meetings');
          if (!cancelled) setMeetings(fresh);
        } catch {
          // Ignore transient 3G poll errors
        }
      }
    };
    void loop();
    return () => {
      cancelled = true;
    };
  }, [activeSession, preJoin]);

  // Auto-open Pre-Join Green Room if user navigated via ?room=YH-ROOM-XXX invite link
  useEffect(() => {
    if (handledUrlParamRef.current || loading || typeof window === 'undefined') return;
    const code = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase();
    if (!code) return;
    handledUrlParamRef.current = true;
    const match = meetings.find((m) => m.roomCode.toUpperCase() === code || m.id.toUpperCase() === code);
    if (match) {
      setPreJoin({ mode: 'existing', meeting: match });
    } else {
      setRoomCodeInput(code);
    }
  }, [loading, meetings]);

  const openMeetingPopup = (params: Record<string, string>): boolean => {
    if (typeof window === 'undefined') return false;
    const qs = new URLSearchParams(params).toString();
    const win = window.open(`/meet?${qs}`, '_blank');
    if (win) {
      win.focus();
      return true;
    }
    return false;
  };

  const confirmPreJoin = async ({
    micOn,
    camOn,
    micDeviceId,
    camDeviceId,
  }: {
    micOn: boolean;
    camOn: boolean;
    micDeviceId?: string;
    camDeviceId?: string;
  }) => {
    if (!preJoin) return;
    setJoining(true);
    setJoinError(null);
    try {
      let joined: MeetingRow;
      if (preJoin.mode === 'instant') {
        joined = await post<MeetingRow>('/meetings', {
          title: preJoin.title,
          agenda: preJoin.agenda,
          instant: true,
          micOn,
          camOn,
        });
      } else {
        joined = await post<MeetingRow>(`/meetings/${preJoin.meeting.id}/join`, {
          micOn,
          camOn,
        });
      }
      setPreJoin(null);
      void load();
      if (
        !openMeetingPopup({
          room: joined.roomCode,
          mic: String(micOn),
          cam: String(camOn),
          ...(micDeviceId ? { micId: micDeviceId } : {}),
          ...(camDeviceId ? { camId: camDeviceId } : {}),
          autojoin: '1',
        })
      ) {
        setActiveSession({ room: joined, micOn, camOn, micDeviceId, camDeviceId });
      }
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Unable to enter meeting room.');
    } finally {
      setJoining(false);
    }
  };

  const onJoinByCode = async (e: FormEvent) => {
    e.preventDefault();
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) return;
    setJoinError(null);
    const localMatch = meetings.find(
      (m) => m.roomCode.toUpperCase() === code || m.id.toUpperCase() === code,
    );
    if (localMatch) {
      setRoomCodeInput('');
      if (!openMeetingPopup({ room: localMatch.roomCode })) {
        setPreJoin({ mode: 'existing', meeting: localMatch });
      }
      return;
    }
    setJoining(true);
    try {
      const joined = await post<MeetingRow>('/meetings/join-by-code', {
        roomCode: code,
        micOn: true,
        camOn: true,
      });
      setRoomCodeInput('');
      void load();
      if (
        !openMeetingPopup({
          room: joined.roomCode,
          mic: 'true',
          cam: 'true',
          autojoin: '1',
        })
      ) {
        setActiveSession({ room: joined, micOn: true, camOn: true });
      }
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Invalid meeting room code.');
    } finally {
      setJoining(false);
    }
  };

  const onSchedule = async (e: FormEvent) => {
    e.preventDefault();
    await post<MeetingRow>('/meetings', {
      title,
      agenda,
      startsAt: new Date(startsAt).toISOString(),
      notes,
      meetingScope,
      allowedRoles,
      waitingRoomEnabled,
      allowExternalGuests,
      recordingAllowed,
    });
    setModalOpen(false);
    setTitle('');
    setAgenda('');
    setNotes('');
    await load();
  };

  const markCompleted = async (id: string) => {
    await patch(`/meetings/${id}`, { status: 'COMPLETED' });
    await load();
  };

  const copyInvite = async (mtg: MeetingRow) => {
    const url = `${window.location.origin}/meet?room=${mtg.roomCode}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopiedId(mtg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (activeSession) {
    return (
      <MeetingStudio
        initialRoom={activeSession.room}
        initialMicOn={activeSession.micOn}
        initialCamOn={activeSession.camOn}
        initialMicId={activeSession.micDeviceId}
        initialCamId={activeSession.camDeviceId}
        currentUser={{
          id: user?.id ?? '',
          companyId: user?.companyId ?? null,
          fullName: user?.fullName ?? 'You',
          role: user?.role ?? 'STAFF',
        }}
        onExited={() => {
          setActiveSession(null);
          void load();
        }}
        onMeetingUpdated={(updated) => {
          setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }}
      />
    );
  }

  if (preJoin) {
    const meetingTitle =
      preJoin.mode === 'instant' ? preJoin.title : preJoin.meeting.title;
    const roomCode =
      preJoin.mode === 'instant' ? 'NEW ROOM' : preJoin.meeting.roomCode;
    const organizerName =
      preJoin.mode === 'instant'
        ? user?.fullName ?? 'You'
        : preJoin.meeting.organizerName;

    return (
      <div className="space-y-4">
        {joinError && (
          <div className="mx-auto max-w-4xl rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-500">
            {joinError}
          </div>
        )}
        <PreJoinGreenRoom
          meetingTitle={meetingTitle}
          roomCode={roomCode}
          organizerName={organizerName}
          userName={user?.fullName ?? 'You'}
          joining={joining}
          onCancel={() => {
            setPreJoin(null);
            setJoinError(null);
          }}
          onJoin={(opts) => void confirmPreJoin(opts)}
        />
      </div>
    );
  }

  const liveCount = meetings.filter((m) => m.status === 'LIVE').length;
  const activePeople = meetings.reduce((sum, m) => sum + (m.participants?.length ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">
            Yakunex Hub Meet — Live Video & Screen Share
          </h2>
          <p className="mt-1 text-sm text-muted">
            Zoom-grade peer-to-peer HD video, crystal clear two-way audio, screen sharing,
            reactions & live room chat inside your browser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <form onSubmit={onJoinByCode} className="flex items-center gap-2">
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <Input
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value)}
                placeholder="Room code (YH-ROOM-...)"
                className="h-10 w-48 pl-9 text-xs uppercase"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={joining || !roomCodeInput.trim()}>
              Join Code
            </Button>
          </form>

          {user?.role !== 'INTERN' && policy?.canCreate && (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  const titleText = `${user?.fullName ?? 'Team'}'s Instant Meeting`;
                  if (!openMeetingPopup({ instant: '1', title: titleText })) {
                    setPreJoin({
                      mode: 'instant',
                      title: titleText,
                      agenda: 'Live video sync & screen share huddle',
                    });
                  }
                }}
              >
                <Video className="h-4 w-4" /> New Meeting
              </Button>
              <Button variant="secondary" onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" /> Schedule
              </Button>
            </>
          )}
        </div>
      </header>

      {joinError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-500">
          {joinError}
        </div>
      )}

      {/* Quick overview strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Live Rooms"
          value={String(liveCount)}
          hint={liveCount > 0 ? 'Active calls happening now' : 'Start an instant call anytime'}
          icon={<Video className="h-5 w-5" />}
        />
        <StatCard
          label="People In Call"
          value={String(activePeople)}
          hint="Connected with live mic & camera"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Scheduled Rooms"
          value={String(meetings.filter((m) => m.status === 'SCHEDULED').length)}
          hint="Upcoming team standups & reviews"
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {loading ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : meetings.length === 0 ? (
        <Card className="p-12 text-center text-muted">
          <Video className="mx-auto mb-3 h-10 w-10 text-muted/60" />
          <p className="font-display text-lg font-semibold text-ink">
            No active or scheduled meetings yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm">
            {user?.role === 'INTERN'
              ? 'Enter a room code above to join an invited meeting.'
              : 'Start a new instant video meeting with screen sharing or schedule a sprint review room.'}
          </p>
          {user?.role !== 'INTERN' && policy?.canCreate && (
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button
                variant="primary"
                onClick={() =>
                  setPreJoin({
                    mode: 'instant',
                    title: `${user?.fullName ?? 'Team'}'s Instant Meeting`,
                    agenda: 'Live video sync & screen share huddle',
                  })
                }
              >
                <Video className="h-4 w-4" /> Start Instant Meeting
              </Button>
              <Button variant="secondary" onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" /> Schedule Meeting
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {meetings.map((mtg) => {
            const inCallCount = mtg.participants?.length ?? 0;
            const isLive = mtg.status === 'LIVE';
            return (
              <Card key={mtg.id} className="flex flex-col justify-between p-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          isLive
                            ? 'danger'
                            : mtg.status === 'SCHEDULED'
                              ? 'gold'
                              : 'success'
                        }
                      >
                        {isLive ? '● LIVE NOW' : mtg.status}
                      </Badge>
                      <Badge tone="neutral">{mtg.roomCode}</Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyInvite(mtg)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-canvas hover:text-ink"
                    >
                      {copiedId === mtg.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-500" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Invite Link
                        </>
                      )}
                    </button>
                  </div>

                  <h3 className="mt-2.5 font-display text-lg font-semibold text-ink">
                    {mtg.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{mtg.agenda}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span>Host: {mtg.organizerName}</span>
                    <span>
                      {new Date(mtg.startsAt).toLocaleString('en-LK', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'Asia/Colombo',
                      })}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-ink">
                      <Users className="h-3.5 w-3.5 text-gold-600" />
                      {inCallCount > 0 ? `${inCallCount} in call` : 'Waiting to start'}
                    </span>
                  </div>

                  {mtg.notes && (
                    <div className="mt-3 rounded-xl bg-canvas px-3 py-2 text-xs text-muted">
                      <strong className="text-ink">Notes:</strong> {mtg.notes}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3.5">
                  <Button
                    variant={isLive ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => {
                      if (!openMeetingPopup({ room: mtg.roomCode })) {
                        setPreJoin({ mode: 'existing', meeting: mtg });
                      }
                    }}
                  >
                    <Video className="h-3.5 w-3.5" />{' '}
                    {mtg.status === 'COMPLETED' ? 'Reopen & Join' : 'Join Meeting'}
                  </Button>
                  {user?.role !== 'INTERN' && mtg.status !== 'COMPLETED' && mtg.status !== 'CANCELLED' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void markCompleted(mtg.id)}
                    >
                      End / Complete
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Schedule Yakunex Hub Meet Room"
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={onSchedule} className="space-y-4">
          <Field label="Meeting title" htmlFor="mt-title">
            <Input
              id="mt-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Architecture Review & Sprint Demo"
            />
          </Field>
          <Field label="Date & time" htmlFor="mt-time">
            <Input
              id="mt-time"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label="Agenda" htmlFor="mt-agenda">
            <Input
              id="mt-agenda"
              required
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Topics to cover & screen share walkthrough"
            />
          </Field>
          <Field label="Initial notes / action items" htmlFor="mt-notes">
            <Input id="mt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {policy && policy.allowedScopes.length > 0 && (
            <Field label="Meeting Scope" htmlFor="mt-scope">
              <Select id="mt-scope" value={meetingScope} onChange={(e) => setMeetingScope(e.target.value)}>
                {policy.allowedScopes.map((sc) => (
                  <option key={sc} value={sc}>{sc}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Who can see & join this meeting (Target Audience)" htmlFor="mt-audience">
            <div id="mt-audience" className="flex flex-wrap gap-1.5 pt-1">
              {[
                { key: 'ALL', label: 'Everyone (All Roles)' },
                { key: 'SUPER_ADMIN', label: 'Super Admin / MD / CEO' },
                { key: 'ADMIN', label: 'Admin / C-Level / Legal' },
                { key: 'PROJECT_MANAGER', label: 'Management / HR / PM' },
                { key: 'STAFF', label: 'Core Staff / Engineers' },
                { key: 'INTERN', label: 'Interns / Trainees' },
              ].map((opt) => {
                const selected = allowedRoles.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      if (opt.key === 'ALL') {
                        setAllowedRoles(['ALL']);
                        return;
                      }
                      const next = allowedRoles.filter((r) => r !== 'ALL');
                      if (next.includes(opt.key)) {
                        const filtered = next.filter((r) => r !== opt.key);
                        setAllowedRoles(filtered.length > 0 ? filtered : ['ALL']);
                      } else {
                        setAllowedRoles([...next, opt.key]);
                      }
                    }}
                    className={cn(
                      'rounded-xl border px-2.5 py-1 text-xs font-medium transition',
                      selected
                        ? 'border-gold bg-gold/15 text-gold-strong dark:text-gold'
                        : 'border-line bg-surface text-muted hover:text-ink',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="space-y-2 rounded-xl bg-ink/[0.04] p-3 text-xs dark:bg-white/[0.06]">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={waitingRoomEnabled}
                onChange={(e) => setWaitingRoomEnabled(e.target.checked)}
              />
              <span>Enable Waiting Room (Admit / Remove)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                disabled={!policy?.canInviteExternal}
                checked={allowExternalGuests}
                onChange={(e) => setAllowExternalGuests(e.target.checked)}
              />
              <span className={!policy?.canInviteExternal ? 'text-muted' : ''}>
                Allow External Guests {policy && !policy.canInviteExternal ? '(Disabled for your tier)' : ''}
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                disabled={policy?.recordingScope === 'NONE'}
                checked={recordingAllowed}
                onChange={(e) => setRecordingAllowed(e.target.checked)}
              />
              <span className={policy?.recordingScope === 'NONE' ? 'text-muted' : ''}>
                Allow Meeting Recording {policy?.recordingScope === 'NONE' ? '(Disabled for your tier)' : ''}
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Meeting Room</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── 3. REPORTS PAGE (/reports) ──────────────────────────────────────────────

interface ReportsData {
  projectProgress: Array<{
    id: string;
    code: string;
    name: string;
    clientName: string;
    status: string;
    budget: number;
    progressPercent: number;
    totalTasks: number;
    completedTasks: number;
    hoursLogged: number;
  }>;
  bugsBySeverity: Array<{ severity: string; count: number }>;
  tasksByStatus: Array<{ status: string; count: number }>;
  timesheetSummary?: Array<{
    userId: string;
    userName: string;
    totalMinutes: number;
    regularMinutes: number;
    overtimeMinutes: number;
    billableMinutes: number;
    approvedMinutes: number;
    breakMinutes: number;
    lateCount: number;
    gpsVerifiedCount: number;
  }>;
  totalBillableMinutes: number;
  totalNonBillableMinutes: number;
}

export function ReportsView() {
  const { user } = useAuth();
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ReportsData>('/reports/summary')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  function exportCsv() {
    if (!data) return;
    const header = 'Code,Project Name,Client,Status,Budget (LKR),Progress (%),Tasks Completed,Total Tasks,Hours Logged\n';
    const rows = data.projectProgress
      .map(
        (p) =>
          `"${p.code}","${p.name}","${p.clientName}","${p.status}",${p.budget},${p.progressPercent},${p.completedTasks},${p.totalTasks},${p.hoursLogged}`,
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'yakunex-hub-delivery-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportTimesheetCsv() {
    const rows = data?.timesheetSummary ?? [];
    if (rows.length === 0) return;
    const header = 'Employee,Total Hours,Regular Hours,Overtime Hours,Billable Hours,Approved Hours,Break Minutes,Late Count,GPS Verified\n';
    const body = rows
      .map(
        (r) =>
          `"${r.userName}",${(r.totalMinutes / 60).toFixed(2)},${(r.regularMinutes / 60).toFixed(2)},${(r.overtimeMinutes / 60).toFixed(2)},${(r.billableMinutes / 60).toFixed(2)},${(r.approvedMinutes / 60).toFixed(2)},${r.breakMinutes},${r.lateCount},${r.gpsVerifiedCount}`,
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yakunex-timesheet-attendance-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Analytics & Reports</h2>
          <p className="mt-1 text-sm text-muted">
            Executive delivery metrics, live timesheet/overtime utilization &amp; defect distribution.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={!data?.timesheetSummary?.length}
            onClick={() => {
              if (!data?.timesheetSummary) return;
              exportBrandedPdf({
                title: 'Timesheet, Overtime & Attendance Report',
                subtitle: 'Regular vs Overtime (>8h/day), Billable & GPS Verification Summary',
                generatedByEmail: user?.email,
                generatedByName: user?.fullName,
                columns: ['Employee', 'Total (h)', 'Regular (h)', 'Overtime (h)', 'Billable (h)', 'Approved (h)', 'Breaks (m)', 'Late / GPS'],
                rows: data.timesheetSummary.map((r) => [
                  r.userName,
                  (r.totalMinutes / 60).toFixed(1),
                  (r.regularMinutes / 60).toFixed(1),
                  (r.overtimeMinutes / 60).toFixed(1),
                  (r.billableMinutes / 60).toFixed(1),
                  (r.approvedMinutes / 60).toFixed(1),
                  r.breakMinutes,
                  `${r.lateCount} late / ${r.gpsVerifiedCount} GPS`,
                ]),
              });
            }}
          >
            <Download className="h-4 w-4" /> Timesheet PDF
          </Button>
          <Button
            disabled={!data}
            onClick={() => {
              if (!data) return;
              exportBrandedPdf({
                title: 'Executive Delivery & Utilization Report',
                subtitle: 'Project portfolio progress, hours logged & contract budgets',
                generatedByEmail: user?.email,
                generatedByName: user?.fullName,
                kpis: [
                  {
                    label: 'Avg Completion',
                    value: `${Math.round(
                      data.projectProgress.reduce((s, p) => s + p.progressPercent, 0) /
                        Math.max(1, data.projectProgress.length),
                    )}%`,
                  },
                  { label: 'Billable Hours', value: `${(data.totalBillableMinutes / 60).toFixed(1)}h` },
                  {
                    label: 'Total Budget',
                    value: `LKR ${(
                      data.projectProgress.reduce((s, p) => s + p.budget, 0) / 1_000_000
                    ).toFixed(1)}M`,
                  },
                ],
                columns: ['Code', 'Project', 'Client', 'Status', 'Tasks', 'Hours', 'Progress'],
                rows: data.projectProgress.map((p) => [
                  p.code,
                  p.name,
                  p.clientName,
                  p.status,
                  `${p.completedTasks}/${p.totalTasks}`,
                  `${p.hoursLogged}h`,
                  `${p.progressPercent}%`,
                ]),
              });
            }}
          >
            <Download className="h-4 w-4" /> Delivery PDF
          </Button>
          <Button variant="secondary" onClick={exportTimesheetCsv} disabled={!data?.timesheetSummary?.length}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="secondary" onClick={exportCsv} disabled={!data}>
            <Download className="h-4 w-4" /> Delivery CSV
          </Button>
        </div>
      </header>

      {loading || !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Average project completion"
              value={`${Math.round(
                data.projectProgress.reduce((s, p) => s + p.progressPercent, 0) /
                  Math.max(1, data.projectProgress.length),
              )}%`}
              hint="Across active portfolio"
              icon={<FolderKanban className="h-4 w-4" />}
            />
            <StatCard
              label="Billable hours logged"
              value={`${(data.totalBillableMinutes / 60).toFixed(1)}h`}
              hint="Verified client delivery"
              icon={<Clock className="h-4 w-4" />}
            />
            <StatCard
              label="Total contracted budget"
              value={`LKR ${(
                data.projectProgress.reduce((s, p) => s + p.budget, 0) / 1_000_000
              ).toFixed(1)}M`}
              hint="Active client contracts"
              icon={<BarChart3 className="h-4 w-4" />}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Project completion (%)"
                description="Delivery progress across active projects."
              />
              <div className="flex h-64 flex-col justify-center gap-3 overflow-y-auto p-5">
                {data.projectProgress.length === 0 ? (
                  <p className="text-center text-xs text-muted">No active projects yet.</p>
                ) : (
                  data.projectProgress.map((entry) => (
                    <div key={entry.id} className="grid grid-cols-[96px_1fr_42px] items-center gap-3 text-xs">
                      <span className="truncate font-mono font-medium text-muted" title={entry.name}>
                        {entry.code}
                      </span>
                      <div className="h-4 w-full overflow-hidden rounded-r-md bg-canvas">
                        <div
                          className="h-full rounded-r-md bg-[#D5A52E] transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, entry.progressPercent))}%` }}
                        />
                      </div>
                      <span className="text-right font-semibold tabular-nums text-text">
                        {entry.progressPercent}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Tasks by workflow stage"
                description="Distribution of tasks across Kanban columns."
              />
              <div className="flex h-64 flex-col justify-center gap-3 p-5">
                {(() => {
                  const maxCount = Math.max(...data.tasksByStatus.map((s) => s.count), 1);
                  return data.tasksByStatus.map((stage) => {
                    const pct = Math.round((stage.count / maxCount) * 100);
                    return (
                      <div key={stage.status} className="grid grid-cols-[110px_1fr_36px] items-center gap-3 text-xs">
                        <span className="truncate font-medium text-muted">{stage.status}</span>
                        <div className="h-4 w-full overflow-hidden rounded-r-md bg-canvas">
                          <div
                            className="h-full rounded-r-md bg-[#D5A52E] transition-all duration-300"
                            style={{ width: `${stage.count > 0 ? Math.max(pct, 6) : 0}%` }}
                          />
                        </div>
                        <span className="text-right font-semibold tabular-nums text-text">{stage.count}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </Card>
          </div>

          {data.timesheetSummary && data.timesheetSummary.length > 0 && (
            <Card>
              <CardHeader
                title="Employee Timesheet, Overtime & Attendance Report"
                description="Regular vs Overtime (>8h/day), Billable, Approved, Break & GPS-verified breakdown."
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-5 py-3 text-right">Total</th>
                      <th className="px-5 py-3 text-right">Regular</th>
                      <th className="px-5 py-3 text-right">Overtime</th>
                      <th className="px-5 py-3 text-right">Billable</th>
                      <th className="px-5 py-3 text-right">Approved</th>
                      <th className="px-5 py-3 text-right">Breaks</th>
                      <th className="px-5 py-3 text-right">Late / GPS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.timesheetSummary.map((r) => (
                      <tr key={r.userId} className="hover:bg-canvas/40">
                        <td className="px-5 py-3.5 font-medium text-ink">{r.userName}</td>
                        <td className="px-5 py-3.5 text-right font-mono text-xs font-semibold">
                          {(r.totalMinutes / 60).toFixed(1)}h
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-xs text-muted">
                          {(r.regularMinutes / 60).toFixed(1)}h
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-xs">
                          {r.overtimeMinutes > 0 ? (
                            <Badge tone="warning">{(r.overtimeMinutes / 60).toFixed(1)}h OT</Badge>
                          ) : (
                            <span className="text-muted">0.0h</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-xs text-success">
                          {(r.billableMinutes / 60).toFixed(1)}h
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-xs">
                          {(r.approvedMinutes / 60).toFixed(1)}h
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-xs text-muted">
                          {r.breakMinutes}m
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs">
                          <span className="text-muted">{r.lateCount} late · </span>
                          <span className="font-semibold text-gold-strong dark:text-gold">{r.gpsVerifiedCount} GPS</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Project delivery & budget summary"
              description="Detailed breakdown included in CSV exports."
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[740px] text-left text-sm">
                <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-5 py-3">Code & Project</th>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Tasks</th>
                    <th className="px-5 py-3">Hours</th>
                    <th className="px-5 py-3">Budget</th>
                    <th className="px-5 py-3 text-right">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.projectProgress.map((p) => (
                    <tr key={p.id} className="hover:bg-canvas/40">
                      <td className="px-5 py-3.5">
                        <p className="font-mono text-xs text-muted">{p.code}</p>
                        <p className="font-medium text-ink">{p.name}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted">{p.clientName}</td>
                      <td className="px-5 py-3.5">
                        <Badge tone="gold">{p.status}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        {p.completedTasks}/{p.totalTasks}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs">{p.hoursLogged}h</td>
                      <td className="px-5 py-3.5 text-xs">LKR {p.budget.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-right font-semibold">{p.progressPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── 4. AUDIT LOGS PAGE (/audit-logs) ────────────────────────────────────────

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { fullName: string } | null;
}

export function AuditLogsView() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api<AuditRow[]>('/audit-logs')
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.entityType.toLowerCase().includes(q) ||
      (l.actor?.fullName.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Security Audit Logs</h2>
        <p className="mt-1 text-sm text-muted">
          Append-only record of authentication events, role assignments and workspace modifications.
        </p>
      </header>

      <Card className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Filter audit trail by action (e.g. LOGIN_SUCCESS), actor or entity…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="p-6">
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Timestamp (Asia/Colombo)</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Entity</th>
                  <th className="px-5 py-3">IP & Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-xs text-muted">
                      No security audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-canvas/40">
                    <td className="px-5 py-3.5 font-mono text-xs text-muted">
                      {new Date(row.createdAt).toLocaleString('en-LK', {
                        dateStyle: 'medium',
                        timeStyle: 'medium',
                        timeZone: 'Asia/Colombo',
                      })}
                    </td>
                    <td className="px-5 py-3.5 font-medium">
                      {row.actor?.fullName ?? 'System'}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge
                        tone={
                          row.action.includes('FAILED') || row.action.includes('LOCKED')
                            ? 'danger'
                            : 'gold'
                        }
                      >
                        {row.action}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <span className="font-medium text-ink">{row.entityType}</span>
                      {row.entityId && (
                        <span className="ml-1 font-mono text-muted">({row.entityId})</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted">
                      {row.ipAddress ?? '127.0.0.1'}
                      {row.metadata ? ` · ${JSON.stringify(row.metadata)}` : ''}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── 5. SETTINGS & RBAC MATRIX PAGE (/settings) ──────────────────────────────

interface SettingsPayload {
  settings: {
    name: string;
    slug: string;
    timezone: string;
    workDayStart: string;
    workDayEnd: string;
    idleTimeoutMinutes: number;
    enforceSingleTimer: boolean;
    requirePasswordRotationDays: number;
    officeLatitude?: number;
    officeLongitude?: number;
    officeRadiusMeters?: number;
  };
  roleMatrix: Record<Role, string[]>;
  permissionCatalog: string[];
  tierAccessMatrix?: Array<{
    tier: string;
    roles: string;
    legalGovernance: string;
    systemSettings: string;
    financialsPayroll: string;
    hrAttendance: string;
    projectsTasks: string;
    codeDeployments: string;
  }>;
}

const ROLES_ORDER: Role[] = ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'];

export function SettingsView() {
  const { lang } = useLang();
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Colombo');
  const [workDayStart, setWorkDayStart] = useState('08:30');
  const [workDayEnd, setWorkDayEnd] = useState('17:30');
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState('10');
  const [officeLatitude, setOfficeLatitude] = useState('6.9271');
  const [officeLongitude, setOfficeLongitude] = useState('79.8612');
  const [officeRadiusMeters, setOfficeRadiusMeters] = useState('250');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<SettingsPayload>('/settings');
    setData(res);
    setName(res.settings.name);
    setTimezone(res.settings.timezone);
    setWorkDayStart(res.settings.workDayStart);
    setWorkDayEnd(res.settings.workDayEnd);
    setIdleTimeoutMinutes(String(res.settings.idleTimeoutMinutes));
    setOfficeLatitude(String(res.settings.officeLatitude ?? 6.9271));
    setOfficeLongitude(String(res.settings.officeLongitude ?? 79.8612));
    setOfficeRadiusMeters(String(res.settings.officeRadiusMeters ?? 250));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function useCurrentGpsForOffice() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOfficeLatitude(pos.coords.latitude.toFixed(6));
        setOfficeLongitude(pos.coords.longitude.toFixed(6));
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function saveOrgSettings(e: FormEvent) {
    e.preventDefault();
    await put('/settings', {
      name,
      timezone,
      workDayStart,
      workDayEnd,
      idleTimeoutMinutes: Number(idleTimeoutMinutes),
      officeLatitude: Number(officeLatitude),
      officeLongitude: Number(officeLongitude),
      officeRadiusMeters: Number(officeRadiusMeters),
    });
    setSavedNotice('Organization profile, working policies, and office geofence saved.');
    setTimeout(() => setSavedNotice(null), 3000);
    await load();
  }

  async function toggleRolePermission(role: Role, permKey: string) {
    if (!data || role === 'SUPER_ADMIN') return;
    const current = new Set(data.roleMatrix[role] ?? []);
    if (current.has(permKey)) current.delete(permKey);
    else current.add(permKey);
    await put('/settings/role-permissions', { role, permissions: [...current] });
    setSavedNotice(`Updated default permissions for ${ROLE_LABELS[role][lang]}.`);
    setTimeout(() => setSavedNotice(null), 3000);
    await load();
  }

  if (!data) {
    return <Skeleton className="h-72 rounded-2xl" />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Settings & Role Permissions</h2>
        <p className="mt-1 text-sm text-muted">
          Company profile, working schedule policies and the global Role → Permission matrix.
        </p>
      </header>

      {savedNotice && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {savedNotice}
        </div>
      )}

      <Card>
        <CardHeader
          title="Organization profile & work policy"
          description="Applies across attendance, time tracking and reporting."
        />
        <form onSubmit={saveOrgSettings} className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company name" htmlFor="st-name">
              <Input
                id="st-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Default timezone" htmlFor="st-tz">
              <Select id="st-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                <option value="Asia/Colombo">Asia/Colombo (GMT+05:30)</option>
                <option value="UTC">UTC</option>
                <option value="Europe/London">Europe/London</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Workday start" htmlFor="st-start">
              <Input
                id="st-start"
                type="time"
                value={workDayStart}
                onChange={(e) => setWorkDayStart(e.target.value)}
              />
            </Field>
            <Field label="Workday end" htmlFor="st-end">
              <Input
                id="st-end"
                type="time"
                value={workDayEnd}
                onChange={(e) => setWorkDayEnd(e.target.value)}
              />
            </Field>
            <Field label="Idle timeout (minutes)" htmlFor="st-idle">
              <Input
                id="st-idle"
                type="number"
                min={5}
                max={60}
                value={idleTimeoutMinutes}
                onChange={(e) => setIdleTimeoutMinutes(e.target.value)}
              />
            </Field>
          </div>
          <div className="rounded-2xl border border-line/70 bg-canvas/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                  Office HQ Geofence Zone
                </h4>
                <p className="text-xs text-muted">
                  Coordinates and radius used to verify In-Zone vs Outside-Zone GPS attendance.
                </p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={useCurrentGpsForOffice}>
                Use My Current GPS
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Office Latitude" htmlFor="st-lat">
                <Input
                  id="st-lat"
                  type="number"
                  step="any"
                  value={officeLatitude}
                  onChange={(e) => setOfficeLatitude(e.target.value)}
                />
              </Field>
              <Field label="Office Longitude" htmlFor="st-lon">
                <Input
                  id="st-lon"
                  type="number"
                  step="any"
                  value={officeLongitude}
                  onChange={(e) => setOfficeLongitude(e.target.value)}
                />
              </Field>
              <Field label="Geofence Radius (meters)" htmlFor="st-rad">
                <Input
                  id="st-rad"
                  type="number"
                  min={25}
                  max={10000}
                  value={officeRadiusMeters}
                  onChange={(e) => setOfficeRadiusMeters(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit">Save settings</Button>
          </div>
        </form>
      </Card>

      {data.tierAccessMatrix && data.tierAccessMatrix.length > 0 && (
        <Card>
          <CardHeader
            title="6-Tier Enterprise Access Control Matrix"
            description="Role hierarchy and domain access rules across Legal, System, Financials, HR, Projects, and Code & Deployments."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="bg-canvas/60 uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Tier / Level</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Legal & Governance</th>
                  <th className="px-4 py-3">System & Settings</th>
                  <th className="px-4 py-3">Financials & Payroll</th>
                  <th className="px-4 py-3">HR & Attendance</th>
                  <th className="px-4 py-3">Projects & Tasks</th>
                  <th className="px-4 py-3">Code & Deployments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.tierAccessMatrix.map((row) => (
                  <tr key={row.tier} className="hover:bg-canvas/40">
                    <td className="px-4 py-3 font-semibold text-ink">{row.tier}</td>
                    <td className="px-4 py-3 font-medium text-gold-strong">{row.roles}</td>
                    <td className="px-4 py-3 text-muted">{row.legalGovernance}</td>
                    <td className="px-4 py-3 text-muted">{row.systemSettings}</td>
                    <td className="px-4 py-3 text-muted">{row.financialsPayroll}</td>
                    <td className="px-4 py-3 text-muted">{row.hrAttendance}</td>
                    <td className="px-4 py-3 text-muted">{row.projectsTasks}</td>
                    <td className="px-4 py-3 text-muted">{row.codeDeployments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Role → Permission Matrix"
          description="Click any cell to grant or revoke a default permission for a role. Super Admin always holds all permissions."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-canvas/60 uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Permission Key</th>
                {ROLES_ORDER.map((r) => (
                  <th key={r} className="px-4 py-3 text-center">
                    {ROLE_LABELS[r][lang]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.permissionCatalog.map((perm) => (
                <tr key={perm} className="hover:bg-canvas/40">
                  <td className="px-4 py-2.5 font-mono font-medium text-ink">{perm}</td>
                  {ROLES_ORDER.map((role) => {
                    const enabled = data.roleMatrix[role]?.includes(perm);
                    const locked = role === 'SUPER_ADMIN';
                    return (
                      <td key={role} className="px-4 py-2.5 text-center">
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => toggleRolePermission(role, perm)}
                          className={cn(
                            'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors',
                            enabled
                              ? 'border-gold bg-gold/20 text-gold-strong'
                              : 'border-line bg-canvas text-transparent',
                            locked && 'cursor-not-allowed opacity-70',
                          )}
                          aria-label={`${perm} for ${role}`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

