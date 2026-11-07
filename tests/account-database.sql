-- Local PostgreSQL fixture: uses isolated test identities, not production accounts.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
\i /work/supabase/migrations/001_accounts.sql
insert into auth.users values ('11111111-1111-4111-8111-111111111111','{"display_name":"A"}'),('22222222-2222-4222-8222-222222222222','{"display_name":"B"}');
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.record_best_lap('monza',88.123);
select public.record_best_lap('monza',89);
do $$begin if (select best_seconds from public.race_records where circuit_id='monza')<>88.123 then raise exception 'A slower write replaced PB';end if;end$$;
select public.save_career(1::smallint,0,'{"version":1,"season":1}');
select public.save_career(1::smallint,1,'{"version":1,"season":2}');
do $$begin
 begin perform public.save_career(1::smallint,1,'{"version":1}');raise exception 'A stale write was accepted';exception when unique_violation then null;end;
 begin perform public.save_career(2::smallint,0,'{}');raise exception 'Missing version was accepted';exception when check_violation then null;end;
 begin perform public.record_best_lap('wrong-track',88);raise exception 'Invalid circuit accepted';exception when check_violation then null;end;
 begin perform public.record_best_lap('monza',-5);raise exception 'Invalid lap accepted';exception when invalid_parameter_value then null;end;
 begin insert into public.race_records values('22222222-2222-4222-8222-222222222222','monza',50,now());raise exception 'Direct record insert allowed';exception when insufficient_privilege then null;end;
 begin update public.career_saves set payload='{"version":1}';raise exception 'Direct career overwrite allowed';exception when insufficient_privilege then null;end;
end$$;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$begin
 if exists(select 1 from public.race_records) then raise exception 'B can read A record';end if;
 if exists(select 1 from public.career_saves) then raise exception 'B can read A career';end if;
 if (select count(*) from public.driver_profiles)<>1 then raise exception 'Profile isolation failed';end if;
 begin update public.driver_profiles set user_id='11111111-1111-4111-8111-111111111111';raise exception 'Profile owner change allowed';exception when insufficient_privilege then null;end;
end$$;
select public.record_best_lap('monza',95);
select public.save_career(1::smallint,0,'{"version":1,"season":4}');
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$begin
 if (select best_seconds from public.race_records)<>88.123 then raise exception 'A record changed';end if;
 if (select payload->>'season' from public.career_saves)<>'2' then raise exception 'A career changed';end if;
end$$;
set role anon;
reset request.jwt.claim.sub;
do $$begin
 begin perform * from public.race_records;raise exception 'Anonymous records read allowed';exception when insufficient_privilege then null;end;
 begin perform public.record_best_lap('monza',80);raise exception 'Anonymous RPC allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
select 'PASS: actual PostgreSQL RLS, authenticated RPC ownership, anonymous denial, minimum lap merge, invalid values and stale-save rejection' as result;
