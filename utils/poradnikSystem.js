const poradnikCategories = {
  1: {
    name: 'Ekonomia podstawowa',
    emoji: '📊',
    poradniki: [
      {
        id: 1,
        title: 'Jak zarabiać na work',
        content: `📝 OPIS:
!work to podstawowy sposób zarabiania. Wykonujesz pracę i otrzymujesz wypłatę. Cooldown bazowy: 10 minut.

💡 PORADA:
Kup garnitur (+10%) i kaczkę biznesu (+5%) dla bonusów. Zegarek skraca cooldown o 10-15%. Energetyk zwiększa zysk o 5% i skraca cooldown o 10% (+0,5% na poziom). Awansuj poziom pracy dla dodatkowych bonusów.

⚠️ UWAGA:
W więzieniu nie możesz pracować. Automatyzacja (używanie work co kilka sekund) prowadzi do bana na 10-14h.

📊 INFO:
Cooldown: 10 min | Nagroda: 5000-35000 VC (w zależności od bonusów)`
      },
       {
         id: 2,
         title: 'Jak używać crime',
         content: `📝 OPIS:
!crime to kradzież z ~55% szansy sukcesu. Udana próba = zysk 5000-30000 VC. Nieudana = 1h więzienia + kara.

💡 PORADA:
Nowe Abibasy zwiększają szansę o 3%. Odznaka Komendanta daje 12,5% + 1% na poziom szansy na uniknięcie więzienia. Fałszerz daje 3% szansy na podwojenie zysku. Celuj w graczy z dużym saldem.

⚠️ UWAGA:
Nieudana próba = 1h więzienia + kara 5000-30000 VC. Łapówka kosztuje 2x kwoty stawki (max 30000 VC).

📊 INFO:
Szansa: ~55% | Zysk: 5000-30000 VC`
      },
      {
        id: 3,
        title: 'Jak używać daily',
        content: `📝 OPIS:
!daily to codzienna nagroda. Bazowa kwota: 20000 VC. Przyznawana raz na 24h (od polskiej północy).

💡 PORADA:
Zbieraj daily każdego dnia dla streak bonusu (+1000 VC za każdy dzień). Szwajcarski zegarek pozwala odebrać daily 3.6h wcześniej. VIP i odznaki zwiększają nagrodę.

⚠️ UWAGA:
Jeśli pominiesz dzień, streak resetuje się do 1.

📊 INFO:
Bazowa nagroda: 20000 VC | Streak: +1000/dzień`
      },
      {
        id: 4,
        title: 'Jak używać banku',
        content: `📝 OPIS:
Bank bezpiecznie przechowuje pieniądze. Pieniądze w banku nie są dostępne do kradzieży (!rob). Pojemność rośnie z przedmiotami (VIP, Prestiż, Złota Karta).

💡 PORADA:
Wpłacaj nadwyżki (!wplac). Odsetki wypłacane co 6h: bazowo 5% + bonusy z itemów. Księga Inwestora +5%, Czarna Karta +10%.

⚠️ UWAGA:
Bank ma limit pojemności. Pełny = nie możesz wpłacić więcej. Wypłata: !wyplac.

📊 INFO:
Odsetki: co 6h | Bazowy procent: 5%`
       },
       {
         id: 5,
         title: 'Przelewy i rankingi',
         content: `📝 OPIS:
!tip wysyła VC innemu graczowi. !bal sprawdza saldo w portfelu i banku. !top wyświetwa ranking najbogatszych graczy.

💡 PORADA:
Sprawdź !bal przed wysłaniem przelewu. !top pokazuje top 10 graczy. Używaj !tip do pomocy innym lub przesłania nagrody.

⚠️ UWAGA:
Przelew jest nieodwracalny. Sprawdź dokładnie oznaczenie (@user) przed wysłaniem. Nie można wysyłać tipów z więzienia.

📊 INFO:
Przelew: !tip <@user> <kwota> | Saldo: !bal | Ranking: !top`
       },
       {
         id: 6,
         title: 'Pożyczki i dom',
         content: `📝 OPIS:
!pozyczka pobiera kredyt od banku. !dlug sprawdza długi. !dom kupuje/ulepsza dom generujący pasywny dochód.

💡 PORADA:
Pożyczaj tylko gdy potrzebujesz kapitału na rozwój. Spłać przed terminem aby uniknąć kary. Dom generuje dochód co 24h — im lepszy dom, tym więcej VC. Ulepszaj warsztat, zbrojownię i siłownię dla dodatkowych bonusów.

⚠️ UWAGA:
Masz 7 dni na spłatę pożyczki. Po upływie grzywna % salda. Jeśli nie masz środków na czynsz, dom jest zdegradowany o poziom.

📊 INFO:
Pożyczka: !pozyczka <kwota> | Długi: !dlug | Dom: !dom`
       }
     ]
   },
  2: {
    name: 'Gry hazardowe',
    emoji: '🎰',
    poradniki: [
      {
        id: 1,
        title: 'Jak grać w blackjack',
        content: `📝 OPIS:
Blackjack — gra karciana, cel to 21 punktów. Krupier dobiera do 17. As = 1 lub 11. Walet/Dama/Król = 10.

💡 PORADA:
Dobierz do 16, stój przy 17+. Możesz podwoić stawkę (!double) przy pierwszych 2 kartach. Blackjack (As + 10/K/Q/J) płaci 2.5x.

⚠️ UWAGA:
Przekroczenie 21 = przegrana. Przekupiony Krupier może uratować przegraną.

📊 INFO:
Blackjack: 2.5x | Dobranie: !hit | Stop: !stand`
      },
      {
        id: 2,
        title: 'Jak grać w ruletkę',
        content: `📝 OPIS:
Ruletka — obstawiasz kolor (czerwony/czarny), parzystość lub numer (0-36).

💡 PORADA:
Czerwony/czarny = 2x. Numer = 12x. Zielone (0) = 36x. Przekupiony Krupier podnosi szansę na trafienie.

⚠️ UWAGA:
Zielone ma najmniejszą szansę (1%).

📊 INFO:
Zielone: 36x | Numer: 12x | Kolor: 2x`
      },
      {
        id: 3,
        title: 'Jak grać w slots',
        content: `📝 OPIS:
Slots — automat z 3 bębnami. Dopasuj symbole aby wygrać.

💡 PORADA:
Trzy takie same = wygrana. 7 lub diamenty dają najwyższy mnożnik (5x/4x). Przekupiony Krupier może zmienić symbole.

⚠️ UWAGA:
Slots są oparte na losowości.

📊 INFO:
Mnożniki: 3x-5x | 2 takie same: 1.4x`
       },
       {
         id: 4,
         title: 'Jak grać w kości i coinflip',
         content: `📝 OPIS:
!kosc rzuca kostką (1-6). !coinflip rzuca monetą (orzeł/reszka). Szybkie gry na stawkę.

💡 PORADA:
Kości i coinflip są czystą losowością. Odznaki (Bog, Rekin, Hazardzista) i przedmioty (Szkarłatne Oko, Ananas na pizzy, Kości Oszusta) zwiększają szansę. Przekupiony Krupier może uratować przegraną.

⚠️ UWAGA:
Możesz przegrać całą stawkę. Podatek 5% z wygranej. Kości Oszusta dają 2% szansy na zwrot betu nawet przy przegranej.

📊 INFO:
Stawka: dowolna | Wygrana: 1.9x`
       },
       {
         id: 5,
         title: 'Jak grać w lotto i rosyjską',
         content: `📝 OPIS:
!lotto — wspólna loteria z pulą nagród. !rosyjska — PvP ruletka rosyjska (1v1).

💡 PORADA:
W lotto kup bilety (!otworz) aby zwiększyć szansę. W rosyjskiej rzuć wyzwanie (!rosyjska @user) i czekaj na akceptację. Wygrany dostaje całą pulę.

⚠️ UWAGA:
Lotto: losowanie w określonym czasie. Rosyjska: przeciwnik ma czas na akceptację. Przegrana = strata stawki.

📊 INFO:
Lotto: bilety w paczkach | Rosyjska: 1v1, stawka dowolna`
       }
     ]
   },
  3: {
    name: 'Gry turowe',
    emoji: '⚔️',
    poradniki: [
      {
        id: 1,
        title: 'Jak grać w wojnę',
        content: `📝 OPIS:
Wojna karciana — gra multiplayer do 12 osób. W każdej rundzie losuje się karty, słabsze odpada. Ostatni pozostający wygrywa całą pulę.

💡 PORADA:
Zbierz graczy w grupie. Wymagane min. 2 osoby. Jeśli zapisze się tylko 1, stawka wraca.

⚠️ UWAGA:
Min. 2 graczy, max 12. Czas na dołączenie: 90s.

📊 INFO:
Stawka: dowolna`
      },
      {
        id: 2,
        title: 'Jak grać w PKN',
        content: `📝 OPIS:
Papier-Kamień-Nożyce — graj z botem (singleplayer) lub wyzywaj innych (PvP).

💡 PORADA:
W trybie PvP wpisz !pkn acc aby zaakceptować wyzwanie. W singleplayer graj przeciwko botowi.

⚠️ UWAGA:
W PvP masz 2 minuty na akceptację. W PvP losowość 50/50, ale przedmioty i odznaki mogą uratować od przegranej lub zwiększyć zysk.

📊 INFO:
Stawka: dowolna`
      },
      {
        id: 3,
        title: 'Jak grać w duel',
        content: `📝 OPIS:
Pojedynek 1v1 — obaj stawiają tę samą kwotę, wygrywa losowo 50/50.

💡 PORADA:
Wpisz !duel <kwota> @osoba. Przeciwnik musi zaakceptować (!duel acc) w ciągu 2 minut.

⚠️ UWAGA:
Czysta losowość — nie ma wpływu przedmiotów. Podatek 5% z wygranej.

📊 INFO:
Stawka: dowolna`
      }
    ]
  },
  4: {
    name: 'Gangi i wspólnota',
    emoji: '🏢',
    poradniki: [
      {
        id: 1,
        title: 'Jak założyć gang',
        content: `📝 OPIS:
Gangi pozwalają na współpracę, wspólny skarbiec i ulepszenia. Koszt założenia: 1 000 000 VC.

💡 PORADA:
Zatrudniaj członków. Ulepszaj Dziuplę (więcej miejsc), Biznesy (+zysk z pracy), Fach (+zysk z crime), Uzbrojenie (+atak), Obronę (+obrona). Współpracuj z innymi gangami.

⚠️ UWAGA:
Max członków: 5 + poziom Dziupli (max 15). Tylko Boss może zarządzać ulepszeniami i skarbcem.

📊 INFO:
Koszt: 1 000 000 VC`
      },
      {
        id: 2,
        title: 'Jak zdobywać artefakty',
        content: `📝 OPIS:
Artefakty to przedmioty z bonusami do pracy, kradzieży, kasyna i innych systemów. Kupuj w sklepie lub otwieraj paczki.

💡 PORADA:
Sprawdź !artefakty aby zobaczyć listę. Niektóre przedmioty są eventowe. Przed zakupem sprawdź !sklep help <nr>.

⚠️ UWAGA:
Paczki mają losowe nagrody. Limit 10 paczek/dzień.

📊 INFO:
Sklep: !sklep | Lista: !artefakty`
       },
       {
         id: 3,
         title: 'Mechaniki gangów',
         content: `📝 OPIS:
Gangi mają rozszerzone mechaniki: sojusze, ataki, skoki, sklep i terytoria. Sojusze blokują obrażenia między członkami. Ataki pozwalają na walkę z innymi gangami o zasoby. Skoki to wspólne kradzieże. Sklep oferuje bonusy za VC gangowe. Terytoria dają dodatkowe bonusy.

💡 PORADA:
Zawieraj sojusze z silniejszymi gangami (!sojusz). Atakuj słabe gangi (!atak <nazwa>) dla zasobów. Wykonuj skoki (!gang skok) regularnie dla dodatkowego zysku. Kupuj w sklepie gangu (!gang sklep) uzbrojenie i najemników. Zdobywaj terytoria (!terytoria) dla stałych bonusów.

⚠️ UWAGA:
Ataki kosztująVC z sejfu gangu. Przegrana bitwa = strata VC i reputacji. Terytoria rotują się co 24h. Sojusz można zerwać w każdej chwili (!gang sojusz zerwij).

📊 INFO:
Sojusz: !sojusz <nazwa> | Atak: !atak <cel> | Skok: !gang skok | Sklep: !gang sklep | Terytoria: !terytoria`
       }
     ]
   },
  5: {
    name: 'Wsparcie techniczne',
    emoji: '🔧',
    poradniki: [
      {
        id: 1,
        title: 'Zgłaszanie błędów',
        content: `📝 OPIS:
Jeśli napotkałeś błąd, zgłoś go twórcy.

💡 PORADA:
Zrób screenshot. Opisz co zrobiłeś. Napisz na Facebooku.

📞 KONTAKT:
Facebook: https://www.facebook.com/profile.php?id=100060812419294

⚠️ UWAGA:
Nie spamuj wiadomościami.

💼 OFERTY:
Współpraca i propozycje również na Facebooku.`
      }
    ]
  },
  6: {
    name: 'Zaawansowana ekonomia',
    emoji: '💼',
    poradniki: [
      {
        id: 1,
        title: 'Firmy i pracownicy',
        content: `📝 OPIS:
Firmy generują pasywny dochód co 3 godziny. Możesz mieć do 2 firm. Zatrudniaj 1 pracownika dla dodatkowych bonusów.

💡 PORADA:
Zatrudniaj pracownika (!pracownik) dla bonusów do zysku. Używaj przedmiotów firmowych. Naprawiaj firmę od razu gdy się zepsuje.

⚠️ UWAGA:
Pracownicy pobierają % wypłaty. Mogą wywołać awarię. Sprzedaj firmę (!firma sprzedaj) za 50% ceny.

📊 INFO:
Wypłata co: 3 godziny`
      },
      {
        id: 2,
        title: 'Okradanie graczy',
        content: `📝 OPIS:
!rob pozwala okraść innych graczy. Wymaga 100k w portfelu i 50 użytych komend. Cel musi mieć min. 50k.

💡 PORADA:
Używaj przedmiotów zwiększających szansę i zysk. Latarka, Wampirzy Sztylet, Krwawy Żeton. Czarna Bandera daje 5% szansy na drugi napad.

⚠️ UWAGA:
Nie możesz kraść członków własnego gangu ani sojuszników. Nieudana próba = 1h ban + kara. Cooldown: 30 min bazowo.

📊 INFO:
Szansa: ~60% | Zysk: 20-25% salda`
      }
    ]
  },
  7: {
    name: 'Gry multiplayer',
    emoji: '🎮',
    poradniki: [
      {
        id: 1,
        title: 'Jak obstawiać mecze',
        content: `📝 OPIS:
!mecz — obstawianie pojedynczego meczu piłkarskiego. Wygeneruj ofertę (!mecz) i postaw na wynik: 1 (gospodarze), X (remis), 2 (goście).

💡 PORADA:
Kursy zależą od sił drużyn. Max stawka: 10% salda. Symulacja trwa 60s z wydarzeniami.

⚠️ UWAGA:
Możesz przegrać całą stawkę. Podatek 15% z wygranej.

📊 INFO:
Czas trwania: 60 sekund`
      },
      {
        id: 2,
        title: 'Jak grać multi-mecz',
        content: `📝 OPIS:
!multimecz — kupon na 2-10 meczów naraz. Kursy mnożą się. Wszystkie muszą być trafione aby wygrać.

💡 PORADA:
Im więcej meczów tym wyższy kurs. Jeśli jeden przegrany = cała przegrana. Obstawiaj przez !multiobstaw.

⚠️ UWAGA:
Bardzo ryzykowne. Łączny kurs limitowany (zależnie od liczby meczów).

📊 INFO:
Meczów: 2-10`
      },
      {
        id: 3,
        title: 'Jak grać na giełdzie',
        content: `📝 OPIS:
!gielda — multiplayer inwestycje w 4 aktywa: Bank, Srebro, Złoto, Diamenty. Lobby trwa 2 min, inwestycja 1 min.

💡 PORADA:
Inwestuj w różne aktywa. Sprawdź !gielda info aby zobaczyć zakresy ryzyka. Min. inwestycja: 10% salda.

⚠️ UWAGA:
Możesz stracić całą inwestycję. Nie można zmienić decyzji po rozpoczęciu inwestycji.

📊 INFO:
Runda inwestycji: 1 minuta`
      }
    ]
  },
  8: {
    name: 'Sklep i przedmioty',
    emoji: '🛒',
    poradniki: [
      {
        id: 1,
        title: 'Jak kupować itemy',
        content: `📝 OPIS:
!sklep — kupuj przedmioty z bonusami. Dwa typy: permanent (jednorazowe) i stackable (wielokrotne). Paczki to lootboxy z losowymi nagrodami.

💡 PORADA:
Sprawdź !sklep help <nr> przed zakupem. Paczki otwieraj przez !otworz. Limit 10 paczek/dzień.

⚠️ UWAGA:
Paczki mają losowe nagrody. Niektóre itemy dostępne tylko z paczek.

📊 INFO:
Sklep: !sklep | Paczki: !otworz`
       },
       {
         id: 2,
         title: 'Jak ulepszać przedmioty',
         content: `📝 OPIS:
Większość przedmiotów można ulepszać za VC lub materiały. Każdy poziom zwiększa bonus. Maksymalny poziom zależy od przedmiotu.

💡 PORADA:
Ulepszaj najpierw przedmioty które używasz najczęściej. Sprawdź !ulepsz <nr> aby zobaczyć koszt i efekt. Niektóre przedmioty mają szansę na zniszczenie przy ulepszaniu. VIP i Prestiż podnoszą limit poziomów.

⚠️ UWAGA:
Ulepszanie jest nieodwracalne. Poza max levelem nie można ulepszyć. Ulepszanie wymaga odpowiednich materiałów z paczek.

📊 INFO:
Ulepszenie: !ulepsz <nr> | Max level: zależny od przedmiotu`
       }
     ]
   }
};

