const { formatCurrency, msToReadable } = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const PETS = {
  pies: {
    id: 'pies',
    name: '🐕 Pies',
    price: 350000,
    desc: '+2% -> +4% -> +6% do zarobków z !crime',
    getCrimeBonus: (lvl) => {
      if (lvl >= 10) return 0.06;
      if (lvl >= 5) return 0.04;
      return 0.02;
    },
    getWorkBonus: () => 0,
    getRobProtection: () => 0,
    getCooldownRed: () => 0
  },
  kot: {
    id: 'kot',
    name: '🐈 Kot',
    price: 350000,
    desc: '+4% -> +6% -> +8% do zarobków z !work',
    getCrimeBonus: () => 0,
    getWorkBonus: (lvl) => {
      if (lvl >= 10) return 0.08;
      if (lvl >= 5) return 0.06;
      return 0.04;
    },
    getRobProtection: () => 0,
    getCooldownRed: () => 0
  },
  smok: {
    id: 'smok',
    name: '🐉 Smok',
    price: 850000,
    desc: '+4% -> +6% -> +8% do crime oraz work, -5% ochrona w !rob, -5% cooldown work/crime',
    getCrimeBonus: (lvl) => {
      if (lvl >= 10) return 0.08;
      if (lvl >= 5) return 0.06;
      return 0.04;
    },
    getWorkBonus: (lvl) => {
      if (lvl >= 10) return 0.08;
      if (lvl >= 5) return 0.06;
      return 0.04;
    },
    getRobProtection: () => 0.05,
    getCooldownRed: () => 0.05
  }
};

const findPetType = (query) => {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return null;
  if (PETS[q]) return PETS[q];
  if (q.includes('dog') || q.includes('pies')) return PETS.pies;
  if (q.includes('cat') || q.includes('kot')) return PETS.kot;
  if (q.includes('dragon') || q.includes('smok')) return PETS.smok;
  return null;
};

