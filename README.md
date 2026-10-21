# FilmApp

FilmApp är en mobilapplikation byggd med React Native och Expo där användare kan utforska filmer, söka efter filmtitlar och skriva egna recensioner.

## Funktioner

- Visa populära filmer och filmdetaljer.
- Söka efter filmer med titel.
- Filtrera efter genre, utgivningsår och betyg.
- Sortera filmer efter popularitet, betyg eller utgivningsdatum.
- Ladda fler filmer med paginering.
- Registrera konto och logga in.
- Skapa, redigera och radera egna recensioner.
- Läsa andra användares recensioner.
- Dela filmer via mobilens delningsfunktion.

## Tekniker och REST API

- **Mobilapp:** React Native, Expo och JavaScript.
- **Backend:** Node.js och Express.
- **Databas:** MongoDB Atlas och Mongoose.
- **Filmdata:** TMDB (The Movie Database).
- **Autentisering:** JWT och bcrypt.

Mobilappen kommunicerar med en egen Express-backend via REST API med GET, POST, PATCH och DELETE.

Filminformation hämtas från TMDB medan användarkonton och recensioner lagras i MongoDB Atlas.

## Registrering och inloggning

Användare registrerar sig med användarnamn, e-postadress och lösenord. Lösenorden hashas med bcrypt innan de lagras i databasen.

Vid inloggning returnerar backend en JWT-token som sparas lokalt med **Expo SecureStore**. Detta gör att användaren kan behålla sin inloggning mellan appstarter.

Token används för skyddade API-anrop och tas bort vid utloggning. Backend kontrollerar att användare endast kan ändra sina egna recensioner.

## Mobilfunktion

Appen använder React Natives **Share-funktion** för att dela en films titel och TMDB-länk via mobilens inbyggda delningsmeny.

## Installation

### Förutsättningar

- Node.js och npm
- Git
- Android Studio med Android Emulator
- Internetanslutning
- Tillgång till MongoDB Atlas och TMDB

Projektet har utvecklats med Node.js 24.

### 1. Klona projektet

```bash
git clone https://github.com/Pelmm/FilmApp.git
cd FilmApp
```

### 2. Installera backend

```bash
cd server
npm install
```

Kopiera `server/.env.example` till `server/.env` och fyll i följande miljövariabler:

```env
MONGODB_URI=din_mongodb_anslutningsstrang
JWT_SECRET=din_jwt_hemlighet
TMDB_ACCESS_TOKEN=din_tmdb_token
```

De riktiga värdena för `MONGODB_URI`, `JWT_SECRET` och `TMDB_ACCESS_TOKEN` tillhandahålls separat och ska inte publiceras på GitHub.

### 3. MongoDB Atlas

FilmApp använder databasen `filmapp` i MongoDB Atlas, med collections för `users` och `reviews`.

För att ansluta:

1. Använd ett befintligt Atlas-kluster eller skapa ett nytt.
2. Se till att databasanvändaren har läs- och skrivrättigheter till `filmapp`.
3. Kontrollera att nätverksåtkomst är tillåten under **Network Access**.
4. Ange den giltiga anslutningssträngen som `MONGODB_URI` i `server/.env`.

MongoDB Compass behövs inte för att köra applikationen.

### 4. Installera mobilappen

Öppna en ny terminal i projektets rotmapp:

```bash
cd mobile
npm install
```

Skapa `mobile/.env` med följande innehåll:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api
```

Adressen `10.0.2.2` används för att Android Emulator ska kunna kommunicera med backend på datorn.

## Starta projektet

Backend och mobilappen behöver köras samtidigt.

**Terminal 1 – Backend**

Från projektets `server`-mapp:

```bash
npm run dev
```

**Terminal 2 – Mobilapp**

Från projektets `mobile`-mapp:

```bash
npx expo start
```

Starta Android Emulator via Android Studio och tryck `a` i Expo-terminalen för att öppna FilmApp.

Backend körs på port 3000.

## Kända begränsningar

- Appen kräver internetanslutning och en fungerande backend.
- MongoDB Atlas kräver giltiga anslutningsuppgifter och tillåten nätverksåtkomst.
- Titelsökning och avancerad filtrering är separata funktioner på grund av TMDB:s API.
- `10.0.2.2` fungerar för Android Emulator. På andra enheter behöver API-adressen anpassas.
