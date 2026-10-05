-- =====================================================================
-- Aplikacija za praćenje troškova vozila - šema baze (Supabase / Postgres)
--
-- Kako se koristi: nalepite CEO ovaj fajl u Supabase -> SQL Editor -> Run.
-- Bezbedno je pokrenuti ga više puta (ne briše podatke).
--
-- Bezbednosni model:
--  * VLASNIK se prijavljuje emailom i lozinkom (Supabase Auth). Svaki red
--    ima vlasnika, a RLS dozvoljava da vlasnik vidi i menja samo svoje.
--  * VOZAČ nema nalog. Pristupa samo preko dve funkcije (driver_login i
--    driver_add_expense) uz kod vozača + PIN. Vozač NEMA pristup nijednoj
--    tabeli, pa ne može da pročita ništa: ni prethodne unose, ni iznose,
--    ni zbirove. Može samo da upiše novi trošak.
--  * PIN se čuva samo kao bcrypt hash. Posle 5 pogrešnih PIN-ova, vozač je
--    zaključan 15 minuta.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;      -- nije dostupna preko API-ja
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Tabele
-- ---------------------------------------------------------------------

create table if not exists public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 80),
  plate            text check (length(plate) <= 20),
  fuel_type        text not null check (fuel_type in ('Dizel', 'Benzin', 'TNG', 'Električno')),
  -- čime se meri korišćenje: 'km' (automobili, kamioni) ili 'h' (radni sati: viljuškari, mašine)
  meter_unit       text not null default 'km' check (meter_unit in ('km', 'h')),
  initial_odometer numeric(10, 1) not null default 0 check (initial_odometer >= 0),
  purchase_date    date,
  purchase_price   numeric(12, 2) check (purchase_price >= 0),
  amort_years      integer check (amort_years between 1 and 50),
  created_at       timestamptz not null default now()
);
create index if not exists vehicles_owner_idx on public.vehicles (owner_id);

