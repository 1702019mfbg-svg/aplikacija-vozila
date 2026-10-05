// Testovi bezbednosti baze: pokreću pravi Postgres (PGlite) sa supabase/schema.sql
// i proveravaju ko šta sme da vidi. Najvažnije: vozač ne sme da pročita ništa.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')

let db: PGlite
const OWNER_A = '11111111-1111-1111-1111-111111111111'
const OWNER_B = '22222222-2222-2222-2222-222222222222'

type Who = { owner: string } | 'anon'

/** Izvršava upit kao dati korisnik (kao što bi to uradio Supabase API). */
async function as<T>(who: Who, fn: () => Promise<T>): Promise<T> {
  if (who === 'anon') {
    await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false)`)
  } else {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${who.owner}', false)`)
  }
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}
const A = { owner: OWNER_A }
const B = { owner: OWNER_B }

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows
}

async function driverCall(fn: string, args: unknown[]) {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await q<{ r: any }>(`select public.${fn}(${ph}) as r`, args)
  return rows[0].r
}

let vehicleA1: string
let vehicleA2: string
let vehicleB1: string
let code: string
let driverId: string

function addExpense(over: Record<string, unknown> = {}, pin = '4321', theCode = code) {
  const p = {
    id: crypto.randomUUID(), vehicle: vehicleA1, date: today(), category: 'putarina',
    amount: 350, odometer: null, liters: null, full: null, note: null, ...over,
  }
  return driverCall('driver_add_expense', [
    theCode, pin, p.id, p.vehicle, p.date, p.category, p.amount, p.odometer, p.liters, p.full, p.note,
  ])
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } })
  // Minimalna imitacija Supabase okruženja (auth šema, role, podrazumevana prava)
  await db.exec(`
    create schema extensions;
    create schema auth;
    create role anon nologin;
    create role authenticated nologin;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema extensions to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    -- Supabase po defaultu daje SVA prava na nove tabele i funkcije; schema.sql to mora da popravi
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `)
  await db.exec(schema)
  await db.exec(schema) // mora da može da se pokrene više puta
  await db.exec(`insert into auth.users (id, email) values ('${OWNER_A}', 'a@x.rs'), ('${OWNER_B}', 'b@x.rs')`)

  vehicleA1 = (await as(A, () => q<{ id: string }>(
    `insert into vehicles (name, plate, fuel_type, initial_odometer) values ('Golf', 'BG-123-AA', 'Dizel', 100000) returning id`)))[0].id
  vehicleA2 = (await as(A, () => q<{ id: string }>(
    `insert into vehicles (name, fuel_type) values ('Kombi', 'Benzin') returning id`)))[0].id
  vehicleB1 = (await as(B, () => q<{ id: string }>(
    `insert into vehicles (name, fuel_type) values ('Tuđe auto', 'Benzin') returning id`)))[0].id

  const created = await as(A, () => driverCall('create_driver', ['Marko', '4321', [vehicleA1]]))
  code = created.code
  driverId = created.id
})

afterAll(async () => { await db.close() })

