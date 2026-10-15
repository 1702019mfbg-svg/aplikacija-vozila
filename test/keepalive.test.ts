import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error: običan JavaScript fajl (Vercel funkcija), bez tipova
import handler from '../api/keepalive.js'

function fakeResponse() {
  const out: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} }
  const res = {
    setHeader: (k: string, v: string) => void (out.headers[k] = v),
    status: (code: number) => {
      out.status = code
      return res
    },
    json: (body: unknown) => {
      out.body = body
      return res
    },
  }
  return { res, out }
}

describe('keepalive (dnevni poziv Supabase-a)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('poziva funkciju u bazi sa ključem u apikey zaglavlju i javlja uspeh', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('"2026-10-15T05:00:00+00:00"', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeResponse()
    await handler({}, res)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://abc.supabase.co/rest/v1/rpc/keepalive')
    expect(init.method).toBe('POST')
    expect(init.headers.apikey).toBe('sb_publishable_test')
    expect(init.headers.Authorization).toBeUndefined() // novi ključevi nisu JWT, ne šalju se kao Bearer
    expect(out.status).toBe(200)
    expect(out.body).toEqual({ ok: true, lastPing: '2026-10-15T05:00:00+00:00' })
    expect(out.headers['Cache-Control']).toBe('no-store')
  })

  it('izbacuje kosu crtu sa kraja adrese', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co//')
    const fetchMock = vi.fn().mockResolvedValue(new Response('"x"', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await handler({}, fakeResponse().res)
    expect(fetchMock.mock.calls[0][0]).toBe('https://abc.supabase.co/rest/v1/rpc/keepalive')
  })

  it('prihvata i naziv VITE_SUPABASE_PUBLISHABLE_KEY', async () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_drugi')
    const fetchMock = vi.fn().mockResolvedValue(new Response('"x"', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await handler({}, fakeResponse().res)
    expect(fetchMock.mock.calls[0][1].headers.apikey).toBe('sb_publishable_drugi')
  })

  it('bez podešenih vrednosti javlja grešku i ne zove nikoga', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeResponse()
    await handler({}, res)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.status).toBe(500)
    expect((out.body as { ok: boolean }).ok).toBe(false)
  })

  it('ako baza vrati grešku (npr. nije pokrenut novi SQL), javlja 502 sa razlogom', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":"PGRST202","message":"Could not find the function"}', { status: 404 })))
    const { res, out } = fakeResponse()
    await handler({}, res)
    expect(out.status).toBe(502)
    expect(out.body).toMatchObject({ ok: false, status: 404 })
    expect(JSON.stringify(out.body)).toContain('PGRST202')
  })

  it('ako nema mreže, javlja 502 bez rušenja', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const { res, out } = fakeResponse()
    await handler({}, res)
    expect(out.status).toBe(502)
    expect(out.body).toMatchObject({ ok: false, error: 'fetch failed' })
  })
})
