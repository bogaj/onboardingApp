# Komendy - TopGun Academy

Poniżej masz kroki do uruchomienia i zbudowania aplikacji.
Komendy są takie same na macOS i Windows (PowerShell lub CMD).

## macOS

### 1) Wejdz do folderu projektu
```bash
cd /Users/dargo/Programowanie/TopGunAcademy/topgun-academy
```

### 2) Instalacja zaleznosci
```bash
npm install
```

### 3) Tryb developerski (Electron + Vite)
```bash
npm run dev
```

### 4) Build (kompilacja)
```bash
npm run build
```

### 5) Paczka instalacyjna (DMG/ZIP)
```bash
npm run dist:mac
```

### 6) Wersja folderowa (bez instalatora)
```bash
npm run dist:mac:dir
```

## Windows

### 1) Wejdz do folderu projektu
```bash
cd C:\sciezka\do\topgun-academy
```

### 2) Instalacja zaleznosci
```bash
npm install
```

### 3) Tryb developerski (Electron + Vite)
```bash
npm run dev
```

### 4) Build (kompilacja)
```bash
npm run build
```

### 5) Paczka instalacyjna (EXE/ZIP)
```bash
npm run dist:win
```

### 6) Wersja folderowa (bez instalatora)
```bash
npm run dist:win:dir
npm run dist:mac
```

## Uwagi
- Wymagany jest Node.js 18+ (lub nowszy).
- `npm run build` tworzy `dist/` (frontend) i `dist-electron/` (main/preload).
- Paczki beda w folderze `release/`.
- Najlepiej budowac paczke Windows na Windowsie, a macOS na macOS.
