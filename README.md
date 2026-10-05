# Troškovi vozila

Aplikacija za praćenje **stvarnog troška vozila i radnih mašina** (viljuškara): gorivo, putarine, servis, registracija, tehnički pregled, pranje, vanredni i ostali troškovi, sa podsetnicima za rokove.

- **Vlasnik** (vi) vidi sve: cene, zbirove, grafikone, cenu po kilometru / po radnom satu, potrošnju.
- **Vozač** može da upiše bilo koji trošak, ali **ne vidi ništa od toga**: ni ranije unose, ni iznose, ni zbirove. Prijavljuje se kodom i PIN-om, bez naloga.
- Radi na telefonu i računaru, ceo na srpskom (latinica), i može da se **instalira na telefon besplatno** (bez Play Store-a i App Store-a).

Dva dela aplikacije, prekidač je na vrhu ekrana:

| Deo | Brojač | Glavni broj na pregledu | Potrošnja |
|---|---|---|---|
| **Vozila** | kilometri | RSD/km | L/100 km |
| **Radne mašine** | radni sati (motosati) | RSD/h | L/h |

---

## Postavljanje, korak po korak (bez programiranja)

Treba vam oko 30 minuta i tri besplatna naloga: **GitHub** (već imate), **Supabase** (baza i prijava) i **Vercel** (da aplikacija bude na internetu). Ništa se ne plaća.

### Korak 0: Spojite kod u glavnu granu

Kod trenutno stoji na grani `claude/compassionate-dirac-jeetvw`. Vercel po pravilu objavljuje granu `main`, pa kod prvo treba spojiti u nju:

1. Otvorite https://github.com/1702019mfbg-svg/aplikacija-vozila
2. Kliknite žuti baner **Compare & pull request**, pa **Create pull request**, pa **Merge pull request**.

(Ili recite Claude-u da to uradi umesto vas.)

### Korak 1: Napravite bazu na Supabase-u

1. Idite na https://supabase.com, kliknite **Start your project** i prijavite se preko GitHub-a.
2. **New project**. Upišite naziv (npr. `vozila`), izaberite **Database Password** (sačuvajte ga negde, ali ne treba vam u aplikaciji) i region **Central EU (Frankfurt)**. Plan: **Free**. Kliknite **Create new project** i sačekajte oko 2 minuta.

### Korak 2: Napravite tabele i zaštitu podataka

1. U Supabase-u, u levom meniju otvorite **SQL Editor**, pa **New query**.
2. Na GitHub-u otvorite fajl `supabase/schema.sql`, kliknite ikonicu **Copy raw file** (kopira ceo sadržaj) i nalepite ga u prozor.
3. Kliknite **Run**. Treba da piše *Success. No rows returned*.
   - Ako se pojavi upozorenje (npr. o „destructive operation“), kliknite **Run this query**. To je očekivano: skripta samo zamenjuje sopstvena pravila pristupa i ne briše podatke.
   - Skriptu je bezbedno pokrenuti više puta.

### Korak 3: Napravite svoj nalog (vlasnik)

1. U Supabase-u: **Authentication → Users → Add user → Create new user**.
2. Upišite svoj **email** i **lozinku** (bar 10 znakova) i **obavezno štiklirajte „Auto Confirm User“**. Kliknite **Create user**.
3. Sprečite da se neko drugi registruje: **Authentication → Sign In / Providers** (u nekim verzijama **Authentication → Settings**) → isključite **Allow new users to sign up** → **Save**.
   Vozačima ne treba nalog, pa ovo ništa ne kvari.

### Korak 4: Uzmite dve vrednosti iz Supabase-a

U Supabase-u otvorite **Project Settings** (zupčanik) → **API Keys** (ili **API**) i kopirajte:

- **Project URL** (izgleda ovako: `https://abcdefgh.supabase.co`)
- **anon / publishable ključ** (dug niz slova i brojeva)

> Ne koristite ključ koji se zove **service_role**. Njega nikad ne stavljajte u aplikaciju.
> „anon / publishable“ ključ nije tajna (nalazi se u svakoj aplikaciji). Podaci su zaštićeni pravilima iz Koraka 2.

### Korak 5: Postavite aplikaciju na Vercel

1. Idite na https://vercel.com, **Sign Up** → **Continue with GitHub**.
2. **Add New… → Project** → pored `aplikacija-vozila` kliknite **Import**.
3. Framework će se sam prepoznati kao **Vite**. Otvorite **Environment Variables** i dodajte dve vrednosti iz Koraka 4:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | vaš Project URL |
   | `VITE_SUPABASE_ANON_KEY` | vaš anon / publishable ključ |