create table if not exists public.drivers (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  code       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists drivers_owner_idx on public.drivers (owner_id);

-- PIN i brojač pogrešnih pokušaja: u posebnoj šemi koju API ne izlaže.
create table if not exists private.driver_secrets (
  driver_id       uuid primary key references public.drivers (id) on delete cascade,
  pin_hash        text not null,
  failed_attempts integer not null default 0,
  last_failed_at  timestamptz,
  locked_until    timestamptz
);

create table if not exists public.driver_vehicles (
  driver_id  uuid not null references public.drivers (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  primary key (driver_id, vehicle_id)
);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles (id) on delete cascade,
  expense_date date not null,
  category     text not null check (category in (
                 'gorivo', 'servis', 'gume', 'registracija', 'tehnicki', 'osiguranje',
                 'putarina', 'parking', 'pranje', 'kazne', 'vanredni', 'ostalo')),
  amount       numeric(12, 2) check (amount >= 0),   -- NULL = iznos još nije upisan
  odometer     numeric(10, 1) check (odometer >= 0),   -- km ili radni sati, zavisno od vozila
  liters       numeric(8, 2) check (liters > 0),
  full_tank    boolean,
  note         text check (length(note) <= 500),
  driver_id    uuid references public.drivers (id) on delete set null,
  driver_name  text,                                  -- ostaje i posle brisanja vozača
  created_at   timestamptz not null default now(),
  constraint expenses_note_required
    check (category not in ('ostalo', 'vanredni') or length(btrim(coalesce(note, ''))) > 0),
  constraint expenses_fuel_only
    check (category = 'gorivo' or (liters is null and full_tank is null))
);
create index if not exists expenses_vehicle_date_idx on public.expenses (vehicle_id, expense_date desc);

create table if not exists public.reminders (
  id              uuid primary key default gen_random_uuid(),
  vehicle_id      uuid not null references public.vehicles (id) on delete cascade,
  -- tip određuje ponašanje: 'servis' se računa od poslednjeg servisa (km / meseci),
  -- svi ostali imaju datum isteka (due_date)
  type            text not null check (type in ('tehnicki', 'registracija', 'tahograf', 'servis', 'ostalo')),
  title           text not null check (length(btrim(title)) between 1 and 80),
  due_date        date,                               -- datum isteka (tehnički, registracija, tahograf...)
  interval_meter  numeric(10, 1) check (interval_meter > 0),  -- servis: na svakih X km (ili radnih sati)
  interval_months integer check (interval_months > 0),        -- servis: na svakih X meseci; ostali: na koliko se obnavlja
  last_date       date,                                       -- servis: poslednji put
  last_meter      numeric(10, 1) check (last_meter >= 0),
  created_at      timestamptz not null default now(),
  constraint reminders_datum  check (type = 'servis' or due_date is not null),
  constraint reminders_servis check (type <> 'servis' or interval_meter is not null or interval_months is not null)
);
create index if not exists reminders_vehicle_idx on public.reminders (vehicle_id);

-- Poslednja poznata kilometraža svakog vozila (za upozorenja o servisu na svim vozilima).
-- security_invoker: RLS se primenjuje kao da korisnik sam čita tabele, pa svako vidi samo svoja vozila.
create or replace view public.vehicle_status with (security_invoker = true) as
  select v.id as vehicle_id,
         greatest(v.initial_odometer, coalesce(max(e.odometer), 0)) as last_odometer
    from public.vehicles v
    left join public.expenses e on e.vehicle_id = v.id
   group by v.id, v.initial_odometer;

-- ---------------------------------------------------------------------
-- Prava pristupa: prvo sve oduzmemo, pa dodelimo samo potrebno.
-- Anonimni korisnik (anon) nema pristup NIJEDNOJ tabeli.
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

revoke all on public.vehicles, public.drivers, public.driver_vehicles,
              public.expenses, public.reminders, public.vehicle_status
  from public, anon, authenticated;

grant select, insert, update, delete on public.vehicles        to authenticated;
grant select, delete                 on public.drivers         to authenticated;
grant update (name, active)          on public.drivers         to authenticated;
grant select, insert, delete         on public.driver_vehicles to authenticated;
grant select, delete                 on public.expenses        to authenticated;
-- driver_id i driver_name može da postavi samo funkcija za vozače:
grant insert (id, vehicle_id, expense_date, category, amount, odometer, liters, full_tank, note)
  on public.expenses to authenticated;
grant update (expense_date, category, amount, odometer, liters, full_tank, note)
  on public.expenses to authenticated;
grant select, insert, update, delete on public.reminders       to authenticated;
grant select                         on public.vehicle_status  to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security: vlasnik vidi samo svoje
-- ---------------------------------------------------------------------

alter table public.vehicles        enable row level security;
alter table public.drivers         enable row level security;
alter table public.driver_vehicles enable row level security;
alter table public.expenses        enable row level security;
alter table public.reminders       enable row level security;

drop policy if exists vehicles_owner on public.vehicles;
create policy vehicles_owner on public.vehicles for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists drivers_select on public.drivers;
create policy drivers_select on public.drivers for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists drivers_update on public.drivers;
create policy drivers_update on public.drivers for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
drop policy if exists drivers_delete on public.drivers;
create policy drivers_delete on public.drivers for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists driver_vehicles_owner on public.driver_vehicles;
create policy driver_vehicles_owner on public.driver_vehicles for all to authenticated
  using (
    exists (select 1 from public.drivers d  where d.id = driver_id  and d.owner_id = (select auth.uid()))
    and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from public.drivers d  where d.id = driver_id  and d.owner_id = (select auth.uid()))
    and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));

drop policy if exists expenses_owner on public.expenses;
create policy expenses_owner on public.expenses for all to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));

drop policy if exists reminders_owner on public.reminders;
create policy reminders_owner on public.reminders for all to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------
-- Interne funkcije (šema private, ne mogu se pozvati spolja)
-- ---------------------------------------------------------------------

