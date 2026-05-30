const { EmbedBuilder } = require('./embeds');
const config = require('../config/config');

const HELP_PAGE_SIZE = 7;

const CATEGORY_META = {
  ECONOMY: { label: 'ECONOMY' },
  GAMBLING: { label: 'GAMBLING' },
  SOCIAL: { label: 'SOCIAL' },
  ADMIN: { label: 'ADMIN' },
  UTILITY: { label: 'UTILITY' }
};

const helpCommands = [
  {
    id: 1,
    name: "bal",
    category: "ECONOMY",
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
    category: "ECONOMY",
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
    category: "ECONOMY",
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
    category: "ECONOMY",
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
    name: "top",
    category: "ECONOMY",
    shortDescription: "ranking top 5 graczy lub top 3 gangow",
    description: "Pokazuje ranking 5 najbogatszych graczy lub ranking top 3 gangów.",
    usage: "!top [gang]",
    examples: ["!top","!top gang"],
    cooldown: "8 sekund",
    requirements: "Brak.",
    aliases: ["ranking"],
    additionalInfo: ["Łączny majątek (portfel + bank).","Użyj !top gang, aby zobaczyć ranking 3 najbogatszych gangów."]
  },
  {
    id: 6,
    name: "wplac",
    category: "ECONOMY",
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
    id: 7,
    name: "wyplac",
    category: "ECONOMY",
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
    id: 8,
    name: "sklep",
    category: "ECONOMY",
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
    id: 9,
    name: "eq",
    category: "ECONOMY",
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
    id: 10,
    name: "use",
    category: "ECONOMY",
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
    id: 11,
    name: "tip",
    category: "ECONOMY",
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
    id: 12,
    name: "reakcja",
    category: "ECONOMY",
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
    id: 13,
    name: "loteria",
    category: "ECONOMY",
    shortDescription: "informacje o loterii",
    description: "Pokazuje informacje o loterii, pulę nagród, liczbę kupionych biletów oraz czas do następnego losowania. Bilety kupuje się w sklepie (!sklep 4).",
    usage: "!loteria",
    examples: ["!loteria"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["lottery"],
    additionalInfo: []
  },
  {
    id: 14,
    name: "podatki",
    category: "ECONOMY",
    shortDescription: "informacje o podatkach",
    description: "Pokazuje informacje o podatkach w grze: podatek od salda (2% co 12h) oraz podatek od przelewów (5% przy !tip).",
    usage: "!podatki",
    examples: ["!podatki"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["tax","taxes"],
    additionalInfo: []
  },
  {
    id: 15,
    name: "pozyczka",
    category: "ECONOMY",
    shortDescription: "pozyczka z banku wirtualnego",
    description: "Pozwala pożyczyć pieniądze z banku wirtualnego po przekroczeniu 100 użytych komend (limit 500k). Oprocentowanie rośnie co 6h o 4% (dla kwot <=200k), 8% (>200k), 12% (>300k) lub 20% (>400k). Spłata następuje automatycznie po 48h (ściągane z portfela, nawet na minus). Pieniądze z pożyczki mają 48h blokadę transferu i ochrony przed kradzieżą.",
    usage: "!pozyczka <kwota> | !pozyczka splac <kwota|all> | !pozyczka",
    examples: ["!pozyczka 100000","!pozyczka splac all","!pozyczka"],
    cooldown: "Do momentu spłaty poprzedniej pożyczki.",
    requirements: "Ponad 100 użytych komend i maksymalnie 500k długu.",
    aliases: ["kredyt","loan"],
    additionalInfo: ["Pożyczka odblokowuje się dopiero po przekroczeniu 100 użytych komend.","Po 48h kwota jest automatycznie pobierana z portfela.","Zablokowane środki nie mogą być przelane ani skradzione komendą !rob."]
  },
  {
    id: 16,
    name: "rynek",
    category: "ECONOMY",
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
    id: 17,
    name: "slots",
    category: "GAMBLING",
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
    id: 18,
    name: "coinflip",
    category: "GAMBLING",
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
    id: 19,
    name: "ruletka",
    category: "GAMBLING",
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
    id: 20,
    name: "bet",
    category: "GAMBLING",
    shortDescription: "zaklad liczbowy",
    description: "Postaw zakład na to, że wylosowana liczba 0-99 będzie mniejsza niż Twój typ.",
    usage: "!bet <kwota> <liczba 1-90>",
    examples: ["!bet 1000 50"],
    cooldown: "3 sekundy",
    requirements: "Balance na bet.",
    aliases: [],
    additionalInfo: ["Im mniejsza liczba, tym większy mnożnik."]
  },
  {
    id: 21,
    name: "blackjack",
    category: "GAMBLING",
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
    id: 22,
    name: "rosyjska",
    category: "GAMBLING",
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
    id: 23,
    name: "gielda",
    category: "GAMBLING",
    shortDescription: "multiplayer inwestycje gieldowe",
    description: "Gra giełdowa multiplayer. Uruchom lobby (!gielda start) na 120s, dołącz do aktywnej sesji (!gielda dolacz), a następnie zainwestuj w jedno z 4 aktywów w rundzie inwestowania (60s). Pieniądze są blokowane do losowania wyników.",
    usage: "!gielda | !gielda start | !gielda dolacz | !gielda inwestuj <kwota> <aktywo>",
    examples: ["!gielda", "!gielda start", "!gielda dolacz", "!gielda inwestuj 100k zloto", "!gielda inwestuj all diamenty"],
    cooldown: "Zależy od fazy sesji.",
    requirements: "Maksymalnie 8 graczy na sesję. Wymaga posiadania środków na inwestycję.",
    aliases: ["stock", "giełda"],
    additionalInfo: ["Aktywa to: Bank (-5% do +10%), Srebro (-15% do +20%), Złoto (-25% do +35%), Diamenty (-50% do +80%).", "Wszystkie procenty są w pełni losowane przy każdej sesji w przedziałach zmian."]
  },
  {
    id: 24,
    name: "wojna",
    category: "GAMBLING",
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
    id: 25,
    name: "rob",
    category: "SOCIAL",
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
    id: 26,
    name: "marry",
    category: "SOCIAL",
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
    id: 27,
    name: "pfp",
    category: "SOCIAL",
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
    id: 28,
    name: "rozwod",
    category: "SOCIAL",
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
    name: "kick",
    category: "SOCIAL",
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
    id: 30,
    name: "duel",
    category: "SOCIAL",
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
    id: 31,
    name: "gang",
    category: "SOCIAL",
    shortDescription: "zarzadzanie i interakcje gangu",
    description: "System gangów: zakładanie, wspólny sejf, ulepszenia Dziupli, Biznesów i Fachu, skoki oraz wojny gangów.",
    usage: "!gang [stworz/zapros/dolacz/awans/wyrzuc/opusc/wplac/wyplac/ulepsz/skok/haracz/atak/info] [@osoba/nazwa]",
    examples: ["!gang stworz MojaEkipa","!gang zapros @Kowalski","!gang wplac 5000","!gang ulepsz dziupla","!gang skok","!gang atak InnyGang","!gang info @Kowalski"],
    cooldown: "3 sekundy",
    requirements: "Zakładanie gangu kosztuje 1 000 000 viccoinów. Skok gangu wymaga min. 2 graczy.",
    aliases: ["gangi"],
    additionalInfo: ["Boss i Zastępcy zarządzają gangiem.","Ulepszenia dają bonusy do pracy i kradzieży."]
  },
  {
    id: 32,
    name: "awans",
    category: "SOCIAL",
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
    id: 33,
    name: "haracz",
    category: "SOCIAL",
    shortDescription: "ustawia haracz w gangu",
    description: "Ustawia procent haraczu pobieranego od kradzieży zwykłych członków gangu do portfela Bossa. Dostępne tylko dla Bossa.",
    usage: "!haracz <procent> | !gang haracz <procent>",
    examples: ["!haracz 15","!gang haracz 20%"],
    cooldown: "3 sekundy",
    requirements: "Musisz być Bossem gangu.",
    aliases: [],
    additionalInfo: ["Tribute pobierany jest ze zwycięskich komend !rob i !crime zwykłych członków (z wyłączeniem zastępców).","Wartość musi być liczbą całkowitą od 0 do 100."]
  },
  {
    id: 34,
    name: "atak",
    category: "SOCIAL",
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
    id: 35,
    name: "add",
    category: "SOCIAL",
    shortDescription: "dodaje uzytkownika do grupy",
    description: "Dodaje wskazanego użytkownika do konwersacji grupowej na podstawie podanego linku profilu, nazwy użytkownika (vanity) lub bezpośredniego identyfikatora ID.",
    usage: "!add <link konta fb / nazwa użytkownika / ID>",
    examples: ["!add https://www.facebook.com/zuck", "!add zuck", "!add 4"],
    cooldown: "3 sekundy",
    requirements: "Bot musi być administratorem grupy, a nadawca musi być adminem grupy lub bota.",
    aliases: []
  },
  {
    id: 36,
    name: "help",
    category: "UTILITY",
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
    id: 37,
    name: "artefakty",
    category: "UTILITY",
    shortDescription: "wyswietla Twoje pasywne przedmioty",
    description: "Wyświetla listę wszystkich 5 pasywnych artefaktów w grze oraz informację, które z nich aktualnie posiadasz.",
    usage: "!artefakty | !artefakty help <numer_artefaktu>",
    examples: ["!artefakty","!artefakty help 1"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["artf","artefakt"],
    additionalInfo: []
  },
  {
    id: 38,
    name: "lvl",
    category: "UTILITY",
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
    id: 39,
    name: "odznaki",
    category: "UTILITY",
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
    id: 40,
    name: "shamewall",
    category: "UTILITY",
    shortDescription: "ściana wstydu",
    description: "Pokazuje ranking top 5 kont z najniższym/najbardziej ujemnym saldem ogólnym na całym bocie.",
    usage: "!shamewall",
    examples: ["!shamewall"],
    cooldown: "3 sekundy",
    requirements: "Brak.",
    aliases: ["scianawstydu", "zadluzeni", "dluznicy"],
    additionalInfo: []
  },
  {
    id: 41,
    name: "zasady",
    category: "UTILITY",
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
    id: 42,
    name: "wiadomosci",
    category: "UTILITY",
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
    id: 43,
    name: "afkdel",
    category: "UTILITY",
    shortDescription: "usuwa nieaktywnych czlonkow grupy (30 dni)",
    description: "Analizuje historię wiadomości grupy i usuwa z niej wszystkich użytkowników, którzy nie wysłali żadnej wiadomości w ciągu ostatnich 30 dni (również przed dodaniem komendy). Nie usuwa adminów grupy, adminów bota ani samego bota.",
    usage: "!afkdel",
    examples: ["!afkdel"],
    cooldown: "30 sekund",
    requirements: "Bot musi być administratorem grupy, a nadawca musi być adminem grupy lub bota.",
    aliases: []
  },
  {
    id: 44,
    name: "fm",
    category: "UTILITY",
    shortDescription: "integracja z muzyka Last.fm",
    description: "Integracja z platformą Last.fm. Pozwala sprawdzać aktualnie słuchaną muzykę, historię odtworzeń oraz statystyki.\n\n**Główne subkomendy:**\n• `połącz <nazwa>` • łączy konto Last.fm\n• `odłącz` • rozłącza konto\n• `aktualnie [@osoba]` • co teraz słucha dana osoba\n• `ostatnie [@osoba]` • 5 ostatnio słuchanych utworów\n• `toputwory / topartyści / topalbumy [okres] [@osoba]` • statystyki słuchania (okres: `1m`, `3m`, `6m`, `12m`, `all` (cały czas) • domyślnie: `overall`)\n• `grupa` • czego słuchają teraz połączone osoby w grupie\n• `play <nazwa>` • wyszukuje i odtwarza utwór na YouTube\n• `incognito <on/off>` • ukrywa profil w statystykach grupy",
    usage: "!fm <subkomenda> [opcje]",
    examples: ["!fm połącz nazwa_konta", "!fm toputwory 3m @Rafal", "!fm topartyści", "!fm grupa", "!fm play Billie Eilish Bad Guy"],
    cooldown: "3 sekundy",
    requirements: "Konto Last.fm musi być publiczne.",
    aliases: ["lastfm"],
    additionalInfo: []
  },
  {
    id: 45,
    name: "gangreset",
    category: "ADMIN",
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
    id: 46,
    name: "nick",
    category: "SOCIAL",
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
    id: 47,
    name: "guardnick",
    category: "SOCIAL",
    shortDescription: "blokuje pseudonim wybranego gracza",
    description: "Blokuje pseudonim wybranego użytkownika w bieżącej grupie. Każda próba zmiany nicku tej osoby zostanie natychmiast anulowana przez bota. Dostępne tylko dla twórcy bota.",
    usage: "!guardnick <@osoba | ID> <pseudonim> | !guardnick off",
    examples: ["!guardnick @Kowalski WymuszonyNick", "!guardnick off"],
    cooldown: "Brak.",
    requirements: "Wymaga bycia twórcą bota.",
    aliases: [],
    additionalInfo: []
  }
];

function getHelpCommandById(id) {
  return helpCommands.find(command => command.id === id) || null;
}

function getHelpCommandByName(input) {
  const normalized = String(input || '').toLowerCase();

  return helpCommands.find(command => (
    command.name === normalized
    || (command.aliases && (command.aliases && command.aliases.some(alias => alias.toLowerCase() === normalized)))
  )) || null;
}

function getTotalPages() {
  return Math.max(1, Math.ceil(helpCommands.length / HELP_PAGE_SIZE));
}

function paginateCommands(page) {
  const safePage = Math.min(Math.max(1, page), getTotalPages());
  const start = (safePage - 1) * HELP_PAGE_SIZE;
  const items = helpCommands.slice(start, start + HELP_PAGE_SIZE);

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

function buildHelpListEmbed(client) {
  const embed = buildHelpShell()
    .setDescription('Wszystkie dostepne komendy bota.');

  const categories = {
    ECONOMY: '💰 EKONOMIA',
    GAMBLING: '🎰 HAZARD',
    SOCIAL: '👥 SOCJALNE',
    UTILITY: '⚙️ INNE'
  };

  const fields = [];
  for (const [catKey, catLabel] of Object.entries(categories)) {
    const cmds = helpCommands.filter(c => c.category === catKey);
    if (cmds.length > 0) {
      const fieldContent = cmds.map(c => `• ${c.id}. !${c.name} - ${c.shortDescription}`).join('\n');
      fields.push({
        name: catLabel,
        value: fieldContent,
        inline: false
      });
    }
  }

  if (fields.length > 0) {
    const lastField = fields[fields.length - 1];
    lastField.value += `\n\nUzyj \`!help <nazwa_komendy>\`, aby poznac szczegoly.`;
  }

  embed.addFields(fields);
  return embed;
}

function buildHelpDetailEmbed(client, command) {
  return buildHelpShell()
    .setTitle(`Komenda: ${config.prefix}${command.name}`)
    .setDescription(command.description)
    .addFields(
      { name: 'Cooldown', value: command.cooldown, inline: true },
      { name: 'Skladnia', value: command.usage, inline: false },
      { name: 'Przyklady', value: command.examples.join('\n'), inline: false }
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
