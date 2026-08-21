const { EmbedBuilder } = require('./embeds');
const config = require('../config/config');

const HELP_PAGE_SIZE = 7;

const CATEGORY_META = {
  ECONOMY_GAMBLING: { label: '💰 EKONOMIA I HAZARD' },
  SOCIAL_GANGS: { label: '👥 SOCJALNE I GANGI' },
  UTILITY_ADMIN: { label: '⚙️ INNE I NARZĘDZIA' }
};

const CATEGORY_SELECT_LABELS = {
  ECONOMY_GAMBLING: '💰 Ekonomiczne',
  SOCIAL_GANGS: '👥 Społeczne',
  UTILITY_ADMIN: '🛠️ Narzędzia / Inne'
};

const CATEGORY_ARG_NAMES = {
  ECONOMY_GAMBLING: 'ekonomiczne',
  SOCIAL_GANGS: 'spoleczne',
  UTILITY_ADMIN: 'narzedzia'
};

const CATEGORY_INPUT_ALIASES = {
  '1': 'ECONOMY_GAMBLING',
  'ekonomiczne': 'ECONOMY_GAMBLING',
  'ekonomia': 'ECONOMY_GAMBLING',
  'ekonomiczna': 'ECONOMY_GAMBLING',
  'hazard': 'ECONOMY_GAMBLING',
  '2': 'SOCIAL_GANGS',
  'spoleczne': 'SOCIAL_GANGS',
  'społeczne': 'SOCIAL_GANGS',
  'socjalne': 'SOCIAL_GANGS',
  'gangi': 'SOCIAL_GANGS',
  '3': 'UTILITY_ADMIN',
  'narzedzia': 'UTILITY_ADMIN',
  'narzędzia': 'UTILITY_ADMIN',
  'inne': 'UTILITY_ADMIN',
  'admin': 'UTILITY_ADMIN',
  '4': 'ALL',
  'wszystkie': 'ALL',
  'wszystko': 'ALL',
  'all': 'ALL'
};

