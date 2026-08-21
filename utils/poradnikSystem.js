const poradnikCategories = {
  1: {
    name: 'Ekonomia',
    emoji: '📊',
    poradniki: [
      {
        id: 1,
        title: 'Jak zarabiać na work',
        content: `📝 OPIS:
Komenda !work pozwala zarabiać pieniądze poprzez wykonanie pracy. Jest to podstawowy sposób zarabkowania w grze.

💡 WSKAZÓWKI:
- Używaj work regularnie co 5 minut (cooldown)
- Najlepsze czasy to rano i wieczorem (mniej graczy = wyższe szanse)
- Używaj itemów zwiększających zarobki (garnitur, kaczka biznesu)
- Sprawdź swój poziom - wyższy poziom = wyższe zarobki

⚠️ OSTRZEŻENIA:
- Nie używaj work jeśli masz ujemne saldo
- Unikaj spamowania - system może Cię zablokować

📊 STATYSTYKI:
- Średnie zarobki: 500-1500 VC
- Czas trwania: natychmiastowy
- Cooldown: 5 minut`
      },
      {
        id: 2,
        title: 'Najlepsze strategie crime',
        content: `📝 OPIS:
Komenda !crime pozwala na kradzież pieniędzy od innych graczy lub z banków. Jest ryzykowna ale może przynieść duże zyski.

💡 WSKAZÓWKI:
- Crime ma 50% szansy sukcesu
- Używaj itemów zwiększających szansę (ostry noz, energetyk)
- Najlepiej kraść od graczy z dużym saldem
- Unikaj graczy z ochroną lub gangami

⚠️ OSTRZEŻENIA:
- Porażka = strata pieniędzy i więzienie
- Możesz zostać zgłoszony za częste kradzieże

📊 STATYSTYKI:
- Szansa sukcesu: 50%
- Potencjalny zysk: 1000-5000 VC
- Kara za porażkę: więzienie 5-15 minut`
      },
      {
        id: 3,
        title: 'Jak efektywnie używać banku',
        content: `📝 OPIS:
Bank pozwala bezpiecznie przechowywać pieniądze i zarabiać procent od depozytu.

💡 WSKAZÓWKI:
- !deposit <kwota> - wpłać do banku
- !withdraw <kwota> - wypłać z banku
- Procent zależy od twojego poziomu
- Wyższy poziom = wyższy procent

⚠️ OSTRZEŻENIA:
- Pieniądze w banku są bezpieczne przed kradzieżą
- Nie można używać pieniędzy z banku do komend

📊 STATYSTYKI:
- Procent: 1-5% dziennie
- Minimalny depozyt: 100 VC
- Maksymalny depozyt: bez limitu`
      },
      {
        id: 4,
        title: 'Poradnik firm - jak zarządzać',
        content: `📝 OPIS:
Firmy pozwalają na pasywne zarobki co 3 godziny. Możesz mieć do 2 firm.

💡 WSKAZÓWKI:
- !firma <nazwa> - załóż firmę
- !firma2 <nazwa> - załóż drugą firmę
- Zatrudniaj pracowników (!pracownik)
- Używaj itemów firmowych (garnitur, kaczka biznesu)

⚠️ OSTRZEŻENIA:
- Firmy mogą się zepsuć - naprawa kosztuje
- Jeśli firma jest zepsuta nie zarabiasz
- Pracownicy mogą nie przyjść do pracy

📊 STATYSTYKI:
- Wypłata co: 3 godziny
- Średni zysk: 2000-10000 VC
- Koszt naprawy: 50% wartości firmy`
      }
    ]
  },
  2: {
    name: 'Gry hazardowe',
    emoji: '🎰',
    poradniki: [
      {
        id: 1,
        title: 'Blackjack - strategie',
        content: `📝 OPIS:
Blackjack to gra karciana gdzie cel jest zbliżenie się do 21 punktów bez przekroczenia.

💡 WSKAZÓWKI:
- !blackjack <stawka> - rozpocznij grę
- hit - dobierz kartę
- stand - zatrzymaj
- double - podwój stawkę i dobierz 1 kartę
- Krupier musi dobierać do 17

⚠️ OSTRZEŻENIA:
- Przekroczenie 21 = automatyczna przegrana
- As może być 1 lub 11 punktów
- Krupier ma przewagę statystyczną

📊 STATYSTYKI:
- Wypłata za blackjack: 3:2
- Wypłata za normalną wygraną: 1:1
- Przewaga krupiera: ~1%`
      },
      {
        id: 2,
        title: 'Ruletka - jak obstawiać',
        content: `📝 OPIS:
Ruletka to gra gdzie obstawiasz kolor lub numer na który wypadnie kulka.

💡 WSKAZÓWKI:
- !ruletka <stawka> <kolor/numer>
- Kolory: czerwony, czarny, zielony
- Zielony (0) daje 14x wygraną
- Czerwony/czarny dają 2x wygraną

⚠️ OSTRZEŻENIA:
- Zielony ma najmniejszą szansę
- Graj odpowiedzialnie - łatwo stracić dużo

📊 STATYSTYKI:
- Szansa na zielony: 1/37 (~2.7%)
- Szansa na czerwony/czarny: 18/37 (~48.6%)`
      },
      {
        id: 3,
        title: 'Slots - jak wygrywać',
        content: `📝 OPIS:
Slots to automat do gier gdzie kręcisz bębnami i czekasz na wygrywające kombinacje.

💡 WSKAZÓWKI:
- !slots <stawka> - zakręć bębnami
- 3 takie same symbole = duża wygrana
- 2 takie same symbole = mała wygrana
- Szukaj symboli premium (7, diamenty)

⚠️ OSTRZEŻENIA:
- Slots są oparte na RNG (losowość)
- Nie ma strategii gwarantującej wygraną
- Graj tylko na pieniądze które możesz stracić

📊 STATYSTYKI:
- Szansa na jackpot: ~0.1%
- Średni RTP (return to player): ~95%`
      }
    ]
  },
  3: {
    name: 'Gry turowe',
    emoji: '⚔️',
    poradniki: [
      {
        id: 1,
        title: 'Wojna karciana - zasady',
        content: `📝 OPIS:
Wojna to gra karciana dla wielu graczy gdzie wygrywa ten z najwyższą kartą.

💡 WSKAZÓWKI:
- !wojna <stawka> - rozpocznij grę
- Musi być minimum 2 graczy
- Każdy stawia tyle samo
- Najwyższa karta wygrywa pulę

⚠️ OSTRZEŻENIA:
- Czas na dołączenie: 90 sekund
- Jeśli za mało graczy - stawka jest zwracana
- Karty są losowane z talii

📊 STATYSTYKI:
- Minimalna stawka: 100 VC
- Maksymalna liczba graczy: bez limitu
- Czas trwania: ~2 minuty`
      },
      {
        id: 2,
        title: 'PKN - papier kamień nożyce',
        content: `📝 OPIS:
PKN to klasyczna gra gdzie wygrywasz jeśli wybierzesz lepszy symbol.

💡 WSKAZÓWKI:
- !pkn <gracz> <stawka> - wyzwaj gracza
- Papier bije kamień
- Kamień bije nożyce
- Nożyce biją papier

⚠️ OSTRZEŻENIA:
- Czas na akceptację: 2 minuty
- Jeśli gracz nie zaakceptuje - wyzwanie wygasa
- Remis = stawka jest zwracana

📊 STATYSTYKI:
- Szansa na wygraną: 33.3%
- Szansa na remis: 33.3%
- Minimalna stawka: 50 VC`
      },
      {
        id: 3,
        title: 'Duel - pojedynek',
        content: `📝 OPIS:
Duel to pojedynek 1v1 gdzie obaj gracze stawiają na siebie.

💡 WSKAZÓWKI:
- !duel <gracz> <stawka> - wyzwaj na pojedynek
- Obaj stawiają tyle samo
- Wygrywa ten kto ma lepsze statystyki
- Itemy mogą zwiększyć szansę

⚠️ OSTRZEŻENIA:
- Czas na akceptację: 2 minuty
- Możesz przegrać dużą kwotę
- Statystyki zależą od poziomu i itemów

📊 STATYSTYKI:
- Minimalna stawka: 100 VC
- Czas trwania: ~1 minuta
- Szansa zależy od statystyk`
      }
    ]
  },
  4: {
    name: 'System',
    emoji: '🏢',
    poradniki: [
      {
        id: 1,
        title: 'Gangi - jak założyć i zarządzać',
        content: `📝 OPIS:
Gangi pozwalają na współpracę z innymi graczami i wspólne cele.

💡 WSKAZÓWKI:
- !gang <nazwa> - załóż gang
- !gang zaprosz <gracz> - dodaj członka
- !gang wyrzuc <gracz> - usuń członka
- Gangi mają wspólne skarbiec i cele

⚠️ OSTRZEŻENIA:
- Musisz być level 10+ aby założyć gang
- Maksymalna liczba członków: 20
- Gang może zostać rozwiązany przez lidera

📊 STATYSTYKI:
- Koszt założenia: 10000 VC
- Minimalny poziom: 10
- Maksymalni członkowie: 20`
      },
      {
        id: 2,
        title: 'Artefakty - jak zdobywać i używać',
        content: `📝 OPIS:
Artefakty to specjalne itemy które dają unikalne bonusy.

💡 WSKAZÓWKI:
- !sklep - kupuj artefakty
- !artefakty - zobacz swoje artefakty
- Artefakty mają różne rzadkości
- Niektóre artefakty są tylko dla gangów

⚠️ OSTRZEŻENIA:
- Artefakty mogą być drogie
- Niektóre artefakty są eventowe (ograniczone)
- Artefakty gangowe są współdzielone

📊 STATYSTYKI:
- Rzadkości: common, rare, epic, legendary
- Ceny: 1000-100000 VC
- Maksymalna liczba artefaktów: bez limitu`
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
Jeśli napotkałeś błąd w grze, zgłoś go twórcy bota.

💡 JAK ZGŁOSIĆ BŁĄD:
1. Zrób screenshot błędu
2. Opisz co zrobiłeś przed błędem
3. Napisz do twórcy bota na Facebooku
4. Dołącz screenshot i opis

📞 KONTAKT:
Facebook: https://www.facebook.com/profile.php?id=100060812419294

⚠️ OSTRZEŻENIA:
- Nie zgłaszaj błędów które już są znane
- Bądź konkretny w opisie
- Nie spamuj wiadomościami

💼 OFERTY:
Jeśli masz ofertę współpracy, propozycję ulepszenia lub chcesz zainwestować w rozwój bota - również napisz na powyższym Facebooku.`
      }
    ]
  },
  6: {
    name: 'Praca i firmy',
    emoji: '💼',
    poradniki: [
      {
        id: 1,
        title: 'Jak efektywnie zarządzać firmami',
        content: `📝 OPIS:
Firmy to pasywne źródło dochodu. Efektywne zarządzanie zwiększa zyski.

💡 WSKAZÓWKI:
- Zatrudniaj pracowników z dobrymi statystykami
- Używaj itemów firmowych
- Naprawiaj firmy od razu gdy się zepsują
- Monitoruj wypłaty co 3 godziny

⚠️ OSTRZEŻENIA:
- Pracownicy mogą nie przyjść do pracy
- Firmy mogą się zepsuć bez ostrzeżenia
- Koszty naprawy rosną z czasem

📊 STATYSTYKI:
- Optymalna liczba pracowników: 5-10
- Czas między wypłatami: 3 godziny
- Średni zysk: 2000-10000 VC`
      }
    ]
  },
  7: {
    name: 'Gry multiplayer',
    emoji: '🎮',
    poradniki: [
      {
        id: 1,
        title: 'Mecz - obstawianie wyników',
        content: `📝 OPIS:
Mecz pozwala obstawiać wyniki meczów piłkarskich.

💡 WSKAZÓWKI:
- !mecz - zobacz ofertę meczu
- !mecz <stawka> <1/X/2> - obstaw wynik
- 1 = wygrana gospodarzy
- X = remis
- 2 = wygrana gości

⚠️ OSTRZEŻENIA:
- Kursy zależą od szans drużyn
- Możesz przegrać całą stawkę
- Mecz trwa ~60 sekund

📊 STATYSTYKI:
- Minimalna stawka: 100 VC
- Czas trwania: 60 sekund
- Kursy: 1.1 - 10.0`
      },
      {
        id: 2,
        title: 'Multi-mecz - obstawianie wielu meczów',
        content: `📝 OPIS:
Multi-mecz pozwala obstawiać wiele meczów naraz za wyższe kursy.

💡 WSKAZÓWKI:
- !multimecz - zobacz oferty meczów
- !multimecz <stawka> <typy> - obstaw
- Typy to np. 1X2 dla każdego meczu
- Im więcej meczów tym wyższy kurs

⚠️ OSTRZEŻENIA:
- Jeśli jeden mecz przegrany = cała przegrana
- Kursy są mnożone
- Bardzo ryzykowne

📊 STATYSTYKI:
- Minimalna stawka: 100 VC
- Maksymalna liczba meczów: 5
- Potencjalny kurs: do 50x`
      },
      {
        id: 3,
        title: 'Giełda - inwestowanie',
        content: `📝 OPIS:
Giełda pozwala inwestować w aktywa (bank, srebro, złoto, diamenty).

💡 WSKAZÓWKI:
- !gielda - rozpocznij sesję giełdy
- !gielda inwestuj <kwota> <aktywo> - zainwestuj
- Aktywa mogą rosnąć lub spadać
- Inwestuj mądrze - nie wszystko w jedno

⚠️ OSTRZEŻENIA:
- Aktywa mogą spaść poniżej 0%
- Możesz stracić całą inwestycję
- Giełda trwa ~3 minuty

📊 STATYSTYKI:
- Minimalna inwestycja: 100 VC
- Czas trwania: 3 minuty
- Zwrot: -50% do +100%`
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
Sklep pozwala kupować itemy które dają różne bonusy.

💡 WSKAZÓWKI:
- !sklep - zobacz dostępne itemy
- !sklep <item> <ilość> - kup item
- !otworz <item> - otwórz skrzynię
- Itemy mają różne rzadkości

⚠️ OSTRZEŻENIA:
- Itemy mogą być drogie
- Skrzynie mają losowe nagrody
- Niektóre itemy są eventowe

📊 STATYSTYKI:
- Rzadkości: common, rare, epic, legendary
- Ceny: 100-100000 VC
- Szansa na legendary: ~1%`
      }
    ]
  }
};