describe('vlasnici su međusobno odvojeni', () => {
  it('vlasnik B ne vidi ništa od vlasnika A', async () => {
    await as(A, () => q(`insert into expenses (vehicle_id, expense_date, category, amount) values ('${vehicleA1}', '${today()}', 'servis', 5000)`))
    await as(A, () => q(`insert into reminders (vehicle_id, type, title, due_date) values ('${vehicleA1}', 'registracija', 'Registracija', '2030-01-01')`))
    for (const t of ['vehicles', 'expenses', 'reminders', 'drivers', 'driver_vehicles']) {
      const rows = await as(B, () => q(`select * from ${t}`))
      expect(rows.every((r: any) => r.vehicle_id !== vehicleA1 && r.id !== vehicleA1), t).toBe(true)
    }
    expect((await as(B, () => q(`select * from vehicles`))).length).toBe(1)
    expect(await as(B, () => q(`select * from drivers`))).toHaveLength(0)
  })

  it('vlasnik B ne može da upiše trošak na tuđe vozilo', async () => {
    await expect(as(B, () => q(
      `insert into expenses (vehicle_id, expense_date, category, amount) values ('${vehicleA1}', '${today()}', 'servis', 1)`,
    ))).rejects.toThrow(/row-level security/)
  })

  it('vlasnik B ne može da menja ni briše tuđe podatke', async () => {
    await as(B, () => q(`update expenses set amount = 1 where vehicle_id = '${vehicleA1}'`))
    await as(B, () => q(`delete from expenses where vehicle_id = '${vehicleA1}'`))
    await as(B, () => q(`delete from vehicles where id = '${vehicleA1}'`))
    expect(await as(A, () => q(`select 1 from vehicles where id = '${vehicleA1}'`))).toHaveLength(1)
    const e = await as(A, () => q<{ amount: string }>(`select amount from expenses where vehicle_id = '${vehicleA1}'`))
    expect(Number(e[0].amount)).toBe(5000)
  })

  it('vlasnik B ne može da napravi vozača za tuđe vozilo niti da menja tuđeg vozača', async () => {
    await expect(as(B, () => driverCall('create_driver', ['Lopov', '1111', [vehicleA1]]))).rejects.toThrow(/bad_vehicle/)
    await expect(as(B, () => driverCall('set_driver_pin', [driverId, '9999', false]))).rejects.toThrow(/not_found/)
    await expect(as(B, () => driverCall('set_driver_vehicles', [driverId, [vehicleB1]]))).rejects.toThrow(/not_found/)
  })

  it('vlasnik ne može da postavi tuđeg vlasnika (owner_id)', async () => {
    await expect(as(B, () => q(
      `insert into vehicles (owner_id, name, fuel_type) values ('${OWNER_A}', 'X', 'Dizel')`,
    ))).rejects.toThrow(/row-level security/)
  })

  it('vlasnik ne može da upiše driver_id/driver_name (to sme samo funkcija za vozače)', async () => {
    await expect(as(A, () => q(
      `insert into expenses (vehicle_id, expense_date, category, amount, driver_name) values ('${vehicleA1}', '${today()}', 'servis', 1, 'Lažno')`,
    ))).rejects.toThrow(/permission denied/)
  })

  it('PIN hash se ne vidi ni vlasniku (nema ga u public tabelama, a šema private je zatvorena)', async () => {
    const cols = Object.keys((await as(A, () => q(`select * from drivers`)))[0])
    expect(cols).not.toContain('pin_hash')
    await expect(as(A, () => q(`select * from private.driver_secrets`))).rejects.toThrow(/permission denied/)
  })
})

