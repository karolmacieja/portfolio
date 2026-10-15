/**
 * Default drafts of the legal documents (Polish), based on what the platform actually does. They are a
 * starting point to be reviewed by a lawyer and edited in the admin panel (/settings). Placeholders
 * {company}, {email}, {brand} and {domain} are filled from the invoicing seller data and env on render.
 *
 * Format (see LegalText): "## " heading, "- " list item, blank line between paragraphs. No HTML.
 */

export const DEFAULT_TERMS = `## 1. Postanowienia ogólne

Regulamin określa zasady korzystania z serwisu {brand} dostępnego pod adresem {domain} (dalej: Serwis), w którym użytkownicy tworzą i publikują strony portfolio.

Usługodawcą jest {company} (dalej: Usługodawca). Kontakt: {email}.

Korzystanie z Serwisu wymaga urządzenia z dostępem do internetu i aktualnej przeglądarki internetowej oraz adresu e-mail.

## 2. Konto

- Konto zakłada się, podając imię, adres e-mail i hasło, albo logując się linkiem e-mail lub kontem Google.
- Użytkownik odpowiada za poufność danych logowania i aktualność swoich danych.
- Zakup planu wymaga potwierdzenia adresu e-mail i podania danych do faktury.

## 3. Plany, płatności i faktury

- Tworzenie i edycja stron są bezpłatne; publikacja strony wymaga aktywnego planu. Zakres planów i ceny (brutto) są podane w cenniku.
- Plany są subskrypcjami odnawianymi co miesiąc lub co rok. Płatności obsługuje Stripe; Usługodawca nie przechowuje danych kart.
- Plan może zawierać bezpłatny okres próbny. Subskrypcję można anulować w każdej chwili ze skutkiem na koniec opłaconego okresu.
- Po nieudanej płatności Serwis ponawia ją i wysyła przypomnienia; po okresie karencji strony mogą zostać wstrzymane do czasu opłacenia planu.
- Za każdą płatność wystawiamy fakturę, przekazywaną do Krajowego Systemu e-Faktur (KSeF) i wysyłaną e-mailem.

## 4. Treści użytkownika

- Użytkownik odpowiada za treści publikowane na swoich stronach i oświadcza, że ma do nich prawa.
- Zabronione są treści bezprawne, w szczególności naruszające prawa autorskie, dobra osobiste, wprowadzające w błąd lub nawołujące do nienawiści.
- Każda opublikowana strona zawiera link „Zgłoś treść”. Zgłoszenia rozpatrujemy bez zbędnej zwłoki; o decyzji informujemy zgłaszającego, a w razie wstrzymania strony — jej właściciela, wraz z uzasadnieniem.
- Użytkownik udziela Usługodawcy licencji na przechowywanie i wyświetlanie treści w zakresie potrzebnym do świadczenia usługi.

## 5. Domeny

- W wybranych planach można podłączyć własną domenę lub kupić ją za pośrednictwem Serwisu.
- Kupiona domena jest rejestrowana na dane użytkownika i odnawiana co rok z jego karty, dopóki odnawianie jest włączone. Kod transferu jest dostępny w panelu.

## 6. Zawieszenie i usunięcie konta

- Usługodawca może zablokować konto naruszające Regulamin, informując o przyczynie.
- Użytkownik może w każdej chwili usunąć konto w ustawieniach konta. Strony przestają być dostępne od razu, a dane są usuwane po 14 dniach (do tego czasu usunięcie można anulować). Subskrypcje kończą się bez zwrotu za niewykorzystany okres.

## 7. Reklamacje

Reklamacje można składać na adres {email}. Odpowiadamy w ciągu 14 dni.

## 8. Prawo odstąpienia od umowy

Konsument może odstąpić od umowy w ciągu 14 dni od jej zawarcia bez podania przyczyny. Jeżeli na wyraźne żądanie konsumenta usługa zaczęła być świadczona przed upływem tego terminu, konsument płaci za usługę świadczoną do chwili odstąpienia.

## 9. Postanowienia końcowe

- O zmianach Regulaminu informujemy e-mailem i w panelu z wyprzedzeniem. Zalogowani użytkownicy akceptują nową wersję w panelu.
- W sprawach nieuregulowanych stosuje się prawo polskie.`;

export const DEFAULT_PRIVACY = `## 1. Administrator danych

Administratorem danych osobowych użytkowników Serwisu {brand} ({domain}) jest {company}. Kontakt w sprawach danych osobowych: {email}.

## 2. Jakie dane przetwarzamy i po co

- Dane konta (imię, e-mail, hasło w postaci skrótu) — świadczenie usługi (art. 6 ust. 1 lit. b RODO).
- Dane do faktur i historia płatności — wystawianie faktur i obowiązki podatkowe (art. 6 ust. 1 lit. c RODO).
- Treści stron i pliki — publikacja stron użytkownika (art. 6 ust. 1 lit. b RODO).
- Dane rejestrującego domenę — rejestracja domen kupionych przez Serwis (art. 6 ust. 1 lit. b RODO).
- Adresy IP w dzienniku zdarzeń i limitach prób logowania — bezpieczeństwo Serwisu (art. 6 ust. 1 lit. f RODO).

## 3. Odbiorcy danych

Dane powierzamy dostawcom, bez których usługa nie działa: hostingowi serwerów, Cloudflare (sieć i certyfikaty), Stripe (płatności), Fakturowni (faktury) i Ministerstwu Finansów (KSeF), Openprovider (rejestracja domen) oraz dostawcy poczty e-mail. Część z nich może przetwarzać dane poza EOG na podstawie standardowych klauzul umownych.

## 4. Jak długo przechowujemy dane

- Dane konta — do czasu usunięcia konta (po 14 dniach od zlecenia usunięcia).
- Faktury i dane płatności — 5 lat od końca roku podatkowego.
- Dziennik zdarzeń administracyjnych — 2 lata.
- Wiadomości z formularzy kontaktowych — do usunięcia przez użytkownika, najdłużej 2 lata.

## 5. Twoje prawa

Masz prawo dostępu do danych i ich przeniesienia (eksport w ustawieniach konta), sprostowania, usunięcia (usunięcie konta w ustawieniach), ograniczenia przetwarzania, sprzeciwu oraz skargi do Prezesa Urzędu Ochrony Danych Osobowych.

## 6. Pliki cookies

Panel Serwisu używa wyłącznie niezbędnych plików cookies: sesji logowania i wybranego języka. Opublikowane strony użytkowników nie zapisują żadnych plików cookies. Nie używamy cookies reklamowych ani analitycznych.

## 7. Strony użytkowników

- Statystyki odwiedzin stron liczymy bez cookies i bez zapisywania adresów IP: odwiedzający jest rozpoznawany tylko w obrębie jednego dnia za pomocą jednorazowego skrótu, który usuwamy następnego dnia.
- Dane wysłane przez formularz kontaktowy na stronie użytkownika trafiają do właściciela tej strony, który jest ich administratorem; Serwis przetwarza je w jego imieniu (powierzenie przetwarzania na podstawie Regulaminu).
- Adresy IP osób zgłaszających treści i wysyłających wiadomości zapisujemy wyłącznie jako skrót, w celu ograniczania nadużyć.`;