4. Kliknite **Deploy**. Posle 1 do 2 minuta dobijate adresu oblika `https://aplikacija-vozila-xxxx.vercel.app`. To je vaša aplikacija.

> Ako ste vrednosti dodali kasnije: **Deployments →** tri tačkice pored poslednjeg → **Redeploy**.

### Korak 6: Prva prijava

1. Otvorite adresu iz Koraka 5, ostanite na kartici **Vlasnik** i prijavite se emailom i lozinkom iz Koraka 3.
2. Prvo dodajte vozilo ili mašinu (kartica **Vozila**, odnosno **Mašine**).
3. Zatim dodajte vozače (kartica **Vozači**).

---

## Instalacija na telefon (besplatno)

Aplikacija je PWA: instalira se direktno iz pregledača.

- **Android (Chrome):** otvorite adresu, tri tačkice u uglu, **Instaliraj aplikaciju** (ili **Dodaj na početni ekran**).
- **iPhone (Safari):** otvorite adresu u **Safari-ju**, dugme za deljenje (kvadrat sa strelicom), **Dodaj na početni ekran**.

Pojaviće se ikonica kao za svaku aplikaciju. Nema naknada ni prodavnica aplikacija.

> iPhone: instalirana aplikacija ne pamti kod iz linka (iOS je odvaja od Safari-ja), pa vozač prvi put upisuje i kod i PIN. Posle toga kod ostaje.

### Sopstvena adresa (poddomen), opciono i besplatno

Ako imate domen, npr. `vasdomen.rs`, možete da dobijete adresu `vozila.vasdomen.rs`:
**Vercel → vaš projekat → Settings → Domains → Add** → upišite `vozila.vasdomen.rs`. Vercel će vam prikazati tačan DNS zapis (obično `CNAME`) koji dodajete kod firme gde držite domen. HTTPS dobijate automatski.

---

## Kako rade vozači

1. U kartici **Vozači** kliknite **Dodaj vozača**: ime, **PIN** (4 do 8 cifara) i vozila/mašine koje sme da koristi.
2. Prikazaće se **link** i **kod**. Vozaču pošaljite link (npr. Viber-om), a **PIN poslednje i posebnom porukom**. Link sam upisuje kod, pa vozač kuca samo PIN.
3. Vozač bira šta upisuje (Gorivo, Putarina, Servis, Vanredni trošak, Ostalo, Parking, Pranje vozila, Tehnički pregled, Registracija, Gume, Kazne, Osiguranje), popunjava obrazac i čuva.

Šta vozač **ne** može: da vidi ranije unose, iznose, zbirove, grafikone, cenu po km, CSV ili podsetnike. To nije samo sakriveno u izgledu: baza mu ne dozvoljava da pročita ništa (provereno automatskim testovima).

Šta treba da znate:
- Vozač ne mora da upiše iznos (npr. ako ne zna). Takav unos vidite oznakom **bez iznosa** i dopunjujete ga (na pregledu stoji traka „X unosa čeka iznos“).
- Vozač naravno zna ono što je sam upravo ukucao. Aplikacija mu ne pokazuje ni istoriju ni zbirove.
- Gorivo za vozača traži kilometre (ili radne sate) i količinu. Kilometraža ne može biti manja od poslednje upisane.
- Datum unosa: do 14 dana unazad.
- **Posle 5 pogrešnih PIN-ova** vozač je zaključan 15 minuta. **Novi PIN** (dugme na kartici vozača) odmah skida zaključavanje.
- **Izgubljen telefon:** **Novi PIN** i štiklirajte **Napravi i novi kod**. Stari link prestaje da važi.
- Vozač se automatski odjavljuje posle 10 minuta mirovanja.
- Vozača možete **isključiti** (kvačica Aktivan) ili obrisati. Njegovi dosadašnji unosi ostaju sačuvani sa njegovim imenom.

---

## Šta aplikacija računa

- **Cena po km (ili po satu)** = zbir troškova u periodu / pređeni km (ili odrađeni sati). Pređeno = najveća minus najmanja upisana vrednost brojača u tom periodu. Potrebna su bar dva unosa sa očitavanjem.
- **Potrošnja** po metodi punog rezervoara: litri od prvog do poslednjeg *punog* sipanja (bez prvog), podeljeni sa pređenim km (L/100 km) odnosno satima (L/h). Delimična sipanja između se računaju. Zato je važna kvačica **Pun rezervoar**.
- **Mesečni prosek** = ukupno / broj meseci obuhvaćenih periodom.
- **Amortizacija** (opciono, po vozilu): nabavna cena se ravnomerno raspoređuje po danima na izabrani broj godina. Prikazuje se posebno, a kvačicom „Uračunaj amortizaciju“ ulazi u cenu po km.
- Periodi: **Mesec** (tekući), **Godina** (tekuća), **12 meseci**, **Sve**.
- Unosi bez iznosa se ne računaju u zbir, dok ih ne dopunite.