describe('vozač (bez naloga) ne može da pročita ništa', () => {
  it('anon nema pristup nijednoj tabeli', async () => {
    for (const t of ['vehicles', 'expenses', 'drivers', 'driver_vehicles', 'reminders']) {
      await expect(as('anon', () => q(`select * from public.${t}`)), t).rejects.toThrow(/permission denied/)
      await expect(as('anon', () => q(`insert into public.${t} default values`)), t).rejects.toThrow(/permission denied/)
    }
    await expect(as('anon', () => q(`select * from private.driver_secrets`))).rejects.toThrow(/permission denied/)
  })

  it('anon ne može da zove funkcije vlasnika', async () => {
    await expect(as('anon', () => driverCall('create_driver', ['X', '1234', []]))).rejects.toThrow(/permission denied/)
    await expect(as('anon', () => driverCall('set_driver_pin', [driverId, '1234', false]))).rejects.toThrow(/permission denied/)
    await expect(as('anon', () => driverCall('set_driver_vehicles', [driverId, []]))).rejects.toThrow(/permission denied/)
  })

  it('anon ne može da zove interne funkcije', async () => {
    await expect(as('anon', () => q(`select private.check_driver('${code}', '4321')`))).rejects.toThrow(/permission denied/)
    await expect(as('anon', () => q(`select private.last_odometer('${vehicleA1}')`))).rejects.toThrow(/permission denied/)
  })

  it('prijava vraća samo ime i dodeljena vozila, bez ikakvih iznosa', async () => {
    const r = await as('anon', () => driverCall('driver_login', [code, '4321']))
    expect(r.ok).toBe(true)
    expect(r.name).toBe('Marko')
    expect(r.vehicles).toHaveLength(1)
    expect(r.vehicles[0].name).toBe('Golf')
    expect(r.vehicles[0].last_odometer).toBe(100000)
    expect(JSON.stringify(r)).not.toMatch(/amount|price|cena|iznos|5000/i)
  })

  it('kod se prepoznaje i sa crticom i malim slovima', async () => {
    const fancy = `${code.slice(0, 5)}-${code.slice(5)}`.toLowerCase()
    expect((await as('anon', () => driverCall('driver_login', [fancy, '4321']))).ok).toBe(true)
  })

  it('odgovori funkcija za vozača nikad ne sadrže iznose ni zbirove', async () => {
    const r = await as('anon', () => addExpense({ amount: 777 }))
    expect(r).toEqual({ ok: true })
  })
})

describe('PIN i zaključavanje', () => {
  it('pogrešan PIN i pogrešan kod daju isti odgovor', async () => {
    const wrongPin = await as('anon', () => driverCall('driver_login', [code, '0000']))
    const wrongCode = await as('anon', () => driverCall('driver_login', ['ZZZZZZZZZZ', '4321']))
    expect(wrongPin).toEqual({ ok: false, error: 'invalid' })
    expect(wrongCode).toEqual({ ok: false, error: 'invalid' })
  })

  it('posle 5 pogrešnih pokušaja zaključava, čak i za tačan PIN, i brojač ostaje upisan', async () => {
    const c2 = (await as(A, () => driverCall('create_driver', ['Jovan', '5555', [vehicleA1]]))).code
    for (let i = 0; i < 4; i++) {
      expect((await as('anon', () => driverCall('driver_login', [c2, '0000']))).error).toBe('invalid')
    }
    expect((await as('anon', () => driverCall('driver_login', [c2, '0000']))).error).toBe('locked')
    expect((await as('anon', () => driverCall('driver_login', [c2, '5555']))).error).toBe('locked')
    expect((await as('anon', () => addExpense({}, '5555', c2))).error).toBe('locked')

    // posle isteka zaključavanja tačan PIN opet radi
    await db.exec(`update private.driver_secrets set locked_until = now() - interval '1 minute'
                    where driver_id = (select id from public.drivers where code = '${c2}')`)
    expect((await as('anon', () => driverCall('driver_login', [c2, '5555']))).ok).toBe(true)
  })

  it('tačan PIN poništava brojač pogrešnih pokušaja', async () => {
    const c3 = (await as(A, () => driverCall('create_driver', ['Ana', '6666', [vehicleA1]]))).code
    for (let i = 0; i < 4; i++) await as('anon', () => driverCall('driver_login', [c3, '0000']))
    expect((await as('anon', () => driverCall('driver_login', [c3, '6666']))).ok).toBe(true)
    for (let i = 0; i < 4; i++) {
      expect((await as('anon', () => driverCall('driver_login', [c3, '0000']))).error).toBe('invalid')
    }
  })

  it('vlasnik može da promeni PIN i to skida zaključavanje; stari PIN više ne radi', async () => {
    const created = await as(A, () => driverCall('create_driver', ['Mina', '1212', [vehicleA1]]))
    for (let i = 0; i < 5; i++) await as('anon', () => driverCall('driver_login', [created.code, '0']))
    await as(A, () => driverCall('set_driver_pin', [created.id, '3434', false]))
    expect((await as('anon', () => driverCall('driver_login', [created.code, '1212']))).ok).toBe(false)
    expect((await as('anon', () => driverCall('driver_login', [created.code, '3434']))).ok).toBe(true)
  })

  it('novi kod poništava stari kod', async () => {
    const created = await as(A, () => driverCall('create_driver', ['Pera', '1212', [vehicleA1]]))
    const res = await as(A, () => driverCall('set_driver_pin', [created.id, '1212', true]))
    expect(res.code).not.toBe(created.code)
    expect((await as('anon', () => driverCall('driver_login', [created.code, '1212']))).ok).toBe(false)
    expect((await as('anon', () => driverCall('driver_login', [res.code, '1212']))).ok).toBe(true)
  })

  it('neaktivan vozač ne može da se prijavi', async () => {
    const created = await as(A, () => driverCall('create_driver', ['Neaktivan', '1212', [vehicleA1]]))
    await as(A, () => q(`update drivers set active = false where id = '${created.id}'`))
    expect((await as('anon', () => driverCall('driver_login', [created.code, '1212']))).ok).toBe(false)
  })

  it('PIN mora biti 4 do 8 cifara', async () => {
    for (const bad of ['123', '123456789', 'abcd', '12 34', '']) {
      await expect(as(A, () => driverCall('create_driver', ['X', bad, []])), bad).rejects.toThrow(/bad_pin/)
    }
  })

  it('PIN se čuva samo kao hash', async () => {
    const rows = await q<{ pin_hash: string }>(`select pin_hash from private.driver_secrets`)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.pin_hash).toMatch(/^\$2[aby]\$/)
      expect(r.pin_hash).not.toContain('4321')
    }
  })
})