const helpCommands = [
  // --- KATEGORIA 1: EKONOMIA I HAZARD ---
  {
    id: 1,
    name: "bal",
    category: "ECONOMY_GAMBLING",
    shortDescription: "👛 pokazuje saldo konta",
    description: "👛 Wyświetla stan portfela, 🏦 banku oraz podstawowe statystyki Twojego konta.",
    usage: "!bal [@osoba | id]",
    examples: ["!bal","!bal @Rafal"],
    cooldown: "2 sekundy",
    requirements: "Brak.",
    aliases: ["balance","kasa","saldo"],
    additionalInfo: ["Pokazuje aktualny stan VicCoinów w gotówce i w banku."]
  },
  {
    id: 2,
    name: "daily",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🎁 odbierz dzienną nagrodę",
    description: "🎁 Pozwala odebrać darmową nagrodę dzienną w VicCoinach.",
    usage: "!daily",
    examples: ["!daily"],
    cooldown: "Raz na 24h",
    requirements: "Odczekanie 24 godzin od ostatniego odebrania.",
    aliases: [],
    additionalInfo: ["Posiadanie VIP Pass zwiększa nagrodę.","Dzienny streak (nieprzerwane dni) daje bonus."]
  },
  {
    id: 3,
    name: "work",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🛠️ zarób monety pracując",
    description: "🛠️ Uczciwa praca pozwalająca zarobić dodatkowe VicCoiny. Z każdym użyciem masz szansę awansować na wyższe poziomy pracy, które zwiększają Twoje wynagrodzenie.",
    usage: "!work",
    examples: ["!work"],
    cooldown: "~10 minut (zależne od ekwipunku i eventów)",
    requirements: "Brak.",
    aliases: [],
    additionalInfo: [
      "Wykonując !work awansujesz na wyższe poziomy i zwiększasz swoje zarobki.",
      "📈 **Kariera:** 🟢Praktykant (L1-4: do +6%) • 🔵Specjalista (L5-9: do +16%) • 🟡Ekspert (L10-14: do +26%) • 🟠Mistrz (L15-19: do +40%) • 🔴Legenda (L20+: +45%)",
      "Losowe zdarzenia (2% szans): Premia (+50%), Wypadek (CD -20% na 1h), Podwyżka (płaca +10% na 6h) lub Podwójne XP."
    ]
  },
  {
    id: 4,
    name: "crime",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🔫 ryzykowna kradzież zysku/straty",
    description: "🔫 Szybki, lecz ryzykowny skok na NPC. Możesz zyskać monety lub ponieść stratę.",
    usage: "!crime",
    examples: ["!crime"],
    cooldown: "12 sekund",
    requirements: "Brak.",
    aliases: [],
    additionalInfo: ["Ryzykowna akcja — uważaj na straty!"]
  },
  {
    id: 5,
    name: "wplac",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🏦 wpłać monety do banku",
    description: "🏦 Przenosi bezpiecznie VicCoiny z portfela na Twoje konto bankowe.",
    usage: "!wplac <kwota>",
    examples: ["!wplac 1000","!wplac all"],
    cooldown: "3 sekundy",
    requirements: "Wolne miejsce w banku.",
    aliases: ["deposit","dep"],
    additionalInfo: ["Chronione przed kradzieżą komendą !rob.","VIP zwiększa maksymalną pojemność banku."]
  },
  {
    id: 6,
    name: "wyplac",
    category: "ECONOMY_GAMBLING",
    shortDescription: "👛 wypłać monety z banku",
    description: "👛 Wypłaca VicCoiny z konta bankowego z powrotem do portfela.",
    usage: "!wyplac <kwota>",
    examples: ["!wyplac 5000","!wyplac all"],
    cooldown: "3 sekundy",
    requirements: "Posiadanie środków w banku.",
    aliases: ["withdraw","with"],
    additionalInfo: ["Obsługuje skróty 'all' oraz 'max'."]
  },
  {
    id: 7,
    name: "sklep",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🛒 sklep kasynowy",
    description: "🛒 Pozwala zakupić przedmioty użytkowe i pakiety z aktualnej oferty sklepu.",
    usage: "!sklep <numer_przedmiotu> [ilość]",
    examples: ["!sklep 3 2"],
    cooldown: "3 sekundy",
    requirements: "Odpowiednia ilość monet w portfelu.",
    aliases: ["shop","sklp","store"],
    additionalInfo: ["Zakup następuje poprzez podanie numeru z listy sklepu."]
  },
  {
    id: 8,
    name: "eq",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🎒 Twój ekwipunek",
    description: "🎒 Pokazuje listę wszystkich posiadanych przez Ciebie przedmiotów.",
    usage: "!eq [@osoba | id] | !eq help <numer>",
    examples: ["!eq","!eq @Rafal","!eq help 3"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["inv","ekwipunek","inventory"],
    additionalInfo: ["!eq help <numer> pokazuje szczegółowy opis i zastosowanie przedmiotu."]
  },
  {
    id: 9,
    name: "ulepsz",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🔧 ulepsz przedmiot",
    description: "🔧 Ulepsz przedmioty w ekwipunku do +5. Każdy poziom wymaga kopii przedmiotu + materiału ulepszeniowego + monet.",
    usage: "!ulepsz <przedmiot> | !ulepsz <przedmiot> potwierdz | !ulepsz lista | !ulepsz materialy",
    examples: ["!ulepsz sejf","!ulepsz vip potwierdz","!ulepsz lista","!ulepsz materialy"],
    cooldown: "3 sekundy",
    requirements: "Posiadanie przedmiotu i odpowiednich materiałów.",
    aliases: ["upgrade","ulepszanie"],
    additionalInfo: ["Materiały dropują z paczek: Żelazo, Miedź, Tytan, Karbid, Inżelit.","Event przedmioty nie mogą być ulepszane."]
  },
  {
    id: 9,
    name: "use",
    category: "ECONOMY_GAMBLING",
    shortDescription: "⚡ użyj przedmiotu",
    description: "⚡ Pozwala aktywować i sprawdzić działanie przedmiotu z ekwipunku.",
    usage: "!use <numer_przedmiotu>",
    examples: ["!use 1","!use 3"],
    cooldown: "2 sekundy",
    requirements: "Posiadanie wybranego przedmiotu.",
    aliases: ["uzyj"],
    additionalInfo: ["Niektóre przedmioty (np. Kłódka, Piwo) aktywują się automatycznie."]
  },
  {
    id: 10,
    name: "tip",
    category: "ECONOMY_GAMBLING",
    shortDescription: "💸 przelej monety graczowi",
    description: "💸 Bezpośredni przelew VicCoinów z Twojego portfela do portfela innego gracza.",
    usage: "!tip <kwota> <@osoba | id>",
    examples: ["!tip 1000 @Rafal","!tip all 123456"],
    cooldown: "3 sekundy",
    requirements: "Posiadanie odpowiednich środków.",
    aliases: ["przelej","daj"],
    additionalInfo: ["Obsługuje słowo kluczowe 'all'."]
  },
  {
    id: 11,
    name: "loteria",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🎫 informacje o loterii",
    description: "🎫 Wyświetla stan puli nagród, liczbę kupionych biletów i czas do losowania.",
    usage: "!loteria",
    examples: ["!loteria"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["lottery"],
    additionalInfo: ["Bilety kupuje się w sklepie komendą `!sklep 3`."]
  },
  {
    id: 12,
    name: "podatki",
    category: "ECONOMY_GAMBLING",
    shortDescription: "📊 informacje o podatkach",
    description: "📊 Pokazuje stawkę podatku od salda (4% co 12h) oraz podatku progresywnego.",
    usage: "!podatki",
    examples: ["!podatki"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["tax","taxes"],
    additionalInfo: ["Karta 'Dobra Księgowa' obniża stawki podatków o połowę (o 2%)."]
  },
  {
    id: 13,
    name: "pozyczka",
    category: "ECONOMY_GAMBLING",
    shortDescription: "📈 pożyczki z banku lub od graczy",
    description: "📈 Umożliwia pożyczenie monet z banku (do 500k) lub zaoferowanie pożyczki graczowi.",
    usage: "!pozyczka <kwota> | !pozyczka splac <kwota|all> | !pozyczka @osoba <kwota> <raty> <ile_spłat> <rata> <kara_%_spóźnienia> <dni> <suma> | !pozyczka acc/dec @lender",
    examples: ["!pozyczka 100000","!pozyczka splac all","!pozyczka @Kowalski 10000 5 5 2500 20 2 12500","!pozyczka acc @Kowalski"],
    cooldown: "Brak / do spłaty",
    requirements: "Min. 100 komend i 100 wiadomości (przy pożyczkach p2p).",
    aliases: ["kredyt","loan"],
    additionalInfo: [
      "Pożyczka z banku musi być spłacona w ciągu 48h.",
      "Pożyczka p2p: kwota początkowa maks. 40% salda pożyczkodawcy.",
      "Spłata rat o 00:00. Brak środków powoduje windykację zysków i naliczenie odsetek karnych.",
      "Wcześniejsza spłata: komendą `!pozyczka gracz splac <kwota>` (min. równowartość 1 raty)."
    ]
  },
  {
    id: 14,
    name: "rynek",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🏛️ rynek handlu artefaktami",
    description: "🏛️ Globalny rynek pozwalający na wystawianie, kupowanie oraz wycofywanie ofert artefaktów.",
    usage: "!rynek | !rynek sprzedaj <nr_art> <cena> | !rynek kup <nr_oferty> | !rynek wycofaj <nr_oferty>",
    examples: ["!rynek","!rynek sprzedaj 1 300000","!rynek kup 1"],
    cooldown: "3 sekundy",
    requirements: "Przedmiot musi być w ekwipunku. Cena minimalna to 250 000 monet.",
    aliases: ["market"],
    additionalInfo: ["Prowizja (podatek) od udanej sprzedaży wynosi 10%.","Wycofanie oferty zwraca przedmiot za darmo do ekwipunku."]
  },
  {
    id: 15,
    name: "firma",
    category: "ECONOMY_GAMBLING",
    shortDescription: "💼 zarządzanie własną firmą",
    description: "💼 Umożliwia zakup firm generujących dochód pasywny co 3 godziny, ich naprawę oraz wypłaty.",
    usage: "!firma | !firma kup <nazwa> | !firma sprzedaj | !firma zbierz | !firma napraw",
    examples: ["!firma", "!firma kup kiosk", "!firma zbierz", "!firma napraw"],
    cooldown: "3 sekundy",
    requirements: "Posiadanie odpowiednich środków na start.",
    aliases: [],
    additionalInfo: ["Dochód pasywny można odbierać co 3 godziny.","W przypadku awarii, firma nie generuje zysków do czasu naprawy."]
  },
  {
    id: 16,
    name: "pracownik",
    category: "ECONOMY_GAMBLING",
    shortDescription: "👷 zatrudnianie pracowników do firmy",
    description: "👷 Kup pracowników, którzy zwiększają zyski z firmy, ale pobierają część wypłaty i mogą spowodować awarię.",
    usage: "!pracownik | !pracownik <nr> | !pracownik sprzedaj",
    examples: ["!pracownik", "!pracownik 1", "!pracownik sprzedaj"],
    cooldown: "3 sekundy",
    requirements: "Posiadanie firmy. Każdy pracownik ma inny koszt i efekty.",
    aliases: ["pracownicy", "worker"],
    additionalInfo: ["Pracownicy automatycznie pobierają % z wypłaty podczas !firma zbierz.","Nasi pracownicy mają unikalne umiejętności: bonusy, awarie, natychmiastowe naprawy."]
  },
  {
    id: 17,
    name: "slots",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🎰 automat jednoręki bandyta",
    description: "🎰 Klasyczny automat do gry. Wylosuj identyczne symbole, aby wygrać mnożnik.",
    usage: "!slots <kwota>",
    examples: ["!slots 1000","!slots all"],
    cooldown: "4 sekundy",
    requirements: "Środki w portfelu.",
    aliases: ["slot"],
    additionalInfo: ["Mnożniki zależą od wylosowanej kombinacji symboli."]
  },
  {
    id: 17,
    name: "coinflip",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🪙 rzut monetą",
    description: "🪙 Obstaw orła lub reszkę. Trafienie podwaja stawkę.",
    usage: "!coinflip <kwota> <orzel/reszka>",
    examples: ["!coinflip 1000 orzel","!cf 5000 reszka"],
    cooldown: "4 sekundy",
    requirements: "Środki w portfelu.",
    aliases: ["cf"],
    additionalInfo: ["Szansa na wygraną wynosi dokładnie 50%."]
  },
  {
    id: 18,
    name: "ruletka",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🎡 obstawianie w ruletce",
    description: "🎡 Postaw na kolor (czerwony, czarny, zielony), parzystość lub konkretny numer (0-36).",
    usage: "!ruletka <kwota> <czerwony/czarny/zielony/parzyste/nieparzyste/0-36>",
    examples: ["!ruletka 1000 czerwony","!roulette 500 parzyste"],
    cooldown: "5 sekund",
    requirements: "Środki w portfelu.",
    aliases: ["roulette","roul"],
    additionalInfo: ["Zielone (0) oraz konkretne liczby oferują najwyższe mnożniki wygranej."]
  },
  {
    id: 19,
    name: "bet",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🎲 zakład liczbowy",
    description: "🎲 Obstaw, że wylosowana liczba 0-99 będzie mniejsza niż Twój typ.",
    usage: "!bet <kwota> <liczba_progowa> [ilość_zakładów]",
    examples: ["!bet 1000 50","!bet 500 30 10"],
    cooldown: "3 sekundy",
    requirements: "Środki w portfelu.",
    aliases: [],
    additionalInfo: ["Im niższa liczba progowa, tym wyższy potencjalny mnożnik wygranej.","Seryjne zakłady są dostępne wyłącznie dla administratorów."]
  },
  {
    id: 20,
    name: "blackjack",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🃏 gra w blackjacka",
    description: "🃏 Zagraj w blackjacka (oczko) przeciwko krupierowi. Zbliż się do 21 punktów bez przekroczenia.",
    usage: "!blackjack <kwota> | !bj <kwota>",
    examples: ["!blackjack 1000","!bj all"],
    cooldown: "3 sekundy",
    requirements: "Środki w portfelu.",
    aliases: ["bj"],
    additionalInfo: ["Krupier dobiera karty do 17 punktów.","Idealny Blackjack (As + 10) wypłaca bonus 2.5x stawki."]
  },
  {
    name: "chickenroad",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🐔 przeprowadź kurczaka przez ruchliwą drogę",
    description: "🐔 Chicken Road — wybierz poziom ryzyka i poprowadź kurczaka przez kolejne pasy ruchu.",
    usage: "!chickenroad <poziom> <kwota> | !dalej | !odbierz",
    examples: ["!chickenroad latwy 5000", "!chickenroad sredni 10000", "!dalej", "!odbierz"],
    cooldown: "",
    aliases: ["kurczak", "chickenrun"],
    additionalInfo: [
      "🟢 Łatwy (92% szansy na pas, 24 pasy) • 🟡 Średni (84%, 20 pasów) • 🟠 Trudny (76%, 15 pasów) • 🔴 Hardcore (65%, 12 pasów).",
      "Im dalej zajdzie kurczak, tym wyższy mnożnik stawki — ale rośnie też ryzyko utraty całego zakładu.",
      "W dowolnym momencie możesz napisać !odbierz, żeby zainkasować aktualną wygraną zamiast ryzykować kolejny pas.",
      "Aktywna gra wygasa po 5 minutach bezczynności, a stawka wtedy przepada."
    ]
  },
  {
    name: "zadanie",
    category: "ECONOMY_GAMBLING",
    shortDescription: "📋 weź codzienne wyzwanie i zdobądź nagrodę",
    description: "📋 Zadanie — weź jedno wyzwanie na 24h, wykonaj je w grach i odbierz nagrodę. Tylko jedno zadanie naraz, po odebraniu nagrody musisz czekać 24h na kolejne.",
    usage: "!zadanie | !zadanie postep | !zadanie nagroda",
    examples: ["!zadanie", "!zadanie postep", "!zadanie nagroda"],
    cooldown: "24h na kolejne zadanie",
    requirements: "Brak.",
    aliases: ["quest", "challenge", "wyzwanie_daily"],
    additionalInfo: [
      "Zadania wymagają wykonania konkretnych akcji w grach: !work, !bet, !coinflip, !chickenroad, !blackjack, !crime, !rob, !pkn, !slots, !ruletka, !mecz, !wojna.",
      "Niektóre zadania wymagają minimalnej stawki lub konkretnej liczby/specjalnych warunków (np. tylko liczby 1-73 w betach, Hardcore w kurczaku, serie wygranych pod rząd).",
      "Postęp liczony jest automatycznie podczas normalnej gry. Sprawdź status przez !zadanie postep.",
      "Po ukończeniu zadania odbierz nagrodę przez !zadanie nagroda. Nieukończone zadania wygasają po 24h."
    ]
  },
  {
    id: 21,
    name: "rosyjska",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🔫 rosyjska ruletka ze stawką",
    description: "🔫 Zagraj solo przeciwko rewolwerowi (szansa 5/6, zysk 1.2x) lub wyzwij innego gracza.",
    usage: "!rr <kwota> [@osoba] | !rr acc | !rr dec",
    examples: ["!rr 1000","!rr 5000 @Kowalski"],
    cooldown: "5 sekund",
    requirements: "Środki w portfelu.",
    aliases: ["rr","ruletkarosyjska"],
    additionalInfo: ["Pojedynek z graczem toczy się na przemian ze wzrastającym ryzykiem.","Czas na akceptację wyzwania to 2 minuty."]
  },
  {
    id: 22,
    name: "gielda",
    category: "ECONOMY_GAMBLING",
    shortDescription: "📈 gra giełdowa multiplayer",
    description: "📈 Inwestuj w aktywa (Bank, Srebro, Złoto, Diamenty) i zyskuj na zmianach kursów rynkowych.",
    usage: "!gielda | !gielda start | !gielda dolacz | !gielda inwestuj <kwota> <aktywo>",
    examples: ["!gielda start", "!gielda dolacz", "!gielda inwestuj 100k zloto"],
    cooldown: "Zależny od fazy gry",
    requirements: "Zapisy trwają 120s. Runda inwestowania trwa 60s.",
    aliases: ["stock", "giełda"],
    additionalInfo: [
      "Przedziały zmian: Bank (-5% do +10%), Srebro (-15% do +20%), Złoto (-25% do +35%), Diamenty (-50% do +80%).",
      "Maksymalnie 8 graczy na jedną sesję giełdową."
    ]
  },
  {
    id: 23,
    name: "wojna",
    category: "ECONOMY_GAMBLING",
    shortDescription: "⚔️ karciana wojna multiplayer",
    description: "⚔️ Gra karciana dla wielu graczy. W każdej rundzie odpada 40% osób z najsłabszymi kartami.",
    usage: "!wojna <kwota> | !wojna dolacz",
    examples: ["!wojna 50k", "!wojna dolacz"],
    cooldown: "Na czas trwania rund",
    requirements: "Minimum 2, maksymalnie 12 graczy. Czas na zapisy: 90s.",
    aliases: ["cardwar"],
    additionalInfo: [
      "W przypadku remisu kart decyduje kolor (Pik > Kier > Karo > Trefl).",
      "Ostatni gracz na polu bitwy zgarnia całą pulę wpisowego."
    ]
  },
  {
    id: 24,
    name: "artefakty",
    category: "ECONOMY_GAMBLING",
    shortDescription: "💎 Twoje pasywne artefakty",
    description: "💎 Wyświetla listę wszystkich 5 potężnych pasywnych artefaktów i stan ich posiadania.",
    usage: "!artefakty | !artefakty help <nr_artefaktu>",
    examples: ["!artefakty","!artefakty help 1"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["artf","artefakt"],
    additionalInfo: ["!artefakty help <nr> wyświetla szczegółowy opis bonusów pasywnych danego artefaktu."]
  },
  {
    name: "dom",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🏰 twoja posiadłość i bonusy",
    description: "🏰 Zarządzanie własną nieruchomością. Pozwala kupować domy.",
    usage: "!dom | !dom rynek | !dom kup <nazwa> | !dom ulepsz <warsztat/zbrojownia/silownia> | !dom sprzedaj",
    examples: ["!dom", "!dom rynek", "!dom kup domek", "!dom ulepsz warsztat", "!dom sprzedaj"],
    cooldown: "3 sekundy",
    requirements: "Posiadanie odpowiednich funduszy na zakup i utrzymanie (czynsz co 24h).",
    aliases: ["mieszkanie", "house"],
    additionalInfo: [
      "💰 **Czynsz:** Wynosi 10% wartości domu co 24h. Brak środków w portfelu powoduje degradację domu o 1 klasę w dół i reset wszystkich ulepszeń do poziomu 0!",
      "⚙️ **Ulepszenia:** Każdy dom ogranicza maksymalny poziom ulepszeń.",
      "🔧 **Warsztat:** Zwiększa zarobki z pracy !work (od +1% do +9%).",
      "⚔️ **Zbrojownia:** Zwiększa Twoją osobistą siłę (+5% do +22%) i zdobywany przez Ciebie łup (+2% do +18%) w skokach gangu.",
      "🏋️ **Siłownia:** Skraca odnowienie wszystkich komend (od -2% do -12%).",
      "📈 **Upgrade:** Przy zakupie droższej posiadłości płacisz jedynie różnicę ceny."
    ]
  },

  // --- KATEGORIA 2: SOCJALNE I GANGI ---
  {
    id: 25,
    name: "top",
    category: "SOCIAL_GANGS",
    shortDescription: "🏆 rankingi bogactwa, gangów i innych",
    description: "🏆 Pokazuje top 5 najbogatszych graczy, top 3 gangów lub top 5 największych femboyów.",
    usage: "!top [gang/femboy]",
    examples: ["!top","!top gang","!top femboy"],
    cooldown: "8 sekund",
    requirements: "Brak.",
    aliases: ["ranking"],
    additionalInfo: ["Ranking bogactwa sumuje gotówkę w portfelu oraz środki zdeponowane w banku."]
  },
  {
    id: 26,
    name: "rob",
    category: "SOCIAL_GANGS",
    shortDescription: "🗡️ okradnij innego gracza",
    description: "🗡️ Próba kradzieży monet z portfela wskazanego gracza.",
    usage: "!rob <@osoba | id>",
    examples: ["!rob @Rafal"],
    cooldown: "30 minut",
    requirements: "Ofiara musi posiadać minimum 1 000 monet.",
    aliases: ["okradnij"],
    additionalInfo: ["Przedmiot 'Kłódka' chroni przed kradzieżą, a 'Piwo' modyfikuje szanse na sukces."]
  },
  {
    id: 27,
    name: "marry",
    category: "SOCIAL_GANGS",
    shortDescription: "💍 ślub z innym graczem",
    description: "💍 Oświadcz się wybranej osobie. Ślub zapewnia unikalny status w profilu.",
    usage: "!marry <id> | !marry accept/decline <id>",
    examples: ["!marry 123456"],
    cooldown: "12 sekund",
    requirements: "Obie osoby muszą być wolnego stanu.",
    aliases: ["slub"],
    additionalInfo: ["Czas na odpowiedź na oświadczyny wynosi 2 minuty."]
  },
  {
    id: 28,
    name: "rozwod",
    category: "SOCIAL_GANGS",
    shortDescription: "💔 rozwód z partnerem",
    description: "💔 Natychmiastowe zerwanie obecnego związku małżeńskiego.",
    usage: "!rozwod",
    examples: ["!rozwod"],
    cooldown: "3 sekundy",
    requirements: "Musisz być w związku małżeńskim.",
    aliases: ["divorce"],
    additionalInfo: ["Czyści informacje o małżeństwie z profilu obu graczy."]
  },
  {
    id: 29,
    name: "pfp",
    category: "SOCIAL_GANGS",
    shortDescription: "👤 profil gracza",
    description: "👤 Wyświetla profil użytkownika z informacjami o finansach, poziomie, odznakach i statystykach.",
    usage: "!pfp [@osoba | id]",
    examples: ["!pfp @Rafal"],
    cooldown: "4 sekundy",
    requirements: "Brak.",
    aliases: ["profile","profil","awatar"],
    additionalInfo: ["Wysyła grafikę profilową bota jako załącznik, o ile jest dostępna."]
  },
  {
    id: 30,
    name: "nick",
    category: "SOCIAL_GANGS",
    shortDescription: "🏷️ zmiana pseudonimu na grupie",
    description: "🏷️ Pozwala zmienić pseudonim wskazanego użytkownika na aktualnej konwersacji.",
    usage: "!nick <@osoba | id> [nowy_pseudonim]",
    examples: ["!nick @Kowalski Szef", "!nick 123456"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: [],
    additionalInfo: ["Wywołanie komendy bez podawania nowego nicku usuwa pseudonim z czatu."]
  },
  {
    id: 31,
    name: "kick",
    category: "SOCIAL_GANGS",
    shortDescription: "🚷 wyrzucenie członka z grupy",
    description: "🚷 Usuwa wskazanego użytkownika z aktualnej konwersacji grupowej.",
    usage: "!kick <@osoba | id>",
    examples: ["!kick @Kowalski"],
    cooldown: "3 sekundy",
    requirements: "Wymaga uprawnień administratora grupy dla bota oraz nadawcy komendy.",
    aliases: ["wyrzuc"],
    additionalInfo: ["Nie można wyrzucić samego siebie ani twórcy bota."]
  },
  {
    id: 32,
    name: "add",
    category: "SOCIAL_GANGS",
    shortDescription: "➕ dodawanie do grupy",
    description: "➕ Dodaje użytkownika do grupy na podstawie linku do profilu, loginu lub ID.",
    usage: "!add <link_fb / login / ID>",
    examples: ["!add https://www.facebook.com/zuck"],
    cooldown: "3 sekundy",
    requirements: "Wymaga uprawnień administratora grupy dla bota oraz nadawcy komendy.",
    aliases: []
  },
  {
    id: 33,
    name: "duel",
    category: "SOCIAL_GANGS",
    shortDescription: "⚔️ pojedynek o monety",
    description: "⚔️ Wyzywa innego gracza na szybki pojedynek o stawkę z portfela.",
    usage: "!duel <kwota> @osoba | !duel acc/dec",
    examples: ["!duel 1000 @Kowalski","!duel acc"],
    cooldown: "3 sekundy",
    requirements: "Obaj gracze muszą posiadać wybraną stawkę w portfelu.",
    aliases: ["pojedynek"],
    additionalInfo: ["Akceptacja wyzwania: `!duel acc`. Odrzucenie wyzwania: `!duel dec`."]
  },
  {
    id: 34,
    name: "gang",
    category: "SOCIAL_GANGS",
    shortDescription: "zarzadzanie i interakcje gangu",
    description: "System gangów: zakładanie, wspólny sejf, ulepszenia Dziupli, Biznesów i Fachu, skoki oraz wojny gangów.",
    usage: "!gang [stworz/zapros/dolacz/akceptuj/awans/usun/wyrzuc/opusc/wplac/wyplac/ulepsz/skok/wsparcie/wesprzyj/haracz/atak/info] [@osoba/nazwa/nr]",
    examples: ["!gang stworz MojaEkipa","!gang zapros @Kowalski","!gang wplac 5000","!gang ulepsz dziupla","!gang skok","!gang wsparcie InnyGang","!gang wesprzyj","!gang atak InnyGang","!gang info @Kowalski","!gang usun 3"],
    cooldown: "3 sekundy",
    requirements: "Zakładanie gangu kosztuje 1 000 000 viccoinów. Skok gangu wymaga min. 2 graczy.",
    aliases: ["gangi"],
    additionalInfo: ["Boss i Zastępcy zarządzają gangiem.","Ulepszenia dają bonusy do pracy i kradzieży.","!gang usun <nr> — usuwa członka po numerze z listy !gang info (tylko Boss/Zastępcy, Zastępca nie może usuwać Zastępców)."]
  },
  {
    id: 35,
    name: "terytoria",
    category: "SOCIAL_GANGS",
    shortDescription: "🗺️ terytoria gangów",
    description: "🗺️ Zarządzanie i przejmowanie stref dających gangom stałe bonusy pasywne.",
    usage: "!terytoria | !terytoria odbij <nr>",
    examples: ["!terytoria","!terytoria odbij 1"],
    cooldown: "1h po odbiciu",
    requirements: "Przynależność do gangu.",
    aliases: ["territory", "territories"],
    additionalInfo: [
      "Strefy dają bonusy do pracy, kradzieży, walki i reputacji.",
      "Rotacja i reset terytoriów następuje automatycznie co 7 dni."
    ]
  },
  {
    id: 36,
    name: "reputacja",
    category: "SOCIAL_GANGS",
    shortDescription: "🎖️ ranga i reputacja gangu",
    description: "🎖️ Pokazuje reputację gangu, osiągniętą rangę oraz aktywne bonusy pasywne.",
    usage: "!reputacja",
    examples: ["!reputacja","!rep"],
    cooldown: "3 sekundy",
    requirements: "Przynależność do gangu.",
    aliases: ["rep", "ranking_gangu"],
    additionalInfo: ["Wyższa ranga odblokowuje bonusy (np. +5% do work, +5% nagrody z crime)."]
  },
  {
    id: 37,
    name: "awans",
    category: "SOCIAL_GANGS",
    shortDescription: "🎖️ awansuj członka gangu",
    description: "🎖️ Awansuje wybranego członka gangu na stanowisko Zastępcy. Komenda tylko dla Bossa.",
    usage: "!awans @osoba",
    examples: ["!awans @Kowalski"],
    cooldown: "3 sekundy",
    requirements: "Musisz być Bossem gangu.",
    aliases: [],
    additionalInfo: ["Zastępca zyskuje prawa do zapraszania i wyrzucania graczy."]
  },
  {
    id: 38,
    name: "haracz",
    category: "SOCIAL_GANGS",
    shortDescription: "💰 ustawia haracz w gangu",
    description: "💰 Pobiera określony % zysków członków gangu do portfela Bossa. Komenda tylko dla Bossa.",
    usage: "!haracz <procent> | !gang haracz <procent>",
    examples: ["!haracz 15","!gang haracz 20%"],
    cooldown: "3 sekundy",
    requirements: "Musisz być Bossem gangu.",
    aliases: [],
    additionalInfo: ["Haracz nalicza się od wygranych komend !rob i !crime zwykłych członków (zakres 0-100%)."]
  },
  {
    id: 39,
    name: "atak",
    category: "SOCIAL_GANGS",
    shortDescription: "⚔️ napad na sejf wrogiego gangu",
    description: "⚔️ Wypowiedzenie wojny innemu gangowi w celu okradzenia ich sejfu.",
    usage: "!atak <nazwa_gangu> | !gang atak dolacz | !gang obrona dolacz",
    examples: ["!atak InnyGang","!gang atak dolacz"],
    cooldown: "3 sekundy",
    requirements: "Tylko dla Bossa lub Zastępcy gangu.",
    aliases: ["wojna"],
    additionalInfo: [
      "Wymaga minimum 500k w sejfie i kosztuje 10% własnego sejfu.",
      "Zwycięstwo kradnie 15%-35% sejfu wroga. Porażka zabiera 35% własnego sejfu.",
      "Atakowany gang otrzymuje 6h tarczy ochronnej po walce."
    ]
  },
  {
    id: 40,
    name: "milosc",
    category: "SOCIAL_GANGS",
    shortDescription: "❤️ kalkulator dopasowania miłości",
    description: "❤️ Mierzy dopasowanie miłosne dwójki osób i generuje zabawną przepowiednię.",
    usage: "!milosc @osoba | !milosc @osoba1 @osoba2",
    examples: ["!milosc @Kasia", "!milosc @Kasia @Tomek"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["love", "kalkulatormilosci"],
    additionalInfo: ["Wynik dopasowania jest w pełni deterministyczny."]
  },
  {
    id: 41,
    name: "swataj",
    category: "SOCIAL_GANGS",
    shortDescription: "💘 losuje parę dnia na grupie",
    description: "💘 Raz na dobę losuje i oznacza parę dnia spośród aktywnych członków grupy.",
    usage: "!swataj",
    examples: ["!swataj"],
    cooldown: "3 sekundy",
    requirements: "Minimum 2 uczestników na grupie.",
    aliases: ["matchmaker", "pare-dnia", "couple"],
    additionalInfo: ["Wylosowana para zmienia się dokładnie o północy każdego dnia."]
  },
  {
    id: 42,
    name: "wyzwanie",
    category: "SOCIAL_GANGS",
    shortDescription: "🎲 gra w prawda czy wyzwanie",
    description: "🎲 Gra w Prawdę czy Wyzwanie. Uczestnik ma 3 minuty na odpowiedź lub dowód.",
    usage: "!wyzwanie | !wyzwanie @osoba",
    examples: ["!wyzwanie","!wyzwanie @Kowalski"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["dare", "wyzywam"],
    additionalInfo: ["Po 3 minutach bez odpowiedzi, grupa głosuje nad zaliczeniem wyzwania."]
  },
  {
    id: 100,
    name: "sety",
    category: "SOCIAL_GANGS",
    shortDescription: "📦 zestawy przedmiotów",
    description: "📦 Przeglądanie zestawów przedmiotów (item sets) i statusu ich skompletowania.",
    usage: "!sety | !sety <numer>",
    examples: ["!sety","!sety 1"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["sets","zestawy","zestaw"],
    additionalInfo: ["Kompletne zestawy dają dodatkowe, stałe bonusy pasywne."]
  },

  // --- KATEGORIA 3: INNE I NARZĘDZIA ---
  {
    name: "poradnik",
    category: "UTILITY_ADMIN",
    shortDescription: "📖 krótki poradnik dla nowych graczy",
    description: "📖 Wyświetla krótki poradnik z najważniejszymi poradami ułatwiającymi start.",
    usage: "!poradnik",
    examples: ["!poradnik"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["guide"],
    additionalInfo: []
  },
  {
    id: 43,
    name: "help",
    category: "UTILITY_ADMIN",
    shortDescription: "📖 menu pomocy bota",
    description: "📖 Wyświetla listę wszystkich dostępnych komend lub szczegóły wybranego polecenia.",
    usage: "!help [numer/nazwa] | !help <kategoria> [numer]",
    examples: ["!help","!help 2","!help bal","!help spoleczne 3"],
    cooldown: "Brak.",
    requirements: "Brak.",
    aliases: ["pomoc","commands"],
    additionalInfo: ["Kategorie: ekonomiczne (1), spoleczne (2), narzedzia (3), wszystkie (4)."]
  },
  {
    id: 44,
    name: "lvl",
    category: "UTILITY_ADMIN",
    shortDescription: "🏅 nagrody za poziomy i prestiż",
    description: "🏅 Pokazuje nagrody za kamienie milowe poziomów (po 100 lvl poziom resetuje się do 1 i wzrasta Prestiż).",
    usage: "!lvl",
    examples: ["!lvl"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["milestones", "kamieniemilowe"],
    additionalInfo: ["Każdy poziom Prestiżu odblokowuje cenne bonusy ekonomiczne."]
  },
  {
    id: 45,
    name: "odznaki",
    category: "UTILITY_ADMIN",
    shortDescription: "🏆 posiadane i dostępne odznaki",
    description: "🏆 Pokazuje listę zdobytych i dostępnych odznak z ich krótkim opisem.",
    usage: "!odznaki | !odznaki help <nazwa_odznaki>",
    examples: ["!odznaki", "!odznaki help hazardzista"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: [],
    additionalInfo: ["Użyj `!odznaki help <nazwa>` aby poznać szczegóły wymagań i bonusów."]
  },
  {
    id: 46,
    name: "cd",
    category: "UTILITY_ADMIN",
    shortDescription: "⏳ czas oczekiwania komend",
    description: "⏳ Pokazuje czas pozostały do ponownego użycia komend zarobkowych i firm.",
    usage: "!cd",
    examples: ["!cd"],
    cooldown: "Brak.",
    requirements: "Brak.",
    aliases: ["cooldowns", "czasy"],
    additionalInfo: ["Dotyczy komend: !work, !crime, !daily, !rob oraz czasu generowania zysku firm."]
  },
  {
    id: 47,
    name: "pogoda",
    category: "UTILITY_ADMIN",
    shortDescription: "🌤️ sprawdź prognozę pogody",
    description: "🌤️ Wyświetla aktualne warunki atmosferyczne dla wskazanego miasta.",
    usage: "!pogoda [miasto] | !pogoda domyslna <miasto>",
    examples: ["!pogoda","!pogoda Londyn","!pogoda domyslna Rzeszów"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["weather", "synoptyk"],
    additionalInfo: ["Użyj `!pogoda domyslna <miasto>`, aby zapisać swoją lokalizację na stałe."]
  },
  {
    id: 48,
    name: "shamewall",
    category: "UTILITY_ADMIN",
    shortDescription: "📉 ściana wstydu dłużników",
    description: "📉 Pokazuje ranking top 5 graczy z najbardziej ujemnym saldem konta.",
    usage: "!shamewall",
    examples: ["!shamewall"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["scianawstydu", "zadluzeni", "dluznicy"],
    additionalInfo: ["Pokazuje globalną listę osób z ujemnym stanem konta."]
  },
  {
    id: 49,
    name: "zasady",
    category: "UTILITY_ADMIN",
    shortDescription: "📜 regulamin i zasady korzystania",
    description: "📜 Wyświetla oficjalne zasady i regulamin korzystania z bota.",
    usage: "!zasady",
    examples: ["!zasady"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["rules"],
    additionalInfo: []
  },
  {
    id: 50,
    name: "wiadomosci",
    category: "UTILITY_ADMIN",
    shortDescription: "💬 logowanie usuniętych wiadomości",
    description: "💬 Włącza lub wyłącza logowanie usuniętych wiadomości na bieżącej grupie.",
    usage: "!wiadomosci <on/off>",
    examples: ["!wiadomosci on", "!wiadomosci off"],
    cooldown: "3 sekundy",
    requirements: "Wymaga uprawnień administratora grupy lub administratora bota.",
    aliases: ["wiadomości", "delmsglog"],
    additionalInfo: ["Wiadomości usunięte przez twórcę bota nigdy nie są logowane ze względów bezpieczeństwa."]
  },
  {
    id: 51,
    name: "afkdel",
    category: "UTILITY_ADMIN",
    shortDescription: "🧹 usuwanie nieaktywnych z grupy",
    description: "🧹 Usuwa z grupy członków, którzy nie wysłali wiadomości przez ostatnie 30 dni.",
    usage: "!afkdel",
    examples: ["!afkdel"],
    cooldown: "30 sekund",
    requirements: "Wymaga uprawnień administratora grupy dla bota oraz nadawcy komendy.",
    aliases: [],
    additionalInfo: ["Ignoruje administratorów grupy, administratorów bota oraz samego bota."]
  },
  {
    id: 52,
    name: "fm",
    category: "UTILITY_ADMIN",
    shortDescription: "🎵 integracja z Last.fm",
    description: "🎵 Integracja z Last.fm: statystyki odtworzeń, aktualnie słuchane utwory i wspólna topka.",
    usage: "!fm <subkomenda> [opcje]",
    examples: ["!fm połącz nazwa_konta", "!fm toputwory 3m @Rafal", "!fm grupa"],
    cooldown: "3 sekundy",
    requirements: "Profil Last.fm musi być publiczny.",
    aliases: ["lastfm"],
    additionalInfo: [
      "Główne subkomendy: połącz <nazwa>, odłącz, aktualnie [@osoba], ostatnie, grupa.",
      "Statystyki: toputwory/topartyści/topalbumy [okres (1m, 3m, 6m, 12m, all)].",
      "Wyszukiwanie i granie muzyki: play <nazwa_utworu> (odtworzy wideo z YouTube).",
      "Prywatność: incognito <on/off>."
    ]
  },
  {
    id: 53,
    name: "reakcja",
    category: "UTILITY_ADMIN",
    shortDescription: "⚡ gra szybkie palce",
    description: "⚡ Szybkie Palce — kto pierwszy przepisze losowo wygenerowany kod, ten zgarnia nagrodę.",
    usage: "!reakcja",
    examples: ["!reakcja"],
    cooldown: "Brak.",
    requirements: "Wymaga bycia pierwszym.",
    aliases: [],
    additionalInfo: [
      "Wywołuje się automatycznie co 9-24h lub ręcznie przez admina.",
      "Nagroda wynosi od 20 000 do 200 000 monet. Kod wygasa po 2 minutach."
    ]
  },
  {
    id: 54,
    name: "gangreset",
    category: "UTILITY_ADMIN",
    shortDescription: "🔄 reset cooldownów gangów",
    description: "🔄 Resetuje czas oczekiwania (cooldown) na skoki gangu oraz ataki dla wszystkich gangów.",
    usage: "!gangreset",
    examples: ["!gangreset"],
    cooldown: "Brak.",
    requirements: "Wymaga uprawnień administratora bota.",
    aliases: [],
    additionalInfo: []
  },
  {
    id: 55,
    name: "guardnick",
    category: "UTILITY_ADMIN",
    shortDescription: "🔒 blokada pseudonimu gracza",
    description: "🔒 Blokuje pseudonim użytkownika na grupie. Każda próba zmiany nicku zostanie anulowana.",
    usage: "!guardnick <@osoba | id> <pseudonim> | !guardnick off",
    examples: ["!guardnick @Kowalski WymuszonyNick", "!guardnick off"],
    cooldown: "Brak.",
    requirements: "Wymaga bycia twórcą bota.",
    aliases: [],
    additionalInfo: []
  },
  {
    id: 56,
    name: "prefix",
    category: "UTILITY_ADMIN",
    shortDescription: "🔣 zmiana prefixu bota",
    description: "🔣 Wyświetla aktualny prefix bota lub zmienia go na nowy na bieżącej grupie.",
    usage: "!prefix [nowy_prefix]",
    examples: ["!prefix", "!prefix .", "!prefix !"],
    cooldown: "Brak.",
    requirements: "Zmiana wymaga administratora bota lub administratora grupy.",
    aliases: [],
    additionalInfo: []
  },
  {
    id: 57,
    name: "zakaz",
    category: "UTILITY_ADMIN",
    shortDescription: "🚫 blokada komend/powiadomień",
    description: "🚫 Pozwala zablokować komendy ekonomiczne lub wszystkie globalne powiadomienia na bieżącej grupie.",
    usage: "!zakaz economia | !zakaz powiadomienia",
    examples: ["!zakaz economia", "!zakaz powiadomienia"],
    cooldown: "Brak.",
    requirements: "Wymaga uprawnień administratora grupy lub bota.",
    aliases: [],
    additionalInfo: [
      "!zakaz economia — blokuje komendy z kategorii ekonomicznej.",
      "!zakaz powiadomienia — blokuje WSZYSTKIE globalne powiadomienia (podatki, loteria, eventy, gry, reminder, multimecz, reakcje, flagi itd.)."
    ]
  },
  {
    id: 57,
    name: "pkn",
    category: "ECONOMY_GAMBLING",
    shortDescription: "✊ gra w papier, kamień, nożyce",
    description: "✊ Hazardowa gra w Papier, Kamień, Nożyce (solo z botem lub wyzwanie PvP z graczem).",
    usage: "!pkn <stawka> <k/p/n> | !pkn @osoba <stawka> | !pkn acc/dec",
    examples: ["!pkn 1000 kamien", "!pkn @Kowalski 20000", "!pkn acc"],
    cooldown: "3 sekundy",
    requirements: "Posiadanie stawki w portfelu.",
    aliases: ["rps", "papierkamiennozyce"],
    additionalInfo: [
      "Wygrana solo daje 1.90x stawki (remis zwraca stawkę).",
      "Pojedynek PvP: wygrany zgarnia całą pulę pomniejszoną o 5% prowizji.",
      "Szkarłatne Oko lub odznaki mogą uratować Cię przed przegraną solo."
    ]
  },
  {
    id: 58,
    name: "mecz",
    category: "ECONOMY_GAMBLING",
    shortDescription: "⚽ zakłady bukmacherskie",
    description: "⚽ Obstawiaj wyniki wirtualnych meczów piłkarskich (1 - gospodarze, X - remis, 2 - goście).",
    usage: "!mecz | !mecz <stawka> <1/X/2>",
    examples: ["!mecz", "!mecz 5000 1", "!mecz x 10k"],
    cooldown: "3 sekundy",
    requirements: "Posiadanie stawki w portfelu.",
    aliases: ["betmecz", "spotkanie"],
    additionalInfo: [
      "Wpisanie komendy bez argumentów generuje nowe spotkanie i kursy.",
      "Wygrana wypłaca stawkę pomnożoną przez kurs wybranego typu."
    ]
  },
  {
    id: 59,
    name: "multimecz",
    category: "ECONOMY_GAMBLING",
    shortDescription: "📋 oferta meczów łączonych (AKO)",
    description: "📋 Generuje ofertę wielu wirtualnych meczów (od 2 do 10), które można połączyć na jednym kuponie.",
    usage: "!multimecz [liczba_meczów]",
    examples: ["!multimecz", "!multimecz 5"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: [],
    additionalInfo: [
      "Pozwala na jednoczesne obstawienie wielu meczów z wyższym kursem łącznym (AKO)."
    ]
  },
  {
    id: 60,
    name: "multiobstaw",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🎫 obstawianie kuponu łączonego (AKO)",
    description: "🎫 Pozwala obstawić mecze z aktywnej oferty łączonej (AKO) na jednym kuponie (kursy mnożą się).",
    usage: "!multiobstaw <nr_meczu> <typ> <stawka> ...",
    examples: ["!mo 1 1 2 x 1000", "!mm 1 x 2 2 3 1 10k"],
    cooldown: "3 sekundy",
    requirements: "Aktywna oferta multi-meczu i środki w portfelu.",
    aliases: ["mo", "mm"],
    additionalInfo: [
      "Kupon jest wygrany tylko wtedy, gdy wszystkie wybrane typy są trafione.",
      "Stawki podane przy typach zostaną zsumowane do całkowitej stawki kuponu."
    ]
  },
  {
    id: 61,
    name: "admin",
    category: "UTILITY_ADMIN",
    shortDescription: "⚙️ zarządzanie adminami bota",
    description: "⚙️ Pozwala nadawać i odbierać uprawnienia administratora bota w danej grupie.",
    usage: "!admin give @osoba | !admin del @osoba",
    examples: ["!admin give @Kowalski", "!admin del 123456789"],
    cooldown: "Brak.",
    requirements: "Wymaga, by bot był adminem grupy, a nadawca adminem bota lub grupy.",
    aliases: [],
    additionalInfo: ["Zarządza uprawnieniami bezpośrednio w bazie konfiguracji bota."]
  },
  {
    id: 62,
    name: "milionerzy",
    category: "ECONOMY_GAMBLING",
    shortDescription: "🧠 quiz wiedzy z pulą nagród",
    description: "🧠 Uruchamia quiz wiedzy Milionerzy. Pierwsza osoba w grupie, która odpowie poprawnie, wygrywa pulę.",
    usage: "!milionerzy <kwota>",
    examples: ["!milionerzy 50000", "!milionerzy 1m", "!milionerzy all"],
    cooldown: "Brak.",
    requirements: "Środki w portfelu (minimum 10 000 monet).",
    aliases: ["mili", "quiz"],
    additionalInfo: [
      "Czas na odpowiedź (A/B/C/D) wynosi 15 sekund.",
      "Od wygranej pobierany jest podatek w wysokości 5%.",
      "Organizator nie może sam brać udziału w odpowiadaniu."
    ]
  },
  {
    id: 63,
    name: "wisielec",
    category: "SOCIAL_GANGS",
    shortDescription: "🔤 gra w wisielca",
    description: "🔤 Uruchamia grę w Wisielca. Gracze na przemian zgadują litery wylosowanego hasła.",
    usage: "!wisielec | !wisielec dolacz | !wisielec start",
    examples: ["!wisielec", "!wisielec dolacz", "!wisielec start"],
    cooldown: "Brak.",
    requirements: "Minimum 1 gracz.",
    aliases: ["wisielecz", "hangman"],
    additionalInfo: [
      "Czas na zapisy to 2 minuty. Czas na podanie litery w turze to 30 sekund.",
      "Gracze mają wspólnie 6 szans na pomyłkę (6 żyć). Pula haseł to ponad 500 słów."
    ]
  },
  {
    id: 64,
    name: "panstwamiasta",
    category: "SOCIAL_GANGS",
    shortDescription: "🗺️ gra w państwa-miasta",
    description: "🗺️ Uruchamia grę w Państwa-Miasta na określoną liczbę tur.",
    usage: "!panstwamiasta [ilość_tur]",
    examples: ["!panstwamiasta", "!panstwamiasta 4", "!panstwa-miasta dolacz"],
    cooldown: "Brak.",
    requirements: "Maksymalnie 4 tury.",
    aliases: ["panstwa-miasta", "panstwamiastadolacz", "panstwamiastastart"],
    additionalInfo: [
      "Rejestracja trwa 2 minuty.",
      "Runda trwa 20 sekund. Należy wysłać parę 'Kraj Miasto' na wylosowaną literę.",
      "Punktacja: słowo unikalne daje 10 pkt, powtórzone 5 pkt."
    ]
  },
  {
    id: 65,
    name: "femboy",
    category: "SOCIAL_GANGS",
    shortDescription: "💅 sprawdź poziom bycia femboyem",
    description: "💅 Mierzy w procentach poziom bycia femboyem dla oznaczonej osoby.",
    usage: "!femboy @osoba",
    examples: ["!femboy @Kowalski"],
    cooldown: "3 sekundy",
    requirements: "Oznaczenie użytkownika.",
    aliases: ["fem", "boy"],
    additionalInfo: ["Wynik dopasowania jest w pełni deterministyczny."]
  },
  {
    id: 66,
    name: "toplvl",
    category: "SOCIAL_GANGS",
    shortDescription: "🏅 ranking najwyższych poziomów",
    description: "🏅 Wyświetla ranking 5 graczy z najwyższym poziomem (lvl) oraz ich prestiżem.",
    usage: "!toplvl",
    examples: ["!toplvl"],
    cooldown: "8 sekund",
    requirements: "Brak.",
    aliases: ["rankinglvl", "toppoziom"],
    additionalInfo: []
  },
  {
    id: 67,
    name: "losuj",
    category: "SOCIAL_GANGS",
    shortDescription: "🎯 losuje i oznacza osobę z grupy",
    description: "🎯 Losuje losowego członka grupy (oprócz bota) i oznacza go na czacie.",
    usage: "!losuj",
    examples: ["!losuj"],
    cooldown: "3 sekundy",
    requirements: "Działa wyłącznie w konwersacjach grupowych.",
    aliases: ["random", "wylosuj"],
    additionalInfo: []
  },
  {
    id: 68,
    name: "afk",
    category: "SOCIAL_GANGS",
    shortDescription: "💤 status nieobecności (AFK)",
    description: "💤 Ustawia status nieobecności (AFK) z opcjonalnym powodem.",
    usage: "!afk <powod>",
    examples: ["!afk robie obiad", "!afk zaraz wracam"],
    cooldown: "Brak.",
    requirements: "Brak.",
    aliases: ["brb", "zaz", "zw"],
    additionalInfo: [
      "Gdy ktoś Cię oznaczy, bot wyświetli informację o Twoim statusie i powodzie nieobecności.",
      "Napisanie jakiejkolwiek wiadomości na czacie automatycznie wyłącza status AFK."
    ]
  },
  {
    id: 69,
    name: "krolik",
    category: "SOCIAL_GANGS",
    shortDescription: "🐰 wysyła zdjęcie królika",
    description: "🐰 Pobiera i wysyła losowe zdjęcie królika (przefiltrowane - tylko formaty graficzne, bez wideo i treści drastycznych).",
    usage: "!krolik",
    examples: ["!krolik"],
    cooldown: "2 minuty",
    requirements: "Brak.",
    aliases: ["rabbit", "bunny"],
    additionalInfo: ["Właściciel bota nie ma cooldownu na tę komendę."]
  },
  {
    id: 691,
    name: "lew",
    category: "SOCIAL_GANGS",
    shortDescription: "🦁 wysyła zdjęcie lwa",
    description: "🦁 Pobiera i wysyła losowe zdjęcie lwa (przefiltrowane - tylko formaty graficzne, bez wideo i treści drastycznych).",
    usage: "!lew",
    examples: ["!lew"],
    cooldown: "2 minuty",
    requirements: "Brak.",
    aliases: ["lion", "lwy"],
    additionalInfo: ["Właściciel bota nie ma cooldownu na tę komendę."]
  },
  {
    id: 70,
    name: "kotek",
    category: "SOCIAL_GANGS",
    shortDescription: "🐱 wysyła zdjęcie małego kotka",
    description: "🐱 Pobiera i wysyła losowe zdjęcie małego kotka (przefiltrowane - tylko formaty graficzne, bez wideo i treści drastycznych).",
    usage: "!kotek",
    examples: ["!kotek"],
    cooldown: "2 minuty",
    requirements: "Brak.",
    aliases: ["kitten", "kitty", "cat"],
    additionalInfo: ["Właściciel bota nie ma cooldownu na tę komendę."]
  },
  {
    id: 71,
    name: "dog",
    category: "SOCIAL_GANGS",
    shortDescription: "🐶 wysyła zdjęcie psa",
    description: "🐶 Pobiera i wysyła losowe zdjęcie psa (przefiltrowane - tylko formaty graficzne, bez wideo i treści drastycznych).",
    usage: "!dog",
    examples: ["!dog", "!pies"],
    cooldown: "2 minuty",
    requirements: "Brak.",
    aliases: ["pies", "piesek", "puppy", "doggo"],
    additionalInfo: ["Właściciel bota nie ma cooldownu na tę komendę."]
  },
  {
    id: 72,
    name: "fox",
    category: "SOCIAL_GANGS",
    shortDescription: "🦊 wysyła zdjęcie liska",
    description: "🦊 Pobiera i wysyła losowe zdjęcie liska (przefiltrowane - tylko formaty graficzne, bez wideo i treści drastycznych).",
    usage: "!fox",
    examples: ["!fox", "!lis"],
    cooldown: "2 minuty",
    requirements: "Brak.",
    aliases: ["lis", "liszka", "vulpes"],
    additionalInfo: ["Właściciel bota nie ma cooldownu na tę komendę."]
  },
  {
    id: 73,
    name: "capybara",
    category: "SOCIAL_GANGS",
    shortDescription: "🦫 wysyła zdjęcie kapibary",
    description: "🦫 Pobiera i wysyła losowe zdjęcie kapibary (przefiltrowane - tylko formaty graficzne, bez wideo i treści drastycznych).",
    usage: "!capybara",
    examples: ["!capybara", "!kapibara"],
    cooldown: "2 minuty",
    requirements: "Brak.",
    aliases: ["capy", "kapibara"],
    additionalInfo: ["Właściciel bota nie ma cooldownu na tę komendę."]
  },
  {
    id: 74,
    name: "kameleon",
    category: "SOCIAL_GANGS",
    shortDescription: "🦎 wysyła zdjęcie kameleona",
    description: "🦎 Pobiera i wysyła losowe zdjęcie kameleona (przefiltrowane - tylko formaty graficzne, bez wideo i treści drastycznych).",
    usage: "!kameleon",
    examples: ["!kameleon"],
    cooldown: "2 minuty",
    requirements: "Brak.",
    aliases: ["chameleon"],
    additionalInfo: ["Właściciel bota nie ma cooldownu na tę komendę."]
  },
  {
    id: 75,
    name: "jaszczurka",
    category: "SOCIAL_GANGS",
    shortDescription: "🦎 wysyła zdjęcie jaszczurki",
    description: "🦎 Pobiera i wysyła losowe zdjęcie jaszczurki (przefiltrowane - tylko formaty graficzne, bez wideo i treści drastycznych).",
    usage: "!jaszczurka",
    examples: ["!jaszczurka"],
    cooldown: "2 minuty",
    requirements: "Brak.",
    aliases: ["lizard", "lizardi"],
    additionalInfo: ["Właściciel bota nie ma cooldownu na tę komendę."]
  },
  {
    id: 76,
    name: "waz",
    category: "SOCIAL_GANGS",
    shortDescription: "🐍 wysyła zdjęcie węża",
    description: "🐍 Pobiera i wysyła losowe zdjęcie węża (przefiltrowane - tylko formaty graficzne, bez wideo i treści drastycznych).",
    usage: "!waz",
    examples: ["!waz"],
    cooldown: "2 minuty",
    requirements: "Brak.",
    aliases: ["snake"],
    additionalInfo: ["Właściciel bota nie ma cooldownu na tę komendę."]
  },
  {
    name: "analiza",
    category: "UTILITY_ADMIN",
    shortDescription: "📊 analiza historii czatu i odpowiedzi",
    description: "📊 Generuje podsumowanie i analizę historii czatu grupowego lub odpowiada na zadane pytania.",
    usage: "!analiza <pytanie> | !analiza <liczba_wiadomości> <pytanie>",
    examples: ["!analiza jaka jest stolica Francji?", "!analiza 500 kto ma rację w sporze?"],
    cooldown: "10 minut (grupowy) / 1 na dobę per gracz",
    requirements: "Brak.",
    aliases: ["pytanie", "zapytaj"],
    additionalInfo: [
      "Maksymalnie analizuje do 5000 wiadomości.",
      "Liczba analizowanych wiadomości musi być podana jako pierwszy parametr."
    ]
  },
  {
    name: "propozycje",
    category: "UTILITY_ADMIN",
    shortDescription: "💡 zgłaszanie propozycji i sugestii",
    description: "💡 Wysyła propozycję nowej funkcji, przedmiotu lub ulepszenia bota do zespołu administracyjnego.",
    usage: "!propozycje <treść>",
    examples: ["!propozycje dodaj komende do zakladania eventow"],
    cooldown: "Brak.",
    requirements: "Brak.",
    aliases: ["propozycja"],
    additionalInfo: [
      "Maksymalna długość wiadomości to 2000 znaków.",
      "Za niepoważne zgłoszenia otrzymujesz ostrzeżenia. 3 ostrzeżenia blokują dostęp do komendy."
    ]
  },
  {
    name: "dlug",
    category: "ECONOMY_GAMBLING",
    shortDescription: "📝 przegląd długów i wierzytelności",
    description: "📝 Wyświetla podsumowanie Twoich aktualnych długów oraz listę pożyczek.",
    usage: "!dlug | !dlug lista | !dlug gracz <id>",
    examples: ["!dlug", "!dlug lista", "!dlug gracz 123456789"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["dlugi", "debts", "debtors"],
    additionalInfo: ["Bilans netto pokazuje różnicę między kwotami pożyczonymi a należnymi."]
  },
  {
    id: 999,
    name: "podziekowania",
    category: "UTILITY_ADMIN",
    shortDescription: "lista osób które pomogły w tworzeniu bota",
    description: "Wyświetla listę osób, które pomogły w tworzeniu i testowaniu bota, podzieloną na kategorie.",
    usage: "!podziekowania",
    examples: ["!podziekowania"],
    cooldown: "Brak",
    requirements: "Brak.",
    aliases: ["thanks", "credits", "podziekowanie"],
    additionalInfo: ["Tylko twórca bota może dodawać/usuwać osoby komendą !thx."]
  },
  {
    id: 1000,
    name: "tlumacz",
    category: "UTILITY_ADMIN",
    shortDescription: "🌍 przetłumacz tekst na wybrany język",
    description: "🌍 Przetłumacza podaną treść na wybrany język za pomocą AI.",
    usage: "!tlumacz <treść> <język>",
    examples: ["!tlumacz hello world angielski","!tlumacz jak się masz francuski","!tlumacz good morning japoński"],
    cooldown: "5 sekund",
    requirements: "Brak.",
    aliases: ["translate", "tl"],
    additionalInfo: ["Język podaj jako słowo, np. angielski, niemiecki, francuski, hiszpański, japoński, chiński, rosyjski itp."]
  },
  {
    id: 1001,
    name: "afk",
    category: "UTILITY_ADMIN",
    shortDescription: "😴 ustaw status nieobecności",
    description: "😴 Ustawia status AFK (Away From Keyboard) z dowolnym powodem. Inni użytkownicy zostaną powiadomieni o Twojej nieobecności, gdy wzmienią Twoją nazwę.",
    usage: "!afk <powód> | !afk off",
    examples: ["!afk lecę spać","!afk praca","!afk off"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: [],
    additionalInfo: [
      "Status AFK wygasa automatycznie po 24 godzinach.",
      "Wszyscy użytkownicy mają status AFK wyłączony domyślnie.",
      "Aby sprawdzić swój status: !afk"
    ]
  },
  {
    id: 1002,
    name: "anime",
    category: "UTILITY_ADMIN",
    shortDescription: "🎬 info o anime z AniList",
    description: "🎬 Wyszukuje anime po tytule w bazie AniList i wyświetla ocenę, typ, odcinki, status, studio i opis.",
    usage: "!anime <tytuł>",
    examples: ["!anime attack on titan"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["anime-info", "animeinfo"],
    additionalInfo: ["Dane pochodzą z AniList (GraphQL, bez klucza, bez rate limit Jikan).","W razie problemów z API spróbuj ponownie za chwilę."]
  },
  {
    id: 1003,
    name: "manga",
    category: "UTILITY_ADMIN",
    shortDescription: "📖 info o mandze z AniList",
    description: "📖 Wyszukuje mangę po tytule w bazie AniList i wyświetla ocenę, typ, liczbę rozdziałów, tomów, status i opis.",
    usage: "!manga <tytuł>",
    examples: ["!manga one piece"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["manga-info", "mangainfo"],
    additionalInfo: ["Dane pochodzą z AniList (GraphQL, bez klucza, bez restrykcyjnych limitów Jikan).","W razie problemów z API spróbuj ponownie za chwilę."]
  }
];

function getActiveHelpCommands() {
  const unlockTime = 1780264800000; // 2026-06-01T00:00:00+02:00
  let filtered = [...helpCommands];
  if (Date.now() < unlockTime) {
    filtered = filtered.filter(command => command.name !== 'firma');
  }
  
  // Ukryj komendy dostępne tylko dla twórcy z zwykłego help
  filtered = filtered.filter(command => {
    const creatorOnlyCommands = ['thx', 'zezwol', 'wersja', 'uadm', 'adm', 'guardnick', 'danegrpinfo', 'danegrp', 'dane', 'checkspam', 'backup', 'eventitemadd', 'eventitemdel', 'itemadd', 'gangreset', 'wymus', 'odtworz', 'stopdanegrpinfo', 'kubl', 'truebl'];
    return !creatorOnlyCommands.includes(command.name);
  });
  
  const catOrder = {
    ECONOMY_GAMBLING: 0,
    SOCIAL_GANGS: 1,
    UTILITY_ADMIN: 2
  };
  filtered.sort((a, b) => catOrder[a.category] - catOrder[b.category]);
  return filtered.map((cmd, idx) => ({ ...cmd, id: idx + 1 }));
}

function getCreatorHelpCommands() {
  const unlockTime = 1780264800000; // 2026-06-01T00:00:00+02:00
  let filtered = [...helpCommands];
  if (Date.now() < unlockTime) {
    filtered = filtered.filter(command => command.name !== 'firma');
  }
  
  // Pokaż tylko komendy dostępne dla twórcy i adminów
  filtered = filtered.filter(command => {
    const creatorOnlyCommands = ['thx', 'zezwol', 'wersja', 'uadm', 'adm', 'guardnick', 'danegrpinfo', 'danegrp', 'dane', 'checkspam', 'backup', 'eventitemadd', 'eventitemdel', 'itemadd', 'gangreset', 'wymus', 'odtworz', 'stopdanegrpinfo', 'kubl', 'truebl'];
    const adminCommands = ['afkdel', 'aktualizuj', 'bl', 'blgrp', 'flaga', 'group', 'kick', 'loop', 'prefix', 'reakcja', 'ubl', 'ublgrp', 'wiadomosci', 'zakaz'];
    return creatorOnlyCommands.includes(command.name) || adminCommands.includes(command.name);
  });
  
  const catOrder = {
    ECONOMY_GAMBLING: 0,
    SOCIAL_GANGS: 1,
    UTILITY_ADMIN: 2
  };
  filtered.sort((a, b) => catOrder[a.category] - catOrder[b.category]);
  return filtered.map((cmd, idx) => ({ ...cmd, id: idx + 1 }));
}

function getHelpCommandById(id) {
  return getActiveHelpCommands().find(command => command.id === id) || null;
}

function getHelpCommandByName(input) {
  const normalized = String(input || '').toLowerCase();

  return getActiveHelpCommands().find(command => (
    command.name === normalized
    || (command.aliases && (command.aliases && command.aliases.some(alias => alias.toLowerCase() === normalized)))
  )) || null;
}

function getTotalPages() {
  return Math.max(1, Math.ceil(getActiveHelpCommands().length / HELP_PAGE_SIZE));
}

function paginateCommands(page) {
  const safePage = Math.min(Math.max(1, page), getTotalPages());
  const start = (safePage - 1) * HELP_PAGE_SIZE;
  const items = getActiveHelpCommands().slice(start, start + HELP_PAGE_SIZE);

  return {
    page: safePage,
    totalPages: getTotalPages(),
    items
  };
}

function buildHelpShell() {
  return new EmbedBuilder()
    .setColor(config.embed.primary);
}

function buildHelpListEmbed(client, prefix = '!') {
  const embed = buildHelpShell()
    .setDescription('Wszystkie dostepne komendy bota podzielone na 3 kategorie.');

  const categories = {
    ECONOMY_GAMBLING: '💰 EKONOMIA I HAZARD',
    SOCIAL_GANGS: '👥 SOCJALNE I GANGI',
    UTILITY_ADMIN: '⚙️ INNE I NARZĘDZIA'
  };

  const fields = [];
  for (const [catKey, catLabel] of Object.entries(categories)) {
    const cmds = getActiveHelpCommands().filter(c => c.category === catKey);
    if (cmds.length > 0) {
      const fieldContent = cmds.map(c => `• ${c.id}. ${prefix}${c.name} - ${c.shortDescription}`).join('\n');
      fields.push({
        name: catLabel,
        value: fieldContent,
        inline: false
      });
    }
  }

  if (fields.length > 0) {
    const lastField = fields[fields.length - 1];
    lastField.value += `\n\nUzyj \`${prefix}help <nazwa_komendy>\`, aby poznac szczegoly.`;
  }

  embed.addFields(fields);
  return embed;
}

function buildHelpDetailEmbed(client, command, prefix = '!') {
  const embed = buildHelpShell()
    .setTitle(`Komenda: ${prefix}${command.name}`)
    .setDescription(command.description)
    .addFields(
      { name: 'Cooldown', value: command.cooldown, inline: true }
    );

  if (command.aliases && command.aliases.length > 0) {
    embed.addFields({ name: 'Aliasy', value: command.aliases.map(al => `${prefix}${al}`).join(', '), inline: true });
  }

  embed.addFields(
    { name: 'Skladnia', value: command.usage.replace(/!/g, prefix), inline: false },
    { name: 'Przyklady', value: command.examples.map(ex => ex.replace(/!/g, prefix)).join('\n'), inline: false }
  );

  if (command.requirements && command.requirements !== 'Brak.') {
    embed.addFields({ name: 'Wymagania', value: command.requirements, inline: false });
  }

  if (command.additionalInfo && command.additionalInfo.length > 0) {
    embed.addFields({
      name: 'Dodatkowe informacje',
      value: command.additionalInfo.map(info => info.trim().startsWith('•') || info.trim().startsWith('📈') ? info : `• ${info}`).join('\n'),
      inline: false
    });
  }

  return embed;
}

function buildHelpErrorEmbed() {
  return buildHelpShell()
    .setTitle('Blad pomocy')
    .setDescription('Nie znaleziono komendy o tym numerze lub nazwie.');
}

function buildHelpButtons() {
  return [];
}

function resolveCategoryInput(input) {
  const normalized = String(input || '').toLowerCase().trim();
  return CATEGORY_INPUT_ALIASES[normalized] || null;
}

function getCommandsByCategory(categoryKey) {
  const all = getActiveHelpCommands();
  const filtered = all.filter(c => c.category === categoryKey);
  return filtered.map((cmd, idx) => ({ ...cmd, categoryId: idx + 1 }));
}

function getHelpCommandByCategoryAndNumber(categoryKey, num) {
  const list = getCommandsByCategory(categoryKey);
  return list.find(c => c.categoryId === num) || null;
}

function buildCategoryPromptEmbed(prefix = '!') {
  return buildHelpShell()
    .setTitle('📖 Centrum Pomocy')
    .setDescription(
      `Wybierz kategorię, którą chcesz zobaczyć:\n\n` +
      `1️⃣ 💰 Ekonomiczne\n` +
      `2️⃣ 👥 Społeczne\n` +
      `3️⃣ 🛠️ Narzędzia / Inne\n` +
      `4️⃣ 📋 Wszystkie na raz\n\n` +
      `👉 Odpowiedz numerem (1-4) lub nazwą kategorii (np. "społeczne").\n` +
      `⏳ Masz 60 sekund na odpowiedź — tylko Ty możesz odpowiedzieć na to pytanie.`
    );
}

function buildCategoryListEmbed(categoryKey, prefix = '!') {
  const label = CATEGORY_SELECT_LABELS[categoryKey] || categoryKey;
  const cmds = getCommandsByCategory(categoryKey);
  const catArg = CATEGORY_ARG_NAMES[categoryKey] || '';

  const listText = cmds.map(c => `${c.categoryId}. ${prefix}${c.name} — ${c.shortDescription}`).join('\n');

  return buildHelpShell()
    .setTitle(label)
    .setDescription(
      `${listText}\n\n💡 Szczegóły komendy: \`${prefix}help ${catArg} <numer>\``
    );
}

module.exports = {
  HELP_PAGE_SIZE,
  helpCommands,
  getHelpCommandById,
  getHelpCommandByName,
  buildHelpDetailEmbed,
  buildHelpErrorEmbed,
  buildHelpListEmbed,
  resolveCategoryInput,
  getHelpCommandByCategoryAndNumber,
  buildCategoryPromptEmbed,
  buildCategoryListEmbed,
  getActiveHelpCommands,
  getCreatorHelpCommands
};
