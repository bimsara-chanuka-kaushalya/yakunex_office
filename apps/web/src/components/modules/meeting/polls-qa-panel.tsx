'use client';

import { useState, type FormEvent } from 'react';
import { BarChart3, CheckCircle2, HelpCircle, Plus, Send, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { MeetingPollItem, MeetingQaItem } from './meeting-types';

export function PollsQaPanel({
  polls,
  qaItems,
  currentUserId,
  canHostControl,
  onCreatePoll,
  onVotePoll,
  onClosePoll,
  onAskQuestion,
  onUpvoteQuestion,
  onAnswerQuestion,
}: {
  polls: MeetingPollItem[];
  qaItems: MeetingQaItem[];
  currentUserId: string;
  canHostControl: boolean;
  onCreatePoll: (question: string, options: string[], multipleChoice: boolean) => Promise<void>;
  onVotePoll: (pollId: string, optionIds: string[]) => Promise<void>;
  onClosePoll: (pollId: string) => Promise<void>;
  onAskQuestion: (question: string) => Promise<void>;
  onUpvoteQuestion: (qaId: string) => Promise<void>;
  onAnswerQuestion: (qaId: string, answerText: string) => Promise<void>;
}) {
  const [subTab, setSubTab] = useState<'polls' | 'qa'>('polls');
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [qaInput, setQaInput] = useState('');
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const submitPoll = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleaned.length < 2) return;
    setBusy(true);
    try {
      await onCreatePoll(question.trim(), cleaned, multipleChoice);
      setQuestion('');
      setOptions(['', '']);
      setMultipleChoice(false);
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  const submitQuestion = async (e: FormEvent) => {
    e.preventDefault();
    if (!qaInput.trim()) return;
    setBusy(true);
    try {
      await onAskQuestion(qaInput.trim());
      setQaInput('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="mx-3 mt-2.5 flex gap-1.5 rounded-full border border-white/12 bg-white/[0.04] p-1">
        <button
          type="button"
          onClick={() => setSubTab('polls')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold transition',
            subTab === 'polls' ? 'liquid-orb-gold' : 'text-white/65 hover:text-white',
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" /> Polls ({polls.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('qa')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold transition',
            subTab === 'qa' ? 'liquid-orb-gold' : 'text-white/65 hover:text-white',
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" /> Q&amp;A ({qaItems.length})
        </button>
      </div>

      {subTab === 'polls' ? (
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {canHostControl && !creating && (
            <button
              type="button"
              className="liquid-orb-gold flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Launch Spatial Poll
            </button>
          )}

          {creating && (
            <form
              onSubmit={submitPoll}
              className="liquid-orb space-y-2.5 rounded-2xl p-3"
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a poll question..."
                required
                className="w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-[#D4A843] focus:outline-none"
              />
              {options.map((opt, idx) => (
                <input
                  key={idx}
                  value={opt}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                  }
                  placeholder={`Option ${idx + 1}`}
                  required={idx < 2}
                  className="w-full rounded-lg border border-white/15 bg-black/25 px-2.5 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-[#D4A843] focus:outline-none"
                />
              ))}
              {options.length < 6 && (
                <button
                  type="button"
                  onClick={() => setOptions((prev) => [...prev, ''])}
                  className="text-[11px] font-semibold text-[#D4A843] hover:underline"
                >
                  + Add option
                </button>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-white/75">
                <input
                  type="checkbox"
                  checked={multipleChoice}
                  onChange={(e) => setMultipleChoice(e.target.checked)}
                />
                Allow multiple choices
              </label>
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="primary" disabled={busy} className="flex-1">
                  Launch Poll
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="border-white/15 bg-white/10 text-white"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {polls.length === 0 ? (
            <p className="py-10 text-center text-xs text-white/45">
              No live polls yet.{canHostControl ? ' Click "Create Live Poll" to start.' : ''}
            </p>
          ) : (
            polls.map((poll) => {
              const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);
              return (
                <div
                  key={poll.id}
                  className="space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-white">{poll.question}</p>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase',
                        poll.status === 'OPEN'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-white/10 text-white/50',
                      )}
                    >
                      {poll.status}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {poll.options.map((opt) => {
                      const voted = opt.votes.includes(currentUserId);
                      const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                      const toggleVote = () => {
                        if (poll.status !== 'OPEN') return;
                        if (poll.multipleChoice) {
                          const myCurrent = poll.options
                            .filter((o) => o.votes.includes(currentUserId))
                            .map((o) => o.id);
                          const next = voted
                            ? myCurrent.filter((id) => id !== opt.id)
                            : [...myCurrent, opt.id];
                          if (next.length > 0) void onVotePoll(poll.id, next);
                        } else {
                          void onVotePoll(poll.id, [opt.id]);
                        }
                      };
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={poll.status !== 'OPEN'}
                          onClick={toggleVote}
                          className={cn(
                            'relative w-full overflow-hidden rounded-lg border px-2.5 py-2 text-left text-xs transition',
                            voted
                              ? 'border-[#D4A843] bg-[#D4A843]/15 text-white'
                              : 'border-white/10 bg-black/25 text-white/85 hover:border-white/25',
                          )}
                        >
                          <div
                            className="pointer-events-none absolute inset-y-0 left-0 bg-[#D4A843]/20 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="relative flex items-center justify-between gap-2">
                            <span className="font-medium">{opt.label}</span>
                            <span className="font-mono text-[10px] text-white/70">
                              {opt.votes.length} ({pct}%)
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between pt-1 text-[10px] text-white/45">
                    <span>{totalVotes} total vote{totalVotes === 1 ? '' : 's'}</span>
                    {canHostControl && poll.status === 'OPEN' && (
                      <button
                        type="button"
                        onClick={() => void onClosePoll(poll.id)}
                        className="font-semibold text-rose-300 hover:underline"
                      >
                        End Poll
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
            {qaItems.length === 0 ? (
              <p className="py-10 text-center text-xs text-white/45">
                No questions yet. Ask a question below!
              </p>
            ) : (
              [...qaItems]
                .sort((a, b) => Number(a.answered) - Number(b.answered) || b.upvoterIds.length - a.upvoterIds.length)
                .map((qa) => {
                  const upvoted = qa.upvoterIds.includes(currentUserId);
                  return (
                    <div
                      key={qa.id}
                      className={cn(
                        'space-y-1.5 rounded-xl border p-2.5 text-xs',
                        qa.answered
                          ? 'border-emerald-500/25 bg-emerald-500/5'
                          : 'border-white/10 bg-white/[0.04]',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-semibold text-white/50">{qa.authorName}</p>
                          <p className="mt-0.5 text-white">{qa.question}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onUpvoteQuestion(qa.id)}
                          className={cn(
                            'flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition',
                            upvoted
                              ? 'bg-[#D4A843]/25 text-[#D4A843]'
                              : 'bg-white/10 text-white/70 hover:bg-white/15',
                          )}
                        >
                          <ThumbsUp className="h-3 w-3" /> {qa.upvoterIds.length}
                        </button>
                      </div>
                      {qa.answered && (
                        <div className="flex items-start gap-1.5 rounded-lg bg-emerald-500/15 px-2 py-1.5 text-[11px] text-emerald-200">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            <strong>{qa.answeredByName || 'Host'}:</strong> {qa.answerText}
                          </span>
                        </div>
                      )}
                      {canHostControl && !qa.answered && (
                        answeringId === qa.id ? (
                          <div className="flex gap-1.5 pt-1">
                            <input
                              value={answerDraft}
                              onChange={(e) => setAnswerDraft(e.target.value)}
                              placeholder="Type answer or leave blank for 'Answered live'"
                              className="flex-1 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-[11px] text-white outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                void onAnswerQuestion(qa.id, answerDraft.trim() || 'Answered live');
                                setAnsweringId(null);
                                setAnswerDraft('');
                              }}
                              className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-white"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAnsweringId(qa.id)}
                            className="text-[10px] font-semibold text-emerald-300 hover:underline"
                          >
                            Mark Answered / Reply
                          </button>
                        )
                      )}
                    </div>
                  );
                })
            )}
          </div>
          <form onSubmit={submitQuestion} className="p-2.5 pt-0">
            <div className="liquid-orb flex items-center gap-1.5 rounded-full p-1.5 pl-3.5">
              <input
                value={qaInput}
                onChange={(e) => setQaInput(e.target.value)}
                placeholder="Ask the studio a question..."
                className="flex-1 bg-transparent py-1 text-xs text-white placeholder:text-white/40 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !qaInput.trim()}
                className="liquid-orb-gold flex h-7 w-7 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
