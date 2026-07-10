const { EmbedBuilder } = require('./embeds');
const config = require('../config/config');

const HELP_PAGE_SIZE = 7;

const CATEGORY_META = {
  ECONOMY_GAMBLING: { label: '💰 EKONOMIA I HAZARD' },
  SOCIAL_GANGS: { label: '👥 SOCJALNE I GANGI' },
  UTILITY_ADMIN: { label: '⚙️ INNE I NARZĘDZIA' }
};

const helpCommands = [
  // --- KATEGORIA 1: EKONOMIA I HAZARD (1 - 24) ---
  {
    id: 1,
    name: "bal",
    category: "ECONOMY_GAMBLING",
    shortDescription: "pokazuje saldo",
    description: "Pokazuje stan portfela, banku oraz podstawowe statystyki konta.",
    usage: "!bal [@osoba | id]",
    examples: ["!bal","!bal @Rafal"],
    cooldown: "2 sekundy",
    requirements: "Brak.",
    aliases: ["balance","kasa","saldo"],
    additionalInfo: ["Pokazuje portfel i bank."]
  },
  {
    id: 2,
    name: "daily",
    category: "ECONOMY_GAMBLING",
    shortDescription: "odbierz dzienna nagrode",
    description: "Odbiera codzienną nagrodę.",
    usage: "!daily",
    examples: ["!daily"],
    cooldown: "Nagroda co 24h",
    requirements: "Musisz odczekac 24 godziny od poprzedniego claimu.",
    aliases: [],
    additionalInfo: ["VIP Pass zwieksza wysokosc daily.","Dzienny streak dodaje bonus."]
  },
  {
    id: 3,
    name: "work",
    category: "ECONOMY_GAMBLING",
    shortDescription: "zarob viccoiny pracujac",
    description: "Zarób viccoiny za uczciwą pracę.",
    usage: "!work",
    examples: ["!work"],
    cooldown: "10 sekund",
    requirements: "Brak.",
    aliases: [],
    additionalInfo: ["VIP Pass daje bonus do wyplat."]
  },
  {
    id: 4,
    name: "crime",
    category: "ECONOMY_GAMBLING",
    shortDescription: "ryzykowna kradziez NPC",
    description: "Napad na NPC — zysk lub strata.",
    usage: "!crime",
    examples: ["!crime"],
    cooldown: "12 sekund",
    requirements: "Brak.",
    aliases: [],
    additionalInfo: ["Ryzykowna akcja."]
  },
  {
    id: 5,
    name: "wplac",
    category: "ECONOMY_GAMBLING",
    shortDescription: "wplac viccoiny do banku",
    description: "Przenosi viccoiny z portfela do banku.",
    usage: "!wplac kwota",
    examples: ["!wplac 1000","!wplac all"],
    cooldown: "3 sekundy",
    requirements: "Musisz miec miejsce w banku.",
    aliases: ["deposit","dep"],
    additionalInfo: ["VIP zwieksza pojemnosc banku."]
  },
  {
    id: 6,
    name: "wyplac",
    category: "ECONOMY_GAMBLING",
    shortDescription: "wyplac viccoiny z banku",
    description: "Wyjmuje viccoiny z banku do portfela.",
    usage: "!wyplac kwota",
    examples: ["!wyplac 5000","!wyplac all"],
    cooldown: "3 sekundy",
    requirements: "Musisz miec viccoiny w banku.",
    aliases: ["withdraw","with"],
    additionalInfo: ["Obsluguje all i max."]
  },
  {
    id: 7,
    name: "sklep",
    category: "ECONOMY_GAMBLING",
    shortDescription: "sklep kasynowy",
    description: "Pozwala kupić przedmioty z oferty.",
    usage: "!sklep <nr_itemu> [ilosc]",
    examples: ["!sklep 3 2"],
    cooldown: "3 sekundy",
    requirements: "Wystarczajacy balance.",
    aliases: ["shop","sklp","store"],
    additionalInfo: ["Kupuj po numerze z listy."]
  },
  {
    id: 8,
    name: "eq",
    category: "ECONOMY_GAMBLING",
    shortDescription: "twoj ekwipunek",
    description: "Pokazuje posiadane przedmioty.",
    usage: "!eq [@osoba | id]",
    examples: ["!eq","!eq @Rafal"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["inv","ekwipunek","inventory"],
    additionalInfo: ["Wyświetla kupione przedmioty."]
  },
  {
    id: 9,
    name: "use",
    category: "ECONOMY_GAMBLING",
    shortDescription: "uzyj itemu z ekwipunku",
    description: "Sprawdz dzialanie itemu. Klodka i Piwo dzialaja automatycznie.",
    usage: "!use <nr_itemu>",
    examples: ["!use 1","!use 3"],
    cooldown: "2 sekundy",
    requirements: "Musisz posiadac dany item.",
    aliases: ["uzyj"],
    additionalInfo: ["Pokazuje informacje o przedmiocie."]
  },
  {
    id: 10,
    name: "tip",
    category: "ECONOMY_GAMBLING",
    shortDescription: "przelej viccoiny innemu graczowi",
    description: "Przelewa viccoiny innemu graczowi.",
    usage: "!tip <kwota> @osoba | !tip <kwota> <id>",
    examples: ["!tip 1000 @Rafal","!tip all 123456"],
    cooldown: "3 sekundy",
    requirements: "Musisz miec odpowiedni balance.",
    aliases: ["przelej","daj"],
    additionalInfo: ["Obsługuje all."]
  },
  {
    id: 11,
    name: "loteria",
    category: "ECONOMY_GAMBLING",
    shortDescription: "informacje o loterii",
    description: "Pokazuje informacje o loterii, pulę nagród, liczbę kupionych biletów oraz czas do następnego losowania. Bilety kupuje się w sklepie (!sklep 3).",
    usage: "!loteria",
    examples: ["!loteria"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["lottery"],
    additionalInfo: []
  },
  {
    id: 12,
    name: "podatki",
    category: "ECONOMY_GAMBLING",
    shortDescription: "informacje o podatkach",
    description: "Pokazuje informacje o podatkach w grze: podatek od salda (4% co 12h) oraz podatek od przelewów (5% przy !tip).",
    usage: "!podatki",
    examples: ["!podatki"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["tax","taxes"],
    additionalInfo: []
  },
  {
    id: 13,
    name: "pozyczka",
    category: "ECONOMY_GAMBLING",
    shortDescription: "pożyczki z banku lub między graczami",
    description: "Pozwala wziąć pożyczkę z banku wirtualnego (limit 500k) lub zaproponować pożyczkę innemu graczowi na własnych warunkach (podział na raty, automatyczne ściąganie rat przez bota, oprocentowanie kary). W przypadku braku spłaty raty o północy, dług rośnie o % kary, a zyski dłużnika są automatycznie zajmowane na poczet spłaty.",
    usage: "!pozyczka <kwota> | !pozyczka splac <kwota|all> | !pozyczka @osoba <kwota> <ilosc_rat> <ile_bot_pobiera_rat> <kwota_raty> <oprocentowanie_spoznienia> <co_ile_dni> <ile_do_splaty> | !pozyczka acc/dec @lender | !pozyczka gracz splac <kwota>",
    examples: ["!pozyczka 100000","!pozyczka splac all","!pozyczka @Kowalski 10000 5 5 2500 20 2 12500","!pozyczka acc @Kowalski","!pozyczka gracz splac 2500"],
    cooldown: "Brak / Do momentu spłaty.",
    requirements: "Konta muszą mieć ponad 100 komend i 100 wiadomości.",
    aliases: ["kredyt","loan"],
    additionalInfo: [
      "Pożyczka z banku automatycznie spłaca się po 48h.",
      "Pożyczki między graczami: Kwota pożyczki (kwota początkowa) może wynosić maksymalnie 40% salda pożyczkodawcy.",
      "Bot automatycznie pobiera raty o 00:00 czasu polskiego. Jeśli dłużnik nie ma środków, jego konto jest zerowane, status zmienia się na defaulted (windykacja zysków), a pozostały dług powiększa się o oprocentowanie spóźnienia.",
      "Przedwczesna spłata: Można spłacić pożyczkę u innego gracza komendą !pozyczka gracz splac <kwota>. Minimalna kwota wplaty to 1 rata. Jeśli chcesz wpłacić więcej niż jedną ratę, musi to być co najmniej równowartość 2 rat."
    ]
  },
  {
    id: 14,
    name: "rynek",
    category: "ECONOMY_GAMBLING",
    shortDescription: "globalny rynek artefaktow",
    description: "Pozwala wystawiać na sprzedaż, kupować oraz wycofywać oferty potężnych pasywnych artefaktów na globalnym rynku. Podatek wynosi 10% przy sprzedaży.",
    usage: "!rynek | !rynek sprzedaj <nr_artefaktu> <cena> | !rynek kup <nr_oferty> | !rynek wycofaj <nr_oferty>",
    examples: ["!rynek","!rynek sprzedaj 1 300000","!rynek kup 1","!rynek wycofaj 2"],
    cooldown: "3 sekundy",
    requirements: "Wystawienie przedmiotu na rynek wymaga posiadania go w ekwipunku. Minimalna cena to 250 000 viccoinów.",
    aliases: ["market"],
    additionalInfo: ["Pieniądze trafiają do sprzedającego po zakupie przedmiotu przez innego gracza.","Wycofanie oferty zwraca przedmiot do ekwipunku sprzedającego bez żadnych kosztów."]
  },
  {
    id: 15,
    name: "firma",
    category: "ECONOMY_GAMBLING",
    shortDescription: "zarzadzanie wlasna firma i pasywny dochod",
    description: "Pozwala na zakup jednej z 5 dostępnych firm generujących dochód pasywny co 3 godziny, ich sprzedaż, naprawę po awarii oraz odbiór wypłat.",
    usage: "!firma | !firma kup <nazwa/nr> | !firma sprzedaj | !firma zbierz | !firma napraw",
    examples: ["!firma", "!firma kup kiosk", "!firma sprzedaj", "!firma zbierz", "!firma napraw"],
    cooldown: "3 sekundy",
    requirements: "Posiadanie odpowiednich środków.",
    aliases: [],
    additionalInfo: []
  },
  {
    id: 16,
    name: "slots",
    category: "ECONOMY_GAMBLING",
    shortDescription: "automaty kasynowe",
    description: "Zagraj na jednorękim bandycie.",
    usage: "!slots <kwota>",
    examples: ["!slots 1000","!slots all"],
    cooldown: "4 sekundy",
    requirements: "Balance na bet.",
    aliases: ["slot"],
    additionalInfo: []
  },
  {
    id: 17,
    name: "coinflip",
    category: "ECONOMY_GAMBLING",
    shortDescription: "rzut moneta",
    description: "Obstaw orła lub reszkę i podwój stawkowanie.",
    usage: "!coinflip <kwota> <orzel/reszka> | !cf <kwota> <orzel/reszka>",
    examples: ["!coinflip 1000 orzel","!cf 5000 reszka"],
    cooldown: "4 sekundy",
    requirements: "Balance na bet.",
    aliases: ["cf"],
    additionalInfo: []
  },
  {
    id: 18,
    name: "ruletka",
    category: "ECONOMY_GAMBLING",
    shortDescription: "ruletka",
    description: "Obstaw kolor lub numer w ruletce.",
    usage: "!ruletka <kwota> <czerwony/czarny/zielony/parzyste/nieparzyste/0-36>",
    examples: ["!ruletka 1000 czerwony"],
    cooldown: "5 sekund",
    requirements: "Balance na bet.",
    aliases: ["roulette","roul"],
    additionalInfo: ["Różne mnożniki zysków."]
  },
  {
    id: 19,
    name: "bet",
    category: "ECONOMY_GAMBLING",
    shortDescription: "zaklad liczbowy",
    description: "Postaw zakład na to, że wylosowana liczba 0-99 będzie mniejsza niż Twój typ. Administratorzy mogą stawiać seryjnie.",
    usage: "!bet <kwota> <liczba 1-90> [ilosc_betow]",
    examples: ["!bet 1000 50","!bet 1000 50 100"],
    cooldown: "3 sekundy",
    requirements: "Balance na bet.",
    aliases: [],
    additionalInfo: ["Im mniejsza liczba, tym większy mnożnik. Seria betów jest dostępna tylko dla adminów."]
  },
  {
    id: 20,
    name: "blackjack",
    category: "ECONOMY_GAMBLING",
    shortDescription: "gra w blackjacka (oczko)",
    description: "Klasyczna gra w Blackjacka przeciwko krupierowi. Dobieraj karty (hit), pasuj (stand) lub podwajaj stawke (double).",
    usage: "!blackjack <kwota> | !bj <kwota>",
    examples: ["!blackjack 1000","!bj all"],
    cooldown: "3 sekundy",
    requirements: "Balance na bet.",
    aliases: ["bj"],
    additionalInfo: ["Blackjack (As + 10) placi bonus 2.5x!","Krupier dobiera do 17."]
  },
  {
    id: 21,
    name: "rosyjska",
    category: "ECONOMY_GAMBLING",
    shortDescription: "rosyjska ruletka ze stawka",
    description: "Zagraj w rosyjską ruletkę solo przeciwko rewolwerowi (szansa na wygraną 5/6, wypłata 1.2x) lub wyzwij innego gracza na pojedynek.",
    usage: "!rr <kwota> [@osoba] | !rr acc | !rr dec",
    examples: ["!rr 1000","!rr 5000 @Kowalski"],
    cooldown: "5 sekund",
    requirements: "Balance na bet.",
    aliases: ["rr","ruletkarosyjska"],
    additionalInfo: ["Wyzwanie trwa 2 minuty.","Pojedynek toczy się do pierwszego strzału ze wzrastającym ryzykiem."]
  },
  {
    id: 22,
    name: "gielda",
    category: "ECONOMY_GAMBLING",
    shortDescription: "multiplayer inwestycje gieldowe",
    description: "Gra giełdowa multiplayer. Uruchom lobby (!gielda start) na 120s, dołącz to aktywnej sesji (!gielda dolacz), a następnie zainwestuj w jedno z 4 aktywów w rundzie inwestowania (60s). Pieniądze są blokowane do losowania wyników.",
    usage: "!gielda | !gielda start | !gielda dolacz | !gielda inwestuj <kwota> <aktywo>",
    examples: ["!gielda", "!gielda start", "!gielda dolacz", "!gielda inwestuj 100k zloto", "!gielda inwestuj all diamenty"],
    cooldown: "Zależy od fazy sesji.",
    requirements: "Maksymalnie 8 graczy na sesję. Wymaga posiadania środków na inwestycję.",
    aliases: ["stock", "giełda"],
    additionalInfo: ["Aktywa to: Bank (-5% do +10%), Srebro (-15% do +20%), Złoto (-25% do +35%), Diamenty (-50% do +80%).", "Wszystkie procenty są w pełni losowane przy każdej sesji w przedziałach zmian."]
  },
  {
    id: 23,
    name: "wojna",
    category: "ECONOMY_GAMBLING",
    shortDescription: "multiplayer wojna karciana",
    description: "Gra karciana multiplayer (Wojna). Otwiera lobby dla maksymalnie 12 graczy ze stawką wejściową. W każdej rundzie odpada 40% graczy z najsłabszymi kartami (w przypadku remisu decyduje kolor: Pik > Kier > Karo > Trefl). Ostatni pozostały gracz wygrywa całą pulę.",
    usage: "!wojna <kwota> | !wojna dolacz | !wojna",
    examples: ["!wojna 50k", "!wojna dolacz", "!wojna"],
    cooldown: "Zależy od czasu trwania gry.",
    requirements: "Minimum 2 graczy, maksymalnie 12. Wymaga posiadania kwoty wpisowej.",
    aliases: ["cardwar"],
    additionalInfo: ["Stawka jest pobierana przy dołączeniu.", "Czas na zapisy to 90s.", "Jeśli nikt nie dołączy, stawka jest zwracana hostowi."]
  },
  {
    id: 24,
    name: "artefakty",
    category: "ECONOMY_GAMBLING",
    shortDescription: "wyswietla Twoje pasywne przedmioty",
    description: "Wyświetla listę wszystkich 5 pasywnych artefaktów w grze oraz informację, które z nich aktualnie posiadasz.",
    usage: "!artefakty | !artefakty help <numer_artefaktu>",
    examples: ["!artefakty","!artefakty help 1"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["artf","artefakt"],
    additionalInfo: []
  },

  // --- KATEGORIA 2: SOCJALNE I GANGI (25 - 40) ---
  {
    id: 25,
    name: "top",
    category: "SOCIAL_GANGS",
    shortDescription: "ranking top 5 graczy, top 3 gangow lub top 5 femboyow",
    description: "Pokazuje ranking 5 najbogatszych graczy, ranking top 3 gangów lub top 5 największych femboyów na grupie.",
    usage: "!top [gang/femboy]",
    examples: ["!top","!top gang","!top femboy"],
    cooldown: "8 sekund",
    requirements: "Brak.",
    aliases: ["ranking"],
    additionalInfo: ["Łączny majątek (portfel + bank).","Użyj !top gang, aby zobaczyć ranking gangów.","Użyj !top femboy, aby zobaczyć 5 największych femboyów na grupie."]
  },
  {
    id: 26,
    name: "rob",
    category: "SOCIAL_GANGS",
    shortDescription: "okradnij gracza",
    description: "Spróbuj okraść innego gracza.",
    usage: "!rob @osoba | !rob <id>",
    examples: ["!rob @Rafal"],
    cooldown: "30 minut",
    requirements: "Cel musi mieć min. 1 000 viccoinów.",
    aliases: ["okradnij"],
    additionalInfo: ["Kłódka broni, Piwo modyfikuje szanse."]
  },
  {
    id: 27,
    name: "marry",
    category: "SOCIAL_GANGS",
    shortDescription: "slub z graczem",
    description: "Oświadcz się innemu graczowi.",
    usage: "!marry <id> | !marry accept <id> | !marry decline <id>",
    examples: ["!marry 123456"],
    cooldown: "12 sekund",
    requirements: "Obie osoby muszą być wolne.",
    aliases: ["slub"],
    additionalInfo: ["Oświadczyny trwają 2 minuty."]
  },
  {
    id: 28,
    name: "rozwod",
    category: "SOCIAL_GANGS",
    shortDescription: "rozwod z graczem",
    description: "Bierze rozwód z obecnym małżonkiem.",
    usage: "!rozwod",
    examples: ["!rozwod"],
    cooldown: "3 sekundy",
    requirements: "Musisz być w związku.",
    aliases: ["divorce"],
    additionalInfo: ["Czyści stan małżeństwa."]
  },
  {
    id: 29,
    name: "pfp",
    category: "SOCIAL_GANGS",
    shortDescription: "profil kasynowy",
    description: "Pokazuje profil gracza z danymi.",
    usage: "!pfp [@osoba | id]",
    examples: ["!pfp @Rafal"],
    cooldown: "4 sekundy",
    requirements: "Brak.",
    aliases: ["profile","profil","awatar"],
    additionalInfo: ["Pokazuje stan konta i odznaki."]
  },
  {
    id: 30,
    name: "nick",
    category: "SOCIAL_GANGS",
    shortDescription: "zmienia pseudonim gracza na grupie",
    description: "Zmienia pseudonim wskazanego użytkownika na konwersacji grupowej. Każdy może używać tej komendy. Aby wyczyścić pseudonim, wywołaj komendę bez podawania nowej wartości.",
    usage: "!nick <@osoba | ID> [nowy_pseudonim]",
    examples: ["!nick @Kowalski Szef", "!nick 100089655356822"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: [],
    additionalInfo: []
  },
  {
    id: 31,
    name: "kick",
    category: "SOCIAL_GANGS",
    shortDescription: "wyrzucenie czlonka z grupy",
    description: "Wyrzuca wskazanego użytkownika z konwersacji grupowej (wymaga uprawnień administratora dla bota oraz nadawcy komendy).",
    usage: "!kick @osoba | !kick <id_uzytkownika>",
    examples: ["!kick @Kowalski","!kick 100089655356822"],
    cooldown: "3 sekundy",
    requirements: "Bot musi być administratorem grupy, a nadawca musi być adminem grupy lub bota.",
    aliases: ["wyrzuc"],
    additionalInfo: ["Nie można wyrzucić samego siebie ani twórcy bota."]
  },
  {
    id: 32,
    name: "add",
    category: "SOCIAL_GANGS",
    shortDescription: "dodaje uzytkownika do grupy",
    description: "Dodaje wskazanego użytkownika do konwersacji grupowej na podstawie podanego linku profilu, nazwy użytkownika (vanity) lub bezpośredniego identyfikatora ID.",
    usage: "!add <link konta fb / nazwa użytkownika / ID>",
    examples: ["!add https://www.facebook.com/zuck", "!add zuck", "!add 4"],
    cooldown: "3 sekundy",
    requirements: "Bot musi być administratorem grupy, a nadawca musi być adminem grupy lub bota.",
    aliases: []
  },
  {
    id: 33,
    name: "duel",
    category: "SOCIAL_GANGS",
    shortDescription: "pojedynek o monety",
    description: "Wyzywa innego gracza na pojedynek o stawkę.",
    usage: "!duel <kwota> @osoba",
    examples: ["!duel 1000 @Kowalski"],
    cooldown: "3 sekundy",
    requirements: "Obaj gracze muszą posiadać stawkę.",
    aliases: ["pojedynek"],
    additionalInfo: ["Akceptacja: !duel acc, Odrzucenie: !duel dec."]
  },
  {
    id: 34,
    name: "gang",
    category: "SOCIAL_GANGS",
    shortDescription: "zarzadzanie i interakcje gangu",
    description: "System gangów: zakładanie, wspólny sejf, ulepszenia Dziupli, Biznesów i Fachu, skoki oraz wojny gangów.",
    usage: "!gang [stworz/zapros/dolacz/awans/wyrzuc/opusc/wplac/wyplac/ulepsz/skok/wsparcie/wesprzyj/haracz/atak/info] [@osoba/nazwa]",
    examples: ["!gang stworz MojaEkipa","!gang zapros @Kowalski","!gang wplac 5000","!gang ulepsz dziupla","!gang skok","!gang wsparcie InnyGang","!gang wesprzyj","!gang atak InnyGang","!gang info @Kowalski"],
    cooldown: "3 sekundy",
    requirements: "Zakładanie gangu kosztuje 1 000 000 viccoinów. Skok gangu wymaga min. 2 graczy.",
    aliases: ["gangi"],
    additionalInfo: ["Boss i Zastępcy zarządzają gangiem.","Ulepszenia dają bonusy do pracy i kradzieży."]
  },
  {
    id: 35,
    name: "awans",
    category: "SOCIAL_GANGS",
    shortDescription: "awansuj czlonka gangu",
    description: "Skrót do awansowania członka gangu na stanowisko Zastępcy. Dostępne tylko dla Bossa.",
    usage: "!awans @osoba",
    examples: ["!awans @Kowalski"],
    cooldown: "3 sekundy",
    requirements: "Musisz być Bossem gangu.",
    aliases: [],
    additionalInfo: ["Zastępcy mogą zapraszać i wyrzucać zwykłych członków."]
  },
  {
    id: 36,
    name: "haracz",
    category: "SOCIAL_GANGS",
    shortDescription: "ustawia haracz w gangu",
    description: "Ustawia procent haraczu pobieranego od kradzieży zwykłych członków gangu do portfela Bossa. Dostępne tylko dla Bossa.",
    usage: "!haracz <procent> | !gang haracz <procent>",
    examples: ["!haracz 15","!gang haracz 20%"],
    cooldown: "3 sekundy",
    requirements: "Musisz być Bossem gangu.",
    aliases: [],
    additionalInfo: ["Tribute pobierany jest ze zwycięskich komend !rob i !crime zwykłych członków (z wyłączeniem zastępców).","Wartość must być liczbą całkowitą od 0 do 100."]
  },
  {
    id: 37,
    name: "atak",
    category: "SOCIAL_GANGS",
    shortDescription: "wojna gangow o sejf",
    description: "Wypowiada wojnę wrogiemu gangowi w celu okradzenia ich sejfu. Wymaga min. 500k w sejfie i kosztuje 10% Twojego sejfu. Przy wygranej kradnie 15%-35% sejfu wroga (30% idzie do Twojego sejfu, 70% dzielone dla graczy). Przy wpadce tracisz 35% sejfu (20% do sejfu wroga, 15% dzielone dla wrogich obrońców).",
    usage: "!atak <nazwa_gangu_wroga> | !gang atak dolacz",
    examples: ["!atak InnyGang","!gang atak dolacz"],
    cooldown: "3 sekundy",
    requirements: "Musisz być Bossem lub Zastępcą gangu.",
    aliases: ["wojna"],
    additionalInfo: ["Po ataku gang broniący otrzymuje 6h tarczy ochronnej.","Wydarzenie trwa 2 minuty i zależy od siły graczy oraz poziomu ulepszenia Fach."]
  },
  {
    id: 38,
    name: "milosc",
    category: "SOCIAL_GANGS",
    shortDescription: "kalkulator miłości",
    description: "Mierzy w procentach dopasowanie miłosne dwójki osób i generuje humorystyczną przepowiednię ich przyszłości. Wynik jest w pełni deterministyczny.",
    usage: "!milosc @osoba | !milosc @osoba1 @osoba2",
    examples: ["!milosc @Kasia", "!milosc @Kasia @Tomek"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["love", "kalkulatormilosci"],
    additionalInfo: []
  },
  {
    id: 39,
    name: "swataj",
    category: "SOCIAL_GANGS",
    shortDescription: "dobiera parę dnia",
    description: "Raz na 24h losowo i stabilnie dobiera parę dnia spośród aktywnych członków grupy.",
    usage: "!swataj",
    examples: ["!swataj"],
    cooldown: "3 sekundy",
    requirements: "Minimum 2 uczestników na grupie.",
    aliases: ["matchmaker", "pare-dnia", "couple"],
    additionalInfo: ["Para jest deterministyczna i zmienia się tylko raz na dobę."]
  },
  {
    id: 40,
    name: "wyzwanie",
    category: "SOCIAL_GANGS",
    shortDescription: "wirtualna prawda czy wyzwanie",
    description: "Wyzwij losowego lub wybranego gracza z grupy do gry w Prawdę czy Wyzwanie. Gracz otrzymuje losowo pytanie otwarte (Prawda) lub zadanie rzeczywiste (Wyzwanie) i ma 3 minuty na odpowiedź bądź dowód.",
    usage: "!wyzwanie | !wyzwanie @osoba",
    examples: ["!wyzwanie","!wyzwanie @Kowalski"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["dare", "wyzywam"],
    additionalInfo: ["Po 3 minutach bot przypomni grupie o głosowaniu nad zaliczeniem odpowiedzi/wyzwania."]
  },

  // --- KATEGORIA 3: INNE I NARZĘDZIA (41 - 53) ---
  {
    id: 41,
    name: "help",
    category: "UTILITY_ADMIN",
    shortDescription: "wyswietla pomoc",
    description: "Wyświetla listę wszystkich dostępnych komend lub szczegółowy opis wybranej komendy.",
    usage: "!help [numer/nazwa]",
    examples: ["!help","!help 2","!help bal"],
    cooldown: "Brak.",
    requirements: "Brak.",
    aliases: ["pomoc","commands"],
    additionalInfo: []
  },
  {
    id: 42,
    name: "lvl",
    category: "UTILITY_ADMIN",
    shortDescription: "nagrody za kamienie milowe",
    description: "Pokazuje nagrody za kamienie milowe poziomów (do 100 lvl, po wbiciu którego poziom resetuje się do 1 i wzrasta Prestiż).",
    usage: "!lvl",
    examples: ["!lvl"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["milestones", "kamieniemilowe"],
    additionalInfo: []
  },
  {
    id: 43,
    name: "odznaki",
    category: "UTILITY_ADMIN",
    shortDescription: "lista odznak i ich opisy",
    description: "Pokazuje listę posiadanych/dostępnych odznak i ich krótkie opisy. Wpisz !odznaki help <nazwa_odznaki>, aby poznać szczegółowe wymagania i bonusy.",
    usage: "!odznaki | !odznaki help <nazwa_odznaki>",
    examples: ["!odznaki", "!odznaki help hazardzista"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: [],
    additionalInfo: []
  },
  {
    id: 44,
    name: "cd",
    category: "UTILITY_ADMIN",
    shortDescription: "pokazuje czasy oczekiwania (cooldowny)",
    description: "Pokazuje stan czasów oczekiwania dla komend takich jak !work, !crime, !daily, !rob oraz firm.",
    usage: "!cd",
    examples: ["!cd"],
    cooldown: "Brak.",
    requirements: "Brak.",
    aliases: ["cooldowns", "czasy"],
    additionalInfo: []
  },
  {
    id: 45,
    name: "pogoda",
    category: "UTILITY_ADMIN",
    shortDescription: "prognoza pogody",
    description: "Pobiera aktualne dane pogodowe dla wybranego miasta. Możesz też zapisać miasto na stałe, aby wpisywać samo !pogoda.",
    usage: "!pogoda [miasto] | !pogoda domyslna <miasto>",
    examples: ["!pogoda","!pogoda Londyn","!pogoda domyslna Rzeszów"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["weather", "synoptyk"],
    additionalInfo: ["Domyślnie sprawdza dla zapisanego miasta lub Warszawy."]
  },
  {
    id: 46,
    name: "shamewall",
    category: "UTILITY_ADMIN",
    shortDescription: "ściana wstydu",
    description: "Pokazuje ranking top 5 kont z najniższym/najbardziej ujemnym saldem ogólnym na całym bode.",
    usage: "!shamewall",
    examples: ["!shamewall"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["scianawstydu", "zadluzeni", "dluznicy"],
    additionalInfo: []
  },
  {
    id: 47,
    name: "zasady",
    category: "UTILITY_ADMIN",
    shortDescription: "wyswietla zasady korzystania z bota",
    description: "Wyświetla oficjalne zasady i regulamin korzystania z bota.",
    usage: "!zasady",
    examples: ["!zasady"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["rules"],
    additionalInfo: []
  },
  {
    id: 48,
    name: "wiadomosci",
    category: "UTILITY_ADMIN",
    shortDescription: "wlacza/wylacza logowanie usunietych wiadomosci",
    description: "Pozwala administratorom grupy włączyć lub wyłączyć logowanie (oznaczanie) usuniętych wiadomości na tej grupie. Wiadomości usunięte przez podadminów bota są wysyłane zawsze, a przez twórcę nigdy.",
    usage: "!wiadomosci <on/off>",
    examples: ["!wiadomosci on", "!wiadomosci off"],
    cooldown: "3 sekundy",
    requirements: "Musisz być administratorem grupy lub bota.",
    aliases: ["wiadomości", "delmsglog"],
    additionalInfo: []
  },
  {
    id: 49,
    name: "afkdel",
    category: "UTILITY_ADMIN",
    shortDescription: "usuwa nieaktywnych czlonkow grupy (30 dni)",
    description: "Analizuje historię wiadomości grupy i usuwa z niej wszystkich użytkowników, którzy nie wysłali żadnej wiadomości w ciągu ostatnich 30 dni (również przed dodaniem komendy). Nie usuwa adminów grupy, adminów bota ani samego bota.",
    usage: "!afkdel",
    examples: ["!afkdel"],
    cooldown: "30 sekund",
    requirements: "Bot musi być administratorem grupy, a nadawca musi być adminem grupy lub bota.",
    aliases: []
  },
  {
    id: 50,
    name: "fm",
    category: "UTILITY_ADMIN",
    shortDescription: "integracja z muzyka Last.fm",
    description: "Integracja z platformą Last.fm. Pozwala sprawdzać aktualnie słuchaną muzykę, historię odtworzeń oraz statystyki.\n\n**Główne subkomendy:**\n• `połącz <nazwa>` • łączy konto Last.fm\n• `odłącz` • rozłącza konto\n• `aktualnie [@osoba]` • co teraz słucha dana osoba\n• `ostatnie [@osoba]` • 5 ostatnio słuchanych utworów\n• `toputwory / topartyści / topalbumy [okres] [@osoba]` • statystyki słuchania (okres: `1m`, `3m`, `6m`, `12m`, `all` • domyślnie: `overall`)\n• `grupa` • czego słuchają teraz połączone osoby w grupie\n• `play <nazwa>` • wyszukuje i odtwarza utwór na YouTube\n• `incognito <on/off>` • ukrywa profil w statystykach grupy",
    usage: "!fm <subkomenda> [opcje]",
    examples: ["!fm połącz nazwa_konta", "!fm toputwory 3m @Rafal", "!fm topartyści", "!fm grupa", "!fm play Billie Eilish Bad Guy"],
    cooldown: "3 sekundy",
    requirements: "Konto Last.fm must być publiczne.",
    aliases: ["lastfm"],
    additionalInfo: []
  },
  {
    id: 51,
    name: "reakcja",
    category: "UTILITY_ADMIN",
    shortDescription: "informacje o szybkich palcach",
    description: "Gra zręcznościowa wywoływana automatycznie na czacie grupowym co 9-24 godzin lub ręcznie przez administratora. Kto pierwszy przepisze kod, wygrywa od 20 000 do 200 000 viccoinów!",
    usage: "!reakcja (tylko admin)",
    examples: ["!reakcja"],
    cooldown: "Brak.",
    requirements: "Wymaga bycia pierwszym na czacie.",
    aliases: [],
    additionalInfo: ["Nagroda za poprawny kod wynosi od 20 000 do 200 000 viccoinów.","Wygenerowany kod wygasa po upływie 2 minut."]
  },
  {
    id: 52,
    name: "gangreset",
    category: "UTILITY_ADMIN",
    shortDescription: "resetuje cooldowny gangow (admin)",
    description: "Resetuje czas oczekiwania (cooldown) na skoki gangu oraz ataki dla wszystkich gangów w bazie danych.",
    usage: "!gangreset",
    examples: ["!gangreset"],
    cooldown: "Brak.",
    requirements: "Wymaga uprawnień administratora bota.",
    aliases: [],
    additionalInfo: []
  },
  {
    id: 53,
    name: "guardnick",
    category: "UTILITY_ADMIN",
    shortDescription: "blokuje pseudonim wybranego gracza",
    description: "Blokuje pseudonim wybranego użytkownika w bieżącej grupie. Każda próba zmiany nicku tej osoby zostanie natychmiast anulowana przez bota. Dostępne tylko dla twórcy bota.",
    usage: "!guardnick <@osoba | ID> <pseudonim> | !guardnick off",
    examples: ["!guardnick @Kowalski WymuszonyNick", "!guardnick off"],
    cooldown: "Brak.",
    requirements: "Wymaga bycia twórcą bota.",
    aliases: [],
    additionalInfo: []
  },
  {
    id: 54,
    name: "prefix",
    category: "UTILITY_ADMIN",
    shortDescription: "zmienia prefix bota na grupie",
    description: "Wyświetla aktualny prefix bota lub zmienia go na wskazany nowy prefix dla bieżącej grupy. Opcja zmiany jest dostępna tylko dla administratorów grupy lub administratorów bota.",
    usage: "!prefix [nowy_prefix]",
    examples: ["!prefix", "!prefix .", "!prefix !"],
    cooldown: "Brak.",
    requirements: "Tylko administrator grupy lub administrator bota może zmienić prefix.",
    aliases: [],
    additionalInfo: []
  },
  {
    id: 55,
    name: "pkn",
    category: "ECONOMY_GAMBLING",
    shortDescription: "gra w papier kamień nożyce (z botem lub graczem)",
    description: "Gra hazardowa Papier, Kamień, Nożyce. Możesz grać solo przeciwko botowi lub wyzwać innego gracza na pojedynek PvP, w którym bot wylosuje ruchy dla obu stron.",
    usage: "!pkn <stawka> <k/p/n | kamien/papier/nozyce> | !pkn @osoba <stawka> | !pkn acc | !pkn dec",
    examples: ["!pkn 1000 kamien", "!pkn 5000 p", "!pkn @Kowalski 20000", "!pkn acc"],
    cooldown: "3 sekundy",
    requirements: "Wymaga posiadania stawki.",
    aliases: ["rps", "papierkamiennozyce"],
    additionalInfo: ["Wygrana solo daje 1.90x stawki (zysk netto 90%).", "Remis zwraca stawkę.", "W pojedynku PvP wygrany zgarnia całą pulę minus 5% podatku.", "Odznaki i Szkarłatne Oko mogą uratować Cię przed przegraną solo."]
  },
  {
    id: 56,
    name: "mecz",
    category: "ECONOMY_GAMBLING",
    shortDescription: "wirtualne zaklady bukmacherskie",
    description: "Obstawiaj wyniki wirtualnych meczów piłkarskich pomiędzy prawdziwymi drużynami (np. Real Madryt, Bayern, PSG).",
    usage: "!mecz | !mecz <stawka> <1/X/2>",
    examples: ["!mecz", "!mecz 5000 1", "!mecz x 10k"],
    cooldown: "3 sekundy",
    requirements: "Wymaga posiadania stawki.",
    aliases: ["betmecz", "spotkanie"],
    additionalInfo: ["Wywołanie !mecz bez argumentów losuje nowe spotkanie i generuje kursy.", "Wygrana wypłaca stawkę pomnożoną przez kurs danego typu.", "Obsługuje typy: 1 (wygrana gospodarzy), X (remis), 2 (wygrana gości).", "Kolejność stawki i typu jest dowolna."]
  },
  {
    id: 57,
    name: "multimecz",
    category: "ECONOMY_GAMBLING",
    shortDescription: "oferta wielu meczow w jednym kuponie",
    description: "Generuje ponumerowaną ofertę od 2 do 10 wirtualnych meczów, które można obstawić razem na jednym kuponie łączonym (AKO).",
    usage: "!multimecz [liczba_meczow]",
    examples: ["!multimecz", "!multimecz 5", "!multimecz 3"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: [],
    additionalInfo: ["Wpisanie !multimecz przy aktywnej już propozycji wyświetla tę samą ofertę.", "Maksymalnie 10 meczów na raz."]
  },
  {
    id: 58,
    name: "multiobstaw",
    category: "ECONOMY_GAMBLING",
    shortDescription: "obstawianie kuponow laczonych (AKO)",
    description: "Pozwala obstawić mecze z aktywnej oferty multi-meczu na jednym kuponie (AKO), gdzie kursy są mnożone.",
    usage: "!multiobstaw <nr_meczu> <typ> <stawka> ... | !multiobstaw <nr_meczu> <typ> ... <stawka>",
    examples: ["!mo 1 1 2 x 1000", "!mo 1 2 2000 2 1 5000", "!mm 1 x 2 2 3 1 10k"],
    cooldown: "3 sekundy",
    requirements: "Wymaga aktywnej oferty multi-meczu i stawki.",
    aliases: ["mo", "mm"],
    additionalInfo: ["Kupon jest wygrany tylko wtedy, gdy wszystkie wybrane typy są trafione.", "Czas symulacji wynosi 15 sekund.", "Można podać stawkę wspólną na końcu lub stawkę dla każdego meczu osobno (zostaną zsumowane do całkowitej stawki kuponu)."]
  },
  {
    id: 59,
    name: "admin",
    category: "UTILITY_ADMIN",
    shortDescription: "zarzadzanie administratorami grupy",
    description: "Pozwala administratorom grupy lub bota nadawać i odbierać uprawnienia administratora grupowego dla innych członków.",
    usage: "!admin give @osoba | !admin del @osoba",
    examples: ["!admin give @Kowalski", "!admin del 123456789"],
    cooldown: "Brak.",
    requirements: "Wymaga, aby bot był administratorem grupy, a nadawca miał uprawnienia admina grupy lub bota.",
    aliases: [],
    additionalInfo: ["Zarządza uprawnieniami bezpośrednio w czacie grupowym Messengera."]
  },
  {
    id: 60,
    name: "milionerzy",
    category: "ECONOMY_GAMBLING",
    shortDescription: "quiz wiedzy milionerzy z pula nagrod",
    description: "Rozpoczyna grę w Milionerów. Organizator stawia określoną kwotę, która tworzy pulę nagród. Pierwsza osoba w grupie, która poprawnie odpowie na pytanie (A, B, C lub D) w ciągu 15 sekund, wygrywa pulę (minus 5% podatku). Organizator nie może brać udziału w odpowiedzi.",
    usage: "!milionerzy <kwota>",
    examples: ["!milionerzy 50000", "!milionerzy 1m", "!milionerzy all"],
    cooldown: "Brak.",
    requirements: "Posiadanie odpowiedniej kwoty portfelu (min. 10 000 viccoinów).",
    aliases: ["mili", "quiz"],
    additionalInfo: ["Czas na odpowiedź to 15 sekund. Jeśli nikt nie odpowie poprawnie, pula organizatora przepada."]
  },
  {
    id: 61,
    name: "wisielec",
    category: "SOCIAL_GANGS",
    shortDescription: "klasyczna gra w wisielca z grupa",
    description: "Uruchamia grę w Wisielca. Gracze mają 2 minuty na dołączenie. Bot losuje słowo z puli 500 haseł, a zapisani gracze po kolei zgadują litery w ciągu 30 sekund. Pomyłka zbliża do powieszenia (6 żyć).",
    usage: "!wisielec | !wisielec dolacz | !wisielec start",
    examples: ["!wisielec", "!wisielec dolacz", "!wisielec start"],
    cooldown: "Brak.",
    requirements: "Wymaga przynajmniej 1 gracza.",
    aliases: ["wisielecz", "hangman"],
    additionalInfo: ["Gracze po kolei zgadują po jednej literze. W swojej turze można również spróbować odgadnąć całe hasło."]
  },
  {
    id: 62,
    name: "panstwamiasta",
    category: "SOCIAL_GANGS",
    shortDescription: "gra w panstwa-miasta",
    description: "Uruchamia grę w Państwa-Miasta na określoną liczbę tur. Gracze mają 2 minuty na dołączenie. W każdej rundzie bot losuje literę, a gracze mają 20 sekund na wysłanie kraju i miasta na tę literę. Unikalne poprawne słowa dają 10 pkt, powtórzone 5 pkt.",
    usage: "!panstwamiasta [ilosc_tur]",
    examples: ["!panstwamiasta", "!panstwamiasta 4", "!panstwa-miasta dolacz"],
    cooldown: "Brak.",
    requirements: "Maksymalnie 4 tury.",
    aliases: ["panstwa-miasta", "panstwamiastadolacz", "panstwamiastastart"],
    additionalInfo: ["Odpowiedzi wysyła się w formacie: Kraj Miasto (np. Kanada Kraków). Słowa nie mogą się powtarzać między graczami w tej samej turze."]
  },
  {
    id: 63,
    name: "femboy",
    category: "SOCIAL_GANGS",
    shortDescription: "sprawdza poziom bycia femboyem",
    description: "Mierzy w procentach poziom bycia femboyem dla oznaczonej osoby. Wynik jest deterministyczny.",
    usage: "!femboy @osoba",
    examples: ["!femboy @Kowalski"],
    cooldown: "3 sekundy",
    requirements: "Oznaczenie osoby.",
    aliases: ["fem", "boy"],
    additionalInfo: []
  },
  {
    id: 64,
    name: "toplvl",
    category: "SOCIAL_GANGS",
    shortDescription: "ranking top 5 graczy wg poziomu (lvl)",
    description: "Pokazuje ranking 5 graczy z najwyższym poziomem (lvl).",
    usage: "!toplvl",
    examples: ["!toplvl"],
    cooldown: "8 sekund",
    requirements: "Brak.",
    aliases: ["rankinglvl", "toppoziom"],
    additionalInfo: []
  },
  {
    id: 65,
    name: "pozyczka miedzy graczami",
    category: "ECONOMY_GAMBLING",
    shortDescription: "pozyczka bezpośrednio od innego gracza",
    description: "Pozwala zaproponować i wziąć pożyczkę od innego gracza na ustalonych warunkach (liczba rat, raty automatycznie ściągane przez bota o północy, kwota raty, procent kary za brak środków, częstotliwość pobierania oraz łączna kwota do spłaty).",
    usage: "!pozyczka @osoba <kwota> <ilosc_rat> <ile_bot_pobiera_rat> <kwota_raty> <oprocentowanie_spoznienia> <co_ile_dni> <ile_do_splaty> | !pozyczka acc/dec @lender | !pozyczka gracz splac <kwota>",
    examples: ["!pozyczka @Kowalski 10000 5 5 2500 20 2 12500", "!pozyczka acc @Nowak", "!pozyczka gracz splac 2500"],
    cooldown: "Brak.",
    requirements: "Odpowiedni wiek konta (>100 komend i >100 wiadomości).",
    aliases: [],
    additionalInfo: [
      "Raty pobierane są automatycznie o 00:00 czasu polskiego do momentu osiągnięcia wybranej liczby pobrań przez bota.",
      "Brak środków o 00:00 zeruje konto dłużnika, dodaje zdefiniowaną karę % do długu oraz włącza windykację komorniczą ze wszystkich zysków dłużnika.",
      "Przedwczesna spłata: komendą !pozyczka gracz splac <kwota>. Minimalna wpłata to 1 rata, a przy większej wpłacie musi to być minimum równowartość 2 rat."
    ]
  },
  {
    id: 66,
    name: "losuj",
    category: "SOCIAL_GANGS",
    shortDescription: "losuje i oznacza osobe na grupie",
    description: "Losuje losowego członka grupy (z wykluczeniem bota) i oznacza go na czacie.",
    usage: "!losuj",
    examples: ["!losuj"],
    cooldown: "3 sekundy",
    requirements: "Działa wyłącznie w konwersacjach grupowych.",
    aliases: ["random", "wylosuj"],
    additionalInfo: []
  },
  {
    id: 67,
    name: "afk",
    category: "SOCIAL_GANGS",
    shortDescription: "ustawia status nieobecnosci (AFK)",
    description: "Ustawia Twój status jako nieobecny (AFK) z opcjonalnym powodem. Kiedy ktoś Cię oznaczy, bot poinformuje o Twojej nieobecności.",
    usage: "!afk <powod>",
    examples: ["!afk robie obiad", "!afk zaraz wracam"],
    cooldown: "Brak.",
    requirements: "Brak.",
    aliases: ["brb", "zaz", "zw"],
    additionalInfo: ["Każda kolejna wysłana przez Ciebie wiadomość automatycznie anuluje status AFK. Powód jest cenzurowany automatycznie pod kątem słów niedozwolonych na FB."]
  },
  {
    id: 68,
    name: "krolik",
    category: "SOCIAL_GANGS",
    shortDescription: "wysyla losowe zdjecie krolika z Reddita",
    description: "Wysyła losowe zdjęcie królika pobrane z Reddita (r/Rabbits, r/Bunnies, r/Rabbit). Zdjęcia są filtrowane - tylko obrazy JPG/JPEG/PNG/WEBP, bez filmów, GIF-ów lub treści NSFW.",
    usage: "!krolik",
    examples: ["!krolik"],
    cooldown: "2 minuty",
    requirements: "Brak.",
    aliases: ["rabbit", "bunny"],
    additionalInfo: ["Właściciel bota nie ma cooldownu.", "Jeśli Reddit nie odpowiada, bot wyświetli komunikat o błędzie."]
  },
  {
    id: 69,
    name: "kotek",
    category: "SOCIAL_GANGS",
    shortDescription: "wysyla losowe zdjecie malego kotka z Reddita",
    description: "Wysyła losowe zdjęcie małego kotka (kociaka) pobrane z Reddita (r/IllegallySmolCats, r/Kittens, r/aww). Priorytet mają małe kotki. Zdjęcia są filtrowane - tylko obrazy JPG/JPEG/PNG/WEBP, bez filmów, GIF-ów lub treści NSFW.",
    usage: "!kotek",
    examples: ["!kotek"],
    cooldown: "2 minuty",
    requirements: "Brak.",
    aliases: ["kitten", "kitty", "cat"],
    additionalInfo: ["Właściciel bota nie ma cooldownu.", "Jeśli Reddit nie odpowiada, bot wyświetli komunikat o błędzie."]
  },
  {
    name: "analiza",
    category: "UTILITY_ADMIN",
    shortDescription: "analiza historii czatu lub odpowiedz na pytanie",
    description: "Analizuje historię czatu grupowego lub odpowiada na pytanie. Dostępne ograniczenia: 1 użycie na dobę oraz cooldown grupowy 10 minut.",
    usage: "!analiza <pytanie> | !analiza <liczba_wiadomosci> <pytanie>",
    examples: ["!analiza jaka jest stolica Francji?", "!analiza 500 przeanalizuj kto ma rację w sporze"],
    cooldown: "10 minut (grupowy) / 1 na dobę",
    requirements: "Brak.",
    aliases: ["pytanie", "zapytaj"],
    additionalInfo: ["Max 5000 wiadomości.", "Liczba wiadomości jako pierwszy argument."]
  },
  {
    name: "propozycje",
    category: "UTILITY_ADMIN",
    shortDescription: "wyslij propozycje do administracji",
    description: "Wysyła propozycję nowej komendy, przedmiotu, funkcji lub ulepszenia bota do grupy administracyjnej. Niepoważne zgłoszenia skutkują ostrzeżeniami, a po 3 ostrzeżeniach tracisz dostęp do komendy.",
    usage: "!propozycje <treść>",
    examples: ["!propozycje dodaj komende do zakladania wlasnych eventow"],
    cooldown: "Brak.",
    requirements: "Brak.",
    aliases: ["propozycja"],
    additionalInfo: ["Maksymalnie 2000 znaków.", "Nie wysyłaj żartów — za niepoważne zgłoszenia otrzymujesz ostrzeżenia."]
  },
  {
    name: "stresc",
    category: "UTILITY_ADMIN",
    shortDescription: "streszczenie historii czatu",
    description: "Pobiera ostatnie wiadomości z czatu grupowego i tworzy ich streszczenie. Działa tylko w konwersacjach grupowych.",
    usage: "!stresc",
    examples: ["!stresc"],
    cooldown: "60 sekund",
    requirements: "Tylko w konwersacjach grupowych.",
    aliases: ["skrot", "podsumuj", "summarize"],
    additionalInfo: ["Pobiera do 200 ostatnich wiadomości."]
  },
  {
    name: "dlug",
    category: "ECONOMY_GAMBLING",
    shortDescription: "przegladaj dlugi graczy",
    description: "Pokazuje podsumowanie Twoich długów i wierzytelności, listę wszystkich pożyczek lub szczegóły długu z wybranym graczem.",
    usage: "!dlug | !dlug lista | !dlug gracz <id>",
    examples: ["!dlug", "!dlug lista", "!dlug gracz 123456789"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["dlugi", "debts", "debtors"],
    additionalInfo: ["Bilans netto pokazuje różnicę między tym co jesteś winien a tym co Ci są winni."]
  }
];

function getActiveHelpCommands() {
  const unlockTime = 1780264800000; // 2026-06-01T00:00:00+02:00
  let filtered = [...helpCommands];
  if (Date.now() < unlockTime) {
    filtered = filtered.filter(command => command.name !== 'firma');
  }
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
  return buildHelpShell()
    .setTitle(`Komenda: ${prefix}${command.name}`)
    .setDescription(command.description)
    .addFields(
      { name: 'Cooldown', value: command.cooldown, inline: true },
      { name: 'Skladnia', value: command.usage.replace(/!/g, prefix), inline: false },
      { name: 'Przyklady', value: command.examples.map(ex => ex.replace(/!/g, prefix)).join('\n'), inline: false }
    );
}

function buildHelpErrorEmbed() {
  return buildHelpShell()
    .setTitle('Blad pomocy')
    .setDescription('Nie znaleziono komendy o tym numerze lub nazwie.');
}

function buildHelpButtons() {
  return [];
}

module.exports = {
  HELP_PAGE_SIZE,
  helpCommands,
  getHelpCommandById,
  getHelpCommandByName,
  buildHelpListEmbed,
  buildHelpDetailEmbed,
  buildHelpErrorEmbed,
  buildHelpButtons,
  getTotalPages
};
