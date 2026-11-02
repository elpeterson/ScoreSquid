// Postgres side of the crawl, connected as the limited be_crawler role through
// Supabase's transaction pooler (so no prepared statements, one connection per batch).

import postgres from 'postgres';
import type { CachedEvent, CachedTournament, CrawlStore, EntryRow, SearchRow } from './crawl';

type Row = {
  id: string;
  membership_number: string;
  archer_name: string;
  from_date: string;
  to_date: string;
  status: SearchRow['status'];
  tournaments_done: number;
  heartbeat_at: Date | null;
};

const SEARCH_COLUMNS = [
  'id',
  'membership_number',
  'archer_name',
  'from_date',
  'to_date',
  'status',
  'tournaments_done',
  'heartbeat_at',
] as const;

const toSearch = (r: Row): SearchRow => ({
  id: r.id,
  membershipNumber: r.membership_number,
  archerName: r.archer_name,
  fromDate: r.from_date,
  toDate: r.to_date,
  status: r.status,
  tournamentsDone: r.tournaments_done,
  heartbeatAt: r.heartbeat_at ? r.heartbeat_at.toISOString() : null,
});

export function connectCrawlStore(url: string): { store: CrawlStore; close: () => Promise<void> } {
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    ssl: url.includes('sslmode=disable') && process.env.NODE_ENV !== 'production' ? false : 'require',
    // Dates stay strings, as Between Ends' and the search's are compared as YYYY-MM-DD.
    types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } },
  });

  const store: CrawlStore = {
    async getSearch(id) {
      const [row] = await sql<Row[]>`select ${sql(SEARCH_COLUMNS)} from public.arch_be_searches where id = ${id}`;
      return row ? toSearch(row) : null;
    },
    async runningSearch() {
      const [row] = await sql<Row[]>`
        select ${sql(SEARCH_COLUMNS)} from public.arch_be_searches where status = 'running'`;
      return row ? toSearch(row) : null;
    },
    async claimNext() {
      try {
        const [row] = await sql<Row[]>`
          update public.arch_be_searches
          set status = 'running', heartbeat_at = now()
          where id = (
            select id from public.arch_be_searches
            where status = 'queued' order by created_at limit 1
          )
          returning ${sql(SEARCH_COLUMNS)}`;
        return row ? toSearch(row) : null;
      } catch (err) {
        // The one-running index: another run claimed a search first.
        if ((err as { code?: string }).code === '23505') return null;
        throw err;
      }
    },
    async takeOver(id, staleBefore) {
      const rows = await sql`
        update public.arch_be_searches set heartbeat_at = now()
        where id = ${id} and status = 'running'
          and (heartbeat_at is null or heartbeat_at < ${staleBefore})
        returning id`;
      return rows.length === 1;
    },
    async setTotal(id, total) {
      await sql`
        update public.arch_be_searches set tournaments_total = ${total}, heartbeat_at = now()
        where id = ${id} and status = 'running' returning id`;
    },
    async saveProgress(id, tournamentsDone) {
      const rows = await sql`
        update public.arch_be_searches set tournaments_done = ${tournamentsDone}, heartbeat_at = now()
        where id = ${id} and status = 'running' returning id`;
      return rows.length === 1;
    },
    async finish(id, status) {
      await sql`
        update public.arch_be_searches set status = ${status}, heartbeat_at = now()
        where id = ${id} and status = 'running' returning id`;
    },
    async getTournament(id) {
      const [t] = await sql<
        { name: string; start_date: string; source_updated_at: Date; etag: string | null }[]
      >`select name, start_date, source_updated_at, etag from public.be_tournaments where id = ${id}`;
      if (!t) return null;
      const events = await sql<
        { id: number; event_type: CachedEvent['eventType']; etag: string | null }[]
      >`select id, event_type, etag from public.be_events where tournament_id = ${id} order by id`;
      const cached: CachedTournament = {
        name: t.name,
        startDate: t.start_date,
        sourceUpdatedAt: t.source_updated_at.toISOString(),
        etag: t.etag,
        events: events.map((e) => ({ id: e.id, eventType: e.event_type, etag: e.etag })),
      };
      return cached;
    },
    async saveTournament(t) {
      await sql`
        insert into public.be_tournaments (id, name, start_date, source_updated_at, etag)
        values (${t.id}, ${t.name}, ${t.startDate}, ${t.sourceUpdatedAt}, ${t.etag})
        on conflict (id) do update set
          name = excluded.name, start_date = excluded.start_date,
          source_updated_at = excluded.source_updated_at, etag = excluded.etag, read_at = now()`;
    },
    async touchTournament(id, sourceUpdatedAt) {
      await sql`
        update public.be_tournaments set source_updated_at = ${sourceUpdatedAt}, read_at = now()
        where id = ${id}`;
    },
    async saveEventSummary(tournamentId, event) {
      await sql`
        insert into public.be_events (id, tournament_id, event_type)
        values (${event.id}, ${tournamentId}, ${event.eventType})
        on conflict (id) do update set
          tournament_id = excluded.tournament_id, event_type = excluded.event_type, read_at = now()`;
    },
    async replaceEntries(eventId, etag, entries) {
      await sql.begin(async (tx) => {
        await tx`update public.be_events set etag = ${etag}, read_at = now() where id = ${eventId}`;
        await tx`delete from public.be_entries where event_id = ${eventId}`;
        if (entries.length === 0) return;
        const rows = entries.map((e) => ({
          event_id: eventId,
          aid: e.aid,
          alt_raw: e.altRaw,
          alt_norm: e.altNorm,
          first_name: e.firstName,
          last_name: e.lastName,
          team: e.team,
          division_code: e.divisionCode,
          division_name: e.divisionName,
        }));
        await tx`insert into public.be_entries ${tx(rows)}`;
      });
    },
    async findMatches(eventId, number, name) {
      const rows = await sql<
        {
          aid: number;
          alt_raw: string;
          alt_norm: string | null;
          first_name: string;
          last_name: string;
          team: string;
          division_code: string;
          division_name: string | null;
        }[]
      >`
        select aid, alt_raw, alt_norm, first_name, last_name, team, division_code, division_name
        from public.be_entries
        where event_id = ${eventId}
          and (alt_norm = ${number}
            or (alt_norm is null
              and lower(regexp_replace(trim(first_name || ' ' || last_name), '\\s+', ' ', 'g')) = ${name}))`;
      return rows.map(
        (r): EntryRow => ({
          aid: r.aid,
          altRaw: r.alt_raw,
          altNorm: r.alt_norm,
          firstName: r.first_name,
          lastName: r.last_name,
          team: r.team,
          divisionCode: r.division_code,
          divisionName: r.division_name,
        }),
      );
    },
    async saveMatch(m) {
      await sql`
        insert into public.arch_be_search_matches
          (search_id, event_id, aid, match_kind, tournament_name, tournament_date, division, total, arrows)
        values (${m.searchId}, ${m.eventId}, ${m.aid}, ${m.matchKind}, ${m.tournamentName},
                ${m.tournamentDate}, ${m.division}, ${m.total}, ${m.arrows})
        on conflict (search_id, event_id, aid) do nothing`;
    },
  };

  return { store, close: () => sql.end({ timeout: 5 }) };
}
