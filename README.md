# TopGun Academy

Lokalna aplikacja onboardingowa do nauki (desktop, Electron + React). Projekt dziala w trybie offline, z tresciami zapisanymi lokalnie i mozliwoscia eksportu lub importu materialow w ZIP.

## Status

Elektron jest zintegrowany (main/preload) i uruchamia renderer Vite. Tryb nauczyciela jest aktywny i pozwala na CRUD tematow, lekcji oraz komponentow w lekcji. Pliki do pobrania, obrazy i wideo mozna dolaczac z dysku i sa przechowywane lokalnie przy aplikacji.

## Funkcje MVP (stan obecny)

- Tryb ucznia: imie, nawigacja po tematach i lekcjach, osobne scrollowanie listy i tresci.
- Wyszukiwarka: filtruje po nazwach i tresci, podswietla dopasowania.
- Postep: oznaczanie lekcji jako ukonczonych, przycisk "Zrozumialem lekcje", mozliwosc resetu.
- Odznaka: generowana lokalnie w Canvas API i pobierana jako PNG (zapis przez dialog Electron, w przegladarce standardowy download).
- Komponenty lekcji: tekst (WYSIWYG z wklejaniem z Worda lub Markdown), wideo (embed lub plik), obrazy z lightboxem, materialy ZIP, testy.
- Pliki z dysku: nauczyciel moze dolaczyc PDF/ZIP/PNG itd. i zapisac je w pamieci aplikacji.
- Obrazy z dysku: nauczyciel moze dodac grafiki z miniaturkami i opisem.
- Wideo z dysku: nauczyciel moze dodac lokalne nagranie jako plik.
- Tryb nauczyciela: logowanie (topgun / topgunpass), dodawanie i edycja tematow, lekcji, komponentow oraz usuwanie z potwierdzeniem.
- Testy: losowa kolejnosc pytan i odpowiedzi, zapis postepu, wynik koncowy oraz odznaka z wynikiem.
- Import/eksport lekcji jako ZIP (z assets) z oknem wyboru zapisu i importu.

## Model danych

- Jeden onboarding zawiera wiele tematow.
- Temat zawiera wiele lekcji.
- Lekcja sklada sie z wierszy (4-kolumnowy grid) i komponentow:
  - tekst (Markdown)
  - wideo (embed lub plik)
  - obraz(y) + lightbox
  - pliki do pobrania (ZIP)
  - test (pytania wielokrotnego wyboru)

## Lokalny zapis (renderer)

- `tga-student-name` – imie ucznia
- `tga-completed-lessons` – tablica ID ukonczonych lekcji
- `tga-topics` – struktura tematow i lekcji (edytowana przez nauczyciela)
- `tga-test-progress` – postep rozwiazywania testow
- `tga-test-results` – wyniki zakonczonych testow

Pliki z dysku sa zapisywane w katalogu danych aplikacji Electron (`userData/assets`).

## Uruchomienie

```bash
npm install
npm run dev
```

## Skrypty

- `npm run dev` – start Electron + Vite (renderer)
- `npm run dev:renderer` – sam renderer Vite
- `npm run build` – build Vite + kompilacja Electron
- `npm run preview` – podglad buildu Vite

## Nastepne kroki (propozycje)

1. Zapisywanie odznak i postepu do plikow lokalnych (np. katalog uzytkownika).
2. Dopracowanie walidacji i historii zmian w trybie nauczyciela.
3. Dodanie konfiguracji ikon aplikacji (icns/ico) i podpisywania buildow.
