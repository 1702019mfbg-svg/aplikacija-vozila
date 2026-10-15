// Vercel funkcija: jednom dnevno (vidi "crons" u vercel.json) poziva funkciju keepalive() u Supabase-u,
// da besplatan projekat ne bude pauziran zbog neaktivnosti.
// Ne traži nikakve nove tajne: koristi iste dve vrednosti kao i sama aplikacija.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')

  const url = (process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const key = (process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
  if (!url || !key) {
    return response
      .status(500)
      .json({ ok: false, error: 'Nedostaju VITE_SUPABASE_URL i/ili ključ u podešavanjima Vercel-a.' })
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/keepalive`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(20_000),
    })
    const text = await res.text()
    if (!res.ok) {
      return response.status(502).json({ ok: false, status: res.status, error: text.slice(0, 300) })
    }
    return response.status(200).json({ ok: true, lastPing: JSON.parse(text) })
  } catch (error) {
    return response.status(502).json({ ok: false, error: String(error?.message ?? error).slice(0, 300) })
  }
}