function buildPoradnikCategoriesEmbed(prefix) {
  let description = '📚 PORADNIKI - WYBIERZ KATEGORIĘ\n\n';
  
  for (const [num, category] of Object.entries(poradnikCategories)) {
    const poradnikCount = category.poradniki.length;
    description += `${num}. ${category.emoji} ${category.name} (${poradnikCount} poradnik${poradnikCount !== 1 ? 'y' : 'ów'})\n`;
  }
  
  description += '\n👉 Wpisz numer kategorii aby zobaczyć poradniki w niej';
  
  const embed = {
    title: '📚 PORADNIKI',
    description,
    color: 0x00ff00,
    toMessageText: function() {
      return `**${this.title}**\n\n${this.description}`;
    }
  };
  
  return embed;
}

function buildPoradnikListEmbed(categoryNum) {
  const category = poradnikCategories[categoryNum];
  if (!category) return null;
  
  let description = `${category.emoji} PORADNIKI - ${category.name.toUpperCase()}\n\n`;
  
  for (const poradnik of category.poradniki) {
    description += `${poradnik.id}. ${poradnik.title}\n`;
  }
  
  description += '\n👉 Wpisz numer poradnika aby zobaczyć szczegóły';
  
  const embed = {
    title: `${category.emoji} ${category.name}`,
    description,
    color: 0x00ff00,
    toMessageText: function() {
      return `**${this.title}**\n\n${this.description}`;
    }
  };
  
  return embed;
}

function buildPoradnikDetailEmbed(categoryNum, poradnikNum) {
  const category = poradnikCategories[categoryNum];
  if (!category) return null;
  
  const poradnik = category.poradniki.find(p => p.id === poradnikNum);
  if (!poradnik) return null;
  
  const embed = {
    title: `📖 PORADNIK: ${poradnik.title.toUpperCase()}`,
    description: poradnik.content,
    color: 0x00ff00,
    toMessageText: function() {
      return `**${this.title}**\n\n${this.description}`;
    }
  };
  
  return embed;
}

function resolvePoradnikCategory(input) {
  const num = Number(input);
  if (Number.isInteger(num) && poradnikCategories[num]) {
    return num;
  }
  return null;
}

function getPoradnikByCategoryAndNumber(categoryNum, poradnikNum) {
  const category = poradnikCategories[categoryNum];
  if (!category) return null;
  
  return category.poradniki.find(p => p.id === poradnikNum) || null;
}

module.exports = {
  poradnikCategories,
  buildPoradnikCategoriesEmbed,
  buildPoradnikListEmbed,
  buildPoradnikDetailEmbed,
  resolvePoradnikCategory,
  getPoradnikByCategoryAndNumber
};
