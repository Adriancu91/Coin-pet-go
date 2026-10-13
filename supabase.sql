-- =====================================================================
-- Pocket Island Master — Supabase schema (real players only, no bots)
-- Applied to Supabase project "coin-pet-go".
-- To rebuild from scratch: Supabase → SQL Editor → paste → Run.
--
-- Accounts are nickname + password (bcrypt via pgcrypto) with session
-- tokens. Tables have RLS ON and NO policies: the browser can only use
-- the game functions below, which enforce every rule on the server.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- TABLES ----------------------------------------------------
create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  nickname      text not null check (nickname ~ '^[A-Za-z0-9_]{3,16}$'),
  pass_hash     text not null,
  gold          bigint not null default 0 check (gold >= 0),
  island_level  int not null default 1,
  pets          jsonb not null default '[]'::jsonb,
  failed_logins int not null default 0,
  locked_until  timestamptz,
  banned        boolean not null default false,   -- moderation: excluded from login, raids, friends, leaderboard
  last_seen     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create unique index if not exists players_nickname_lower_idx on public.players (lower(nickname));

create table if not exists public.sessions (
  token      text primary key,
  player_id  uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used  timestamptz not null default now(),
  revoked    boolean not null default false
);
create index if not exists sessions_player_idx on public.sessions (player_id);

