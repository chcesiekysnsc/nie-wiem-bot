const { COUNTRIES, CITIES, NAMES, ANIMALS, PLANTS, THINGS } = require('../utils/panstwaMiastaData');

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'U', 'W', 'Z'];

function removeDiacritics(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź/g, 'z')
    .replace(/ż/g, 'z');
}

const COUNTRIES_NORMALIZED = new Map();
for (const country of COUNTRIES) {
  COUNTRIES_NORMALIZED.set(removeDiacritics(country), country);
}

const CITIES_NORMALIZED = new Map();
for (const city of CITIES) {
  CITIES_NORMALIZED.set(removeDiacritics(city), city);
}

const NAMES_NORMALIZED = new Map();
for (const name of NAMES) {
  NAMES_NORMALIZED.set(removeDiacritics(name), name);
}

const ANIMALS_NORMALIZED = new Map();
for (const animal of ANIMALS) {
  ANIMALS_NORMALIZED.set(removeDiacritics(animal), animal);
}

const PLANTS_NORMALIZED = new Map();
for (const plant of PLANTS) {
  PLANTS_NORMALIZED.set(removeDiacritics(plant), plant);
}

const THINGS_NORMALIZED = new Map();
for (const thing of THINGS) {
  THINGS_NORMALIZED.set(removeDiacritics(thing), thing);
}

const axios = require('axios');

const sjpCache = new Map();

const CATEGORY_KEYWORDS = {
  country: ['państwo', 'republika'],
  city: ['miasto', 'stolica'],
  name: ['imię', 'imiona'],
  animal: ['zwierzę', 'zwierze', 'ssak', 'ptak', 'owad', 'ryba', 'płaz', 'gad', 'rak', 'skorupiak', 'mięczak', 'psowatych', 'kotowatych', 'drapieżnik', 'drapieżny', 'pajęczak', 'pająk', 'stawonóg'],
  plant: ['roślina', 'roslina', 'grzyb', 'drzewo', 'kwiat', 'krzew', 'warzywo', 'owoc', 'bylina', 'byliny', 'zborze', 'zboże', 'przyprawa', 'zioło', 'ziolo', 'owatych']
};

async function checkSjpWord(word) {
  const normWord = word.trim().toLowerCase();
  if (sjpCache.has(normWord)) {
    return sjpCache.get(normWord);
  }

  const url = `https://sjp.pl/${encodeURIComponent(normWord)}`;
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 3000
    });

    if (response.status === 200) {
      const html = response.data;
      
      const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let match;
      const paragraphs = [];
      while ((match = regex.exec(html)) !== null) {
        const text = match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) {
          paragraphs.push(text);
        }
      }

      const defs = [];
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i].toLowerCase();
        if (p.startsWith('znaczenie:') || p === 'znaczenie') {
          if (i + 1 < paragraphs.length) {
            const nextP = paragraphs[i + 1];
            const nextPLower = nextP.toLowerCase();
            if (nextPLower !== 'komentarze' && nextPLower !== '-' && nextPLower !== 'dodaj') {
              defs.push(nextP.toLowerCase());
            }
          }
        }
      }

      const result = {
        exists: true,
        definitions: defs
      };
      sjpCache.set(normWord, result);
      return result;
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      const result = { exists: false, definitions: [] };
      sjpCache.set(normWord, result);
      return result;
    }
    console.error(`[SJP] Błąd podczas sprawdzania słowa "${normWord}":`, error.message);
  }
  return null;
}

