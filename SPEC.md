# Prompt dla Claude Code: platforma SaaS do tworzenia portfolio

> Wklej całość jako pierwszą wiadomość w Claude Code (najlepiej w pustym katalogu projektu) albo zapisz w repo jako `SPEC.md` i napisz: „Przeczytaj SPEC.md i zacznij od Fazy 0”.

---

## Rola i cel

Jesteś senior full-stack developerem. Zbuduj od zera produkcyjną platformę SaaS (multi-tenant), na której klienci tworzą i publikują własne strony portfolio w edytorze drag & drop, podobnym w prostocie do portfolio z Canvy.

Model biznesowy:
- Klient rejestruje się, wybiera pakiet (subskrypcja) i tworzy stronę portfolio.
- Strona jest hostowana na subdomenie mojej domeny: `{slug}.{ROOT_DOMAIN}`.
- W wyższych pakietach klient może podpiąć własną domenę lub kupić ją przeze mnie (reseller).
- Płatności online (subskrypcje) i automatyczne fakturowanie (Polska, VAT, KSeF).
- Ja (administrator) mam panel do zarządzania klientami, subskrypcjami, fakturami, domenami, szablonami i planami.
- Administrator tworzy szablony, z których korzystają klienci; dostęp do szablonów i bloków zależy od pakietu.

## Zasady pracy (ważne)

1. **Pracuj fazami** (lista niżej). Przed każdą fazą przedstaw krótki plan, po każdej: uruchom lint, typecheck i testy, podsumuj zmiany i **zatrzymaj się na moją akceptację**, zanim przejdziesz dalej.
2. W Fazie 0 utwórz `CLAUDE.md` z opisem architektury, konwencji, komend i decyzji, a następnie aktualizuj go na bieżąco.
3. Jeśli coś jest niejasne albo wymaga decyzji biznesowej, zapytaj mnie, zamiast zgadywać. Drobne decyzje techniczne podejmuj sam i zapisuj je w `docs/decisions.md`.
4. Kod, nazwy i komentarze po angielsku. Interfejs użytkownika po polsku, ale przez system i18n (łatwe dodanie EN później).
5. Wszystkie sekrety w zmiennych środowiskowych. Utrzymuj kompletny `.env.example` z opisem każdej zmiennej.
6. Integracje zewnętrzne (płatności, faktury, domeny, DNS/SSL) zawsze za **interfejsem (adapterem)** z implementacją „mock” do developmentu i testów. Cały system ma działać lokalnie bez prawdziwych kluczy API.
7. Commituj logicznymi krokami z czytelnymi opisami (Conventional Commits).

## Stack technologiczny

- **Next.js** (App Router) + **TypeScript** (strict) jako jedna aplikacja: renderer stron klientów, panel klienta, edytor, panel admina, API
- **PostgreSQL** + **Prisma** (migracje, seed)
- **Auth.js** (email + hasło, magic link, Google), role: `CLIENT`, `SUPPORT`, `ADMIN`
- **Puck** (`@measured/puck`) jako edytor drag & drop; strony zapisywane jako JSON
- **Tailwind CSS** + **shadcn/ui** dla paneli; strony klientów stylowane przez tokeny motywu (CSS variables)
- **Stripe Billing** (subskrypcje, karty, BLIK/Przelewy24 przez Stripe, Customer Portal, webhooki)
- **Fakturownia API** do faktur VAT i wysyłki do KSeF (za adapterem `InvoicingProvider`, żeby dało się zmienić na inFakt/wFirma)
- **Cloudflare for SaaS (Custom Hostnames)** dla własnych domen klientów i SSL (adapter `HostnameProvider`)
- **Openprovider API** do sprzedaży domen, w tym .pl (adapter `DomainRegistrar`)
- **S3-compatible storage** (Cloudflare R2; lokalnie MinIO) na pliki + optymalizacja obrazów
- **Resend** do maili transakcyjnych (szablony w React Email)
- **BullMQ + Redis** (lub Inngest) do zadań w tle: weryfikacja DNS, SSL, faktury, odnowienia domen, dunning
- **Vitest** (unit/integration) + **Playwright** (E2E)
- **Docker Compose** dla lokalnego środowiska (Postgres, Redis, MinIO, Mailpit)

## Architektura

### Multi-tenancy i routing
- `middleware.ts` odczytuje nagłówek `Host`:
  - `{ROOT_DOMAIN}` / `www` → strona marketingowa (landing, cennik, logowanie)
  - `app.{ROOT_DOMAIN}` → panel klienta i edytor
  - `admin.{ROOT_DOMAIN}` → panel admina (dodatkowo chroniony rolą)
  - `{slug}.{ROOT_DOMAIN}` → opublikowana strona klienta
  - dowolna inna domena → wyszukanie w tabeli `domains` (status `ACTIVE`) → strona klienta
