const poradnikCategories = {
  1: {
    name: 'Ekonomia',
    emoji: '📊',
    poradniki: [
      {
        id: 1,
        title: 'Jak zarabiać na work',
        content: `📝 OPIS:
Komenda !work to podstawowy sposób zarabiania.

💡 PORADA:
Używaj work co 5 minut. Najlepiej rano i wieczorem gdy mniej graczy. Kup garnitur i kaczkę biznesu dla bonusów.

⚠️ UWAGA:
Nie używaj z ujemnym saldem.

📊 INFO:
Cooldown: 5 min`
      },
      {
        id: 2,
        title: 'Jak używać crime',
        content: `📝 OPIS:
Komenda !crime pozwala kraść pieniądze.

💡 PORADA:
Crime ma 50% szansy. Używaj ostry noz i energetyk dla bonusów. Celuj w graczy z dużym saldem.

⚠️ UWAGA:
Porażka = więzienie 5-15 min.

📊 INFO:
Szansa: 50%`
      },
      {
        id: 3,
        title: 'Jak używać banku',
        content: `📝 OPIS:
Bank bezpiecznie przechowuje pieniądze.

💡 PORADA:
Wpłacaj nadwyżki do banku. Procent zależy od poziomu - wyższy = wyższy procent.

⚠️ UWAGA:
Pieniądze w banku są bezpieczne przed kradzieżą.

📊 INFO:
Procent: 1-5% dziennie`
      },
      {
        id: 4,
        title: 'Jak zarządzać firmami',
        content: `📝 OPIS:
Firmy dają pasywne zarobki co 3 godziny.

💡 PORADA:
Zatrudniaj pracowników. Używaj itemów firmowych. Naprawiaj firmy od razu gdy się zepsują.

⚠️ UWAGA:
Firmy mogą się zepsuć bez ostrzeżenia.

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
Blackjack to gra karciana - cel to 21 punktów.

💡 PORADA:
Dobierz do 16-17. Stój przy 17+. Krupier musi dobierać do 17.

⚠️ UWAGA:
Przekroczenie 21 = przegrana.

📊 INFO:
Wypłata blackjack: 3:2`
      },
      {
        id: 2,
        title: 'Jak grać w ruletkę',
        content: `📝 OPIS:
Ruletka - obstawiasz kolor lub numer.

💡 PORADA:
Czerwony/czarny = 2x. Zielony (0) = 14x. Graj ostrożnie.

⚠️ UWAGA:
Zielony ma najmniejszą szansę.

📊 INFO:
Szansa na zielony: 2.7%`
      },
      {
        id: 3,
        title: 'Jak grać w slots',
        content: `📝 OPIS:
Slots to automat z bębnami.

💡 PORADA:
Szukaj symboli premium (7, diamenty). Graj tylko na pieniądze które możesz stracić.

⚠️ UWAGA:
Slots są oparte na losowości.

📊 INFO:
RTP: ~95%`
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
Wojna to gra karciana dla wielu graczy.

💡 PORADA:
Minimalnie 2 graczy. Najwyższa karta wygrywa pulę. Zbieraj graczy w grupie.

⚠️ UWAGA:
Czas na dołączenie: 90 sekund.

📊 INFO:
Minimalna stawka: 100 VC`
      },
      {
        id: 2,
        title: 'Jak grać w PKN',
        content: `📝 OPIS:
PKN to klasyczna gra papier kamień nożyce.

💡 PORADA:
Papier bije kamień, kamień bije nożyce, nożyce biją papier. Wyzwalaj znajomych.

⚠️ UWAGA:
Czas na akceptację: 2 minuty.

📊 INFO:
Minimalna stawka: 50 VC`
      },
      {
        id: 3,
        title: 'Jak grać w duel',
        content: `📝 OPIS:
Duel to pojedynek 1v1 na stawkę.

💡 PORADA:
Obaj stawiają tyle samo. Wygrywa ten z lepszymi statystykami i itemami.

⚠️ UWAGA:
Możesz przegrać dużą kwotę.

📊 INFO:
Minimalna stawka: 100 VC`
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
Gangi pozwalają na współpracę z innymi.

💡 PORADA:
Musisz być level 10+. Zatrudniaj członków. Gangi mają wspólne cele i skarbiec.

⚠️ UWAGA:
Maksymalnie 20 członków.

📊 INFO:
Koszt: 10000 VC`
      },
      {
        id: 2,
        title: 'Jak zdobywać artefakty',
        content: `📝 OPIS:
Artefakty to specjalne itemy z bonusami.

💡 PORADA:
Kupuj w sklepie. Otwieraj skrzynie. Niektóre są tylko dla gangów.

⚠️ UWAGA:
Artefakty mogą być drogie.

📊 INFO:
Rzadkości: common-legendary`
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
Firmy to pasywne zarobki co 3 godziny.

💡 PORADA:
Zatrudniaj 5-10 pracowników. Używaj itemów firmowych. Naprawiaj od razu.

⚠️ UWAGA:
Pracownicy mogą nie przyjść do pracy.

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
Mecz pozwala obstawiać wyniki piłkarskie.

💡 PORADA:
1 = gospodarze, X = remis, 2 = goście. Kursy zależą od szans drużyn.

⚠️ UWAGA:
Możesz przegrać całą stawkę.

📊 INFO:
Czas trwania: 60 sekund`
      },
      {
        id: 2,
        title: 'Jak grać multi-mecz',
        content: `📝 OPIS:
Multi-mecz to obstawianie wielu meczów naraz.

💡 PORADA:
Im więcej meczów tym wyższy kurs. Jeśli jeden przegrany = cała przegrana.

⚠️ UWAGA:
Bardzo ryzykowne.

📊 INFO:
Maksymalnie 5 meczów`
      },
      {
        id: 3,
        title: 'Jak grać na giełdzie',
        content: `📝 OPIS:
Giełda pozwala inwestować w aktywa.

💡 PORADA:
Inwestuj w różne aktywa. Nie wszystko w jedno. Aktywa mogą rosnąć lub spadać.

⚠️ UWAGA:
Możesz stracić całą inwestycję.

📊 INFO:
Czas trwania: 3 minuty`
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
Sklep pozwala kupować itemy z bonusami.

💡 PORADA:
Używaj !sklep aby zobaczyć ofertę. Otwieraj skrzynie. Itemy mają różne rzadkości.

⚠️ UWAGA:
Skrzynie mają losowe nagrody.

📊 INFO:
Rzadkości: common-legendary`
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
