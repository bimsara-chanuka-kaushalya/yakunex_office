/**
 * Three-way merge helpers for the workspace_state snapshot.
 *
 * The workspace keeps its collections in memory and persists them as one JSON
 * document. Several API instances (or overlapping requests in one instance) can
 * change that document at the same time. Instead of letting the last writer
 * overwrite everything, every load and every save merges three versions:
 *
 *   base   – the snapshot this instance last read from / wrote to the database
 *   local  – the in-memory state (base + this instance's unsaved changes)
 *   remote – the snapshot currently stored in the database
 *
 * Rule: anything this instance changed since `base` wins; everything else is
 * taken from `remote`. Arrays whose items all carry a string `id` are merged
 * item by item, plain objects key by key, anything else as a whole value.
 */

type Json = unknown;
type IdItem = Record<string, unknown>;

export function stableStringify(value: Json): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function deepClone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Identity of an array item: its `id`, or `userId` for per-person rows (participants etc.). */
function keyOf(item: unknown): string | null {
  if (!isPlainObject(item)) return null;
  if (typeof item.id === 'string' && item.id.length > 0) return `id:${item.id}`;
  if (typeof item.userId === 'string' && item.userId.length > 0) return `u:${item.userId}`;
  return null;
}

function isIdArray(value: unknown): value is IdItem[] {
  return Array.isArray(value) && value.every((item) => keyOf(item) !== null);
}

function isPrimitiveArray(value: unknown): value is Array<string | number | boolean> {
  return Array.isArray(value) && value.every((v) => ['string', 'number', 'boolean'].includes(typeof v));
}

/** Set-style merge for lists like votes, upvoterIds, readByIds, coHostIds. */
function mergePrimitiveArrays<T extends string | number | boolean>(base: T[], local: T[], remote: T[]): T[] {
  const added = local.filter((v) => !base.includes(v));
  const removed = new Set(base.filter((v) => !local.includes(v)));
  const out = remote.filter((v) => !removed.has(v));
  for (const v of added) if (!out.includes(v)) out.push(v);
  return out;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return stableStringify(a) === stableStringify(b);
}

function mergeIdArrays(base: IdItem[], local: IdItem[], remote: IdItem[]): IdItem[] {
  const k = (x: IdItem) => keyOf(x) as string;
  const baseObj = new Map(base.map((x) => [k(x), x]));
  const baseMap = new Map(base.map((x) => [k(x), stableStringify(x)]));
  const localMap = new Map(local.map((x) => [k(x), x]));
  const remoteMap = new Map(remote.map((x) => [k(x), x]));

  const resolve = (id: string): IdItem | undefined => {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    const localChanged = (l === undefined ? undefined : stableStringify(l)) !== b;
    const remoteChanged = (r === undefined ? undefined : stableStringify(r)) !== b;
    if (localChanged && remoteChanged && l !== undefined && r !== undefined && b !== undefined) {
      // Both sides edited the same item (e.g. two people toggling mic in one meeting on
      // different API instances): merge it field by field instead of dropping one edit.
      return mergeValue(baseObj.get(id), l, r) as IdItem;
    }
    if (localChanged) return l; // includes local creations and local deletions (undefined)
    // Local untouched: keep the local object identity when remote did not change either.
    if (l !== undefined && !remoteChanged) return l;
    return r;
  };

  const result: IdItem[] = [];
  const placed = new Set<string>();
  for (const r of remote) {
    if (placed.has(k(r))) continue;
    placed.add(k(r));
    const v = resolve(k(r));
    if (v !== undefined) result.push(v);
  }

  // Items that exist locally but not remotely: keep them next to their local predecessor
  // so that both `push` (append) and `unshift` (prepend) orderings are preserved.
  for (let i = 0; i < local.length; i += 1) {
    const item = local[i];
    if (placed.has(k(item))) continue;
    placed.add(k(item));
    const v = resolve(k(item));
    if (v === undefined) continue;
    let insertAt = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const idx = result.findIndex((x) => k(x) === k(local[j]));
      if (idx >= 0) {
        insertAt = idx + 1;
        break;
      }
    }
    result.splice(insertAt, 0, v);
  }
  return result;
}

function mergeRecords(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    const bHas = key in base;
    const lHas = key in local;
    const rHas = key in remote;
    if (!lHas) {
      // Deleted locally (or never known locally): keep remote only if remote changed it.
      if (rHas && (!bHas || !same(remote[key], base[key]))) out[key] = remote[key];
      continue;
    }
    if (!rHas) {
      // Deleted remotely: keep it only if this instance changed or created it.
      if (!bHas || !same(local[key], base[key])) out[key] = local[key];
      continue;
    }
    out[key] = mergeValue(bHas ? base[key] : undefined, local[key], remote[key]);
  }
  return out;
}

export function mergeValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (remote === undefined) return local;
  if (local === undefined) return remote;

  if (Array.isArray(local) && Array.isArray(remote)) {
    const baseArr = Array.isArray(base) ? base : [];
    if (local.length + remote.length > 0 && isIdArray(local) && isIdArray(remote) && isIdArray(baseArr)) {
      return mergeIdArrays(baseArr, local, remote);
    }
    if (same(local, base)) return remote;
    if (same(remote, base)) return local;
    if (isPrimitiveArray(local) && isPrimitiveArray(remote) && isPrimitiveArray(baseArr)) {
      return mergePrimitiveArrays(baseArr, local, remote);
    }
    return local;
  }

  if (isPlainObject(local) && isPlainObject(remote)) {
    return mergeRecords(isPlainObject(base) ? base : {}, local, remote);
  }

  return same(local, base) ? remote : local;
}

/** Merges every key of `remote` into `local`, returning the merged snapshot. */
export function mergeSnapshots(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = remote[key] === undefined ? local[key] : mergeValue(base[key], local[key], remote[key]);
  }
  return out;
}