describe('unos troška od strane vozača', () => {
  it('trošak stiže vlasniku sa imenom vozača, a vlasnik ga vidi i sa iznosom', async () => {
    const id = crypto.randomUUID()
    await as('anon', () => addExpense({ id, amount: 1234.5, note: 'Autoput' }))
    const rows = await as(A, () => q<any>(`select * from expenses where id = '${id}'`))
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].amount)).toBe(1234.5)
    expect(rows[0].driver_name).toBe('Marko')
    expect(rows[0].driver_id).toBe(driverId)
  })

  it('iznos može da se izostavi, pa ga vlasnik dopuni', async () => {
    const id = crypto.randomUUID()
    expect((await as('anon', () => addExpense({ id, amount: null }))).ok).toBe(true)
    expect((await as(A, () => q<any>(`select amount from expenses where id = '${id}'`)))[0].amount).toBeNull()
    await as(A, () => q(`update expenses set amount = 400 where id = '${id}'`))
    expect(Number((await as(A, () => q<any>(`select amount from expenses where id = '${id}'`)))[0].amount)).toBe(400)
  })

  it('ponovljeno slanje istog unosa ne pravi duplikat', async () => {
    const id = crypto.randomUUID()
    await as('anon', () => addExpense({ id }))
    await as('anon', () => addExpense({ id }))
    expect(await as(A, () => q(`select 1 from expenses where id = '${id}'`))).toHaveLength(1)
  })

  it('vozač ne može da piše na vozilo koje mu nije dodeljeno (ni tuđe)', async () => {
    expect((await as('anon', () => addExpense({ vehicle: vehicleA2 }))).error).toBe('bad_vehicle')
    expect((await as('anon', () => addExpense({ vehicle: vehicleB1 }))).error).toBe('bad_vehicle')
  })

  it('vozač može da unese i registraciju, tehnički pregled, pranje i osiguranje', async () => {
    for (const category of ['registracija', 'tehnicki', 'pranje', 'osiguranje', 'parking', 'gume', 'kazne']) {
      expect((await as('anon', () => addExpense({ category }))).ok, category).toBe(true)
    }
  })

  it('nepoznata vrsta troška se odbija', async () => {
    for (const category of ['nesto', '', null]) {
      expect((await as('anon', () => addExpense({ category }))).error, String(category)).toBe('bad_category')
    }
  })

  it('datum: ne u budućnosti i ne stariji od 14 dana', async () => {
    expect((await as('anon', () => addExpense({ date: daysAgo(15) }))).error).toBe('bad_date')
    expect((await as('anon', () => addExpense({ date: daysAgo(-3) }))).error).toBe('bad_date')
    expect((await as('anon', () => addExpense({ date: daysAgo(10) }))).ok).toBe(true)
  })

  it('"Ostalo" i "Vanredni" traže opis', async () => {
    expect((await as('anon', () => addExpense({ category: 'ostalo', note: '  ' }))).error).toBe('note_required')
    expect((await as('anon', () => addExpense({ category: 'vanredni' }))).error).toBe('note_required')
    expect((await as('anon', () => addExpense({ category: 'ostalo', note: 'Kafa' }))).ok).toBe(true)
  })

  it('gorivo traži litre i kilometražu', async () => {
    expect((await as('anon', () => addExpense({ category: 'gorivo', odometer: 100500 }))).error).toBe('bad_liters')
    expect((await as('anon', () => addExpense({ category: 'gorivo', liters: 40 }))).error).toBe('odometer_required')
    const ok = await as('anon', () => addExpense({ category: 'gorivo', liters: 40, odometer: 100500, full: true, amount: 6000 }))
    expect(ok.ok).toBe(true)
  })

  it('kilometraža ne može biti manja od poslednje upisane', async () => {
    const r = await as('anon', () => addExpense({ category: 'gorivo', liters: 30, odometer: 100400, full: true }))
    expect(r).toEqual({ ok: false, error: 'odometer_low', last_odometer: 100500 })
  })

  it('litri i pun rezervoar se ignorišu za ostale vrste', async () => {
    const id = crypto.randomUUID()
    await as('anon', () => addExpense({ id, category: 'putarina', liters: 99, full: true }))
    const row = (await as(A, () => q<any>(`select liters, full_tank from expenses where id = '${id}'`)))[0]
    expect(row.liters).toBeNull()
    expect(row.full_tank).toBeNull()
  })

  it('prekomerni i negativni iznosi se odbijaju', async () => {
    expect((await as('anon', () => addExpense({ amount: -5 }))).error).toBe('bad_amount')
    expect((await as('anon', () => addExpense({ amount: 1e9 }))).error).toBe('bad_amount')
  })

  it('brisanje vozača ostavlja troškove i ime vozača', async () => {
    const created = await as(A, () => driverCall('create_driver', ['Privremeni', '7777', [vehicleA1]]))
    const id = crypto.randomUUID()
    await as('anon', () => addExpense({ id, category: 'parking' }, '7777', created.code))
    await as(A, () => q(`delete from drivers where id = '${created.id}'`))
    const row = (await as(A, () => q<any>(`select driver_id, driver_name from expenses where id = '${id}'`)))[0]
    expect(row.driver_id).toBeNull()
    expect(row.driver_name).toBe('Privremeni')
  })

  it('izmena dodeljenih vozila radi i skida pristup', async () => {
    const created = await as(A, () => driverCall('create_driver', ['Dvovozilni', '8888', [vehicleA1, vehicleA2]]))
    expect((await as('anon', () => driverCall('driver_login', [created.code, '8888']))).vehicles).toHaveLength(2)
    await as(A, () => driverCall('set_driver_vehicles', [created.id, [vehicleA2]]))
    const r = await as('anon', () => driverCall('driver_login', [created.code, '8888']))
    expect(r.vehicles.map((v: any) => v.name)).toEqual(['Kombi'])
    expect((await as('anon', () => addExpense({ vehicle: vehicleA1 }, '8888', created.code))).error).toBe('bad_vehicle')
  })
})