create table if not exists public.saves (
  player_id  uuid primary key references public.players(id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.attacks (
  id         bigint generated always as identity primary key,
  attacker   uuid not null references public.players(id) on delete cascade,
  victim     uuid not null references public.players(id) on delete cascade,
  stolen     bigint not null,
  captured   jsonb,
  processed  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists attacks_victim_open_idx on public.attacks (victim) where not processed;
create index if not exists attacks_attacker_idx on public.attacks (attacker, created_at desc);

create table if not exists public.friendships (
  player_id  uuid not null references public.players(id) on delete cascade,
  friend_id  uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, friend_id)
);
create index if not exists friendships_friend_idx on public.friendships (friend_id);

create table if not exists public.gifts (
  id         bigint generated always as identity primary key,
  sender     uuid not null references public.players(id) on delete cascade,
  receiver   uuid not null references public.players(id) on delete cascade,
  amount     int not null default 10,
  claimed    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists gifts_receiver_open_idx on public.gifts (receiver) where not claimed;
create index if not exists gifts_sender_idx on public.gifts (sender, receiver, created_at desc);

create table if not exists public.tombola_tickets (
  round_id   bigint not null,
  player_id  uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, player_id)
);
create index if not exists tombola_tickets_player_idx on public.tombola_tickets (player_id);

create table if not exists public.tombola_draws (
  round_id     bigint primary key,
  players      int not null,
  pool         int not null,
  prize        int not null,
  winner_names text[] not null default '{}',
  refunded     boolean not null default false,
  drawn_at     timestamptz not null default now()
);

create table if not exists public.tombola_payouts (
  round_id  bigint not null,
  player_id uuid not null references public.players(id) on delete cascade,
  amount    int not null,
  kind      text not null check (kind in ('win','refund')),
  claimed   boolean not null default false,
  primary key (round_id, player_id)
);
create index if not exists tombola_payouts_player_open_idx on public.tombola_payouts (player_id) where not claimed;

-- RLS on, no policies: tables are invisible to the browser except through the functions below
alter table public.players         enable row level security;
alter table public.sessions        enable row level security;
alter table public.saves           enable row level security;
alter table public.attacks         enable row level security;
alter table public.friendships     enable row level security;
alter table public.gifts           enable row level security;
alter table public.tombola_tickets enable row level security;
alter table public.tombola_draws   enable row level security;
alter table public.tombola_payouts enable row level security;

-- ---------- HELPERS ---------------------------------------------------
create or replace function public.tombola_round() returns bigint
language sql stable set search_path = '' as $$
  select floor(extract(epoch from now()) * 1000 / 18000000)::bigint;
$$;

-- Resolve a session token to a player id (raises if invalid)
create or replace function public._me(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  update public.sessions s set last_used = now()
   where s.token = p_token and not s.revoked and s.last_used > now() - interval '60 days'
     and not exists (select 1 from public.players p where p.id = s.player_id and p.banned)
  returning s.player_id into v;
  if v is null then raise exception 'invalid session' using errcode = '28000'; end if;
  return v;
end $$;

create or replace function public._new_session(p_player uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.sessions (token, player_id) values (t, p_player);
  return t;
end $$;

-- ---------- ACCOUNTS --------------------------------------------------
create or replace function public.register(p_nick text, p_pass text) returns json
language plpgsql security definer set search_path = '' as $$
declare v uuid; n text := trim(p_nick);
begin
  if n !~ '^[A-Za-z0-9_]{3,16}$' then return json_build_object('ok', false, 'error', 'Nickname: 3–16 letters, digits or _'); end if;
  if length(coalesce(p_pass, '')) < 6 then return json_build_object('ok', false, 'error', 'Password: at least 6 characters'); end if;
  if exists (select 1 from public.players where lower(nickname) = lower(n)) then
    return json_build_object('ok', false, 'error', 'This nickname is already taken');
  end if;
  insert into public.players (nickname, pass_hash) values (n, extensions.crypt(p_pass, extensions.gen_salt('bf', 8)))
  returning id into v;
  return json_build_object('ok', true, 'token', public._new_session(v), 'id', v, 'nickname', n);
exception when unique_violation then
  return json_build_object('ok', false, 'error', 'This nickname is already taken');
end $$;

create or replace function public.login(p_nick text, p_pass text) returns json
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select * into p from public.players where lower(nickname) = lower(trim(p_nick));
  if not found or p.banned then return json_build_object('ok', false, 'error', 'Wrong nickname or password'); end if;
  if p.locked_until is not null and p.locked_until > now() then
    return json_build_object('ok', false, 'error', 'Too many attempts — try again in a few minutes');
  end if;
  if p.pass_hash <> extensions.crypt(coalesce(p_pass, ''), p.pass_hash) then
    update public.players
       set failed_logins = failed_logins + 1,
           locked_until = case when failed_logins + 1 >= 5 then now() + interval '10 minutes' else null end
     where id = p.id;
    return json_build_object('ok', false, 'error', 'Wrong nickname or password');
  end if;
  update public.players set failed_logins = 0, locked_until = null, last_seen = now() where id = p.id;
  return json_build_object('ok', true, 'token', public._new_session(p.id), 'id', p.id, 'nickname', p.nickname);
end $$;

create or replace function public.logout(p_token text) returns void
language sql security definer set search_path = '' as $$
  update public.sessions set revoked = true where token = p_token;
$$;

-- Profile + cloud save for the signed-in player
create or replace function public.get_me(p_token text) returns json
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._me(p_token);
begin
  return (select json_build_object('id', p.id, 'nickname', p.nickname, 'island_level', p.island_level,
                                   'save', (select s.state from public.saves s where s.player_id = p.id))
            from public.players p where p.id = me);
end $$;

-- Upload save + public card (gold / island / defending pets)
create or replace function public.push_save(p_token text, p_state jsonb, p_gold bigint, p_island int, p_pets jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._me(p_token);
begin
  if pg_column_size(p_state) > 262144 then raise exception 'save too large'; end if;
  insert into public.saves (player_id, state, updated_at) values (me, p_state, now())
    on conflict (player_id) do update set state = excluded.state, updated_at = now();
  update public.players
     set gold = greatest(0, coalesce(p_gold, 0)),
         island_level = greatest(1, coalesce(p_island, 1)),
         pets = case when jsonb_typeof(p_pets) = 'array' and jsonb_array_length(p_pets) <= 3 then p_pets else '[]'::jsonb end,
         last_seen = now()
   where id = me;
end $$;

-- ---------- RAIDS -----------------------------------------------------
-- Pick a random REAL player, steal 10–30% of their gold (× bet/2), 5% capture chance
create or replace function public.raid(p_token text, p_bet int default 1) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me      uuid := public._me(p_token);
  bet     int  := greatest(1, least(coalesce(p_bet, 1), 10));
  t       record;
  v_last  timestamptz;
  v_steal bigint;
  v_cap   jsonb := null;
begin
  select max(created_at) into v_last from public.attacks where attacker = me;
  if v_last is not null and v_last > now() - interval '2 seconds' then raise exception 'too fast'; end if;

  select id, nickname, gold, island_level, pets into t
    from public.players
   where id <> me and not banned and last_seen > now() - interval '30 days'
   order by (gold > 0) desc, random()
   limit 1;
  if not found then return json_build_object('found', false); end if;

  v_steal := least(t.gold, floor(t.gold * (0.10 + random() * 0.20) * greatest(1, bet / 2.0)))::bigint;
  if random() < 0.05 and jsonb_array_length(t.pets) > 0 then
    v_cap := t.pets -> floor(random() * jsonb_array_length(t.pets))::int;
  end if;

  update public.players set gold = greatest(0, gold - v_steal) where id = t.id;
  insert into public.attacks (attacker, victim, stolen, captured) values (me, t.id, v_steal, v_cap);

  return json_build_object('found', true, 'nickname', t.nickname, 'island_level', t.island_level,
                           'gold', t.gold, 'pets', t.pets, 'stolen', v_steal, 'captured', v_cap);
end $$;

-- Raids made against me (marks them as seen)
create or replace function public.ack_attacks(p_token text) returns json
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._me(p_token); res json;
begin
  with upd as (
    update public.attacks a set processed = true
     where a.victim = me and not a.processed
    returning a.attacker, a.stolen, a.created_at
  )
  select coalesce(json_agg(json_build_object('attacker_name', p.nickname, 'stolen', upd.stolen) order by upd.created_at), '[]'::json)
    into res
    from upd join public.players p on p.id = upd.attacker;
  return res;
end $$;

-- ---------- FRIENDS & GIFTS -------------------------------------------
create or replace function public.add_friend(p_token text, p_nick text) returns json
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._me(p_token); f uuid; n text;
begin
  select id, nickname into f, n from public.players where lower(nickname) = lower(trim(p_nick)) and not banned;
  if f is null then return json_build_object('ok', false, 'error', 'Player not found'); end if;
  if f = me then return json_build_object('ok', false, 'error', 'That is you!'); end if;
  insert into public.friendships (player_id, friend_id) values (me, f) on conflict do nothing;
  insert into public.friendships (player_id, friend_id) values (f, me) on conflict do nothing;
  return json_build_object('ok', true, 'nickname', n);
end $$;

create or replace function public.my_friends(p_token text) returns json
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._me(p_token);
begin
  return coalesce((
    select json_agg(json_build_object(
             'id', p.id, 'nickname', p.nickname, 'island_level', p.island_level, 'last_seen', p.last_seen,
             'last_sent', (select max(g.created_at) from public.gifts g where g.sender = me and g.receiver = p.id))
           order by p.last_seen desc)
      from public.friendships f join public.players p on p.id = f.friend_id
     where f.player_id = me and not p.banned), '[]'::json);
end $$;

create or replace function public.send_gift(p_token text, p_to uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._me(p_token);
begin
  if not exists (select 1 from public.friendships where player_id = me and friend_id = p_to) then
    return json_build_object('ok', false, 'error', 'Not your friend');
  end if;
  if exists (select 1 from public.gifts where sender = me and receiver = p_to and created_at > now() - interval '12 hours') then
    return json_build_object('ok', false, 'error', 'Already sent — wait 12h');
  end if;
  insert into public.gifts (sender, receiver, amount) values (me, p_to, 10);
  return json_build_object('ok', true);
end $$;

create or replace function public.claim_gifts(p_token text) returns json
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._me(p_token); res json;
begin
  with upd as (
    update public.gifts g set claimed = true
     where g.receiver = me and not g.claimed
    returning g.sender, g.amount
  )
  select coalesce(json_agg(json_build_object('sender_name', p.nickname, 'amount', upd.amount)), '[]'::json)
    into res from upd join public.players p on p.id = upd.sender;
  return res;
end $$;

-- ---------- TOMBOLA ---------------------------------------------------
create or replace function public.buy_ticket(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._me(p_token); n int;
begin
  insert into public.tombola_tickets (round_id, player_id) values (public.tombola_round(), me) on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Draw every finished round (idempotent; any client triggers it).
-- pool = players × 3; 3 winners each get (pool ÷ 3) × 10. Fewer than 3 players → tickets refunded.
create or replace function public.draw_tombola() returns void
language plpgsql security definer set search_path = '' as $$
declare r bigint; n int; pr int; names text[];
begin
  for r in
    select distinct t.round_id from public.tombola_tickets t
     where t.round_id < public.tombola_round()
       and not exists (select 1 from public.tombola_draws d where d.round_id = t.round_id)
     order by 1
  loop
    perform pg_advisory_xact_lock(r);
    if exists (select 1 from public.tombola_draws where round_id = r) then continue; end if;
    select count(*) into n from public.tombola_tickets where round_id = r;
    if n < 3 then
      insert into public.tombola_payouts (round_id, player_id, amount, kind)
        select r, player_id, 3, 'refund' from public.tombola_tickets where round_id = r;
      insert into public.tombola_draws (round_id, players, pool, prize, refunded) values (r, n, n * 3, 0, true);
    else
      pr := ((n * 3) / 3) * 10;
      insert into public.tombola_payouts (round_id, player_id, amount, kind)
        select r, w.player_id, pr, 'win'
          from (select player_id from public.tombola_tickets where round_id = r order by random() limit 3) w;
      select array_agg(p.nickname) into names
        from public.tombola_payouts tp join public.players p on p.id = tp.player_id
       where tp.round_id = r and tp.kind = 'win';
      insert into public.tombola_draws (round_id, players, pool, prize, winner_names) values (r, n, n * 3, pr, names);
    end if;
  end loop;
end $$;

create or replace function public.tombola_status(p_token text) returns json
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._me(p_token); cur bigint := public.tombola_round();
begin
  return json_build_object(
    'round',   cur,
    'players', (select count(*) from public.tombola_tickets where round_id = cur),
    'entered', exists (select 1 from public.tombola_tickets where round_id = cur and player_id = me),
    'names',   coalesce((select json_agg(p.nickname)
                           from (select player_id from public.tombola_tickets where round_id = cur
                                  order by created_at desc limit 30) t
                           join public.players p on p.id = t.player_id), '[]'::json),
    'last',    (select row_to_json(d) from public.tombola_draws d order by round_id desc limit 1)
  );
end $$;

create or replace function public.claim_tombola(p_token text) returns json
language plpgsql security definer set search_path = '' as $$
declare me uuid := public._me(p_token); res json;
begin
  with upd as (
    update public.tombola_payouts tp set claimed = true
     where tp.player_id = me and not tp.claimed
    returning tp.round_id, tp.amount, tp.kind
  )
  select coalesce(json_agg(row_to_json(upd)), '[]'::json) into res from upd;
  return res;
end $$;

-- ---------- LEADERBOARD -----------------------------------------------
create or replace function public.leaderboard() returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(x), '[]'::json) from (
    select nickname, island_level, gold, last_seen from public.players
     where not banned
     order by island_level desc, gold desc limit 20) x;
$$;

-- ---------- PERMISSIONS -----------------------------------------------
-- Internal helpers: never callable from the browser
revoke execute on function public._me(text), public._new_session(uuid) from public, anon, authenticated;
-- Game API: callable from the browser (each function checks the session token itself)
grant execute on function
  public.register(text, text), public.login(text, text), public.logout(text), public.get_me(text),
  public.push_save(text, jsonb, bigint, int, jsonb), public.raid(text, int), public.ack_attacks(text),
  public.add_friend(text, text), public.my_friends(text), public.send_gift(text, uuid), public.claim_gifts(text),
  public.buy_ticket(text), public.draw_tombola(), public.tombola_status(text), public.claim_tombola(text),
  public.leaderboard(), public.tombola_round()
to anon, authenticated;

-- ---------- MODERATION ------------------------------------------------
-- To remove a cheater from the game (run in SQL Editor):
--   update public.players set banned = true where nickname = 'TheirNick';

-- ---------- ADMIN (testing accounts) ----------------------------------
alter table public.players add column if not exists is_admin boolean not null default false;
-- get_me also returns 'is_admin'; raid() and leaderboard() skip admin accounts
-- (applied in migration "admin_flag"). Make someone admin:
--   update public.players set is_admin = true where nickname = 'Adrian91';
