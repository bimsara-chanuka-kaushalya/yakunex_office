import { mergeSnapshots, mergeValue, stableStringify } from './workspace-state-merge';

describe('workspace_state three-way merge', () => {
  const keys = ['tasks', 'userProfiles', 'settings'] as const;

  it('keeps changes from both writers instead of last-write-wins', () => {
    const base = { tasks: [{ id: 't1', status: 'TODO' }, { id: 't2', status: 'TODO' }] };
    const local = { tasks: [{ id: 't1', status: 'COMPLETED' }, { id: 't2', status: 'TODO' }] };
    const remote = { tasks: [{ id: 't1', status: 'TODO' }, { id: 't2', status: 'BLOCKED' }] };
    const merged = mergeSnapshots(base, local, remote, keys) as { tasks: Array<{ id: string; status: string }> };
    expect(merged.tasks).toEqual([
      { id: 't1', status: 'COMPLETED' },
      { id: 't2', status: 'BLOCKED' },
    ]);
  });

  it('does not resurrect an item deleted locally when a stale snapshot is read', () => {
    const base = { tasks: [{ id: 't1' }, { id: 't2' }] };
    const local = { tasks: [{ id: 't2' }] }; // t1 deleted, not yet saved
    const remote = { tasks: [{ id: 't1' }, { id: 't2' }] }; // stale copy still has t1
    const merged = mergeSnapshots(base, local, remote, keys) as { tasks: Array<{ id: string }> };
    expect(merged.tasks.map((t) => t.id)).toEqual(['t2']);
  });

  it('applies deletions and creations made by another instance', () => {
    const base = { tasks: [{ id: 't1' }, { id: 't2' }] };
    const local = { tasks: [{ id: 't1' }, { id: 't2' }, { id: 'mine' }] };
    const remote = { tasks: [{ id: 'theirs' }, { id: 't2' }] };
    const merged = mergeSnapshots(base, local, remote, keys) as { tasks: Array<{ id: string }> };
    expect(merged.tasks.map((t) => t.id).sort()).toEqual(['mine', 't2', 'theirs']);
  });

  it('keeps newest-first ordering for items prepended locally', () => {
    const base = { tasks: [{ id: 'a' }] };
    const local = { tasks: [{ id: 'new' }, { id: 'a' }] };
    const remote = { tasks: [{ id: 'a' }] };
    const merged = mergeSnapshots(base, local, remote, keys) as { tasks: Array<{ id: string }> };
    expect(merged.tasks.map((t) => t.id)).toEqual(['new', 'a']);
  });

  it('merges profile records field by field', () => {
    const base = { userProfiles: { u1: { phone: '1', bankName: 'BOC' } } };
    const local = { userProfiles: { u1: { phone: '2', bankName: 'BOC' } } };
    const remote = { userProfiles: { u1: { phone: '1', bankName: 'HNB' }, u2: { phone: '9' } } };
    expect(mergeSnapshots(base, local, remote, keys).userProfiles).toEqual({
      u1: { phone: '2', bankName: 'HNB' },
      u2: { phone: '9' },
    });
  });

  it('merges two instances editing the same meeting (participants keyed by userId, votes as sets)', () => {
    const meeting = (participants: unknown[], votes: string[], title = 'Sync') => ({
      id: 'mtg_1',
      title,
      participants,
      polls: [{ id: 'poll_1', options: [{ id: 'opt_1', votes }] }],
    });
    const p = (userId: string, micOn: boolean) => ({ userId, micOn });
    const base = { meetings: [meeting([p('a', true), p('b', true)], [])] };
    // Instance 1: A mutes and votes. Instance 2: B mutes, C joins, B votes.
    const local = { meetings: [meeting([p('a', false), p('b', true)], ['a'])] };
    const remote = { meetings: [meeting([p('a', true), p('b', false), p('c', true)], ['b'])] };
    const merged = mergeSnapshots(base, local, remote, ['meetings']) as {
      meetings: Array<ReturnType<typeof meeting>>;
    };
    const m = merged.meetings[0];
    expect(m.participants).toEqual([p('a', false), p('b', false), p('c', true)]);
    expect(m.polls[0].options[0].votes.sort()).toEqual(['a', 'b']);
  });

  it('applies a removal from one side while the other side adds a different vote', () => {
    expect(mergeValue(['x', 'y'], ['y'], ['x', 'y', 'z'])).toEqual(['y', 'z']);
  });

  it('keeps local state when the remote snapshot lacks a key', () => {
    expect(mergeValue(undefined, [{ id: 'x' }], undefined)).toEqual([{ id: 'x' }]);
  });

  it('compares objects independently of key order (Postgres jsonb reorders keys)', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });
});