const config = require('../config/config');
const { EmbedBuilder } = require('./messenger');

function resolvePoradnikCategory(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  const num = Number(trimmed);
  if (Number.isInteger(num) && num >= 1 && num <= Object.keys(poradnikCategories).length) {
    return num;
  }
  const lower = trimmed.toLowerCase();
  for (const [key, cat] of Object.entries(poradnikCategories)) {
    if (cat.name.toLowerCase() === lower) {
      return Number(key);
    }
  }
  return null;
}

function getPoradnikByCategoryAndNumber(categoryNum, poradnikNum) {
  const category = poradnikCategories[categoryNum];
  if (!category) return null;
  const poradnik = category.poradniki.find(p => p.id === poradnikNum);
  return poradnik || null;
}

function buildPoradnikCategoriesEmbed(prefix) {
  const lines = [];
  for (const [key, cat] of Object.entries(poradnikCategories)) {
    lines.push(`${cat.emoji} ${key}. ${cat.name}`);
  }
  return new EmbedBuilder()
    .setColor(config.embed.primary)
    .setTitle('📖 Poradnik')
    .setDescription(`Wpisz **${prefix}poradnik <numer kategorii>** aby zobaczyć listę poradników.\n\n${lines.join('\n')}`);
}

function buildPoradnikListEmbed(categoryNum) {
  const category = poradnikCategories[categoryNum];
  if (!category) return null;
  const lines = category.poradniki.map(p => `${p.id}. ${p.title}`);
  return new EmbedBuilder()
    .setColor(config.embed.primary)
    .setTitle(`${category.emoji} ${category.name}`)
    .setDescription(`Wpisz **!poradnik ${categoryNum} <numer poradnika>** aby zobaczyć poradnik.\n\n${lines.join('\n')}`);
}

function buildPoradnikDetailEmbed(categoryNum, poradnikNum) {
  const category = poradnikCategories[categoryNum];
  if (!category) return null;
  const poradnik = getPoradnikByCategoryAndNumber(categoryNum, poradnikNum);
  if (!poradnik) return null;
  return new EmbedBuilder()
    .setColor(config.embed.primary)
    .setTitle(`${category.emoji} ${poradnik.title}`)
    .setDescription(poradnik.content)
    .setFooter({ text: `${category.name} • Poradnik ${poradnikNum}` });
}

module.exports = {
  poradnikCategories,
  resolvePoradnikCategory,
  getPoradnikByCategoryAndNumber,
  buildPoradnikCategoriesEmbed,
  buildPoradnikListEmbed,
  buildPoradnikDetailEmbed
};
