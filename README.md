# Troškovi vozila

Aplikacija za praćenje **stvarnog troška vozila i radnih mašina** (viljuškara): gorivo, putarine, servis, registracija, tehnički pregled, pranje, vanredni i ostali troškovi, sa podsetnicima za rokove.

- **Vlasnik** (vi) vidi sve: cene, zbirove, grafikone, cenu po kilometru / po radnom satu, potrošnju.
- **Vozač** može da upiše bilo koji trošak, ali **ne vidi ništa od toga**: ni ranije unose, ni iznose, ni zbirove. Prijavljuje se kodom i PIN-om, bez naloga.
- **Cenu goriva** upisujete jednom nedeljno, a iznos svakog sipanja koje nema upisan iznos aplikacija **sama obračuna** (litri × cena).
- Radi na telefonu i računaru, ceo na srpskom (latinica), i može da se **instalira na telefon besplatno** (bez Play Store-a i App Store-a).
- Sama održava Supabase bazu „budnom“, da je besplatan plan ne pauzira (vidi **Da baza ne zaspi**).

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
4. Na **Pregledu** kliknite **Upiši cenu** u kartici **Cena goriva** i upišite današnju cenu goriva (vidi **Cena goriva i automatski obračun**).

---

## Ažuriranje (kad dobijete novu verziju)

Redosled je važan: **prvo baza, pa aplikacija**. Tako stara verzija radi sve vreme, a nova nikad ne naiđe na bazu koja nije spremna.

1. **Baza:** u Supabase-u otvorite **SQL Editor → New query**, nalepite **ceo** sadržaj fajla `supabase/schema.sql` sa GitHub-a (ikonica **Copy raw file**) i kliknite **Run**. Treba da piše *Success. No rows returned*. Skripta samo dodaje novo i zamenjuje sopstvena pravila pristupa. **Podaci ostaju netaknuti**, a pokretanje više puta je bezbedno.
2. **Aplikacija:** spojite novu verziju u granu `main` (isto kao Korak 0, ili recite Claude-u „spoji“). Vercel posle 1 do 2 minuta sam objavi novu verziju.
3. **Telefon:** zatvorite aplikaciju i otvorite je ponovo. Instalirana aplikacija se sama osveži.

> Ako nova verzija stigne pre nego što pokrenete ažuriranu šemu, aplikacija i dalje radi kao do sada. Samo kartica **Cena goriva** na Pregledu piše da baza još nije ažurirana, a dugme za cenu se pojavljuje čim pokrenete `supabase/schema.sql`.

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
3. Posle prijave vozač **prvo bira vozilo** (ili mašinu) za koje upisuje, da ne bi pogrešio. Tek kad dodirne vozilo, nudi mu se šta upisuje (Gorivo, Putarina, Servis, Vanredni trošak, Ostalo, Parking, Pranje vozila, Tehnički pregled, Registracija, Gume, Kazne, Osiguranje). Popunjava obrazac i čuva.
4. Izabrano vozilo stoji na vrhu ekrana, sa dugmetom **Promeni**. Posle svakog unosa može da upiše **novi unos** za isto vozilo, da izabere **drugo vozilo** ili da se odjavi.

Vozač koji ima **samo jedno vozilo** ne bira ništa (ne može da pogreši): odmah vidi svoje vozilo. Viljuškari i ostale mašine su u izboru odvojeni od vozila, a za njih se upisuju radni sati umesto kilometara.

Šta vozač **ne** može: da vidi ranije unose, iznose, zbirove, grafikone, cenu po km, cenu goriva, CSV ili podsetnike. To nije samo sakriveno u izgledu: baza mu ne dozvoljava da pročita ništa (provereno automatskim testovima).

Šta treba da znate:
- Vozač ne mora da upiše iznos (npr. ako ne zna). Takav unos vidite oznakom **bez iznosa** i dopunjujete ga (na pregledu stoji traka „X unosa čeka iznos“). Za **gorivo** vozač upisuje samo litre, a iznos obračunavate vi preko cene goriva (vidi dole).
- Vozač naravno zna ono što je sam upravo ukucao. Aplikacija mu ne pokazuje ni istoriju ni zbirove.
- Gorivo za vozača traži kilometre (ili radne sate) i količinu. Kilometraža ne može biti manja od poslednje upisane.
- Datum unosa: do 14 dana unazad.
- **Posle 5 pogrešnih PIN-ova** vozač je zaključan 15 minuta. **Novi PIN** (dugme na kartici vozača) odmah skida zaključavanje.
- **Izgubljen telefon:** **Novi PIN** i štiklirajte **Napravi i novi kod**. Stari link prestaje da važi.
- Vozač se automatski odjavljuje posle 10 minuta mirovanja.
- Vozača možete **isključiti** (kvačica Aktivan) ili obrisati. Njegovi dosadašnji unosi ostaju sačuvani sa njegovim imenom.

