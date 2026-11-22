'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Calendar,
  BarChart3,
  Check,
  CheckCheck,
  CheckSquare,
  Clock,
  Copy,
  Download,
  Edit2,
  FileDown,
  FolderKanban,
  Globe,
  Hash,
  KeyRound,
  Lock,
  MessageSquarePlus,
  MessagesSquare,
  Paperclip,
  Pin,
  Plus,
  Repeat,
  Reply,
  Search,
  Send,
  Shield,
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
import {
  downloadMeetingIcs,
  exportMeetingAttendancePdf,
  openGoogleCalendarInvite,
} from '@/components/modules/meeting/calendar-export';
import type { MeetingAccessPolicy } from '@/components/modules/meeting/meeting-types';
import { useAuth, useLang } from '@/components/providers';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, del, liveGet, patch, post, put } from '@/lib/api';
import { useLiveSync } from '@/lib/use-live-sync';
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
  const toast = useToast();
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
    try {
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to send message.');
    }
  }

  async function onCreateChannel(e: FormEvent) {
    e.preventDefault();
    try {
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
      toast.success(`Group #${created.name} created.`);
      await loadChannels();
      setActiveId(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to create group.');
    }
  }

  async function onStartDm(member: OrgMember) {
    try {
      const ch = await post<ChatChannel>('/chat/direct', {
        targetUserId: member.id,
        targetUserName: member.name,
      });
      setDmModalOpen(false);
      setDmSearch('');
      await loadChannels();
      setActiveId(ch.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to start direct message.');
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingMsg || !editText.trim()) return;
    try {
      await patch(`/chat/messages/${editingMsg.id}`, { body: editText });
      setEditingMsg(null);
      setEditText('');
      await loadMessages(activeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to edit message.');
    }
  }

  async function onDeleteMessage(msgId: string) {
    try {
      await del(`/chat/messages/${msgId}`);
      await loadMessages(activeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete message.');
    }
  }

  async function onReact(msgId: string, emoji: string) {
    try {
      await post(`/chat/messages/${msgId}/react`, { emoji });
      await loadMessages(activeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to add reaction.');
    }
  }

  async function onTogglePin(msgId: string) {
    try {
      await patch(`/chat/messages/${msgId}/pin`, {});
      await loadMessages(activeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update pin state.');
    }
  }

  async function onConvertToTask(msg: ChatMessage) {
    try {
      await post(`/chat/messages/${msg.id}/to-task`, {});
      setBanner(`Task created from message by ${msg.senderName}.`);
      toast.success('Task created from chat message.');
      await loadMessages(activeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to convert message to task.');
    }
  }

  async function onStartChannelMeeting() {
    if (!activeChannel) return;
    try {
      const mt = await post<MeetingRow>(`/chat/channels/${activeChannel.id}/meeting`, {
        title: `${activeChannel.name} Sync`,
        agenda: `Channel huddle for #${activeChannel.name}`,
      });
      setBanner(`Meeting started (${mt.roomCode}) — open Meetings to join.`);
      toast.success(`Meeting started (${mt.roomCode}).`);
      await loadMessages(activeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to start channel meeting.');
    }
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

const ROLE_AUDIENCE_OPTIONS = [
  { key: 'ALL', label: 'Everyone (All Roles)' },
  { key: 'SUPER_ADMIN', label: 'Super Admin / MD / CEO' },
  { key: 'ADMIN', label: 'Admin / C-Level / Legal' },
  { key: 'PROJECT_MANAGER', label: 'Management / HR / PM' },
  { key: 'STAFF', label: 'Core Staff / Engineers' },
  { key: 'INTERN', label: 'Interns / Trainees' },
] as const;

export function MeetingsView() {
  const { user } = useAuth();
  const toast = useToast();
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [policy, setPolicy] = useState<MeetingAccessPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<'closed' | 'instant' | 'schedule'>('closed');

  // Unified Instant + Schedule form state
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [recurrence, setRecurrence] = useState<'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('NONE');
  const [notes, setNotes] = useState('');
  const [meetingScope, setMeetingScope] = useState('INTERNAL');
  const [allowedRoles, setAllowedRoles] = useState<string[]>(['ALL']);
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [allowExternalGuests, setAllowExternalGuests] = useState(false);
  const [recordingAllowed, setRecordingAllowed] = useState(false);
  const [muteUponEntry, setMuteUponEntry] = useState(false);
  const [allowUnmuteSelf, setAllowUnmuteSelf] = useState(true);
  const [allowStartVideo, setAllowStartVideo] = useState(true);
  const [screenShareMode, setScreenShareMode] = useState<'ALL' | 'APPROVAL_REQUIRED' | 'HOST_ONLY'>('ALL');
  const [chatPermission, setChatPermission] = useState<'EVERYONE_DM' | 'EVERYONE_PUBLIC' | 'HOST_ONLY' | 'DISABLED'>('EVERYONE_DM');
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Join by room code & pre-join green room state
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [preJoin, setPreJoin] = useState<
    | { mode: 'existing'; meeting: MeetingRow }
    | { mode: 'instant'; title: string; agenda: string; config?: Record<string, unknown> }
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

  const openCreateModal = (mode: 'instant' | 'schedule') => {
    setJoinError(null);
    setModalMode(mode);
    if (mode === 'instant') {
      setTitle(`${user?.fullName ?? 'Team'}'s Instant Meeting`);
      setAgenda('Live video sync & screen share huddle');
      setRecurrence('NONE');
    } else {
      setTitle('');
      setAgenda('');
      setStartsAt(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
    }
    setPasscode('');
    setAllowedRoles(['ALL']);
    setWaitingRoomEnabled(false);
    setMuteUponEntry(false);
    setAllowUnmuteSelf(true);
    setAllowStartVideo(true);
    setScreenShareMode('ALL');
    setChatPermission('EVERYONE_DM');
    setAllowExternalGuests(false);
    setRecordingAllowed(Boolean(policy && policy.recordingScope !== 'NONE'));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, pol] = await Promise.all([
        liveGet<MeetingRow[]>('/meetings'),
        api<MeetingAccessPolicy>('/meetings/access-policy').catch(() => null),
      ]);
      setMeetings(list);
      if (pol) {
        setPolicy(pol);
        if (pol.allowedScopes.length > 0) {
          const preferred = pol.allowedScopes.includes('INTERNAL') ? 'INTERNAL' : pol.allowedScopes[0];
          setMeetingScope((prev) => (pol.allowedScopes.includes(prev) ? prev : preferred));
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
        await new Promise((r) => setTimeout(r, 4000));
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

  const openPendingMeetingTab = (): Window | null => {
    if (typeof window === 'undefined') return null;
    const tab = window.open('about:blank', '_blank');
    if (tab) {
      try {
        tab.document.write(
          '<!doctype html><html><head><title>Launching Yakunex Meet...</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#08090c;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif;font-size:14px;}</style></head><body>Launching Yakunex Meeting Studio...</body></html>',
        );
        tab.document.close();
      } catch {
        // Ignore cross-origin doc write restrictions
      }
      tab.focus();
    }
    return tab;
  };

  const openMeetingPopup = (params: Record<string, string>, existingTab?: Window | null): boolean => {
    if (typeof window === 'undefined') return false;
    const qs = new URLSearchParams(params).toString();
    const targetUrl = `${window.location.origin}/meet?${qs}`;
    if (existingTab && !existingTab.closed) {
      existingTab.location.href = targetUrl;
      existingTab.focus();
      return true;
    }
    const win = window.open(targetUrl, '_blank');
    if (win) {
      win.focus();
      return true;
    }
    return false;
  };

  const broadcastLocalAlert = () => {
    try {
      const bc = new BroadcastChannel('yakunex_live_alerts');
      bc.postMessage({ type: 'meeting-started' });
      bc.close();
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('yakunex:meeting-started'));
    }
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
    const preTab = openPendingMeetingTab();
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
          ...(preJoin.config ?? {}),
        });
        broadcastLocalAlert();
      } else {
        joined = await post<MeetingRow>(`/meetings/${preJoin.meeting.id}/join`, {
          micOn,
          camOn,
        });
      }
      setPreJoin(null);
      void load();
      if (
        !openMeetingPopup(
          {
            room: joined.roomCode,
            mic: String(micOn),
            cam: String(camOn),
            ...(micDeviceId ? { micId: micDeviceId } : {}),
            ...(camDeviceId ? { camId: camDeviceId } : {}),
            autojoin: '1',
          },
          preTab,
        )
      ) {
        setActiveSession({ room: joined, micOn, camOn, micDeviceId, camDeviceId });
      }
    } catch (err) {
      if (preTab && !preTab.closed) preTab.close();
      setJoinError(err instanceof Error ? err.message : 'Unable to enter meeting room.');
    } finally {
      setJoining(false);
    }
  };

  // Clean single-step Join by Code — always opens synchronously in a dedicated new browser tab
  const onJoinByCode = async (e: FormEvent) => {
    e.preventDefault();
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) return;
    setJoinError(null);
    setRoomCodeInput('');
    if (!openMeetingPopup({ room: code })) {
      setJoining(true);
      try {
        const match = await liveGet<MeetingRow>(`/meetings/by-code/${encodeURIComponent(code)}`);
        setPreJoin({ mode: 'existing', meeting: match });
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : 'Invalid meeting room code.');
      } finally {
        setJoining(false);
      }
    }
  };

  const onSubmitMeetingForm = async (e: FormEvent) => {
    e.preventDefault();
    if (modalMode === 'closed') return;
    const isInstant = modalMode === 'instant';
    // Open tab SYNCHRONOUSLY inside user click gesture so browser popup blockers NEVER block it
    const preTab = isInstant ? openPendingMeetingTab() : null;
    setCreatingRoom(true);
    setJoinError(null);
    try {
      const created = await post<MeetingRow>('/meetings', {
        title: title.trim() || `${user?.fullName ?? 'Team'}'s Meeting`,
        agenda: agenda.trim() || 'Live team sync & screen share huddle',
        startsAt: isInstant ? new Date().toISOString() : new Date(startsAt).toISOString(),
        durationMinutes,
        recurrence: isInstant ? 'NONE' : recurrence,
        notes,
        meetingScope,
        allowedRoles,
        waitingRoomEnabled,
        passcode: passcode.trim() || undefined,
        allowExternalGuests,
        recordingAllowed,
        muteUponEntry,
        allowUnmuteSelf,
        allowStartVideo,
        screenShareMode,
        chatPermission,
        instant: isInstant,
        micOn: true,
        camOn: true,
      });
      broadcastLocalAlert();
      setModalMode('closed');
      setTitle('');
      setAgenda('');
      setNotes('');
      setPasscode('');
      await load();
      if (isInstant) {
        if (
          !openMeetingPopup(
            {
              room: created.roomCode,
              mic: 'true',
              cam: 'true',
              autojoin: '1',
            },
            preTab,
          )
        ) {
          setActiveSession({ room: created, micOn: true, camOn: true });
        }
      }
    } catch (err) {
      if (preTab && !preTab.closed) preTab.close();
      setJoinError(err instanceof Error ? err.message : 'Unable to create meeting room.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const markCompleted = async (id: string) => {
    try {
      await patch(`/meetings/${id}`, { status: 'COMPLETED' });
      toast.success('Meeting ended.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to end meeting.');
    }
  };

  const copyInvite = async (mtg: MeetingRow) => {
    const url = `${window.location.origin}/meet?room=${mtg.roomCode}`;
    const text = mtg.passcode
      ? `Yakunex Hub Meeting: ${mtg.title}\nJoin Link: ${url}\nRoom Code: ${mtg.roomCode}\nPasscode: ${mtg.passcode}`
      : url;
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopiedId(mtg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportAttendance = async (mtg: MeetingRow) => {
    try {
      const report = await liveGet<{ entries?: MeetingRow['attendanceLog'] }>(
        `/meetings/${mtg.id}/attendance`,
      );
      exportMeetingAttendancePdf({
        meeting: mtg,
        entries: report?.entries,
        generatedByName: user?.fullName,
        generatedByEmail: user?.email,
      });
    } catch {
      exportMeetingAttendancePdf({
        meeting: mtg,
        generatedByName: user?.fullName,
        generatedByEmail: user?.email,
      });
    }
  };

  if (activeSession) {
    return (
      <MeetingStudio
        initialRoom={activeSession.room}
        initialMicOn={activeSession.micOn}
        initialCamOn={activeSession.camOn}
        initialMicId={activeSession.micDeviceId}
        initialCamId={activeSession.camDeviceId}
        policy={policy}
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
      {/* Zoom Workplace × Apple Ultra Pro Max Launch Deck */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#0F1219] via-[#131722] to-[#090B10] p-6 text-white shadow-2xl md:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#2D8CFF]/15 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 left-12 h-64 w-64 rounded-full bg-[#F97316]/10 blur-[100px]" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Zoom Iconic Squircle Launch Tiles */}
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2D8CFF]">
                Yakunex Workplace · Zoom Studio
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Meetings &amp; Live Video
              </h2>
              <p className="mt-1 text-xs text-white/60 sm:text-sm">
                Every session launches in a dedicated full-screen browser tab with end-to-end controls.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              {user?.role !== 'INTERN' && policy?.canCreate && (
                <>
                  <button
                    type="button"
                    onClick={() => openCreateModal('instant')}
                    className="group flex flex-col items-center gap-2 focus:outline-none"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-b from-[#FF7A2F] to-[#EA580C] text-white shadow-[0_12px_28px_-6px_rgba(234,88,12,0.55)] ring-1 ring-inset ring-white/25 transition duration-200 group-hover:-translate-y-0.5 group-hover:brightness-110 group-active:scale-95">
                      <Video className="h-7 w-7" />
                    </span>
                    <span className="text-xs font-semibold text-white/90">New Meeting</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openCreateModal('schedule')}
                    className="group flex flex-col items-center gap-2 focus:outline-none"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-b from-[#2D8CFF] to-[#0E71EB] text-white shadow-[0_12px_28px_-6px_rgba(14,113,235,0.5)] ring-1 ring-inset ring-white/25 transition duration-200 group-hover:-translate-y-0.5 group-hover:brightness-110 group-active:scale-95">
                      <Calendar className="h-7 w-7" />
                    </span>
                    <span className="text-xs font-semibold text-white/90">Schedule</span>
                  </button>
                </>
              )}

              {/* Direct Join by Code Apple Frosted Capsule */}
              <form
                onSubmit={onJoinByCode}
                className="flex flex-1 flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-2 backdrop-blur-xl sm:min-w-[300px]"
              >
                <div className="relative flex-1">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                  <input
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value)}
                    placeholder="Enter room code (YH-ROOM-...)"
                    className="h-11 w-full rounded-xl bg-black/35 pl-9 pr-3 font-mono text-xs uppercase text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#2D8CFF]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={joining || !roomCodeInput.trim()}
                  className="h-11 rounded-xl bg-[#2D8CFF] px-5 text-xs font-bold text-white shadow-lg shadow-[#2D8CFF]/25 transition hover:bg-[#3B96FF] disabled:opacity-40"
                >
                  Join in New Tab
                </button>
              </form>
            </div>
          </div>

          {/* Right: Live Apple Frosted Telemetry Pill Grid */}
          <div className="grid grid-cols-3 gap-2.5 lg:w-[320px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 backdrop-blur-xl">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Live Now</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-emerald-400">{liveCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 backdrop-blur-xl">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">In Call</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-white">{activePeople}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 backdrop-blur-xl">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Upcoming</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-[#2D8CFF]">
                {meetings.filter((m) => m.status === 'SCHEDULED').length}
              </p>
            </div>
          </div>
        </div>
      </section>

      {joinError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-500">
          {joinError}
        </div>
      )}

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
              : 'Start a new instant video meeting with full role & security settings, or schedule a recurring sync.'}
          </p>
          {user?.role !== 'INTERN' && policy?.canCreate && (
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button variant="primary" onClick={() => openCreateModal('instant')}>
                <Video className="h-4 w-4" /> Start Instant Meeting
              </Button>
              <Button variant="secondary" onClick={() => openCreateModal('schedule')}>
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
            const canEndThis =
              user?.role !== 'INTERN' &&
              (mtg.organizerId === user?.id ||
                (!mtg.organizerId && mtg.organizerName === user?.fullName) ||
                (mtg.coHostIds ?? []).includes(user?.id ?? '') ||
                user?.role === 'SUPER_ADMIN' ||
                user?.role === 'ADMIN' ||
                user?.role === 'PROJECT_MANAGER');
            const isEnded = mtg.status === 'COMPLETED' || mtg.status === 'CANCELLED';
            // Only hosts / managers can reopen an ended meeting (the API rejects everyone else).
            const canJoin = !isEnded || (mtg.status === 'COMPLETED' && canEndThis);

            return (
              <Card key={mtg.id} className="flex flex-col justify-between p-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
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
                      {mtg.waitingRoomEnabled && (
                        <Badge tone="neutral" className="gap-1">
                          <Shield className="h-3 w-3" /> Waiting Room
                        </Badge>
                      )}
                      {(mtg.hasPasscode ?? Boolean(mtg.passcode)) && (
                        <Badge tone="neutral" className="gap-1">
                          <Lock className="h-3 w-3" /> Passcode
                        </Badge>
                      )}
                      {mtg.allowExternalGuests && (
                        <Badge tone="gold" className="gap-1">
                          <Globe className="h-3 w-3" /> Guest Link
                        </Badge>
                      )}
                      {mtg.recurrence && mtg.recurrence !== 'NONE' && (
                        <Badge tone="neutral" className="gap-1">
                          <Repeat className="h-3 w-3" /> {mtg.recurrence}
                        </Badge>
                      )}
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
                      {mtg.status === 'CANCELLED'
                        ? 'Cancelled'
                        : mtg.status === 'COMPLETED'
                          ? 'Ended'
                          : inCallCount > 0
                            ? `${inCallCount} in call`
                            : 'Waiting to start'}
                    </span>
                    {mtg.allowedRoles && !mtg.allowedRoles.includes('ALL') && (
                      <span className="text-[11px] text-gold-strong dark:text-gold">
                        Roles: {mtg.allowedRoles.join(', ')}
                      </span>
                    )}
                  </div>

                  {mtg.notes && (
                    <div className="mt-3 rounded-xl bg-canvas px-3 py-2 text-xs text-muted">
                      <strong className="text-ink">Notes:</strong> {mtg.notes}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {canJoin && (
                      <a
                        href={`/meet?room=${encodeURIComponent(mtg.roomCode)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition',
                          isLive
                            ? 'bg-[#2D8CFF] text-white shadow-sm shadow-[#2D8CFF]/30 hover:bg-[#3B96FF]'
                            : 'border border-line bg-surface text-ink hover:bg-canvas',
                        )}
                      >
                        <Video className="h-3.5 w-3.5" />
                        {mtg.status === 'COMPLETED' ? 'Reopen & Join' : 'Join Meeting'}
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Download .ics Calendar Invite"
                      onClick={() => downloadMeetingIcs(mtg)}
                    >
                      <Calendar className="h-3.5 w-3.5" /> .ics
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Add to Google Calendar"
                      onClick={() => openGoogleCalendarInvite(mtg)}
                    >
                      GCal
                    </Button>
                    {canEndThis && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Export Attendance & Notes PDF"
                        onClick={() => void exportAttendance(mtg)}
                      >
                        <FileDown className="h-3.5 w-3.5" /> PDF
                      </Button>
                    )}
                  </div>
                  {canEndThis && mtg.status !== 'COMPLETED' && mtg.status !== 'CANCELLED' && (
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
        open={modalMode !== 'closed'}
        title={
          modalMode === 'instant'
            ? 'Start Instant Yakunex Meeting — Configure Access & Security'
            : 'Schedule Yakunex Meeting Room'
        }
        onClose={() => setModalMode('closed')}
      >
        <form onSubmit={onSubmitMeetingForm} className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
          {/* Quick Mode Switcher */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-ink/[0.05] p-1 text-xs dark:bg-white/[0.06]">
            <button
              type="button"
              onClick={() => setModalMode('instant')}
              className={cn(
                'rounded-lg py-1.5 font-semibold transition',
                modalMode === 'instant'
                  ? 'bg-gold text-slate-950 shadow-sm'
                  : 'text-muted hover:text-ink',
              )}
            >
              Start Instant Meeting Now
            </button>
            <button
              type="button"
              onClick={() => setModalMode('schedule')}
              className={cn(
                'rounded-lg py-1.5 font-semibold transition',
                modalMode === 'schedule'
                  ? 'bg-gold text-slate-950 shadow-sm'
                  : 'text-muted hover:text-ink',
              )}
            >
              Schedule for Later
            </button>
          </div>

          <Field label="Meeting title" htmlFor="mt-title">
            <Input
              id="mt-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Architecture Review & Sprint Demo"
            />
          </Field>

          {modalMode === 'schedule' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Date & time" htmlFor="mt-time">
                <Input
                  id="mt-time"
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </Field>
              <Field label="Duration (mins)" htmlFor="mt-dur">
                <Select
                  id="mt-dur"
                  value={String(durationMinutes)}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                >
                  <option value="30">30 mins</option>
                  <option value="45">45 mins</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                </Select>
              </Field>
              <Field label="Recurrence" htmlFor="mt-rec">
                <Select
                  id="mt-rec"
                  value={recurrence}
                  onChange={(e) =>
                    setRecurrence(e.target.value as 'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY')
                  }
                >
                  <option value="NONE">One-time</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="BIWEEKLY">Bi-Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </Select>
              </Field>
            </div>
          )}

          <Field label="Agenda / Description" htmlFor="mt-agenda">
            <Input
              id="mt-agenda"
              required
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Topics to cover & screen share walkthrough"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            {policy && policy.allowedScopes.length > 0 && (
              <Field label="Meeting Scope" htmlFor="mt-scope">
                <Select id="mt-scope" value={meetingScope} onChange={(e) => setMeetingScope(e.target.value)}>
                  {policy.allowedScopes.map((sc) => (
                    <option key={sc} value={sc}>{sc}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Passcode (Optional)" htmlFor="mt-passcode">
              <div className="flex gap-1.5">
                <Input
                  id="mt-passcode"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Leave blank or 6 digits"
                  maxLength={16}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setPasscode(String(Math.floor(100000 + Math.random() * 900000)))}
                >
                  Auto
                </Button>
              </div>
            </Field>
          </div>

          <Field label="Allowed Roles (Who can join & receive instant alert)" htmlFor="mt-audience">
            <div id="mt-audience" className="flex flex-wrap gap-1.5 pt-1">
              {ROLE_AUDIENCE_OPTIONS.map((opt) => {
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

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Screen Sharing Rule" htmlFor="mt-share-rule">
              <Select
                id="mt-share-rule"
                value={screenShareMode}
                onChange={(e) =>
                  setScreenShareMode(e.target.value as 'ALL' | 'APPROVAL_REQUIRED' | 'HOST_ONLY')
                }
              >
                <option value="ALL">Everyone (Interns request approval)</option>
                <option value="APPROVAL_REQUIRED">Host Approval Required for All</option>
                <option value="HOST_ONLY">Host &amp; Co-Host Only</option>
              </Select>
            </Field>
            <Field label="Chat Permission" htmlFor="mt-chat-perm">
              <Select
                id="mt-chat-perm"
                value={chatPermission}
                onChange={(e) =>
                  setChatPermission(
                    e.target.value as 'EVERYONE_DM' | 'EVERYONE_PUBLIC' | 'HOST_ONLY' | 'DISABLED',
                  )
                }
              >
                <option value="EVERYONE_DM">Everyone + Private DM</option>
                <option value="EVERYONE_PUBLIC">Everyone Public Only</option>
                <option value="HOST_ONLY">Host &amp; Co-Host Only</option>
                <option value="DISABLED">Chat Disabled</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-2 rounded-xl bg-ink/[0.04] p-3 text-xs sm:grid-cols-2 dark:bg-white/[0.06]">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={waitingRoomEnabled}
                onChange={(e) => setWaitingRoomEnabled(e.target.checked)}
              />
              <span>Enable Waiting Room (Admit / Deny)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={muteUponEntry}
                onChange={(e) => setMuteUponEntry(e.target.checked)}
              />
              <span>Mute Participants Upon Entry</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allowUnmuteSelf}
                onChange={(e) => setAllowUnmuteSelf(e.target.checked)}
              />
              <span>Allow Participants to Unmute Self</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allowStartVideo}
                onChange={(e) => setAllowStartVideo(e.target.checked)}
              />
              <span>Allow Participants to Start Video</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                disabled={!policy?.canInviteExternal}
                checked={allowExternalGuests}
                onChange={(e) => setAllowExternalGuests(e.target.checked)}
              />
              <span className={!policy?.canInviteExternal ? 'text-muted' : ''}>
                Allow External Guests (No Login)
                {policy && !policy.canInviteExternal ? ' — Restricted' : ''}
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
                Allow Meeting Recording
                {policy?.recordingScope === 'NONE' ? ' — Restricted' : ''}
              </span>
            </label>
          </div>

          <Field label="Initial notes / action items" htmlFor="mt-notes">
            <Input
              id="mt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional pre-meeting notes or agenda links"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setModalMode('closed')}>
              Cancel
            </Button>
            <Button type="submit" disabled={creatingRoom}>
              {creatingRoom
                ? 'Starting...'
                : modalMode === 'instant'
                  ? 'Start Instant Meeting & Notify'
                  : 'Create Scheduled Meeting'}
            </Button>
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

  const load = useCallback(async () => {
    try {
      const res = await api<ReportsData>('/reports/summary');
      setData(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveSync(load);

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

  const load = useCallback(async () => {
    try {
      const res = await api<AuditRow[]>('/audit-logs');
      setLogs(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveSync(load);

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
  const toast = useToast();
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

  useLiveSync(load);

  function useCurrentGpsForOffice() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Geolocation is not supported in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOfficeLatitude(pos.coords.latitude.toFixed(6));
        setOfficeLongitude(pos.coords.longitude.toFixed(6));
        toast.success('Office GPS coordinates captured.');
      },
      (err) => {
        toast.error(err.message || 'Location permission denied.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function saveOrgSettings(e: FormEvent) {
    e.preventDefault();
    try {
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
      toast.success('Organization settings saved.');
      setTimeout(() => setSavedNotice(null), 3000);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save settings.');
    }
  }

  async function toggleRolePermission(role: Role, permKey: string) {
    if (!data || role === 'SUPER_ADMIN') return;
    try {
      const current = new Set(data.roleMatrix[role] ?? []);
      if (current.has(permKey)) current.delete(permKey);
      else current.add(permKey);
      await put('/settings/role-permissions', { role, permissions: [...current] });
      setSavedNotice(`Updated default permissions for ${ROLE_LABELS[role][lang]}.`);
      toast.success(`Updated permissions for ${ROLE_LABELS[role][lang]}.`);
      setTimeout(() => setSavedNotice(null), 3000);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update role permissions.');
    }
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

