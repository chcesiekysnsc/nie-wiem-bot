const poradnikCategories = {
   1: {
     name: 'Ekonomia',
     emoji: '📊',
     poradniki: [
       {
         id: 1,
         title: 'Jak zarabiać na work',
         content: `📝 OPIS:
!work to podstawowe zarobki — co 5 minut możesz wykonać pracę i dostać wypłatę.

💡 PORADA:
Kup garnitur i kaczkę biznesu dla bonusów. Zegarek skraca cooldown. Energetyk zwiększa zysk, ale wydłuża cooldown.

⚠️ UWAGA:
W więzieniu nie możesz pracować.

📊 INFO:
Cooldown: 5 min`
       },
       {
         id: 2,
         title: 'Jak używać crime',
         content: `📝 OPIS:
!crime to kradzież z ~75% szansy sukcesu. Udana = zysk, nieudana = więzienie.

💡 PORADA:
Ostry nóż i energetyk zwiększają szansę i zysk. Celuj w graczy z dużym saldem.

⚠️ UWAGA:
Nieudana próba = 1h więzienia + kara. Możesz przekupić policjanta (!crime lapowka) za 55% szansy uniknięcia.

📊 INFO:
Szansa: ~75%`
       },
       {
         id: 3,
         title: 'Jak używać banku',
         content: `📝 OPIS:
Bank bezpiecznie przechowuje pieniądze. Pieniądze w banku nie są dostępne do kradzieży (!rob).

💡 PORADA:
Wpłacaj nadwyżki (!wplac). Pojemność banku rośnie z przedmiotami. Niektóre itemy dają odsetki.

⚠️ UWAGA:
Bank ma limit pojemności. Pełny = nie możesz wpłacić więcej.

📊 INFO:
Wpłata: !wplac | Wypłata: !wyplac`
       },
       {
         id: 4,
         title: 'Jak zarządzać firmami',
         content: `📝 OPIS:
Firmy generują pasywny dochód co 3 godziny. Możesz mieć do 2 firm.

💡 PORADA:
Zatrudniaj pracowników (!pracownik). Używaj przedmiotów firmowych. Naprawiaj od razu gdy się zepsują.

⚠️ UWAGA:
Firmy mogą ulec awarii. Pracownicy pobierają część wypłaty.

📊 INFO:
Wypłata co: 3 godziny`
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
Blackjack — gra karciana, cel to 21 punktów. Krupier dobiera do 17.

💡 PORADA:
Dobierz do 16, stój przy 17+. Możesz podwoić stawkę (!double) przy pierwszych 2 kartach.

⚠️ UWAGA:
Przekroczenie 21 = przegrana. Blackjack (As+10/K/Q/J) płaci 2.5x.

📊 INFO:
Wypłata blackjack: 2.5x`
       },
       {
         id: 2,
         title: 'Jak grać w ruletkę',
         content: `📝 OPIS:
Ruletka — obstawiasz kolor, parzystość lub numer (0-36).

💡 PORADA:
Czerwony/czarny = 2x. Numer = 12x. Zielone (0) = 36x. Przekupiony krupier podnosi szansę.

⚠️ UWAGA:
Zielone ma najmniejszą szansę (~2.7%).

📊 INFO:
Zielone: 36x | Numer: 12x | Kolor: 2x`
       },
       {
         id: 3,
         title: 'Jak grać w slots',
         content: `📝 OPIS:
Slots — automat z 3 bębnami. Dopasuj symbole aby wygrać.

💡 PORADA:
Trzy takie same = wygrana. 7 lub diamenty dają najwyższy mnożnik. Przekupiony krupier może uratować przegraną.

⚠️ UWAGA:
Slots są oparte na losowości.

📊 INFO:
Mnożniki: 3x-5x`
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
Wojna karciana — gra multiplayer do 12 osób. W każdej rundzie losuje się karty, słabsze odpada.

💡 PORADA:
Zbierz graczy w grupie. Ostatni pozostający wygrywa całą pulę.

⚠️ UWAGA:
Min. 2 graczy, max 12. Jeśli zapisze się tylko 1, stawka wraca.

📊 INFO:
Stawka: dowolna`
       },
       {
         id: 2,
         title: 'Jak grać w PKN',
         content: `📝 OPIS:
Papier-Kamień-Nożyce — graj z botem lub wyzywaj innych (PvP).

💡 PORADA:
W trybie PvP wpisz !pkn acc aby zaakceptować. W singleplayer graj przeciwko botowi.

⚠️ UWAGA:
W PvP masz 2 minuty na akceptację.

📊 INFO:
Stawka: dowolna`
       },
       {
         id: 3,
         title: 'Jak grać w duel',
         content: `📝 OPIS:
Pojedynek 1v1 — obaj stawiają tę samą kwotę, wygrywa losowo 50/50.

💡 PORADA:
Wpisz !duel <kwota> @osoba. Przeciwnik musi zaakceptować (!duel acc).

⚠️ UWAGA:
Czysta losowość — nie ma wpływu przedmiotów. Podatek 5% z wygranej.

📊 INFO:
Stawka: dowolna`
       }
     ]
   },
   4: {
     name: 'System',
     emoji: '🏢',
     poradniki: [
       {
         id: 1,
         title: 'Jak założyć gang',
         content: `📝 OPIS:
Gangi pozwalają na współpracę, wspólny skarbiec i ulepszenia.

💡 PORADA:
Zatrudniaj członków. Ulepszaj Dziuplę (więcej miejsc), Biznesy, Fach, Uzbrojenie, Obronę.

⚠️ UWAGA:
Koszt założenia: 1 000 000 VC. Max członków: 5 + poziom Dziupli (max 15).

📊 INFO:
Koszt: 1 000 000 VC`
       },
       {
         id: 2,
         title: 'Jak zdobywać artefakty',
         content: `📝 OPIS:
Artefakty to przedmioty z bonusami. Kupuj w sklepie lub otwieraj paczki (skrzynie).

💡 PORADA:
Sprawdź !artefakty aby zobaczyć listę. Niektóre itemy dają bonusy do pracy, kradzieży, kasyna.

⚠️ UWAGA:
Paczki mają losowe nagrody.

📊 INFO:
Sklep: !sklep | Lista: !artefakty`
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
     name: 'Praca i firmy',
     emoji: '💼',
     poradniki: [
       {
         id: 1,
         title: 'Jak zarządzać firmami',
         content: `📝 OPIS:
Firmy dają pasywne zarobki co 3 godziny. Możesz mieć 2 firmy.

💡 PORADA:
Zatrudniaj 1 pracownika (!pracownik) dla bonusów. Używaj przedmiotów firmowych. Naprawiaj od razu.

⚠️ UWAGA:
Pracownicy pobierają % wypłaty. Mogą wywołać awarię.

📊 INFO:
Średni zysk: 2000-10000 VC`
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
!mecz — obstawianie meczów piłkarskich. Wygeneruj ofertę i postaw na wynik.

💡 PORADA:
1 = gospodarze, X = remis, 2 = goście. Kursy zależą od sił drużyn. Max stawka: 10% salda.

⚠️ UWAGA:
Możesz przegrać całą stawkę. Symulacja trwa 60s.

📊 INFO:
Czas trwania: 60 sekund`
       },
       {
         id: 2,
         title: 'Jak grać multi-mecz',
         content: `📝 OPIS:
!multimecz — kupon na 2-10 meczów naraz. Kursy mnożą się jak w bukmacherze.

💡 PORADA:
Im więcej meczów tym wyższy kurs. Jeśli jeden przegrany = cała przegrana.

⚠️ UWAGA:
Bardzo ryzykowne. Obstawiaj przez !multiobstaw.

📊 INFO:
Meczów: 2-10`
       },
       {
         id: 3,
         title: 'Jak grać na giełdzie',
         content: `📝 OPIS:
!gielda — multiplayer inwestycje w 4 aktywa (Bank, Srebro, Złoto, Diamenty).

💡 PORADA:
Inwestuj w różne aktywa. Lobby trwa 2 min, inwestycja 1 min. Wszyscy obstawiają przed losowaniem.

⚠️ UWAGA:
Możesz stracić całą inwestycję. Min. inwestycja: 10% salda.

📊 INFO:
Rundainwestycji: 1 minuta`
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
!sklep — kupuj przedmioty z bonusami. Dwa typy: permanent (jednorazowe) i stackable.

💡 PORADA:
Sprawdź !sklep help <nr> przed zakupem. Paczki (lootboxy) dają losowe przedmioty. Otwieraj przez !otworz.

⚠️ UWAGA:
Paczki mają losowe nagrody. Limit 10 paczek/dzień.

📊 INFO:
Sklep: !sklep | Paczki: !otworz`
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