---

## Cena goriva i automatski obračun

Iznos goriva ne morate da upisujete. Dovoljno je da povremeno upišete **cenu goriva**:

1. Na **Pregledu** je kartica **Cena goriva** (za vrstu goriva izabranog vozila ili mašine). Kliknite **Nova cena** (ili **Upiši cenu**).
2. Upišite **cenu po litru** (za struju po kWh). Polje **Važi od** je već ponedeljak ove nedelje, pa cenu možete da upisujete jednom nedeljno. Istorija cena je u istom prozoru, svaku možete da obrišete.
3. Svako sipanje **bez upisanog iznosa** (npr. vozač je upisao samo litre) dobija iznos = **litri × cena koja je važila na dan sipanja**. U listi unosa ispod iznosa piše **obračun**, a stoji i cena po litru.

Pravila:
- **Iznos koji sami upišete uvek ima prednost** nad obračunom. Pri unosu goriva iznos nije obavezan, a ispod polja piše koliko će iznositi obračun.
- Obračunat iznos se **ne upisuje** u bazu, već se računa iznova. Zato se promenom ili brisanjem cene sva sipanja odmah preračunaju, bez ikakvog ručnog posla.
- Cena se čuva posebno za svaku vrstu goriva (Dizel, Benzin, TNG, Električno). Viljuškar na TNG-u koristi cenu TNG-a.
- Za dane **pre prve upisane cene** iznos ostaje prazan (**bez iznosa**). Na kartici piše koliko sipanja nema ni iznos ni cenu. Upišite cenu sa ranijim datumom u polju **Važi od** i ona će biti obračunata.
- Kartica upozorava kad je cena starija od 7 dana („stara N dana“).
- Obračunati iznosi ulaze u zbirove, cenu po km i grafikone. U CSV izvozu su kolone **Cena po litru** i **Iznos obračunat po ceni goriva** (piše **Da** kad iznos nije upisan, već obračunat).

---

## Šta aplikacija računa

- **Cena po km (ili po satu)** = zbir troškova u periodu / pređeni km (ili odrađeni sati). Pređeno = od stanja brojača na početku perioda do najvećeg upisanog u periodu. Stanje na početku perioda je poslednje očitavanje pre perioda, a za prvi period **početna kilometraža** vozila (odnosno početni radni sati). Na Pregledu piše „od … do …“, pa se vidi tačno šta je uračunato.
- **Početna kilometraža** je stanje brojača kad je rezervoar bio **pun**, pre prvog upisanog sipanja. Zato se i cena po km i potrošnja računaju **već posle prvog sipanja**: prvo sipanje pokriva put od početne kilometraže. Proverite je kod svakog vozila (**Vozila → Izmeni**). Ako je ostala 0, aplikacija ne zna odakle je krenulo i čeka drugo sipanje.
- **Potrošnja** po metodi punog rezervoara: razmak između dva uzastopna *puna* sipanja (prvo „puno“ je početna kilometraža) daje litre podeljene sa pređenim km (L/100 km) odnosno satima (L/h). Delimična sipanja između se računaju u sledeće puno. Zato je važna kvačica **Pun rezervoar**. U period ulaze razmaci čije je puno sipanje u tom periodu.
- **Mesečni prosek** = ukupno / broj meseci obuhvaćenih periodom.
- **Amortizacija** (opciono, po vozilu): nabavna cena se ravnomerno raspoređuje po danima na izabrani broj godina. Prikazuje se posebno, a kvačicom „Uračunaj amortizaciju“ ulazi u cenu po km.
- Periodi: **Mesec** (tekući), **Godina** (tekuća), **12 meseci**, **Sve**.
- Unosi bez iznosa se ne računaju u zbir, dok ih ne dopunite. Izuzetak je **gorivo** kad postoji cena goriva za taj dan: tada se iznos obračunava sam (vidi **Cena goriva i automatski obračun**).

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

## Da baza ne zaspi

