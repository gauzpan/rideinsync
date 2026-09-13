// Controllable stand-in for src/lib/supabase used by the unit-test bundler
// (scripts/test/run-unit-tests.mjs aliases ./supabase -> this module). It is
// NOT part of the app build: tsconfig only includes "src".
type Result = { data: unknown; error: { message: string } | null };

let membersResult: Result = { data: [], error: null };
let ridesResult: Result = { data: null, error: null };

export function __setMembers(r: Result) {
  membersResult = r;
}
export function __setRides(r: Result) {
  ridesResult = r;
}

// Chainable, awaitable query builder. Every chain method returns itself; the
// builder is thenable (resolves the preset result) and supports maybeSingle.
function builder(get: () => Result) {
  const p: any = {
    select: () => p,
    eq: () => p,
    in: () => p,
    limit: () => p,
    maybeSingle: () => Promise.resolve(get()),
    then: (res: any, rej: any) => Promise.resolve(get()).then(res, rej),
  };
  return p;
}

export type FakeChannel = {
  name: string;
  handlers: Array<(payload: unknown) => void>;
  subscribed: boolean;
  removed: boolean;
};

export const __channels: FakeChannel[] = [];

// The mock stands in for a live (fake) client, so mirror the real module's
// `supabaseConfigured` export (src/lib/supabase.ts) as configured. Without this
// export, any test that transitively imports sosDemo (e.g. via AppLayout ->
// lib/sos) fails the shared esbuild build with "No matching export".
export const supabaseConfigured = true;

export const supabase = {
  from(table: string) {
    return builder(() => (table === "ride_members" ? membersResult : ridesResult));
  },
  channel(name: string) {
    const ch: FakeChannel = { name, handlers: [], subscribed: false, removed: false };
    __channels.push(ch);
    const api: any = {
      on: (_evt: string, _cfg: unknown, cb: (payload: unknown) => void) => {
        ch.handlers.push(cb);
        return api;
      },
      subscribe: () => {
        ch.subscribed = true;
        return api;
      },
      __ch: ch,
    };
    return api;
  },
  removeChannel(api: any) {
    if (api?.__ch) api.__ch.removed = true;
  },
};

export function __reset() {
  membersResult = { data: [], error: null };
  ridesResult = { data: null, error: null };
  __channels.length = 0;
}