create or replace function private.normalize_code(p text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'))
$$;

create or replace function private.last_odometer(p_vehicle_id uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select greatest(v.initial_odometer, coalesce((select max(e.odometer) from public.expenses e where e.vehicle_id = v.id), 0))
  from public.vehicles v where v.id = p_vehicle_id
$$;

-- Proverava kod + PIN. Brojač pogrešnih pokušaja MORA da ostane upisan, zato
-- ova funkcija nikad ne baca grešku nego vraća status: ok / invalid / locked.
create or replace function private.check_driver(p_code text, p_pin text,
                                                out o_driver_id uuid, out o_status text)
language plpgsql security definer set search_path = '' as $$
declare
  d public.drivers%rowtype;
  s private.driver_secrets%rowtype;
  v_failed integer;
begin
  o_driver_id := null;
  select * into d from public.drivers where code = private.normalize_code(p_code);
  if not found or not d.active then
    o_status := 'invalid';
    return;
  end if;

  -- zaključavanje reda: paralelni pokušaji se izvršavaju jedan po jedan
  select * into s from private.driver_secrets where driver_id = d.id for update;
  if not found then
    o_status := 'invalid';
    return;
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    o_status := 'locked';
    return;
  end if;

  if p_pin is null or extensions.crypt(p_pin, s.pin_hash) <> s.pin_hash then
    -- stari neuspesi (stariji od sat vremena) se ne računaju
    v_failed := case when s.last_failed_at is not null and s.last_failed_at > now() - interval '1 hour'
                     then s.failed_attempts else 0 end + 1;
    if v_failed >= 5 then
      update private.driver_secrets
         set failed_attempts = 0, last_failed_at = now(), locked_until = now() + interval '15 minutes'
       where driver_id = d.id;
      o_status := 'locked';
    else
      update private.driver_secrets
         set failed_attempts = v_failed, last_failed_at = now(), locked_until = null
       where driver_id = d.id;
      o_status := 'invalid';
    end if;
    return;
  end if;

  if s.failed_attempts <> 0 or s.locked_until is not null then
    update private.driver_secrets set failed_attempts = 0, locked_until = null where driver_id = d.id;
  end if;
  o_driver_id := d.id;
  o_status := 'ok';
end
$$;

-- ---------------------------------------------------------------------
-- Funkcije za VOZAČA (pozivaju se bez naloga, uz kod + PIN)
-- Vraćaju {ok: true...} ili {ok: false, error: '...'}; ne vraćaju nikakve
-- iznose ni zbirove.
-- ---------------------------------------------------------------------

create or replace function public.driver_login(p_code text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  select * into c from private.check_driver(p_code, p_pin);
  if c.o_status <> 'ok' then
    return jsonb_build_object('ok', false, 'error', c.o_status);
  end if;

  return jsonb_build_object(
    'ok', true,
    'name', (select d.name from public.drivers d where d.id = c.o_driver_id),
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'name', v.name, 'plate', v.plate, 'fuel_type', v.fuel_type,
               'meter_unit', v.meter_unit,
               'last_odometer', private.last_odometer(v.id)) order by v.name)
        from public.driver_vehicles dv
        join public.vehicles v on v.id = dv.vehicle_id
       where dv.driver_id = c.o_driver_id), '[]'::jsonb));
end
$$;

create or replace function public.driver_add_expense(
  p_code text, p_pin text, p_id uuid, p_vehicle_id uuid, p_date date, p_category text,
  p_amount numeric, p_odometer numeric, p_liters numeric, p_full_tank boolean, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c record;
  v_name text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_today date := (now() at time zone 'Europe/Belgrade')::date;
  v_last numeric;
begin
  select * into c from private.check_driver(p_code, p_pin);
  if c.o_status <> 'ok' then
    return jsonb_build_object('ok', false, 'error', c.o_status);
  end if;

  if not exists (select 1 from public.driver_vehicles dv
                  where dv.driver_id = c.o_driver_id and dv.vehicle_id = p_vehicle_id) then
    return jsonb_build_object('ok', false, 'error', 'bad_vehicle');
  end if;

  if p_category is null or p_category not in
     ('gorivo', 'servis', 'gume', 'registracija', 'tehnicki', 'osiguranje',
      'putarina', 'parking', 'pranje', 'kazne', 'vanredni', 'ostalo') then
    return jsonb_build_object('ok', false, 'error', 'bad_category');
  end if;
  if p_date is null or p_date > v_today + 1 or p_date < v_today - 14 then
    return jsonb_build_object('ok', false, 'error', 'bad_date');
  end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 99999999) then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  if v_note is not null and length(v_note) > 500 then
    return jsonb_build_object('ok', false, 'error', 'bad_note');
  end if;
  if p_category in ('ostalo', 'vanredni') and v_note is null then
    return jsonb_build_object('ok', false, 'error', 'note_required');
  end if;
  if p_category = 'gorivo' then
    if p_liters is null or p_liters <= 0 or p_liters > 2000 then
      return jsonb_build_object('ok', false, 'error', 'bad_liters');
    end if;
    if p_odometer is null then
      return jsonb_build_object('ok', false, 'error', 'odometer_required');
    end if;
  end if;
  if p_odometer is not null then
    v_last := private.last_odometer(p_vehicle_id);
    if p_odometer < 0 or p_odometer > 5000000 then
      return jsonb_build_object('ok', false, 'error', 'bad_odometer');
    end if;
    if p_odometer < v_last then
      return jsonb_build_object('ok', false, 'error', 'odometer_low', 'last_odometer', v_last);
    end if;
  end if;

  select d.name into v_name from public.drivers d where d.id = c.o_driver_id;

  insert into public.expenses
    (id, vehicle_id, expense_date, category, amount, odometer, liters, full_tank, note, driver_id, driver_name)
  values
    (coalesce(p_id, gen_random_uuid()), p_vehicle_id, p_date, p_category, p_amount, p_odometer,
     case when p_category = 'gorivo' then p_liters end,
     case when p_category = 'gorivo' then coalesce(p_full_tank, false) end,
     v_note, c.o_driver_id, v_name)
  on conflict (id) do nothing;      -- ponovljeno slanje istog unosa se ignoriše

  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------------
