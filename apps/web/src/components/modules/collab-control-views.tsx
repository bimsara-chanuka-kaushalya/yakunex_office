'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BarChart3,
  Check,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { api, del, liveGet, patch, post, put } from '@/lib/api';
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
}

interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: string;
  title?: string;
  department?: string;
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
    api<{ items?: Array<{ id: string; fullName?: string; name?: string; email: string; role: string; title?: string; department?: string }> } | OrgMember[]>(
      '/users?page=1&pageSize=100',
    )
      .then((res) => {
        const raw = Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : [];
        setMembers(
          raw.map((u) => ({
            id: u.id,
            name: ('fullName' in u && u.fullName) ? u.fullName : ('name' in u && u.name) ? u.name : u.email,
            email: u.email,
            role: u.role,
            title: u.title,
            department: u.department,
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

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await post(`/chat/channels/${activeId}/messages`, {
      body: text,
      replyToId: replyTo?.id,
    });
    setText('');
    setReplyTo(null);
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Yakunex Hub — Team Chat</h2>
          <p className="mt-1 text-sm text-muted">
            Role-based organization channels, confidential groups, direct messages, threads &amp; quick actions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setDmModalOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" /> Direct message
          </Button>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Create group
          </Button>
        </div>
      </header>

      {banner && (
        <div className="flex items-center justify-between rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-medium text-ink">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner(null)} className="text-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card className="grid min-h-[600px] overflow-hidden md:grid-cols-[280px_1fr]">
        <aside className="flex flex-col border-b border-line bg-canvas/50 p-3 md:border-b-0 md:border-r">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
            <Input
              className="pl-8 text-xs"
              placeholder="Filter channels…"
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {CHANNEL_CATEGORIES.map((cat) => {
              const items = filteredChannels.filter((c) => normalizeChannelCategory(c) === cat.key);
              if (items.length === 0) return null;
              return (
                <div key={cat.key}>
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {cat.label} ({items.length})
                  </p>
                  <ul className="space-y-0.5">
                    {items.map((ch) => (
                      <li key={ch.id}>
                        <button
                          type="button"
                          onClick={() => setActiveId(ch.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors',
                            ch.id === activeId
                              ? 'bg-gold/15 font-medium text-gold-strong'
                              : 'text-ink hover:bg-surface',
                          )}
                        >
                          {ch.privacy === 'CONFIDENTIAL' ? (
                            <Lock className="h-3.5 w-3.5 shrink-0 text-gold" />
                          ) : ch.type === 'DIRECT' ? (
                            <Users className="h-3.5 w-3.5 shrink-0 text-gold" />
                          ) : (
                            <Hash className="h-3.5 w-3.5 shrink-0 text-gold" />
                          )}
                          <span className="truncate">{ch.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {activeChannel?.privacy === 'CONFIDENTIAL' ? (
                  <Lock className="h-4 w-4 text-gold" />
                ) : (
                  <Hash className="h-4 w-4 text-gold" />
                )}
                <h3 className="font-semibold text-ink">{activeChannel?.name ?? 'general'}</h3>
                {activeChannel?.privacy && activeChannel.privacy !== 'PUBLIC' && (
                  <Badge tone="gold">{activeChannel.privacy}</Badge>
                )}
                {activeChannel?.projectName && (
                  <Badge tone="neutral">{activeChannel.projectName}</Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">{activeChannel?.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-44">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
                <Input
                  className="pl-8 text-xs"
                  placeholder="Search messages…"
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                />
              </div>
              <Button size="sm" variant="secondary" onClick={onStartChannelMeeting}>
                <Video className="h-3.5 w-3.5" /> Start Meeting
              </Button>
            </div>
          </div>

          {pinnedMessages.length > 0 && (
            <div className="border-b border-line bg-gold/5 px-5 py-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-gold-strong">
                <Pin className="h-3.5 w-3.5" />
                <span>Pinned ({pinnedMessages.length}):</span>
                <span className="truncate font-normal text-ink">{pinnedMessages[0].body}</span>
              </div>
            </div>
          )}

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {visibleMessages.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-muted">
                <MessagesSquare className="mb-2 h-8 w-8 text-muted/60" />
                <p className="text-sm font-semibold text-ink">
                  {msgSearch.trim()
                    ? 'No matching messages found'
                    : `No messages in #${activeChannel?.name ?? 'channel'} yet`}
                </p>
                <p className="mt-1 text-xs">Start the conversation by sending the first message below.</p>
              </div>
            ) : (
              visibleMessages.map((msg) => {
                const isOwn = user?.id === msg.senderId;
                return (
                  <div key={msg.id} className="group flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-semibold text-gold">
                      {(msg.senderName || 'U').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1 rounded-2xl border border-line bg-canvas/40 px-4 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-ink">{msg.senderName}</span>
                          <Badge>{ROLE_LABELS[msg.senderRole as Role]?.[lang] ?? msg.senderRole}</Badge>
                          <span className="text-[11px] text-muted">
                            {new Date(msg.createdAt).toLocaleTimeString('en-LK', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Asia/Colombo',
                            })}
                          </span>
                          {msg.editedAt && <span className="text-[10px] text-muted">(edited)</span>}
                          {msg.pinned && <Badge tone="gold">Pinned</Badge>}
                          {msg.linkedTaskId && <Badge tone="success">Task linked</Badge>}
                          {msg.linkedMeetingCode && <Badge tone="gold">Meeting {msg.linkedMeetingCode}</Badge>}
                        </div>

                        {!msg.deleted && (
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            {QUICK_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => onReact(msg.id, emoji)}
                                className="rounded px-1.5 py-0.5 text-xs hover:bg-surface"
                                title={`React ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setReplyTo(msg)}
                              className="rounded p-1 text-muted hover:bg-surface hover:text-ink"
                              title="Reply"
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onTogglePin(msg.id)}
                              className="rounded p-1 text-muted hover:bg-surface hover:text-ink"
                              title={msg.pinned ? 'Unpin' : 'Pin'}
                            >
                              <Pin className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onConvertToTask(msg)}
                              className="rounded p-1 text-muted hover:bg-surface hover:text-ink"
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
                                  className="rounded p-1 text-muted hover:bg-surface hover:text-ink"
                                  title="Edit"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteMessage(msg.id)}
                                  className="rounded p-1 text-muted hover:bg-surface hover:text-danger"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {msg.replyPreview && (
                        <div className="mt-1.5 rounded-lg border-l-2 border-gold bg-surface/60 px-2.5 py-1 text-xs text-muted">
                          {msg.replyPreview}
                        </div>
                      )}

                      {editingMsg?.id === msg.id ? (
                        <form onSubmit={onSaveEdit} className="mt-2 flex gap-2">
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
                        <p className={cn('mt-1 text-sm', msg.deleted ? 'italic text-muted' : 'text-ink')}>
                          {msg.body}
                        </p>
                      )}

                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(msg.reactions).map(([emoji, users]) =>
                            Array.isArray(users) && users.length > 0 ? (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => onReact(msg.id, emoji)}
                                className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs hover:border-gold"
                              >
                                <span>{emoji}</span>
                                <span className="font-mono text-[11px] text-muted">{users.length}</span>
                              </button>
                            ) : null,
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {replyTo && (
            <div className="flex items-center justify-between border-t border-line bg-surface/60 px-4 py-2 text-xs">
              <span className="truncate text-muted">
                Replying to <strong className="text-ink">{replyTo.senderName}</strong>: {replyTo.body}
              </span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-muted hover:text-ink">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <form onSubmit={onSend} className="flex gap-2 border-t border-line p-4">
            <Input
              placeholder={`Message #${activeChannel?.name ?? 'channel'}…`}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit">
              <Send className="h-4 w-4" /> Send
            </Button>
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
                  <div>
                    <p className="font-medium text-ink">{m.name}</p>
                    <p className="text-xs text-muted">{m.title ?? m.role}</p>
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

export function MeetingsView() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Schedule form state
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');

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
  } | null>(null);
  const handledUrlParamRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMeetings(await api<MeetingRow[]>('/meetings'));
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

  const confirmPreJoin = async ({ micOn, camOn }: { micOn: boolean; camOn: boolean }) => {
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
          autojoin: '1',
        })
      ) {
        setActiveSession({ room: joined, micOn, camOn });
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
            Start a new instant video meeting with screen sharing or schedule a sprint review room.
          </p>
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
                  {mtg.status !== 'COMPLETED' && mtg.status !== 'CANCELLED' && (
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
  totalBillableMinutes: number;
  totalNonBillableMinutes: number;
}

export function ReportsView() {
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Analytics & Reports</h2>
          <p className="mt-1 text-sm text-muted">
            Executive delivery metrics, billable hour utilization and defect distribution.
          </p>
        </div>
        <Button onClick={exportCsv} disabled={!data}>
          <Download className="h-4 w-4" /> Export CSV report
        </Button>
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
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<SettingsPayload>('/settings');
    setData(res);
    setName(res.settings.name);
    setTimezone(res.settings.timezone);
    setWorkDayStart(res.settings.workDayStart);
    setWorkDayEnd(res.settings.workDayEnd);
    setIdleTimeoutMinutes(String(res.settings.idleTimeoutMinutes));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveOrgSettings(e: FormEvent) {
    e.preventDefault();
    await put('/settings', {
      name,
      timezone,
      workDayStart,
      workDayEnd,
      idleTimeoutMinutes: Number(idleTimeoutMinutes),
    });
    setSavedNotice('Organization profile and working policies saved.');
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

