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

function parseAnswer(text, letter) {
  let cleaned = text.trim();

  // 1. Check labeled formats
  const pMatch = cleaned.match(/(?:państwo|panstwo|p):\s*([\p{L}\-]+)/ui);
  const mMatch = cleaned.match(/(?:miasto|m):\s*([\p{L}\-]+)/ui);
  const iMatch = cleaned.match(/(?:imię|imie|i):\s*([\p{L}\-]+)/ui);
  const zMatch = cleaned.match(/(?:zwierzę|zwierze|z):\s*([\p{L}\-]+)/ui);
  const rzMatch = cleaned.match(/(?:rzecz|rz):\s*([\p{L}\-]+)/ui);
  const roMatch = cleaned.match(/(?:roślina|roslina|ro|r):\s*([\p{L}\-]+)/ui);

  if (pMatch && mMatch && iMatch && zMatch && rzMatch && roMatch) {
    return {
      country: pMatch[1].toLowerCase().trim(),
      city: mMatch[1].toLowerCase().trim(),
      name: iMatch[1].toLowerCase().trim(),
      animal: zMatch[1].toLowerCase().trim(),
      thing: rzMatch[1].toLowerCase().trim(),
      plant: roMatch[1].toLowerCase().trim()
    };
  }

  // 2. Otherwise split by whitespace or commas and take first 6 words
  const parts = cleaned.replace(/,/g, ' ').split(/\s+/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 6) {
    return {
      country: parts[0].toLowerCase(),
      city: parts[1].toLowerCase(),
      name: parts[2].toLowerCase(),
      animal: parts[3].toLowerCase(),
      thing: parts[4].toLowerCase(),
      plant: parts[5].toLowerCase()
    };
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

    const parsed = parseAnswer(answerText, game.currentLetter);
    let isGood = false;

    if (parsed) {
      const letter = game.currentLetter.toLowerCase();
      const normLetter = removeDiacritics(letter);
      const normCountry = removeDiacritics(parsed.country.trim());
      const normCity = removeDiacritics(parsed.city.trim());
      const normName = removeDiacritics(parsed.name.trim());
      const normAnimal = removeDiacritics(parsed.animal.trim());
      const normThing = removeDiacritics(parsed.thing.trim());
      const normPlant = removeDiacritics(parsed.plant.trim());

      let countryValid = normCountry.startsWith(normLetter) && COUNTRIES_NORMALIZED.has(normCountry);

      const matchesCityNamePattern = /^[a-z]+(-[a-z]+)?$/.test(normCity);
      const isKnownCity = CITIES_NORMALIZED.has(normCity);
      let cityValid = normCity.startsWith(normLetter) && (isKnownCity || matchesCityNamePattern) && normCity !== normCountry && normCity.length >= 3;

      let nameValid = normName.startsWith(normLetter) && NAMES_NORMALIZED.has(normName);
      let animalValid = normAnimal.startsWith(normLetter) && ANIMALS_NORMALIZED.has(normAnimal);
      let thingValid = normThing.startsWith(normLetter) && THINGS_NORMALIZED.has(normThing);
      let plantValid = normPlant.startsWith(normLetter) && PLANTS_NORMALIZED.has(normPlant);

      if (countryValid && cityValid && nameValid && animalValid && thingValid && plantValid) {
        isGood = true;
      }

      game.submissions.set(playerId, parsed);
    }

    if (messageContext.rawEvent?.messageID && client.api) {
      const reaction = isGood ? '👍' : '👎';
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
        const rawCountry = sub.country.trim();
        const rawCity = sub.city.trim();
        const rawName = sub.name.trim();
        const rawAnimal = sub.animal.trim();
        const rawThing = sub.thing.trim();
        const rawPlant = sub.plant.trim();

        const normCountry = removeDiacritics(rawCountry);
        const normCity = removeDiacritics(rawCity);
        const normName = removeDiacritics(rawName);
        const normAnimal = removeDiacritics(rawAnimal);
        const normThing = removeDiacritics(rawThing);
        const normPlant = removeDiacritics(rawPlant);

        // Validate Country
        if (normCountry.startsWith(normLetter) && COUNTRIES_NORMALIZED.has(normCountry)) {
          countryValid = true;
          country = capitalize(COUNTRIES_NORMALIZED.get(normCountry));
          countryFreq[normCountry] = (countryFreq[normCountry] || 0) + 1;
        } else {
          country = rawCountry;
        }

        // Validate City: in custom list OR matching naming pattern
        const matchesNamePattern = /^[a-z]+(-[a-z]+)?$/.test(normCity);
        const isKnownCity = CITIES_NORMALIZED.has(normCity);
        if (normCity.startsWith(normLetter) && (isKnownCity || matchesNamePattern) && normCity !== normCountry && normCity.length >= 3) {
          cityValid = true;
          city = isKnownCity ? capitalize(CITIES_NORMALIZED.get(normCity)) : capitalize(rawCity);
          cityFreq[normCity] = (cityFreq[normCity] || 0) + 1;
        } else {
          city = rawCity;
        }

        // Validate Name
        if (normName.startsWith(normLetter) && NAMES_NORMALIZED.has(normName)) {
          nameValid = true;
          name = capitalize(NAMES_NORMALIZED.get(normName));
          nameFreq[normName] = (nameFreq[normName] || 0) + 1;
        } else {
          name = rawName;
        }

        // Validate Animal
        if (normAnimal.startsWith(normLetter) && ANIMALS_NORMALIZED.has(normAnimal)) {
          animalValid = true;
          animal = capitalize(ANIMALS_NORMALIZED.get(normAnimal));
          animalFreq[normAnimal] = (animalFreq[normAnimal] || 0) + 1;
        } else {
          animal = rawAnimal;
        }

        // Validate Thing
        if (normThing.startsWith(normLetter) && THINGS_NORMALIZED.has(normThing)) {
          thingValid = true;
          thing = capitalize(THINGS_NORMALIZED.get(normThing));
          thingFreq[normThing] = (thingFreq[normThing] || 0) + 1;
        } else {
          thing = rawThing;
        }

        // Validate Plant
        if (normPlant.startsWith(normLetter) && PLANTS_NORMALIZED.has(normPlant)) {
          plantValid = true;
          plant = capitalize(PLANTS_NORMALIZED.get(normPlant));
          plantFreq[normPlant] = (plantFreq[normPlant] || 0) + 1;
        } else {
          plant = rawPlant;
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