describe('podsetnici i pogled sa kilometražom', () => {
  it('vlasnik vidi poslednju kilometražu samo svojih vozila', async () => {
    const a = await as(A, () => q<any>(`select * from vehicle_status order by last_odometer desc`))
    expect(a.map((r) => r.vehicle_id).sort()).toEqual([vehicleA1, vehicleA2].sort())
    // početna 100000, a vozač je upisao 100500 (gorivo)
    expect(a.find((r) => r.vehicle_id === vehicleA1).last_odometer).toBe(100500)
    expect(a.find((r) => r.vehicle_id === vehicleA2).last_odometer).toBe(0)
    const b = await as(B, () => q<any>(`select * from vehicle_status`))
    expect(b.map((r) => r.vehicle_id)).toEqual([vehicleB1])
  })

  it('vozač (anon) ne može da čita ni pogled ni podsetnike', async () => {
    await expect(as('anon', () => q(`select * from vehicle_status`))).rejects.toThrow(/permission denied/)
    await expect(as('anon', () => q(`select * from reminders`))).rejects.toThrow(/permission denied/)
  })

  it('vlasnik B ne može da doda podsetnik na tuđe vozilo', async () => {
    await expect(as(B, () => q(
      `insert into reminders (vehicle_id, type, title, due_date) values ('${vehicleA1}', 'tehnicki', 'Tehnički pregled', '2030-01-01')`,
    ))).rejects.toThrow(/row-level security/)
  })

  it('tehnički pregled, registracija i tahograf traže datum isteka', async () => {
    for (const type of ['tehnicki', 'registracija', 'tahograf', 'ostalo']) {
      await expect(as(A, () => q(
        `insert into reminders (vehicle_id, type, title) values ('${vehicleA1}', '${type}', 'X')`,
      )), type).rejects.toThrow(/reminders_datum/)
    }
  })

  it('servis traži interval, a tip mora biti poznat', async () => {
    await expect(as(A, () => q(
      `insert into reminders (vehicle_id, type, title) values ('${vehicleA1}', 'servis', 'Servis')`,
    ))).rejects.toThrow(/reminders_servis/)
    await expect(as(A, () => q(
      `insert into reminders (vehicle_id, type, title, due_date) values ('${vehicleA1}', 'nesto', 'X', '2030-01-01')`,
    ))).rejects.toThrow(/reminders_type_check/)
  })

  it('upozorenje unapred ima razumne granice, a podrazumevano je 30 dana i 1000 km', async () => {
    const r = (await as(A, () => q<any>(
      `insert into reminders (vehicle_id, type, title, due_date) values ('${vehicleA1}', 'tehnicki', 'Tehnički pregled', '2030-01-01') returning *`,
    )))[0]
    expect(r.warn_days).toBe(30)
    expect(r.warn_km).toBe(1000)
    await expect(as(A, () => q(
      `insert into reminders (vehicle_id, type, title, due_date, warn_days) values ('${vehicleA1}', 'tehnicki', 'T', '2030-01-01', 400)`,
    ))).rejects.toThrow(/warn_days/)
  })

  it('sva tri stalna podsetnika (tehnički na 6 meseci, registracija, tahograf) mogu da se zapišu', async () => {
    const rows = await as(A, () => q<any>(
      `insert into reminders (vehicle_id, type, title, due_date, interval_months, warn_days) values
         ('${vehicleA2}', 'tehnicki', 'Tehnički pregled', '2027-03-01', 6, 30),
         ('${vehicleA2}', 'registracija', 'Registracija', '2027-05-01', 12, 30),
         ('${vehicleA2}', 'tahograf', 'Tahograf', '2028-01-15', 24, 60) returning type`,
    ))
    expect(rows.map((r) => r.type).sort()).toEqual(['registracija', 'tahograf', 'tehnicki'])
  })
})

describe('ograničenja tabele', () => {
  it('litri su dozvoljeni samo za gorivo', async () => {
    await expect(as(A, () => q(
      `insert into expenses (vehicle_id, expense_date, category, amount, liters) values ('${vehicleA1}', '${today()}', 'servis', 1, 5)`,
    ))).rejects.toThrow(/expenses_fuel_only/)
  })
})
