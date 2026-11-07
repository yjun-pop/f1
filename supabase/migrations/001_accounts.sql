-- Run once in the project's SQL Editor. Never put a service_role key in the browser.
begin;
create table if not exists public.driver_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(char_length(display_name) between 1 and 24),
 updated_at timestamptz not null default now()
);
create table if not exists public.race_records (
 user_id uuid not null references auth.users(id) on delete cascade,
 circuit_id text not null check(circuit_id in ('monza','silverstone','spa','monaco','suzuka','interlagos','singapore','montreal')),
 best_seconds numeric(10,3) not null check(best_seconds >= 10 and best_seconds <= 3600),
 updated_at timestamptz not null default now(),
 primary key(user_id,circuit_id)
);
create table if not exists public.career_saves (
 user_id uuid not null references auth.users(id) on delete cascade,
 slot smallint not null check(slot between 1 and 3),
 revision bigint not null default 1 check(revision>0),
 payload jsonb not null check(jsonb_typeof(payload)='object' and coalesce(payload->>'version'='1',false) and octet_length(payload::text)<=131072),
 updated_at timestamptz not null default now(),
 primary key(user_id,slot)
);
alter table public.driver_profiles enable row level security;
alter table public.race_records enable row level security;
alter table public.career_saves enable row level security;
revoke all on public.driver_profiles,public.race_records,public.career_saves from anon,authenticated;
grant select,insert,update on public.driver_profiles to authenticated;
grant select on public.race_records,public.career_saves to authenticated;
-- Only server functions can write race records or career saves.
create policy profiles_owner on public.driver_profiles for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy records_owner_read on public.race_records for select to authenticated using ((select auth.uid())=user_id);
create policy career_owner_read on public.career_saves for select to authenticated using ((select auth.uid())=user_id);
create or replace function public.record_best_lap(p_circuit text,p_seconds numeric)
returns public.race_records language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); saved public.race_records;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_seconds is null or p_seconds < 10 or p_seconds > 3600 then raise exception 'Invalid lap time' using errcode='22023';end if;
 insert into public.race_records(user_id,circuit_id,best_seconds) values(owner_id,p_circuit,p_seconds)
 on conflict(user_id,circuit_id) do update set best_seconds=least(public.race_records.best_seconds,excluded.best_seconds),updated_at=now()
 returning * into saved;return saved;
end;$$;
-- Optimistic concurrency: a stale device cannot silently overwrite a newer save.
create or replace function public.save_career(p_slot smallint,p_expected_revision bigint,p_payload jsonb)
returns public.career_saves language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();saved public.career_saves;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_expected_revision is null or p_expected_revision < 0 then raise exception 'Invalid revision' using errcode='22023';end if;
 if p_expected_revision=0 then
  insert into public.career_saves(user_id,slot,revision,payload) values(owner_id,p_slot,1,p_payload) on conflict do nothing returning * into saved;
 else
  update public.career_saves set payload=p_payload,revision=revision+1,updated_at=now() where user_id=owner_id and slot=p_slot and revision=p_expected_revision returning * into saved;
 end if;
 if saved.user_id is null then raise exception 'Save conflict' using errcode='23505';end if;
 return saved;
end;$$;
revoke all on function public.record_best_lap(text,numeric) from public,anon;
revoke all on function public.save_career(smallint,bigint,jsonb) from public,anon;
grant execute on function public.record_best_lap(text,numeric) to authenticated;
grant execute on function public.save_career(smallint,bigint,jsonb) to authenticated;
-- No email addresses or passwords are copied into public game data.
create or replace function public.create_driver_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.driver_profiles(user_id,display_name) values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),24),''),'드라이버')) on conflict do nothing;
 return new;
end;$$;
revoke all on function public.create_driver_profile() from public,anon,authenticated;
create trigger on_apex_user_created after insert on auth.users for each row execute function public.create_driver_profile();
commit;