Besplatan Supabase **pauzira projekat** posle oko 7 dana bez aktivnosti i šalje obaveštenje o tome. Zato aplikacija sama „budi“ bazu:

- **Jednom dnevno** (oko 5 ujutru po UTC vremenu) Vercel automatski pokreće zakazani posao **`/api/keepalive`**. On pozove Supabase i upiše vreme poslednjeg poziva u jednu malu tabelu. To je prava aktivnost na bazi, a ne samo čitanje.
- Ne treba ništa da podešavate: posao je već u fajlu `vercel.json`, a koristi iste dve vrednosti (`VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`) koje ste već upisali na Vercel-u.
- **Provera:** otvorite `https://vasa-adresa.vercel.app/api/keepalive`. Treba da piše `{"ok":true,...}`. Ako piše `ok:false`, poruka kaže šta nedostaje (obično vrednosti iz Koraka 5). Na Vercel-u se rad posla vidi u **projekat → Settings → Cron Jobs** (Hobby plan dozvoljava jednom dnevno, što je dovoljno).
- Baza se pri tome ne opterećuje: upis se obavlja najviše jednom na sat, bez obzira koliko puta se adresa otvori.

**Ako je projekat već pauziran** (u Supabase-u piše *Project paused*, a aplikacija ne može da se poveže): otvorite projekat u Supabase-u i kliknite **Restore project**, pa sačekajte nekoliko minuta. Podaci su sačuvani, ali Supabase dozvoljava vraćanje pauziranog projekta samo ograničeno vreme (oko 90 dana), pa nemojte dugo čekati. Posle toga ga aplikacija sama drži budnim.

---

## Dobro je znati

- **Besplatan Supabase** nema automatske rezervne kopije, pa **povremeno izvezite CSV**. Pauziranje zbog neaktivnosti je rešeno automatskim održavanjem (vidi iznad).
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
npm test             # 151 test: proračuni, bezbednost baze i održavanje budnim
npm run build        # provera tipova + produkcioni build
```

- **Bezbednosni model** (`supabase/schema.sql`): vlasnik je Supabase korisnik, a RLS dozvoljava samo redove čiji je on vlasnik. Vozač nema nalog: `anon` rola nema pristup nijednoj tabeli, već samo dvema `SECURITY DEFINER` funkcijama (`driver_login`, `driver_add_expense`) uz kod + PIN. PIN je bcrypt hash u šemi `private`, koju API ne izlaže. Posle 5 grešaka sledi zaključavanje 15 minuta, a brojač se čuva i pri neuspehu (funkcije vraćaju status umesto da bacaju grešku).
- **Cena goriva:** tabela `fuel_prices` (po vrsti goriva i datumu „važi od“) vidljiva je samo vlasniku, a upis ide kroz funkciju `set_fuel_price` (proverava vrstu, cenu i datum). Iznos sipanja bez iznosa se **ne čuva**, već se računa pri čitanju (`applyFuelPrices` u `src/lib/calc.ts`: litri × cena koja je važila na dan sipanja), pa promena cene preračuna sve unazad. Vozač nema pristup cenama.
- **Održavanje budnim:** `api/keepalive.js` (Vercel funkcija) poziva javnu funkciju `public.keepalive()`, koja najviše jednom na sat ažurira red u `private.heartbeat`. Zakazan je u `vercel.json` (`crons`, jednom dnevno, što dozvoljava i Hobby plan).
- **Testovi baze** (`test/rls.test.ts`) pokreću pravi Postgres (PGlite) sa tom šemom i proveravaju: izolaciju vlasnika, da vozač ne može da pročita ništa, zaključavanje PIN-a, validaciju unosa, radne sate, cene goriva i ponovno pokretanje šeme nad bazom koja već ima podatke.
- **Izgled** je izdvojen: boje, fontovi i zaobljenja su u `src/theme.css`, a raspored u `src/styles.css`. Izgled prati sajt farmerkop.rs (krem podloga, tamnozelena, smeđe oznake, fontovi Bricolage Grotesque i Work Sans, dugmad u obliku pilule), uz akvamarin sa rosysoil.com za grafikone. Boje grafikona su proverene za daltoniste, u svetlom i tamnom režimu.
- **Struktura:** `src/lib` (proračuni, formati, API sloj), `src/components`, `src/pages`, `src/hooks`, `test`, `supabase`.
- Podaci iz baze se ne keširaju u service worker-u (kešira se samo sama aplikacija).
