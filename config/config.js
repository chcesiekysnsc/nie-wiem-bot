module.exports = {
  prefix: '!',
  admins: ['100060812419294', '100089655356822', '61554894353095', '100053875564339'],
  logRecipientId: '',
  adminGroupId: '5277347745703557',
  casinoName: 'Bot',
  currencyEmoji: '💰',
  messenger: {
    port: 3000,
    webhookPath: '/webhook',
    graphVersion: 'v24.0',
    pageId: '',
    botAvatarUrl: ''
  },
  embed: {
    primary: 0xD4AF37
  },
  antiSpam: {
    maxCommands: 6,
    perSeconds: 10,
    muteSeconds: 15,
    cooldownBlacklist: {
      maxNotifications: 5,
      perSeconds: 30
    }
  },
  cooldowns: {
    default: 3,
    help: 3,
    bal: 2,
    daily: 5,
    work: 600,
    crime: 900,
    rob: 20,
    slots: 4,
    blackjack: 10,
    coinflip: 4,
    ruletka: 5,
    bet: 3,
    duel: 3,
    leaderboard: 8,
    wplac: 3,
    wyplac: 3,
    sklep: 3,
    eq: 3,
    marry: 12,
    pfp: 4,
    admadd: 2,
    del: 2,
    weather: 5,
    wiki: 5,
    dictionary: 5,
    news: 8,
    joke: 3,
    fact: 3,
    quote: 3,
    xkcd: 5,
    movie: 6,
    currency: 5,
    hello: 2,
    bye: 2,
    thanks: 2,
    loteria: 3,
    loteriastart: 2,
    podatki: 3,
    artefakty: 3,
    rynek: 3,
    itemadd: 2,
    firma: 3,
    analiza: 10,
    krolik: 0,
    kot: 0
  },
  adminDailyLimits: {
    unlimited: ['admadd', 'admgiv', 'admgivglobal', 'reset', 'del', 'global', 'say', 'loteriastart'],
    daily: {
      reakcja: 5,
      flaga: 5
    }
  },
  economy: {
    defaultUser: {
      balance: 5000,
      bank: 10000,
      level: 5,
      xp: 240,
      totalWon: 12000,
      totalLost: 8000,
      gamesPlayed: 53,
      wins: 0,
      losses: 0,
      commandsUsed: 0,
      lastActiveThreadId: null,
      prestige: 1,
      bio: '',
      badges: [],
      marriedTo: null,
      dailyCooldown: 0,
      messageCount: 0,
      groupMessages: {},
      commandCounts: {},
      company: null,
      defaultCity: null,
      openedPackagesToday: 0,
      lastPackageOpenDate: null
    },
    companies: {
      kiosk: {
        name: 'Kiosk',
        price: 2000000,
        payout: 45000,
        breakChance: 0.06,
        emoji: '🏪'
      },
      restauracja: {
        name: 'Restauracja',
        price: 4000000,
        payout: 95000,
        breakChance: 0.08,
        emoji: '🍔'
      },
      salon: {
        name: 'Salon Gier',
        price: 6000000,
        payout: 150000,
        breakChance: 0.10,
        emoji: '🎮'
      },
      stocznia: {
        name: 'Stocznia',
        price: 8000000,
        payout: 220000,
        breakChance: 0.12,
        emoji: '🚢'
      },
      bank: {
        name: 'Prywatny Bank',
        price: 10000000,
        payout: 340000,
        breakChance: 0.15,
        emoji: '🏦'
      }
    },
    maxBet: 100000,
    dailyMin: 900,
    dailyMax: 2200,
    dailyVipBonus: 1.25,
    workMin: 5000,
    workMax: 25000,
    workVipBonus: 1.1,
    crimeSuccessChance: 0.52,
    crimeWinMin: 400,
    crimeWinMax: 2400,
    crimeLoseMin: 200,
    crimeLoseMax: 1100,
    robSuccessChance: 0.38,
    robMinTarget: 2500,
    robMinPercent: 0.1,
    robMaxPercent: 0.3,
    bankBaseCapacity: 100000,
    bankVipBonus: 25000,
    bankPrestigeBonus: 25000,
    goldenCardBonus: 50000,
    xpPerLevelBase: 180,
    xpPerLevelGrowth: 55,
    jailDurationMinutes: 30
  },
  shopItems: {
    klodka: {
      name: 'Klodka',
      emoji: '🔒',
      price: 35000,
      shortDesc: 'Chroni przed kradzieżą (!rob).',
      description: 'Chroni przed kradzieżą przez innego gracza (!rob). Kłódka jest zużywana przy każdej próbie robu — złodziej traci możliwość kradzieży i odchodzi z niczym.',
      type: 'stackable'
    },
    piwo: {
      name: 'Piwo',
      emoji: '🍺',
      price: 50000,
      shortDesc: 'Bonus do !rob (+5% łup lub -10% kara).',
      description: 'Użyj przed !rob: daje 50% szans na zwiększony łup (+5%, czyli 25% zamiast 20%). Uwaga — przy wpadce kara rośnie do 40% zamiast 30%. Ryzyko się opłaca odważnym!',
      type: 'stackable'
    },
    ticket: {
      name: 'Bilet Loterii',
      emoji: '🎟️',
      price: 50000,
      shortDesc: 'Udział w loterii co 10 min (max 5 szt.).',
      description: 'Bilet uprawnia do udziału w automatycznej loterii, która losuje zwycięzcę co 10 minut. Im więcej biletów, tym większa szansa wygranej. Nagroda = liczba biletów × 50 000. Limit: 5 biletów na osobę.',
      type: 'stackable'
    },
    bomba: {
      name: 'Bomba',
      emoji: '💣',
      price: 100000,
      shortDesc: 'Pułapka: obrabowuje złodzieja przy !rob.',
      description: 'Aktywna pułapka na złodzieja. Gdy ktoś spróbuje cię okraść (!rob), bomba wybucha — kradnie 40% portfela złodzieja i nakłada na niego 30 minut cooldownu na !rob. Bomba zużywa się po aktywacji.',
      type: 'stackable'
    },
    paczka_brazowa: {
      name: 'Brązowa Paczka',
      emoji: '🟫',
      price: 50000,
      shortDesc: 'Lootbox: 20.25k–65.25k + 10% Bilet Loterii + 3% Walizka.',
      description: 'Otwórz komendą: !otworz brazowa\nZawartość: losowa kwota od 20 250 do 65 250 viccoinów (rozkład równomierny).\nBonus drop: 10% Bilet Loterii, 3% Walizka.',
      type: 'stackable'
    },
    paczka_srebrna: {
      name: 'Srebrna Paczka',
      emoji: '⬜',
      price: 100000,
      shortDesc: 'Lootbox: 64.125k–131.625k + szansa na Kłódkę, Piwo, Kominiarkę, Podręcznik.',
      description: 'Otwórz komendą: !otworz srebrna\nZawartość: losowa kwota od 64 125 do 131 625 viccoinów.\nBonus drop: 5% Kłódka, 5% Piwo, 2.5% Kominiarka, 2.5% Podręcznik Praktykanta.',
      type: 'stackable'
    },
    paczka_zlota: {
      name: 'Złota Paczka',
      emoji: '🟨',
      price: 200000,
      shortDesc: 'Lootbox: 130.5k–220.5k + szansa na itemy/Księgę/Włamywacza/Latarkę.',
      description: 'Otwórz komendą: !otworz zlota\nZawartość: losowa kwota od 130 500 do 220 500 viccoinów.\nBonus drop: 5% Bomba, 3% Kłódka+Piwo, 2% Bilet, 2% Złota Karta, 1% Kamera, 1% Talizman Fortuny, 1% Księga Inwestora, 1.5% Zestaw Włamywacza, 1.5% Latarka.',
      type: 'stackable'
    },
    paczka_diamentowa: {
      name: 'Diamentowa Paczka',
      emoji: '🟦',
      price: 500000,
      shortDesc: 'Lootbox: 202.5k–652.5k + szansa na VIP/Sejf/Alarm/Psa/Kaczkę.',
      description: 'Otwórz komendą: !otworz diamentowa\nZawartość: losowa kwota od 202 500 do 652 500 viccoinów.\nBonus drop: 5% VIP Pass, 5% Ulepszenie Banku, 2% Krwawy Żeton, 0.5% Stary Zegar, 3% Godło Gangu, 3% Garnitur, 2% Alarm, 2% Pies Stróżujący, 1.5% Kaczka Biznesu.',
      type: 'stackable'
    },
    // Poniższe itemy są niedostępne w sklepie — wypadają tylko z paczek
    vip: {
      name: 'VIP Pass',
      emoji: '👑',
      price: 100000,
      shortDesc: 'Bonus do !daily, !work i większy bank.',
      description: 'Daje stały bonus do nagród z !daily (+25%) i !work (+10%) oraz zwiększa pojemność banku o 25 000. Tylko jeden egzemplarz na gracza. Dostępny wyłącznie z 🟦 Diamentowej Paczki.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępny tylko z 🟦 Diamentowej Paczki!'
    },
    sejf: {
      name: 'Ulepszenie Banku',
      emoji: '🏦',
      price: 150000,
      shortDesc: 'Zwiększa pojemność banku o 75 000.',
      description: 'Jednorazowy upgrade: trwale zwiększa pojemność banku o 75 000 viccoinów. Tylko jeden egzemplarz na gracza. Dostępny wyłącznie z 🟦 Diamentowej Paczki.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępne tylko z 🟦 Diamentowej Paczki!'
    },
    krwawy_zeton: {
      name: 'Krwawy Żeton',
      emoji: '🩸',
      price: 0,
      shortDesc: 'Pasywny PvP: +6% szansa rob, +4% łup, +8% kara przy wpadce.',
      description: 'Zwiększa szansę powodzenia komendy !rob o 6%. Jeśli kradzież się uda, otrzymujesz +4% dodatkowego łupu. Jeśli nie, kara jest zwiększona o 8%. Efekty się nie stackują.',
      type: 'stackable',
      buyable: false,
      shopNote: 'Dostępny z wojen gangów (4%) lub paczki diamentowej (2%).'
    },
    przekupiony_krupier: {
      name: 'Przekupiony Krupier',
      emoji: '🧠',
      price: 0,
      shortDesc: 'Hazard passive: 3% większa szansa na korzystną kartę w blackjacku.',
      description: 'Daje 3% szansy na dobór korzystniejszej karty w grze !blackjack podczas dobierania (hit). Efekty się nie stackują.',
      type: 'stackable',
      buyable: false,
      shopNote: 'Dostępny tylko z 🩶 Tytanowej Paczki (2%).'
    },
    zlota_karta: {
      name: 'Złota Karta',
      emoji: '💳',
      price: 0,
      shortDesc: '+50k miejsca w banku.',
      description: 'Zwiększa pojemność Twojego banku o 50 000 viccoinów. Efekty się nie stackują.',
      type: 'stackable',
      buyable: false,
      shopNote: 'Dostępna tylko ze Złotej Paczki (2%).'
    },
    stary_zegar: {
      name: 'Stary Zegar',
      emoji: '⏰',
      price: 0,
      shortDesc: '10% krótszy cooldown na !work oraz !crime.',
      description: 'Skraca cooldown na komendy !work oraz !crime o 10%. Efekty się nie stackują.',
      type: 'stackable',
      buyable: false,
      shopNote: 'Dostępny tylko z Diamentowej Paczki (0.5%).'
    },
    kamera: {
      name: 'Kamera',
      emoji: '📷',
      price: 0,
      shortDesc: 'Defensywny: +5% więcej z kary gdy złodziej wpadnie.',
      description: 'Gdy ktoś próbuje Cię okraść i zostanie przyłapany, dostajesz dodatkowo 5% z kwoty kary nałożonej na złodzieja. Efekty się nie stackują.',
      type: 'stackable',
      buyable: false,
      shopNote: 'Dostępna tylko ze Złotej Paczki (1%).'
    },
    paczka_tytanowa: {
      name: 'Tytanowa Paczka',
      emoji: '🩶',
      price: 800000,
      shortDesc: 'Lootbox: 495k–900k + szansa na Krupiera, Kostkę, Insygnia, Księgową.',
      description: 'Otwórz komendą: !otworz tytanowa\nZawartość: losowa kwota od 495 000 do 900 000 viccoinów.\nBonus drop: 2% Przekupiony Krupier, 3% Kostka Ryzyka, 3% Insygnia Gangu, 0.75% Dobra Księgowa, 40% Bomba/Piwo/Kłódka.',
      type: 'stackable',
      buyable: true
    },
    talizman_fortuny: {
      name: 'Talizman Fortuny',
      emoji: '📿',
      price: 0,
      shortDesc: '+1% do wygranej za każdy streak wygranych (max +10%)',
      description: 'Zwiększa wygraną netto o 1% za każdą kolejną wygraną z rzędu w kasynie (max. +10%). Przegrana resetuje passę.',
      type: 'stackable',
      buyable: false,
      shopNote: 'Dostępny tylko ze Złotej Paczki (1.0%).'
    },
    godlo_gangu: {
      name: 'Godło Gangu',
      emoji: '🛡️',
      price: 0,
      shortDesc: '+10% z napadów gangu, +5% z wojen gangów',
      description: 'Zwiększa zyski z napadów gangu (!gang skok) o 10% oraz udział w łupach z wojny gangów (!gang atak) o 5%.',
      type: 'stackable',
      buyable: false,
      shopNote: 'Dostępne tylko z Diamentowej Paczki (3.0%).'
    },
    garnitur: {
      name: 'Garnitur',
      emoji: '👔',
      price: 0,
      shortDesc: '+10% dochodu z firm.',
      description: 'Zwiększa zyski zbierane z Twojej firmy (!firma zbierz) o 10%.',
      type: 'stackable',
      buyable: false,
      shopNote: 'Dostępny tylko z Diamentowej Paczki (3.0%).'
    },
    kosc_ryzyka: {
      name: 'Kostka Ryzyka',
      emoji: '🎲',
      price: 0,
      shortDesc: 'Odblokowuje !kosc (raz na 24h ryzykujesz ostatnią wygraną 50/50).',
      description: 'Odblokowuje specjalną komendę !kosc. Raz na dobę pozwala zaryzykować ostatnią wygraną kwotę netto z kasyna (do 500k) w rzucie 50/50 - możesz ją podwoić lub stracić.',
      type: 'stackable',
      buyable: false,
      shopNote: 'Dostępna tylko z Tytanowej Paczki (3.0%).'
    },
    szkarlatne_oko: {
      name: 'Szkarłatne Oko Krupiera',
      emoji: '👁️',
      price: 0,
      shortDesc: 'Event: +1.5% szansy w kasynie.',
      description: 'Permanentny przedmiot eventowy. Daje stałe +1.5% szansy na wygraną w blackjacku, slots, ruletce, bet i coinflip.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Unikalna nagroda za TOP 1 sezonu!'
    },
    cien_nocy: {
      name: 'Cień Nocy',
      emoji: '🥷',
      price: 0,
      shortDesc: 'Event: -25% cooldownu na !rob.',
      description: 'Permanentny przedmiot eventowy. Skraca cooldown na okradanie o 25%.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Unikalna nagroda za TOP 2 sezonu!'
    },
    wampirzy_sztylet: {
      name: 'Wampirzy Sztylet',
      emoji: '🩸',
      price: 0,
      shortDesc: 'Event: Skok na cooldowny + 5% bonus łup z ofiary.',
      description: 'Permanentny przedmiot eventowy. Udany rob resetuje cooldowny komend !work oraz !crime i kradnie dodatkowe 5% portfela ofiary.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Unikalna nagroda za TOP 3 sezonu!'
    },
    szwajcarski_klucz: {
      name: 'Szwajcarski Klucz',
      emoji: '🔑',
      price: 0,
      shortDesc: 'Event: +100k miejsca w banku.',
      description: 'Permanentny przedmiot eventowy. Zwiększa pojemność banku o 100 000 monet. Efekty się stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Unikalna nagroda za TOP 4 sezonu!'
    },
    krysztal_doswiadczenia: {
      name: 'Kryształ Doświadczenia',
      emoji: '🔮',
      price: 0,
      shortDesc: 'Event: +15% XP ze wszystkich gier.',
      description: 'Permanentny przedmiot eventowy. Zwiększa zdobywane XP o 15%. Efekty się stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Unikalna nagroda za TOP 5 sezonu!'
    },
    ananas_na_pizzy: {
      name: 'Ananas na Pizzy',
      emoji: '🍕',
      price: 0,
      shortDesc: 'Event: +2% szczęścia w kasynie.',
      description: 'Permanentny przedmiot eventowy. Daje stałe +2% do wszystkich szans wygranej/ocalenia w kasynie (!blackjack, !slots, !coinflip, !ruletka, !bet, jackpoty, losowe eventy, skrzynki).',
      type: 'permanent',
      buyable: false,
      shopNote: 'Unikalna nagroda za TOP 1 sezonu!'
    },
    czarna_bandera: {
      name: 'Czarna Bandera',
      emoji: '🏴',
      price: 0,
      shortDesc: 'Event: 5% szansy na Drugi Napad przy !rob.',
      description: 'Permanentny przedmiot eventowy. Po każdym udanym napadzie (!rob) istnieje 5% szansy na aktywację efektu „Drugi Napad” (dodatkowa kradzież bez cooldownu na tę samą osobę).',
      type: 'permanent',
      buyable: false,
      shopNote: 'Unikalna nagroda za TOP 2 sezonu!'
    },
    czarna_karta: {
      name: 'Czarna Karta Bankowa',
      emoji: '💳',
      price: 0,
      shortDesc: 'Event: Dodatkowe +10% odsetek co 6h do salda.',
      description: 'Permanentny przedmiot eventowy. Co każde 6 godzin dopisuje do Twojego salda portfela dodatkowe 10% monet zdeponowanych w banku.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Unikalna nagroda za TOP 5 sezonu!'
    },
    kosci_oszusta: {
      name: 'Kości Oszusta',
      emoji: '🎲',
      price: 0,
      shortDesc: 'Event: 2% szansy na odzyskanie stawki przy przegranej.',
      description: 'Permanentny przedmiot eventowy. Przy każdej przegranej w grach hazardowych istnieje 2% szansy na pełen zwrot postawionej stawki.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Unikalna nagroda za TOP 3 sezonu!'
    },
    czterolistna_moneta: {
      name: 'Czterolistna Moneta',
      emoji: '🍀',
      price: 0,
      shortDesc: 'Event: Wzmacnia wszystkie pozytywne bonusy o +1%.',
      description: 'Permanentny przedmiot eventowy. Zwiększa o +1 punkt procentowy wszystkie posiadane pozytywne bonusy w grze (XP, odsetki, zyski z pracy/firm, szanse w kasynie/napadu, itp.).',
      type: 'permanent',
      buyable: false,
      shopNote: 'Unikalna nagroda za TOP 4 sezonu!'
    },
    walizka: {
      name: 'Walizka',
      emoji: '💼',
      price: 0,
      shortDesc: '+5% monet z !work.',
      description: 'Pasywny przedmiot. Zwiększa bazowe zarobki z komendy !work o 5%. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępna tylko z Brązowej Paczki (3.0%).'
    },
    ksiega_inwestora: {
      name: 'Księga Inwestora',
      emoji: '📖',
      price: 0,
      shortDesc: 'Dodatkowe odsetki co 12h (0.25% z banku).',
      description: 'Pasywny przedmiot. Co 12 godzin dopisuje do portfela bonus równy 0.25% monet zdeponowanych w banku (odpowiednik 0.5% co 24h).',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępna tylko ze Złotej Paczki (1.0%).'
    },
    zestaw_wlamywacza: {
      name: 'Zestaw Włamywacza',
      emoji: '🛠️',
      price: 0,
      shortDesc: '+3% szansy powodzenia !rob.',
      description: 'Pasywny przedmiot. Zwiększa szansę powodzenia napadu (!rob) o 3%. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępny tylko ze Złotej Paczki (1.5%).'
    },
    kominiarka: {
      name: 'Kominiarka',
      emoji: '🥷',
      price: 0,
      shortDesc: 'Zmniejsza karę przy wpadce na !rob o 10%.',
      description: 'Pasywny przedmiot. Jeśli napad (!rob) się nie powiedzie, płacisz karę mniejszą o 10%. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępna tylko ze Srebrnej Paczki (2.5%).'
    },
    latarka: {
      name: 'Latarka',
      emoji: '🔦',
      price: 0,
      shortDesc: 'Udany !rob kradnie dodatkowe 2% łupu.',
      description: 'Pasywny przedmiot. Po udanym napadzie (!rob) kradniesz dodatkowo 2% z portfela ofiary. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępna tylko ze Złotej Paczki (1.5%).'
    },
    alarm: {
      name: 'Alarm',
      emoji: '🚨',
      price: 0,
      shortDesc: '-4% szansy powodzenia napadu na Ciebie.',
      description: 'Defensywny przedmiot pasywny. Zmniejsza szansę na to, że ktoś pomyślnie Cię okradnie (!rob) o 4%. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępny tylko z Diamentowej Paczki (2.0%).'
    },
    pies_strozujacy: {
      name: 'Pies Stróżujący',
      emoji: '🐕',
      price: 0,
      shortDesc: 'Otrzymujesz dodatkowe 5% kary, gdy złodziej wpadnie.',
      description: 'Defensywny przedmiot pasywny. Gdy złodziej próbujący Cię okraść wpadnie, otrzymujesz dodatkowo 5% z kwoty kary nałożonej na niego. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępny tylko z Diamentowej Paczki (2.0%).'
    },
    insygnia_gang: {
      name: 'Insygnia Gangu',
      emoji: '🏴‍☠️',
      price: 0,
      shortDesc: '+8% nagród z aktywności gangowych.',
      description: 'Pasywny przedmiot. Zwiększa nagrody uzyskiwane z aktywności gangowych (napady i wojny gangów) o 8%. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępne tylko z Tytanowej Paczki (3.0%).'
    },
    podrecznik_praktykanta: {
      name: 'Podręcznik Praktykanta',
      emoji: '📘',
      price: 0,
      shortDesc: '+5% XP ze wszystkich źródeł.',
      description: 'Pasywny przedmiot. Zwiększa zdobywane doświadczenie (XP) ze wszystkich źródeł o 5%. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępny tylko ze Srebrnej Paczki (2.5%).'
    },
    kaczka_biznesu: {
      name: 'Kaczka Biznesu',
      emoji: '🦆',
      price: 0,
      shortDesc: '+5% dochodu z firm.',
      description: 'Pasywny przedmiot. Zwiększa dochód generowany przez Twoje firmy o 5%. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępna tylko z Diamentowej Paczki (1.5%).'
    },
    dobra_ksiegowa: {
      name: 'Dobra Księgowa',
      emoji: '👩‍💼',
      price: 0,
      shortDesc: '-2% podatku co 12h i progresywnego.',
      description: 'Pasywny przedmiot. Zmniejsza podatek od salda pobierany co 12h o 2% (z 4% na 2%) oraz obniża stopę progresywnego podatku majątkowego w każdym progu o 2%. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępna tylko z Tytanowej Paczki (0.75%).'
    },
    sakiewka_kolekcjonera: {
      name: 'Sakiewka Kolekcjonera',
      emoji: '💰',
      price: 0,
      shortDesc: '+3% monet z każdej aktywności.',
      description: 'Pasywny przedmiot. Zwiększa wszystkie zarobki (praca, przestępstwa, kasyno, firmy, gang) o 3%. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępna tylko z Tytanowej Paczki (0.75%).'
    },
    z_drive: {
      name: 'Z-drive',
      emoji: '⏳',
      price: 0,
      shortDesc: 'Skraca wszystkie cooldowny o 15%.',
      description: 'Pasywny przedmiot. Skraca czas oczekiwania (cooldown) wszystkich komend o 15%. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępny tylko z Tytanowej Paczki (1.0%).'
    },
    rekawice_robotnika: {
      name: 'Rękawice Robotnika',
      emoji: '🧤',
      price: 0,
      shortDesc: '10% szans na podwójną wypłatę z !work.',
      description: 'Pasywny przedmiot. Daje 10% szans, że wypłata z komendy !work zostanie podwojona. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępne tylko z Tytanowej Paczki (1.0%).'
    },
    patrol_policji: {
      name: 'Patrol Policji',
      emoji: '🚔',
      price: 0,
      shortDesc: 'Złodziej po wpadce płaci dodatkowe 15% kary.',
      description: 'Defensywny przedmiot pasywny. Gdy ktoś próbuje Cię okraść (!rob) i zostanie przyłapany, płaci dodatkowe 15% kary ponad standardową stawkę. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępny tylko z Diamentowej Paczki (1.5%).'
    },
    mocna_kawa: {
      name: 'Mocna Kawa',
      emoji: '☕',
      price: 0,
      shortDesc: '+8% monet z !work.',
      description: 'Pasywny przedmiot. Zwiększa bazowe zarobki z komendy !work o 8%. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępna tylko z Diamentowej Paczki (1.0%).'
    },
    odznaka_komendanta: {
      name: 'Odznaka Komendanta',
      emoji: '🎖️',
      price: 0,
      shortDesc: 'Pasywnie: -12.5 pkt % szansy na przyłapanie w !crime.',
      description: 'Permanentny przedmiot pasywny. Zmniejsza szansę na przyłapanie podczas !crime o 12.5 punktu procentowego. Gdy odznaka Cię uratuje przed aresztowaniem, otrzymujesz o tym powiadomienie. Efekty się nie stackują.',
      type: 'permanent',
      buyable: false,
      shopNote: 'Dostępna tylko z 🩶 Tytanowej Paczki (1.5%).'
    },
    klucz_wiezienny: {
      name: 'Klucz Więzienny',
      emoji: '🔑',
      price: 0,
      shortDesc: 'Odblokowuje !wiezienie <osoba> — wsadza gracza do więzienia.',
      description: 'Rzadki przedmiot zużywalny. Pozwala jednorazowo użyć komendy !wiezienie <osoba>, wsadzając wskazanego gracza do więzienia na czas określony w ustawieniach ekonomii — podczas którego traci dostęp do komend ekonomicznych. Zużywa się po użyciu.',
      type: 'stackable',
      buyable: false,
      shopNote: 'Dostępny tylko z 🩶 Tytanowej Paczki (0.5%).'
    }
  },
  badges: {
    vip: '👑 VIP',
    bogacz: '🪙 Bogacz',
    milioner: '💸 Milioner',
    miliarder: '💎 Miliarder',
    gracz: '🔨 Gracz',
    weteran: '⚡ Weteran',
    uzalezniony: '🌀 Uzależniony',
    hazardzista: '🎲 Hazardzista',
    rekin: '🎰 Rekin Kasyna',
    bog: '🃏 Bóg Kasyna',
    married: '💍 Małżeństwo',
    gadatliwy: '💬 Gadatliwy',
    spamer: '🗣️ Spamer',
    krolSpamu: '📢 Król Spamu',
    klikacz: '⌨️ Klikacz',
    wladcaBota: '🤖 Władca Bota',
    nowicjusz: '📈 Nowicjusz',
    ekspert: '🔥 Ekspert',
    mistrz: '👑 Mistrz',
    zwyciezca: '🏆 Zwycięzca',
    boss: '👑 Boss Gangu',
    zastepca: '⭐ Zastępca',
    czlonek: '👤 Członek Gangu'
  },
  gangAI: {
    enabled: true,
    maxAIGangs: 6,
    maxVault: 5000000,
    minVaultAfterAttack: 100000,
    actionIntervalMinutesMin: 30,
    actionIntervalMinutesMax: 120,
    actionsPerTickMin: 1,
    actionsPerTickMax: 3,
    repeatActionRerollChance: 0.7,
    actionWeights: { earn: 35, upgrade: 22, recruit: 13, attack: 10, alliance: 8, event: 5, buyBossCrate: 15 },
    attackTimeStartHour: 8,
    attackTimeEndHour: 22,
    aiToAiAllianceWeight: 3,
    aiToPlayerAllianceWeight: 1,
    attackAiWeight: 1,
    attackPlayerWeight: 1,
    allianceAcceptChanceFromAI: 0.7,
    allianceAcceptChanceFromPlayer: 0.35,
    maxAlliances: 3,
    participantRatioMin: 0.4,
    participantRatioMax: 1.0,
    attackVaultCostRatio: 0.10,
    attackTargetVaultRatioMin: 0.5,
    attackTargetVaultRatioMax: 2.0,
    attackStrongTargetChance: 0.04,
    startVaultMin: 50000,
    startVaultMax: 300000,
    startMembersMin: 1,
    startMembersMax: 3,
    personalities: {
      agresywny: { upgradePriority: ['fach', 'dziupla', 'biznesy'], attackWeight: 1.8 },
      defensywny: { upgradePriority: ['dziupla', 'fach', 'biznesy'], attackWeight: 0.4 },
      bogacz: { upgradePriority: ['biznesy', 'dziupla', 'fach'], attackWeight: 0.5 },
      rekruter: { upgradePriority: ['dziupla', 'biznesy', 'fach'], attackWeight: 0.7 },
      zbalansowany: { upgradePriority: ['dziupla', 'biznesy', 'fach'], attackWeight: 1.0 },
      agresywny_izraelici: { upgradePriority: ['fach', 'dziupla', 'biznesy'], attackWeight: 1.1 }
    },
    nameParts: {
      adjectives: ['Cienie', 'Żmije', 'Czarna', 'Krwawa', 'Stalowa', 'Złota', 'Srebrna', 'Wściekła', 'Niewidzialna', 'Podziemna', 'Mroczna', 'Płomienna', 'Lodowa', 'Szara', 'Błękitna', 'Zatruty', 'Zbrodniczy', 'Diabli', 'Kosmiczny', 'Posępny'],
      nouns: ['Gwardia', 'Bractwo', 'Kartel', 'Legion', 'Sfora', 'Banda', 'Syndykat', 'Klan', 'Horda', 'Wataha', 'Grom', 'Straż', 'Firma', 'Zespół', 'Ród', 'Kolba', 'Węzeł', 'Krąg', 'Szczep', 'Rój'],
      suffixes: ['Nocy', 'Mroku', 'Stali', 'Ognia', 'Lodu', 'Cienia', 'Krwii', 'Złamanych', 'Ulic', 'Starego', 'Nowego', 'Złotych', 'Srebrnych', 'Diabłów', 'Rozdartych']
    },
    fakeNames: {
      first: ['Jan', 'Piotr', 'Adam', 'Marek', 'Kamil', 'Tomasz', 'Jakub', 'Michał', 'Krzysztof', 'Andrzej', 'Paweł', 'Rafał', 'Grzegorz', 'Marcin', 'Łukasz', 'Dawid', 'Patryk', 'Sebastian', 'Damian', 'Konrad', 'Oskar', 'Dominik', 'Mikołaj', 'Wojciech', 'Artur', 'Mateusz', 'Adrian', 'Bartosz', 'Robert', 'Arkadiusz'],
      last: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur', 'Krawczyk', 'Piotrowski', 'Grabowski', 'Nowakowski', 'Pawłowski', 'Michalski', 'Adamczyk', 'Dudek', 'Zając', 'Wieczorek', 'Jabłoński', 'Król', 'Witkowski', 'Walczak', 'Stępień', 'Górski']
    },
    fixedGangs: [
      { name: 'Arasaka', personality: 'agresywny' },
      { name: 'Militech', personality: 'bogacz' },
      { name: 'Kiramann', personality: 'bogacz' },
      { name: 'Bar Ostatnia Kropla', personality: 'rekruter' },
      { name: 'Chem Barons', personality: 'zbalansowany' },
      { name: 'Izraelici', personality: 'agresywny_izraelici' }
    ],
    fixedActionIntervalMinutes: 45
  },
  bossShopCrates: {
    dailyLimit: 10,
    crates: {
      skrzynia_zwykla: {
        name: 'Zwykła Skrzynka',
        emoji: '📦',
        price: 1000000,
        moneyMin: 750000,
        moneyMax: 1100000,
        items: {
          van_opancerzony: { name: 'Opancerzony Van', emoji: '🛻', chance: 1.5, description: '+15% łupu z okradania innych gangów (atak).' },
          siec_informatorow: { name: 'Sieć Informatorów', emoji: '📡', chance: 1.5, description: '+10% szans na udany gang skok.' },
          falszywe_dokumenty: { name: 'Fałszywe Dokumenty', emoji: '💼', chance: 1.5, description: 'Skraca cooldown napadów gangu o 10%.' },
          monitoring: { name: 'Monitoring', emoji: '📹', chance: 1.5, description: 'Efekt stały: +2% obrony gangu.' },
          centrum_treningowe: { name: 'Centrum treningowe', emoji: '🏋️', chance: 1.5, description: 'Efekt stały: +2% ataku.' },
          warsztat_gang: { name: 'Warsztat', emoji: '🔧', chance: 1.5, description: 'Efekt stały: -5% kosztów ulepszeń gangu.' }
        }
      },
      skrzynia_pozlacana: {
        name: 'Pozłacana Skrzynka',
        emoji: '🥇',
        price: 1500000,
        moneyMin: 1100000,
        moneyMax: 1700000,
        items: {
          szkolenie_bojowe: { name: 'Szkolenie Bojowe', emoji: '🪖', chance: 1.25, description: '+5% siły podczas ataków na gangi.' },
          mobilna_barykada: { name: 'Mobilna Barykada', emoji: '🛡️', chance: 1.25, description: '+6% obrony przed atakiem innego gangu.' },
          warsztat: { name: 'Warsztat', emoji: '🧰', chance: 1.25, description: '+10% pieniędzy z !work dla wszystkich członków gangu.' }
        }
      },
      skrzynia_opancerzona: {
        name: 'Opancerzona Skrzynka',
        emoji: '🛡️',
        price: 2000000,
        moneyMin: 1600000,
        moneyMax: 2200000,
        items: {
          celowniki_laserowe: { name: 'Celowniki Laserowe', emoji: '🎯', chance: 1.2, description: '+10% skuteczności podczas ataku na gang (kumuluje się ze Szkoleniem Bojowym).' },
          ksiegowy_gangu: { name: 'Księgowy Gangu', emoji: '🧑‍💼', chance: 1.2, description: '+5% do wszystkich źródeł dochodu gangu.' },
          sztab_dowodzenia: { name: 'Sztab Dowodzenia', emoji: '👑', chance: 0.5, description: '+5% siły, +5% obrony ORAZ +10% zarobków z napadów.' },
          pralnia_pieniedzy: { name: 'Pralnia pieniędzy', emoji: '🧺', chance: 0.5, description: '+5% zarobków gangu.' },
          tajny_sejf: { name: 'Tajny sejf', emoji: '🗝️', chance: 0.5, description: 'Zmniejsza szansę na kradzież itemów podczas obrony o 3%.' }
        }
      }
    }
  },
  gangReputation: {
    ranks: [
      { min: 0, name: 'Początkujący' },
      { min: 100, name: 'Uliczny Gang' },
      { min: 300, name: 'Znany Gang' },
      { min: 700, name: 'Organizacja' },
      { min: 1500, name: 'Syndykat' },
      { min: 3000, name: 'Imperium' },
      { min: 6000, name: 'Legenda' }
    ]
  },
  territories: {
    definitions: [
      { id: 'strefa_przemyslowa', name: 'Strefa Przemysłowa', emoji: '🏭', bonusType: 'work', bonusValue: 0.05, description: '+5% do nagród z komendy work' },
      { id: 'dzielnica_kasyn', name: 'Dzielnica Kasyn', emoji: '🎰', bonusType: 'crime_reward', bonusValue: 0.05, description: '+5% do nagród z crime' },
      { id: 'port', name: 'Port', emoji: '🚢', bonusType: 'npc_raid', bonusValue: 0.10, description: '+10% do nagród za napady na NPC' },
      { id: 'centrum_finansowe', name: 'Centrum Finansowe', emoji: '💎', bonusType: 'daily', bonusValue: 0.05, description: '+5% do daily' },
      { id: 'twierdza', name: 'Twierdza', emoji: '🛡️', bonusType: 'gang_defense', bonusValue: 0.05, description: '+5% do całkowitej obrony gangu' },
      { id: 'fabryka_broni', name: 'Fabryka Broni', emoji: '⚔️', bonusType: 'gang_attack', bonusValue: 0.05, description: '+5% do całkowitego ataku gangu' },
      { id: 'centrum_wywiadu', name: 'Centrum Wywiadu', emoji: '📡', bonusType: 'intel', bonusValue: 0.10, description: '+10% do skuteczności wywiadu' },
      { id: 'magazyny', name: 'Magazyny', emoji: '🚚', bonusType: 'bank_deposit', bonusValue: 0.05, description: '+5% do wszystkich zarobków wpłacanych do banku gangu' },
      { id: 'slumsy', name: 'Slumsy', emoji: '🏚️', bonusType: 'crime_chance', bonusValue: 0.05, description: '+5% szansy na udany crime' },
      { id: 'szlaki_przemytnicze', name: 'Szlaki Przemytnicze', emoji: '🛣️', bonusType: 'crime_cooldown', bonusValue: -0.10, description: '-10% czasu cooldown komendy crime' },
      { id: 'bank_centralny', name: 'Bank Centralny', emoji: '🏦', bonusType: 'bank_capacity', bonusValue: 0.10, description: '+10% pojemności banku gangu' },
      { id: 'warsztat_terytorium', name: 'Warsztat', emoji: '🔧', bonusType: 'upgrade_cost', bonusValue: -0.10, description: '-10% kosztów ulepszeń gangu' },
      { id: 'centrum_dowodzenia', name: 'Centrum Dowodzenia', emoji: '🛰️', bonusType: 'war_both', bonusValue: 0.05, description: '+5% ataku oraz +5% obrony podczas wojen gangów' },
      { id: 'posterunek_policji', name: 'Posterunek Policji', emoji: '🚔', bonusType: 'war_loss_reduction', bonusValue: 0.10, description: 'Zmniejsza utratę pieniędzy po przegranej wojnie o 10%' },
      { id: 'szpital_polowy', name: 'Szpital Polowy', emoji: '🏥', bonusType: 'shield_reduction', bonusValue: 3600000, description: 'Skraca czas ochrony po wojnie o 1 godzinę' },
      { id: 'sklad_zaopatrzenia', name: 'Skład Zaopatrzenia', emoji: '📦', bonusType: 'mercenary_effectiveness', bonusValue: 0.05, description: '+5% skuteczności najemników' },
      { id: 'rafineria', name: 'Rafineria', emoji: '⛽', bonusType: 'all_economy', bonusValue: 0.05, description: '+5% do wszystkich nagród ekonomicznych (work, crime, napady NPC)' },
      { id: 'centrum_miasta', name: 'Centrum Miasta', emoji: '🏙️', bonusType: 'reputation_gain', bonusValue: 0.05, description: '+5% zdobywanej reputacji gangu' },
      { id: 'dworzec_towarowy', name: 'Dworzec Towarowy', emoji: '🚂', bonusType: 'npc_raid', bonusValue: 0.10, description: '+10% do nagród za napady NPC' },
      { id: 'rezydencja_bossa', name: 'Rezydencja Bossa', emoji: '👑', bonusType: 'all_stats', bonusValue: 0.03, description: '+3% do wszystkich statystyk gangu: ataku, obrony, wywiadu' }
    ]
  }
};