-- Funkcije za VLASNIKA (zahtevaju prijavu)
-- ---------------------------------------------------------------------

create or replace function public.create_driver(p_name text, p_pin text, p_vehicle_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_code text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 60 then raise exception 'bad_name'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then raise exception 'bad_pin'; end if;
  if exists (select 1 from unnest(coalesce(p_vehicle_ids, '{}')) as vid
              where not exists (select 1 from public.vehicles v where v.id = vid and v.owner_id = uid)) then
    raise exception 'bad_vehicle';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (select 1 from public.drivers where code = v_code);
  end loop;

  insert into public.drivers (owner_id, name, code) values (uid, btrim(p_name), v_code) returning id into v_id;
  insert into private.driver_secrets (driver_id, pin_hash)
    values (v_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)));
  insert into public.driver_vehicles (driver_id, vehicle_id)
    select v_id, vid from unnest(coalesce(p_vehicle_ids, '{}')) as vid on conflict do nothing;

  return jsonb_build_object('id', v_id, 'code', v_code);
end
$$;

-- Novi PIN (i opciono novi kod). Odmah skida zaključavanje.
create or replace function public.set_driver_pin(p_driver_id uuid, p_pin text, p_new_code boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_code text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then raise exception 'bad_pin'; end if;
  if not exists (select 1 from public.drivers where id = p_driver_id and owner_id = uid) then
    raise exception 'not_found';
  end if;

  if p_new_code then
    loop
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      exit when not exists (select 1 from public.drivers where code = v_code);
    end loop;
    update public.drivers set code = v_code where id = p_driver_id;
  end if;

  update private.driver_secrets
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)),
         failed_attempts = 0, last_failed_at = null, locked_until = null
   where driver_id = p_driver_id;

  return jsonb_build_object('code', (select code from public.drivers where id = p_driver_id));
end
$$;

create or replace function public.set_driver_vehicles(p_driver_id uuid, p_vehicle_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.drivers where id = p_driver_id and owner_id = uid) then
    raise exception 'not_found';
  end if;
  if exists (select 1 from unnest(coalesce(p_vehicle_ids, '{}')) as vid
              where not exists (select 1 from public.vehicles v where v.id = vid and v.owner_id = uid)) then
    raise exception 'bad_vehicle';
  end if;
  delete from public.driver_vehicles where driver_id = p_driver_id;
  insert into public.driver_vehicles (driver_id, vehicle_id)
    select p_driver_id, vid from unnest(coalesce(p_vehicle_ids, '{}')) as vid on conflict do nothing;
end
$$;

-- ---------------------------------------------------------------------
-- Ko sme da poziva koju funkciju
-- (Postgres po defaultu dozvoljava svima, pa prvo sve oduzmemo)
-- ---------------------------------------------------------------------

revoke all on function public.driver_login(text, text)                                   from public, anon, authenticated;
revoke all on function public.driver_add_expense(text, text, uuid, uuid, date, text,
                                                 numeric, numeric, numeric, boolean, text) from public, anon, authenticated;
revoke all on function public.create_driver(text, text, uuid[])                          from public, anon, authenticated;
revoke all on function public.set_driver_pin(uuid, text, boolean)                        from public, anon, authenticated;
revoke all on function public.set_driver_vehicles(uuid, uuid[])                          from public, anon, authenticated;

grant execute on function public.driver_login(text, text)                                to anon, authenticated;
grant execute on function public.driver_add_expense(text, text, uuid, uuid, date, text,
                                                    numeric, numeric, numeric, boolean, text) to anon, authenticated;
grant execute on function public.create_driver(text, text, uuid[])                       to authenticated;
grant execute on function public.set_driver_pin(uuid, text, boolean)                     to authenticated;
grant execute on function public.set_driver_vehicles(uuid, uuid[])                       to authenticated;
