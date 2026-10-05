export function SetupNeeded() {
  return (
    <main className="login">
      <div className="login-card card">
        <h1 className="brand">Troškovi vozila</h1>
        <p>
          <strong>Aplikacija još nije povezana sa bazom.</strong>
        </p>
        <p className="muted">
          Fale dve vrednosti iz Supabase-a: <code>VITE_SUPABASE_URL</code> i <code>VITE_SUPABASE_ANON_KEY</code>. U Vercel-u ih dodajte pod Settings → Environment Variables, pa ponovo
          postavite (Redeploy) aplikaciju. Detalji su u uputstvu (README.md, korak 4).
        </p>
      </div>
    </main>
  )
}
