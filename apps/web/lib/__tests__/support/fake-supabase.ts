// A stand-in for the Supabase client in server-action tests. It records every query
// (table, operation, filters, values) and RPC, and answers from a handler, so a test can
// check what an action asked for without a database or network (SQ-046).

export type Filter = [method: string, column: string, value?: unknown];

export type Call = {
  kind: 'table' | 'rpc' | 'storage';
  /** Table, RPC or bucket name. */
  name: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc' | 'remove' | 'createSignedUrl';
  filters: Filter[];
  values?: unknown;
  single?: boolean;
};

export type Reply = { data?: unknown; error?: { code?: string; message: string } | null; count?: number | null };
export type Handler = (call: Call) => Reply | undefined;

const WRITE_OPS = new Set(['insert', 'update', 'upsert', 'delete', 'rpc', 'remove']);

export const USER_ID = '11111111-1111-4111-8111-111111111111';

export function fakeSupabase({ user = { id: USER_ID }, handler }: { user?: { id: string } | null; handler?: Handler } = {}) {
  const calls: Call[] = [];
  const answer = (call: Call) => {
    calls.push(call);
    const reply = handler?.(call) ?? {};
    return { data: reply.data ?? null, error: reply.error ?? null, count: reply.count ?? null };
  };

  const builder = (name: string) => {
    const call: Call = { kind: 'table', name, op: 'select', filters: [] };
    let opSet = false;
    const setOp = (op: Call['op'], values?: unknown) => {
      // A `.select()` after a write only shapes what comes back.
      if (!opSet) {
        call.op = op;
        call.values = values;
        opSet = op !== 'select';
      }
      return chain;
    };
    const filter =
      (method: string) =>
      (column: string, value?: unknown) => {
        call.filters.push([method, column, value]);
        return chain;
      };
    const chain: Record<string, unknown> = {
      select: () => setOp('select'),
      insert: (v: unknown) => setOp('insert', v),
      update: (v: unknown) => setOp('update', v),
      upsert: (v: unknown) => setOp('upsert', v),
      delete: () => setOp('delete'),
      eq: filter('eq'),
      neq: filter('neq'),
      in: filter('in'),
      is: filter('is'),
      not: filter('not'),
      order: () => chain,
      limit: () => chain,
      range: () => chain,
      single: () => ((call.single = true), chain),
      maybeSingle: () => ((call.single = true), chain),
      then: (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(answer(call)).then(resolve, reject),
    };
    return chain;
  };

  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => builder(table),
    rpc: (name: string, args?: unknown) => Promise.resolve(answer({ kind: 'rpc', name, op: 'rpc', filters: [], values: args })),
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) =>
          Promise.resolve(answer({ kind: 'storage', name: bucket, op: 'remove', filters: [], values: paths })),
        createSignedUrl: (path: string) =>
          Promise.resolve(answer({ kind: 'storage', name: bucket, op: 'createSignedUrl', filters: [], values: path })),
      }),
    },
  };

  return {
    client,
    calls,
    /** Every call that could change data: table writes, RPCs and storage removals. */
    writes: () => calls.filter((c) => WRITE_OPS.has(c.op)),
    /** Table calls that aren't filtered to the signed-in user. */
    unscoped: () =>
      calls.filter((c) => c.kind === 'table' && !c.filters.some(([m, col, v]) => m === 'eq' && col === 'user_id' && v === user?.id)),
  };
}

/** A FormData from plain fields. */
export function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}