async function verifyWordCategory(word, category) {
  const normWord = word.trim().toLowerCase();
  const normNoDiacritics = removeDiacritics(normWord);

  // 1. Check local maps first
  if (category === 'country' && COUNTRIES_NORMALIZED.has(normNoDiacritics)) return true;
  if (category === 'city' && CITIES_NORMALIZED.has(normNoDiacritics)) return true;
  if (category === 'name' && NAMES_NORMALIZED.has(normNoDiacritics)) return true;
  if (category === 'animal' && ANIMALS_NORMALIZED.has(normNoDiacritics)) return true;
  if (category === 'plant' && PLANTS_NORMALIZED.has(normNoDiacritics)) return true;
  if (category === 'thing' && THINGS_NORMALIZED.has(normNoDiacritics)) return true;

  // If the word is well-known in another category's local list, reject it for this category
  const isWellKnownInOther = 
    (category !== 'country' && COUNTRIES_NORMALIZED.has(normNoDiacritics)) ||
    (category !== 'city' && CITIES_NORMALIZED.has(normNoDiacritics)) ||
    (category !== 'name' && NAMES_NORMALIZED.has(normNoDiacritics)) ||
    (category !== 'animal' && ANIMALS_NORMALIZED.has(normNoDiacritics)) ||
    (category !== 'plant' && PLANTS_NORMALIZED.has(normNoDiacritics));

  if (isWellKnownInOther) {
    return false;
  }

  // 2. Query SJP
  const sjp = await checkSjpWord(normWord);
  if (!sjp || !sjp.exists) {
    return false;
  }

  if (category === 'thing') {
    const isOther = ['country', 'city', 'name', 'animal', 'plant'].some(cat => {
      const keywords = CATEGORY_KEYWORDS[cat];
      return sjp.definitions.some(def => keywords.some(kw => def.includes(kw)));
    });
    return !isOther || sjp.definitions.length === 0;
  }

  const keywords = CATEGORY_KEYWORDS[category];
  if (!keywords) return false;

  return sjp.definitions.some(def => keywords.some(kw => def.includes(kw)));
}

function parseIncrementalAnswer(text) {
  let cleaned = text.trim();
  const results = [];

  // Match labeled formats
  const labelPatterns = [
    { category: 'country', regex: /(?:państwo|panstwo|p):\s*([\p{L}\-]+)/ui },
    { category: 'city', regex: /(?:miasto|m):\s*([\p{L}\-]+)/ui },
    { category: 'name', regex: /(?:imię|imie|i):\s*([\p{L}\-]+)/ui },
    { category: 'animal', regex: /(?:zwierzę|zwierze|z):\s*([\p{L}\-]+)/ui },
    { category: 'thing', regex: /(?:rzecz|rz):\s*([\p{L}\-]+)/ui },
    { category: 'plant', regex: /(?:roślina|roslina|ro|r):\s*([\p{L}\-]+)/ui }
  ];

  for (const pattern of labelPatterns) {
    const match = cleaned.match(pattern.regex);
    if (match) {
      results.push({
        word: match[1].trim(),
        category: pattern.category
      });
      // Remove the matched part from the text to avoid parsing it as unlabeled word
      cleaned = cleaned.replace(match[0], ' ');
    }
  }

  // Any remaining words are unlabeled
  const remainingWords = cleaned.replace(/,/g, ' ').split(/\s+/).map(w => w.trim()).filter(Boolean);
  for (const word of remainingWords) {
    results.push({
      word,
      category: null
    });
  }

  return results;
}