- Lokalnie obsłuż subdomeny przez `*.localhost` (np. `jan.localhost:3000`) oraz testowe custom domeny przez plik konfiguracyjny.
- Opublikowane strony renderowane statycznie/ISR z cache, unieważnianym przy publikacji (`revalidateTag` per site).
- Zarezerwowane slugi (`www`, `app`, `admin`, `api`, `mail` itd.) i walidacja slugów.

### Strony klientów
- `Site` (jedna lub więcej na klienta wg planu) → `Page[]` → JSON z Puck.
- Tryb **szkic / opublikowane**: edycja zawsze na wersji roboczej, „Publikuj” kopiuje ją do wersji opublikowanej.
- Historia wersji (ostatnie N publikacji) z możliwością przywrócenia.
- SEO per strona: title, description, OG image, favicon, sitemap.xml, robots.txt per site.
- Stopka „Made with {BRAND}” w planach, które ją wymuszają.
- Strona wstrzymana (brak płatności) → komunikat zamiast treści.

### Edytor (Puck)
- Biblioteka bloków jako komponenty React z ustandaryzowanymi polami: Hero, Gallery (grid/masonry/carousel), Project (tytuł, opis, zdjęcia, link), ProjectList, About, Timeline/CV, Skills, Testimonials, ContactForm, SocialLinks, Video, Text, Image, Spacer, Columns.
- Globalny **motyw** (kolory, fonty z listy, odstępy, zaokrąglenia, styl przycisków) jako CSS variables. Zmiana motywu nie rusza treści.
- Podgląd desktop / tablet / mobile.
- Upload obrazów do storage z limitem miejsca wg planu, biblioteka mediów klienta.
- Każdy blok ma `requiredTier`; edytor pokazuje tylko bloki dostępne w planie klienta (niedostępne z kłódką i CTA do upgrade'u). Walidacja także po stronie serwera przy zapisie.
- Blokady z szablonu (`lockRules`): blok zablokowany do edycji / przesuwania / usuwania.
- Formularz kontaktowy zapisuje wiadomości w bazie (skrzynka w panelu klienta) i wysyła mail; ochrona antyspamowa (honeypot + rate limit, opcjonalnie Turnstile).

### Plany i uprawnienia
- Plany są w bazie i edytowalne w panelu admina (nie hardcode'uj). Każdy plan ma:
  - powiązane ceny w Stripe (miesięczna/roczna),
  - limity (`maxSites`, `maxPages`, `maxProjects`, `storageMb`),
  - flagi funkcji (`customDomain`, `domainPurchase`, `removeBranding`, `analytics`, `formsExport`, …),
  - poziomy dostępu do szablonów/bloków (`accessTiers`, np. `["basic","pro"]`).
- Jedna centralna warstwa uprawnień, np. `lib/entitlements.ts`: `getEntitlements(user)`, `can(user, feature)`, `canUseTemplate(user, template)`, `canUseBlock(user, block)`. Używana w UI, API i przy zapisie strony.
- Seed z trzema planami: **Start** (subdomena, branding, limity podstawowe, tier basic), **Pro** (własna domena, bez brandingu, basic+pro), **Business** (wszystko + zakup domeny, wszystkie tiery).
- Polityka downgrade'u: istniejąca strona działa dalej, ale klient nie może wybrać nowych szablonów/bloków spoza planu; przy przekroczeniu limitów blokada dodawania (nie usuwamy danych). Funkcje wymagające wyższego planu (np. custom domain) są wyłączane po okresie karencji z powiadomieniem mailowym.

### Szablony
- Admin tworzy szablony w tym samym edytorze w **trybie szablonu** (`/admin/templates/:id/edit`).
- Szablon: nazwa, slug, kategoria, tagi, `accessTier`, status (`DRAFT` → `PUBLISHED` → `ARCHIVED`), miniatura, kolejność, oznaczenia „Nowość”/„Polecany”, opcjonalnie `isPremium` + cena (zakup jednorazowy przez Stripe Checkout).
- Wersjonowanie: `TemplateVersion` (pages JSON, theme JSON, lockRules JSON). Publikacja tworzy nową wersję.
- Wybór szablonu przez klienta **kopiuje** wersję do jego strony (strona pamięta `templateId` i `templateVersionId`).
- Wyjątki dostępu: `TemplateOverride` dla konkretnego planu lub użytkownika.
- Galeria szablonów dla klienta: filtry po kategorii, podgląd na żywo, kłódka i CTA dla niedostępnych.
- Zmiana szablonu na istniejącej stronie: (a) tylko motyw, z zachowaniem treści, (b) pełna zmiana układu z automatyczną kopią zapasową strony i próbą mapowania treści bloków o tym samym typie.
- Automatyczne generowanie miniatur (Playwright screenshot podglądu) jako zadanie w tle.
- Statystyki szablonu: liczba użyć, konwersja do płatnego planu.
- Seed: min. 4 szablony (fotograf, grafik/UX, programista, architekt) z treściami demo.

### Płatności (Stripe)
- Checkout dla subskrypcji (miesięczna/roczna), okres próbny konfigurowalny per plan.
- Dane do faktury przy zakupie: osoba prywatna lub firma (NIP, nazwa, adres); walidacja formatu NIP, opcjonalnie weryfikacja w GUS/VIES za adapterem.
- Upgrade/downgrade z proration, anulowanie na koniec okresu, Stripe Customer Portal do zmiany karty.
- Webhooki (z weryfikacją podpisu i idempotencją — tabela przetworzonych eventów): `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`.
- Dunning: po nieudanej płatności maile przypominające, okres karencji (konfigurowalny), potem status strony `SUSPENDED`; po opłaceniu automatyczne przywrócenie.
- Kupony i rabaty (zarządzane z panelu admina, synchronizowane ze Stripe).

### Fakturowanie
- `invoice.paid` → zadanie w tle → `InvoicingProvider.createInvoice()` (Fakturownia) → zapis numeru, PDF, statusu KSeF w tabeli `Invoice` → mail do klienta z PDF.
- Obsługa: faktura dla osoby prywatnej i firmy, korekty przy zwrotach, waluta PLN, stawki VAT konfigurowalne, przygotowanie pod reverse charge dla firm z UE (pole w danych klienta + flaga).
- Ponawianie przy błędach API i widoczny status w panelu admina („do ręcznej weryfikacji”).
- Klient pobiera swoje faktury w panelu.

### Domeny
- **Podpięcie własnej domeny** (jeśli plan pozwala):
  1. Klient wpisuje domenę → system tworzy Custom Hostname w Cloudflare.
  2. UI pokazuje instrukcję DNS (CNAME dla subdomeny/www, rekordy dla apex) i rekord weryfikacyjny.
  3. Zadanie w tle cyklicznie sprawdza status DNS i SSL; statusy: `PENDING_DNS` → `PENDING_SSL` → `ACTIVE` / `ERROR`.
  4. Opcja przekierowania `www` ↔ apex i ustawienie domeny głównej strony (subdomena zostaje jako zapasowa z przekierowaniem 301).
- **Zakup domeny** (jeśli plan pozwala):
  1. Wyszukiwarka dostępności i ceny (`DomainRegistrar.checkAvailability`), marża konfigurowalna w panelu admina.
  2. Zakup przez Stripe (płatność jednorazowa + roczne odnowienie), dane abonenta zbierane od klienta.
  3. Po płatności: rejestracja → automatyczna konfiguracja DNS → podpięcie jak wyżej.
  4. Przypomnienia o odnowieniu (30/7/1 dzień), auto-odnowienie, statusy wygaśnięcia.
- Wszystko za adapterami z implementacjami mock.

### Panel klienta (`app.`)
- Onboarding: rejestracja → wybór planu → wybór szablonu → edytor.
- Dashboard: moje strony, status publikacji, link do strony, zużycie limitów.
- Edytor, biblioteka mediów, ustawienia SEO, ustawienia strony (slug, favicon).
- Domeny: podpięcie, zakup, statusy.
- Subskrypcja: plan, zmiana planu, Customer Portal, faktury.
- Wiadomości z formularza kontaktowego.
- Podstawowe statystyki odwiedzin (prywatne, bez cookies, np. własny licznik lub Plausible za adapterem) w planach z flagą `analytics`.
- Konto: dane, hasło, dane do faktury, usunięcie konta (RODO).

### Panel admina (`admin.`)
- Dashboard: MRR, liczba aktywnych subskrypcji, nowi klienci, churn, nieudane płatności (wykresy).
- Klienci: lista z wyszukiwaniem i filtrami, szczegóły (plan, płatności, faktury, strony, domeny), notatki, blokada konta, **impersonacja** (z logiem i widocznym bannerem).
- Subskrypcje i płatności, zwroty, kupony.
- Faktury: lista, PDF, status KSeF, ponowienie wysyłki.
- Domeny: wszystkie domeny, statusy DNS/SSL, daty wygaśnięcia, ręczne akcje.
- Strony: podgląd, zawieszenie, zgłoszenia nadużyć (formularz „Zgłoś treść” na stronach klientów, wymóg DSA).
- Szablony: CRUD, edytor szablonu, wersje, dostęp, statystyki.
- Plany: CRUD, limity, flagi, tiery, synchronizacja cen ze Stripe.
- Bloki: przypisanie `requiredTier` do typów bloków.
- Użytkownicy panelu i role (`ADMIN`, `SUPPORT`), audit log wszystkich akcji administracyjnych.
- Ustawienia: marża na domeny, okres karencji, dane firmy do faktur, treść maili.

## Model danych (punkt wyjścia, dopracuj w Prisma)

`User`, `Account`/`Session` (Auth.js), `BillingProfile` (dane do faktury), `Plan`, `PlanPrice`, `Subscription`, `Site`, `Page`, `PageVersion`, `Asset`, `Template`, `TemplateVersion`, `TemplateOverride`, `TemplatePurchase`, `BlockAccess`, `Domain` (typ: `SUBDOMAIN` / `CONNECTED` / `PURCHASED`, status, cloudflareHostnameId, registrarId, expiresAt), `Payment`, `Invoice`, `Coupon`, `ContactMessage`, `AbuseReport`, `AuditLog`, `WebhookEvent`, `Setting`.

## Bezpieczeństwo i jakość

- Izolacja tenantów: każde zapytanie o dane klienta filtrowane po właścicielu (helpery w warstwie danych + testy na próbę dostępu do cudzych zasobów).
- Sanityzacja treści z edytora (brak dowolnego HTML/JS od klientów; ewentualny „embed” tylko z białej listy).
- Walidacja wejścia (Zod) na wszystkich endpointach i server actions.
- Rate limiting (logowanie, formularze kontaktowe, API domen).
- CSRF/CSP/security headers; strony klientów z restrykcyjnym CSP.
- Uploady: walidacja typu i rozmiaru, limity wg planu.
- RODO: eksport i usunięcie danych klienta, retencja logów.
- Backupy: opisz w `docs/operations.md` strategię backupu bazy i storage.
- Testy: unit dla entitlements, logiki planów, webhooków i adapterów; integracyjne dla przepływu płatność → faktura; E2E (Playwright) dla onboardingu, edycji i publikacji strony, zmiany planu, podpięcia domeny (mock).

## Fazy realizacji

- **Faza 0 – Fundament:** inicjalizacja projektu, Docker Compose, Prisma + pierwszy schemat, Auth.js z rolami, i18n, `CLAUDE.md`, `.env.example`, CI (lint, typecheck, test).
- **Faza 1 – Multi-tenancy i renderer:** middleware po `Host`, model Site/Page, renderowanie opublikowanej strony z JSON, cache i rewalidacja, rezerwacja slugów.
- **Faza 2 – Edytor:** Puck z biblioteką bloków, motywy, szkic/publikacja, wersje, biblioteka mediów i upload, SEO.
- **Faza 3 – Plany i uprawnienia:** modele planów, `entitlements`, limity, flagi, tiery bloków, seed planów.
- **Faza 4 – Szablony:** tryb szablonu w panelu admina, wersjonowanie, galeria dla klienta, kopiowanie, zmiana motywu/szablonu, seed szablonów, miniatury.
- **Faza 5 – Płatności:** Stripe Checkout, webhooki, Customer Portal, upgrade/downgrade, dunning, zawieszanie stron, kupony.
- **Faza 6 – Fakturowanie:** adapter Fakturowni, przepływ `invoice.paid` → faktura → KSeF → mail, korekty, faktury w panelach.
- **Faza 7 – Domeny:** podpinanie przez Cloudflare for SaaS, zadania weryfikacji DNS/SSL, zakup i odnowienia przez Openprovider.
- **Faza 8 – Panel admina:** dashboard metryk, klienci, impersonacja, faktury, domeny, moderacja, plany, audit log, ustawienia.
- **Faza 9 – Dopracowanie:** formularze kontaktowe, statystyki, landing i cennik, maile transakcyjne, RODO, testy E2E całych ścieżek, dokumentacja wdrożenia (Vercel lub VPS z Coolify/Caddy).

## Definicja ukończenia

- `docker compose up` + `pnpm dev` uruchamia całość lokalnie z danymi seed (admin, klient testowy w każdym planie, szablony).
- Wszystkie integracje działają w trybie mock bez kluczy; przełączenie na prawdziwe to tylko zmienne środowiskowe.
- Lint, typecheck i testy przechodzą w CI.
- `README.md` i `docs/` opisują uruchomienie, architekturę, konfigurację Stripe/Fakturowni/Cloudflare/Openprovider i wdrożenie produkcyjne.

**Zacznij od Fazy 0: przedstaw plan, zadaj pytania, jeśli coś wymaga mojej decyzji, i poczekaj na akceptację.**