module.exports = {
  name: 'zwierzak',
  aliases: ['zwierze', 'zwierzątko', 'pupil', 'pet'],
  pets: PETS,
  async execute(client, message, args) {
    const action = String(args[0] || '').toLowerCase();
    const userId = message.author.id;
    const now = Date.now();

    // Helper: update hunger and happiness degradation
    const processDegradation = (petObj) => {
      if (!petObj) return;
      const lastCheck = petObj.lastDegradationAt || petObj.adoptedAt || now;
      const fourHourChunks = Math.floor((now - lastCheck) / (4 * 3600 * 1000));
      if (fourHourChunks > 0) {
        petObj.hunger = Math.max(0, petObj.hunger - (fourHourChunks * 5));
        petObj.happiness = Math.max(0, petObj.happiness - (fourHourChunks * 5));
        petObj.lastDegradationAt = lastCheck + (fourHourChunks * 4 * 3600 * 1000);

        if (petObj.hunger === 0) {
          if (!petObj.zeroHungerSince) petObj.zeroHungerSince = now;
        } else {
          petObj.zeroHungerSince = null;
        }
      }
    };

    // --- SUBCOMMAND: KUP ---
    if (action === 'kup' || action === 'buy') {
      const typeArg = args[1];
      const petDef = findPetType(typeArg);

      if (!petDef) {
        let err = `❌ Wybierz prawidłowy gatunek zwierzaka!\nDostępne zwierzaki:\n`;
        Object.values(PETS).forEach((p, idx) => {
          err += `${idx + 1}. **${p.name}** — Cena: **${formatCurrency(p.price)}** | Bonus: ${p.desc}\n`;
        });
        err += `Przykład: **!zwierzak kup smok**`;
        await message.reply(err);
        return;
      }

      const result = await withData(store => {
        const user = createUser(userId, store.users);
        if (!store.profiles) store.profiles = {};
        if (!store.profiles.zwierzaki) store.profiles.zwierzaki = {};

        const currentPet = store.profiles.zwierzaki[userId];
        if (currentPet) {
          processDegradation(currentPet);
          if (currentPet.hunger === 0 && currentPet.zeroHungerSince && (now - currentPet.zeroHungerSince >= 36 * 3600 * 1000)) {
            // Pet escaped, clean up
            delete store.profiles.zwierzaki[userId];
          } else {
            const def = PETS[currentPet.type] || { name: 'Zwierzaka' };
            return { error: `❌ Posiadasz już zwierzaka: **${def.name}**!\n💡 Możesz posiadać tylko 1 chowańca jednocześnie.` };
          }
        }

        if (user.balance < petDef.price) {
          return { error: `❌ Brak środków! Cena to **${formatCurrency(petDef.price)}**, a posiadasz **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= petDef.price;
        store.profiles.zwierzaki[userId] = {
          type: petDef.id,
          name: petDef.name,
          level: 1,
          xp: 0,
          hunger: 100,
          happiness: 100,
          lastFed: now,
          lastPlayed: now,
          lastTrained: 0,
          adoptedAt: now,
          lastDegradationAt: now
        };

        return { success: true, petDef, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🎉 Przygarnięto nowego chowańca: **${result.petDef.name}** za **${formatCurrency(result.petDef.price)}**!\n✨ Bonus: **${result.petDef.desc}**\n💡 Pamiętaj, aby go regularnie karmić i trenować!`);
      return;
    }

    // --- SUBCOMMAND: KARM ---
    if (action === 'karm' || action === 'feed') {
      const result = await withData(store => {
        const user = createUser(userId, store.users);
        if (!store.profiles || !store.profiles.zwierzaki || !store.profiles.zwierzaki[userId]) {
          return { error: '❌ Nie posiadasz żadnego zwierzaka!' };
        }

        const pet = store.profiles.zwierzaki[userId];
        processDegradation(pet);

        if (pet.hunger === 0 && pet.zeroHungerSince && (now - pet.zeroHungerSince >= 36 * 3600 * 1000)) {
          delete store.profiles.zwierzaki[userId];
          return { error: '💔 Twój zwierzak uciekł, ponieważ głodował przez ponad 36 godzin!' };
        }

        const cdMs = 45 * 60 * 1000;
        const diff = now - (pet.lastFed || 0);
        if (diff < cdMs) {
          return { error: `⏳ Twój zwierzak jest jeszcze najedzony! Następne karmienie za **${msToReadable(cdMs - diff)}**.` };
        }

        const feedCost = 6000;
        if (user.balance < feedCost) {
          return { error: `❌ Karma kosztuje **${formatCurrency(feedCost)}**, a posiadasz **${formatCurrency(user.balance)}**.` };
        }

        user.balance -= feedCost;
        pet.hunger = Math.min(100, pet.hunger + 25);
        pet.lastFed = now;
        pet.zeroHungerSince = null;

        return { success: true, name: pet.name, hunger: pet.hunger, balance: user.balance };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`🍖 Nakarmiono **${result.name}**! (+25 Głodu -> Obecnie: **${result.hunger}/100**).\n💳 Zapłacono 6,000💰 za karmę.`);
      return;
    }

    // --- SUBCOMMAND: BAW ---
    if (action === 'baw' || action === 'play') {
      const result = await withData(store => {
        if (!store.profiles || !store.profiles.zwierzaki || !store.profiles.zwierzaki[userId]) {
          return { error: '❌ Nie posiadasz żadnego zwierzaka!' };
        }

        const pet = store.profiles.zwierzaki[userId];
        processDegradation(pet);

        const cdMs = 45 * 60 * 1000;
        const diff = now - (pet.lastPlayed || 0);
        if (diff < cdMs) {
          return { error: `⏳ Twój zwierzak odpoczywa po zabawie! Kolejna zabawa za **${msToReadable(cdMs - diff)}**.` };
        }

        pet.happiness = Math.min(100, pet.happiness + 25);
        pet.lastPlayed = now;

        return { success: true, name: pet.name, happiness: pet.happiness };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`⚽ Pobawiono się z **${result.name}**! (+25 Humoru -> Obecnie: **${result.happiness}/100**).`);
      return;
    }

    // --- SUBCOMMAND: TRENING ---
    if (action === 'trening' || action === 'train') {
      const result = await withData(store => {
        if (!store.profiles || !store.profiles.zwierzaki || !store.profiles.zwierzaki[userId]) {
          return { error: '❌ Nie posiadasz żadnego zwierzaka!' };
        }

        const pet = store.profiles.zwierzaki[userId];
        processDegradation(pet);

        if (pet.hunger < 40 || pet.happiness < 40) {
          return { error: `❌ Twój zwierzak jest zbyt głodny lub smutny na trening! Wymagane: min. **40 Głodu** i **40 Humoru** (Obecnie: ${pet.hunger} Głód / ${pet.happiness} Humor).` };
        }

        const cdMs = 2 * 3600 * 1000; // 2h
        const diff = now - (pet.lastTrained || 0);
        if (diff < cdMs) {
          return { error: `⏳ Twój zwierzak jest zmęczony! Następny trening za **${msToReadable(cdMs - diff)}**.` };
        }

        pet.lastTrained = now;
        pet.xp += 20;

        let levelUp = false;
        if (pet.xp >= 100 && pet.level < 10) {
          pet.level += 1;
          pet.xp -= 100;
          levelUp = true;
        }

        return { success: true, name: pet.name, level: pet.level, xp: pet.xp, levelUp };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      let msg = `🎓 Ukończono trening z **${result.name}**! (+20 XP -> **${result.xp}/100 XP**).`;
      if (result.levelUp) {
        msg += `\n🎉 **AWANS!** Twój zwierzak osiągnął **Level ${result.level}**! Jego pasywny buff stał się silniejszy!`;
      }
      await message.reply(msg);
      return;
    }

    // --- SUBCOMMAND: ODDAJ ---
    if (action === 'oddaj' || action === 'abandon') {
      const result = await withData(store => {
        if (!store.profiles || !store.profiles.zwierzaki || !store.profiles.zwierzaki[userId]) {
          return { error: '❌ Nie posiadasz żadnego zwierzaka do oddania!' };
        }

        const name = store.profiles.zwierzaki[userId].name;
        delete store.profiles.zwierzaki[userId];

        return { success: true, name };
      });

      if (result.error) {
        await message.reply(result.error);
        return;
      }

      await message.reply(`💔 Oddano **${result.refundName || result.name}** do schroniska.`);
      return;
    }

    // DEFAULT: SHOW PET STATUS & CATALOG
    const petStatus = await withData(store => {
      if (!store.profiles || !store.profiles.zwierzaki || !store.profiles.zwierzaki[userId]) {
        return null;
      }
      const pet = store.profiles.zwierzaki[userId];
      processDegradation(pet);
      return pet;
    });

    if (petStatus) {
      const petDef = PETS[petStatus.type] || PETS.pies;
      let text = `🐾 **TWÓJ CHOWANIEC: ${petStatus.name}** (Lvl **${petStatus.level}/10**)\n`;
      text += `🍗 Głód: **${petStatus.hunger}/100** | 🎈 Humor: **${petStatus.happiness}/100**\n`;
      text += `⭐ Postęp: **${petStatus.xp}/100 XP** do następnego poziomu\n`;
      text += `✨ Aktywny buff: **${petDef.desc}**\n\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `💡 **!zwierzak karm** — Nakarm pupilka (+25 Głodu, koszt 6k💰)\n`;
      text += `💡 **!zwierzak baw** — Pobaw się z pupilem (+25 Humoru)\n`;
      text += `💡 **!zwierzak trening** — Przetrenuj pupilka (+20 XP, cd 2h)\n`;
      text += `💡 **!zwierzak oddaj** — Oddaj pupilka do schroniska`;
      await message.reply(text);
      return;
    }

    // Offer list
    let list = `🐾 **SALON CHOWAŃCÓW (ZWIERZĄT)**\n`;
    list += `Posiadanie pupila daje potężne pasywne bonusy rozwijane wraz z jego poziomem!\n\n`;
    list += `📋 **Dostępne zwierzaki:**\n`;

    Object.values(PETS).forEach((p, idx) => {
      list += `**${idx + 1}. ${p.name}**\n`;
      list += `   ↳ Cena: **${formatCurrency(p.price)}**\n`;
      list += `   ↳ Bonus pasywny: **${p.desc}**\n\n`;
    });

    list += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    list += `💡 Kup zwierzaka: **!zwierzak kup <pies/kot/smok>**`;
    await message.reply(list);
  }
};