function parseAnswer(text, letter) {
  // Legacy parser wrapper, returns null or 6-category structure if complete
  const items = parseIncrementalAnswer(text);
  const result = { country: '', city: '', name: '', animal: '', thing: '', plant: '' };
  for (const item of items) {
    if (item.category) {
      result[item.category] = item.word;
    }
  }
  if (result.country && result.city && result.name && result.animal && result.thing && result.plant) {
    return result;
  }
  return null;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function trackMessage(game, msgInfo) {
  if (game && msgInfo && msgInfo.messageID) {
    game.lastMessageId = msgInfo.messageID;
    if (!game.validMessageIds) {
      game.validMessageIds = [];
    }
    if (!game.validMessageIds.includes(msgInfo.messageID)) {
      game.validMessageIds.push(msgInfo.messageID);
    }
  }
}

module.exports = {
  name: 'panstwamiasta',
  aliases: ['panstwa-miasta', 'panstwamiastadolacz', 'panstwamiastastart'],
  checkSjpWord,
  verifyWordCategory,
  parseAnswer,
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;
    if (!threadId) {
      await message.reply('❌ Ta komenda może być używana tylko na czatach grupowych.');
      return;
    }

    if (!client.activePanstwaMiasta) {
      client.activePanstwaMiasta = new Map();
    }

    const game = client.activePanstwaMiasta.get(threadId);

    // 1. Join game action
    const messageText = message.content.toLowerCase().trim();
    if (messageText.includes('dolacz') || messageText.includes('dolać')) {
      if (!game) {
        await message.reply('❌ Nie ma żadnej aktywnej gry w Państwa-Miasta. Wpisz **!panstwamiasta**, aby utworzyć nową.');
        return;
      }
      if (game.state !== 'joining') {
        await message.reply('❌ Gra już się rozpoczęła, nie możesz teraz dołączyć.');
        return;
      }
      const isAlreadyIn = game.players.some(p => p.id === message.author.id);
      if (isAlreadyIn) {
        await message.reply(`⚠️ **${message.author.username}**, już jesteś na liście graczy.`);
        return;
      }
      game.players.push({
        id: message.author.id,
        username: message.author.username,
        score: 0
      });
      const msgInfo = await message.reply(`✅ **${message.author.username}** dołączył do gry w Państwa-Miasta! (Łącznie graczy: **${game.players.length}**)`);
      trackMessage(game, msgInfo);
      return;
    }

    // 2. Start game action
    if (messageText.includes('start')) {
      if (!game) {
        await message.reply('❌ Nie ma aktywnej gry do rozpoczęcia.');
        return;
      }
      if (game.state !== 'joining') {
        await message.reply('❌ Gra już się rozpoczęła.');
        return;
      }
      if (game.hostId !== message.author.id) {
        await message.reply('❌ Tylko organizator gry może rozpocząć ją wcześniej.');
        return;
      }
      if (game.players.length < 1) {
        await message.reply('❌ Musi być przynajmniej 1 gracz, aby rozpocząć grę.');
        return;
      }
      clearTimeout(game.joinTimeout);
      await this.startFirstTurn(client, message, game, threadId);
      return;
    }

    // 3. Create new game
    if (game) {
      await message.reply('⚠️ Na tej grupie trwa już faza rejestracji lub aktywna gra w Państwa-Miasta!');
      return;
    }

    // Resolve number of turns
    let turns = 3;
    if (args[0]) {
      const parsedTurns = parseInt(args[0], 10);
      if (!isNaN(parsedTurns) && parsedTurns > 0) {
        turns = Math.min(parsedTurns, 4); // max 4 turns
      }
    }

    const newGame = {
      active: true,
      state: 'joining',
      hostId: message.author.id,
      players: [{ id: message.author.id, username: message.author.username, score: 0 }],
      maxTurns: turns,
      currentTurn: 0,
      usedLetters: [],
      currentLetter: '',
      submissions: new Map(), // playerId -> { country, city }
      joinTimeout: null,
      validMessageIds: []
    };

    client.activePanstwaMiasta.set(threadId, newGame);

    // Auto-start after 2 minutes
    newGame.joinTimeout = setTimeout(async () => {
      const g = client.activePanstwaMiasta.get(threadId);
      if (g && g.state === 'joining') {
        if (g.players.length > 0) {
          await this.startFirstTurn(client, message, g, threadId);
        } else {
          client.activePanstwaMiasta.delete(threadId);
          if (client.api) {
            client.api.sendMessage('⌛ Faza dołączania do gry w Państwa-Miasta minęła. Brak chętnych — gra anulowana.', threadId);
          }
        }
      }
    }, 120000);

    const announceMsg = 
      `🌎 **PAŃSTWA-MIASTA (QUIZ GRUPOWY)** 🌎\n` +
      `Organizator **${message.author.username}** zaprasza na grę w Państwa-Miasta! (Liczba tur: **${turns}**)\n\n` +
      `⏱️ Macie **2 minuty** na dołączenie do gry.\n` +
      `👉 Napisz **!panstwamiasta dolacz** (lub bez wykrzyknika: **panstwa miasta dolacz**), aby wziąć udział.\n` +
      `👑 Organizator może wpisać **!panstwamiasta start**, aby zacząć od razu.`;

    const msgInfo = await message.reply(announceMsg);
    trackMessage(newGame, msgInfo);
  },

  async startFirstTurn(client, message, game, threadId) {
    game.state = 'playing';
    game.currentTurn = 1;
    await this.startTurn(client, message, game, threadId);
  },

  async startTurn(client, message, game, threadId) {
    // Select a unique random letter
    let letter = '';
    const availableLetters = LETTERS.filter(l => !game.usedLetters.includes(l));
    if (availableLetters.length === 0) {
      letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    } else {
      letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
    }
    game.currentLetter = letter;
    game.usedLetters.push(letter);
    game.submissions.clear();
    game.state = 'answering';

    const turnMsg = 
      `🔔 **RUNDA ${game.currentTurn}/${game.maxTurns}** 🔔\n` +
      `Wylosowana litera to: 🌟 **${letter}** 🌟\n\n` +
      `⏱️ Wszyscy zapisani gracze mają **20 sekund** na wysłanie odpowiedzi!\n` +
      `📝 Format: **Państwo Miasto Imię Zwierzę Rzecz Roślina**\n` +
      `*(np. \`Polska Poznań Piotr Pies Pudełko Pokrzywa\` lub z etykietami: \`p: Polska, m: Poznań, i: Piotr, z: Pies, rz: Pudełko, ro: Pokrzywa\`)*\n\n` +
      `*Uwaga: Słowa nie mogą się powtarzać między graczami!*`;

    if (client.api) {
      client.api.sendMessage(turnMsg, threadId, (err, msgInfo) => {
        if (!err && msgInfo) trackMessage(game, msgInfo);
      });
    } else {
      const msgInfo = await message.reply(turnMsg);
      trackMessage(game, msgInfo);
    }

    // End turn after 20 seconds
    setTimeout(async () => {
      if (game.active && game.state === 'answering') {
        await this.endTurn(client, message, game, threadId);
      }
    }, 20000);
  },

  // Process answers submitted during the 20 seconds
  async handleAnswer(client, messageContext, answerText) {
    const threadId = messageContext.guild.id;
    const game = client.activePanstwaMiasta.get(threadId);
    if (!game || game.state !== 'answering') return;

    const playerId = messageContext.author.id;
    const isJoined = game.players.some(p => p.id === playerId);
    if (!isJoined) return;

    const parsedItems = parseIncrementalAnswer(answerText);
    if (parsedItems.length === 0) return;

    let sub = game.submissions.get(playerId);
    if (!sub) {
      sub = {
        country: '', countryValid: false,
        city: '', cityValid: false,
        name: '', nameValid: false,
        animal: '', animalValid: false,
        thing: '', thingValid: false,
        plant: '', plantValid: false
      };
    }

    const letter = game.currentLetter.toLowerCase();
    const normLetter = removeDiacritics(letter);
    let anyValidAdded = false;

    for (const item of parsedItems) {
      const word = item.word.trim();
      if (!word) continue;

      const normWord = word.toLowerCase();
      const normNoDiacritics = removeDiacritics(normWord);

      // Słowo musi zaczynać się na właściwą literę
      if (!normNoDiacritics.startsWith(normLetter)) {
        continue;
      }

      if (item.category) {
        // A. Słowo z jawną etykietą (np. p: Polska)
        const category = item.category;
        let isValid = await verifyWordCategory(word, category);
        if (isValid && category === 'city') {
          const normCountry = removeDiacritics(sub.country.toLowerCase());
          if (normNoDiacritics.length < 3 || normNoDiacritics === normCountry) {
            isValid = false;
          }
        }

        if (isValid) {
          sub[category] = capitalize(word);
          sub[category + 'Valid'] = true;
          anyValidAdded = true;
        }
      } else {
        // B. Słowo bez etykiety - sprawdzamy puste kategorie po kolei
        const categoriesOrder = ['country', 'city', 'name', 'animal', 'plant', 'thing'];
        for (const category of categoriesOrder) {
          if (sub[category + 'Valid']) {
            continue;
          }

          let isValid = await verifyWordCategory(word, category);
          if (isValid && category === 'city') {
            const normCountry = removeDiacritics(sub.country.toLowerCase());
            if (normNoDiacritics.length < 3 || normNoDiacritics === normCountry) {
              isValid = false;
            }
          }

          if (isValid) {
            sub[category] = capitalize(word);
            sub[category + 'Valid'] = true;
            anyValidAdded = true;
            break; // Przypisaliśmy słowo, kończymy pętlę kategorii dla tego słowa
          }
        }
      }
    }

    game.submissions.set(playerId, sub);

    if (messageContext.rawEvent?.messageID && client.api) {
      const reaction = anyValidAdded ? '👍' : '👎';
      client.api.setMessageReaction(reaction, messageContext.rawEvent.messageID, () => {});
    }
  },

  async endTurn(client, message, game, threadId) {
    game.state = 'evaluating';

    // 1. Evaluate answers
    const letter = game.currentLetter.toLowerCase();
    const normLetter = removeDiacritics(letter);
    const evaluated = [];

    // Frequency counters to find duplicates
    const countryFreq = {};
    const cityFreq = {};
    const nameFreq = {};
    const animalFreq = {};
    const thingFreq = {};
    const plantFreq = {};

    // First pass: validation
    for (const player of game.players) {
      const sub = game.submissions.get(player.id);
      let country = '';
      let city = '';
      let name = '';
      let animal = '';
      let thing = '';
      let plant = '';

      let countryValid = false;
      let cityValid = false;
      let nameValid = false;
      let animalValid = false;
      let thingValid = false;
      let plantValid = false;

      if (sub) {
        country = sub.country;
        city = sub.city;
        name = sub.name;
        animal = sub.animal;
        thing = sub.thing;
        plant = sub.plant;

        countryValid = sub.countryValid;
        cityValid = sub.cityValid;
        nameValid = sub.nameValid;
        animalValid = sub.animalValid;
        thingValid = sub.thingValid;
        plantValid = sub.plantValid;

        if (countryValid) {
          const normCountry = removeDiacritics(country.toLowerCase());
          countryFreq[normCountry] = (countryFreq[normCountry] || 0) + 1;
        }
        if (cityValid) {
          const normCity = removeDiacritics(city.toLowerCase());
          cityFreq[normCity] = (cityFreq[normCity] || 0) + 1;
        }
        if (nameValid) {
          const normName = removeDiacritics(name.toLowerCase());
          nameFreq[normName] = (nameFreq[normName] || 0) + 1;
        }
        if (animalValid) {
          const normAnimal = removeDiacritics(animal.toLowerCase());
          animalFreq[normAnimal] = (animalFreq[normAnimal] || 0) + 1;
        }
        if (thingValid) {
          const normThing = removeDiacritics(thing.toLowerCase());
          thingFreq[normThing] = (thingFreq[normThing] || 0) + 1;
        }
        if (plantValid) {
          const normPlant = removeDiacritics(plant.toLowerCase());
          plantFreq[normPlant] = (plantFreq[normPlant] || 0) + 1;
        }
      }

      evaluated.push({
        player,
        country,
        city,
        name,
        animal,
        thing,
        plant,
        countryValid,
        cityValid,
        nameValid,
        animalValid,
        thingValid,
        plantValid,
        countryPoints: 0,
        cityPoints: 0,
        namePoints: 0,
        animalPoints: 0,
        thingPoints: 0,
        plantPoints: 0,
        turnPoints: 0
      });
    }

    // Second pass: uniqueness check and scoring
    for (const evalResult of evaluated) {
      if (evalResult.countryValid) {
        const freq = countryFreq[removeDiacritics(evalResult.country.toLowerCase())] || 1;
        evalResult.countryPoints = freq > 1 ? 5 : 10;
      }
      if (evalResult.cityValid) {
        const freq = cityFreq[removeDiacritics(evalResult.city.toLowerCase())] || 1;
        evalResult.cityPoints = freq > 1 ? 5 : 10;
      }
      if (evalResult.nameValid) {
        const freq = nameFreq[removeDiacritics(evalResult.name.toLowerCase())] || 1;
        evalResult.namePoints = freq > 1 ? 5 : 10;
      }
      if (evalResult.animalValid) {
        const freq = animalFreq[removeDiacritics(evalResult.animal.toLowerCase())] || 1;
        evalResult.animalPoints = freq > 1 ? 5 : 10;
      }
      if (evalResult.thingValid) {
        const freq = thingFreq[removeDiacritics(evalResult.thing.toLowerCase())] || 1;
        evalResult.thingPoints = freq > 1 ? 5 : 10;
      }
      if (evalResult.plantValid) {
        const freq = plantFreq[removeDiacritics(evalResult.plant.toLowerCase())] || 1;
        evalResult.plantPoints = freq > 1 ? 5 : 10;
      }

      evalResult.turnPoints = 
        evalResult.countryPoints + 
        evalResult.cityPoints + 
        evalResult.namePoints + 
        evalResult.animalPoints + 
        evalResult.thingPoints + 
        evalResult.plantPoints;

      evalResult.player.score += evalResult.turnPoints;
    }

    // 2. Build turn summary text
    let summaryText = `⌛ **KONIEC RUNDY (Litera: ${game.currentLetter})** ⌛\n\n**Podsumowanie punktacji tury:**\n`;
    for (const res of evaluated) {
      const cText = res.countryValid ? `🌍 ${res.country} (+${res.countryPoints} pkt)` : `🌍 ❌ brak/błędny (0 pkt)`;
      const mText = res.cityValid ? `🏙️ ${res.city} (+${res.cityPoints} pkt)` : `🏙️ ❌ brak/błędny (0 pkt)`;
      const nText = res.nameValid ? `👤 ${res.name} (+${res.namePoints} pkt)` : `👤 ❌ brak/błędny (0 pkt)`;
      const aText = res.animalValid ? `🐾 ${res.animal} (+${res.animalPoints} pkt)` : `🐾 ❌ brak/błędny (0 pkt)`;
      const tText = res.thingValid ? `📦 ${res.thing} (+${res.thingPoints} pkt)` : `📦 ❌ brak/błędny (0 pkt)`;
      const pText = res.plantValid ? `🌿 ${res.plant} (+${res.plantPoints} pkt)` : `🌿 ❌ brak/błędny (0 pkt)`;

      summaryText += `👤 **${res.player.username}**:\n` +
                    `  • ${cText}\n` +
                    `  • ${mText}\n` +
                    `  • ${nText}\n` +
                    `  • ${aText}\n` +
                    `  • ${tText}\n` +
                    `  • ${pText}\n` +
                    `  • Razem w turze: **+${res.turnPoints} pkt**\n\n`;
    }

    // 3. Build overall scoreboard
    summaryText += `🏆 **AKTUALNA TABELA WYNIKÓW:**\n`;
    const sortedStandings = [...game.players].sort((a, b) => b.score - a.score);
    sortedStandings.forEach((p, idx) => {
      summaryText += `${idx + 1}. **${p.username}** — **${p.score} pkt**\n`;
    });

    if (game.currentTurn < game.maxTurns) {
      summaryText += `\n🔄 **Rozpoczynamy nową rundę!** Kolejna litera zostanie wylosowana za 7 sekund...`;
    }

    if (client.api) {
      client.api.sendMessage(summaryText, threadId, (err, msgInfo) => {
        if (!err && msgInfo) trackMessage(game, msgInfo);
      });
    } else {
      const msgInfo = await message.reply(summaryText);
      trackMessage(game, msgInfo);
    }

    // 4. Check if game is over
    if (game.currentTurn >= game.maxTurns) {
      game.active = false;
      client.activePanstwaMiasta.delete(threadId);

      const winners = [];
      const maxScore = sortedStandings[0]?.score || 0;
      if (maxScore > 0) {
        for (const p of sortedStandings) {
          if (p.score === maxScore) {
            winners.push(p.username);
          }
        }
      }

      let finishMsg = `\n🏁 **KONIEC GRY!** 🏁\n`;
      if (winners.length > 0) {
        finishMsg += `🎉 Zwycięzca(y): ${winners.map(w => `**${w}**`).join(', ')} z wynikiem **${maxScore} pkt**! Gratulacje!`;
      } else {
        finishMsg += `ℹ️ Nikt nie zdobył żadnych punktów.`;
      }

      setTimeout(() => {
        if (client.api) {
          client.api.sendMessage(finishMsg, threadId, (err, msgInfo) => {
            if (!err && msgInfo) trackMessage(game, msgInfo);
          });
        }
      }, 2000);
    } else {
      // Start next turn after 7 seconds
      setTimeout(async () => {
        if (game.active) {
          game.currentTurn++;
          await this.startTurn(client, message, game, threadId);
        }
      }, 7000);
    }
  }
};