## Podsetnici

Kartica **Podsetnici**, po vozilu, sa gotovim šablonima:

| Šablon | Obnavlja se (dugme „Urađeno“) |
|---|---|
| **Tehnički pregled** | na 6 meseci |
| **Registracija** | na 12 meseci |
| **Tahograf** (istek overe) | na 24 meseca |
| **Servis** | na svakih X km (ili radnih sati) i/ili X meseci |
| **Drugo** | bilo koji datum isteka |

Rokovi za obnavljanje (6, 12, 24 meseca) predlog su koji možete da promenite.

**Upozorenje se pojavljuje 30 dana pre isteka** (za sve), a za servis i kad do roka ostane 1.000 km (kod mašina 50 radnih sati). Upozorenja za **sva** vozila i mašine vidite na pregledu i kao crveni broj na prekidaču **Vozila / Radne mašine** i na kartici Podsetnici. Vozilo sa upozorenjem u listi ima oznaku ⚠.

Kad upišete trošak **Tehnički pregled** ili **Registracija**, aplikacija nudi da odmah pomeri i rok podsetnika.

> Aplikacija **ne šalje** poruke ni email: upozorenja se vide kad otvorite aplikaciju.

## CSV izvoz

Kartica **Unosi → Izvezi CSV**: separator `;`, decimalni zarez, UTF-8 sa BOM-om (Excel ispravno prikazuje č, ć, š, ž, đ). Izvozi se ono što je trenutno prikazano u listi.

---

## Dobro je znati

- **Besplatan Supabase** pauzira projekat posle oko 7 dana bez ikakvog korišćenja (vraća se jednim klikom u Supabase-u). Besplatan plan nema automatske rezervne kopije, pa **povremeno izvezite CSV**.
- **Vercel Hobby** plan je, po uslovima korišćenja, namenjen nekomercijalnoj upotrebi. Ako aplikaciju koristi firma, proverite uslove; isti projekat radi i na drugim besplatnim hostinzima za statične sajtove.
- Zaboravili ste lozinku vlasnika: Supabase → **Authentication → Users** → vaš nalog → **Send password recovery** ili postavite novu lozinku. Lozinku možete da promenite i u aplikaciji (meni ⋮ → Promena lozinke).
- Poruka **„Baza nije podešena“**: nije pokrenut Korak 2.
- Prazan ekran sa porukom o povezivanju: fale vrednosti iz Koraka 5 ili nije urađen **Redeploy**.

---

## Za programere

Stack: React 19 + Vite + TypeScript, Supabase (Auth + Postgres + RLS), PWA (`vite-plugin-pwa`), deploy na Vercel. Bez servera; ceo „backend“ je `supabase/schema.sql`.

```bash
npm install
npm run dev          # sa pravim Supabase-om (.env.local prema .env.example)
npm run dev:demo     # probna verzija sa podacima u memoriji (bez Supabase-a)
npm test             # 109 testova: proračuni i bezbednost baze
npm run build        # provera tipova + produkcioni build
```

- **Bezbednosni model** (`supabase/schema.sql`): vlasnik je Supabase korisnik, a RLS dozvoljava samo redove čiji je on vlasnik. Vozač nema nalog: `anon` rola nema pristup nijednoj tabeli, već samo dvema `SECURITY DEFINER` funkcijama (`driver_login`, `driver_add_expense`) uz kod + PIN. PIN je bcrypt hash u šemi `private`, koju API ne izlaže. Posle 5 grešaka sledi zaključavanje 15 minuta, a brojač se čuva i pri neuspehu (funkcije vraćaju status umesto da bacaju grešku).
- **Testovi baze** (`test/rls.test.ts`) pokreću pravi Postgres (PGlite) sa tom šemom i proveravaju: izolaciju vlasnika, da vozač ne može da pročita ništa, zaključavanje PIN-a, validaciju unosa i radne sate.
- **Izgled** je izdvojen: boje, fontovi i zaobljenja su u `src/theme.css`, a raspored u `src/styles.css`. Izgled prati sajt farmerkop.rs (krem podloga, tamnozelena, smeđe oznake, fontovi Bricolage Grotesque i Work Sans, dugmad u obliku pilule), uz akvamarin sa rosysoil.com za grafikone. Boje grafikona su proverene za daltoniste, u svetlom i tamnom režimu.
- **Struktura:** `src/lib` (proračuni, formati, API sloj), `src/components`, `src/pages`, `src/hooks`, `test`, `supabase`.
- Podaci iz baze se ne keširaju u service worker-u (kešira se samo sama aplikacija).
