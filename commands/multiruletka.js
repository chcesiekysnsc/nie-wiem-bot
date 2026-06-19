const config = require('../config/config');
const {
  ensureInventoryRecord,
  formatCurrency,
  hasItem,
  recordGame,
  refreshBadges,
  getPassiveMultiplier
} = require('../utils/economy');
const { createUser, withData } = require('../utils/storage');

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

module.exports = {
  name: 'multiruletka',
  aliases: ['multi-ruletka', 'mruletka'],
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID;

    if (!client.activeMultiRoulettes) {
      client.activeMultiRoulettes = new Map();
    }

    if (client.activeMultiRoulettes.has(threadId)) {
      await message.reply('❌ W tym wątku trwa już gra w ruletkę wieloosobową! Dołącz, wpisując **!ruletka <stawka> <czerwony/czarny/zielony/parzyste/nieparzyste/0-36>**.');
      return;
    }

    // Inicjalizacja gry
    const game = {
      threadId,
      bets: [],
      endTime: Date.now() + 45000 // 45 sekund
    };

    client.activeMultiRoulettes.set(threadId, game);

    await message.reply(
      `🎡 **RULETKA WIELOOSOBOWA ROZPOCZĘTA!** 🎡\n` +
      `Stół jest otwarty przez **45 sekund**. Dołączcie do gry, obstawiając własną stawkę!\n\n` +
      `👉 Wpisz: **!ruletka <stawka> <czerwony/czarny/zielony/parzyste/nieparzyste/0-36>**`
    );

    // Uruchomienie odliczania (45s)
    setTimeout(async () => {
      // Usuwamy grę z aktywnej mapy, aby nikt nie mógł już stawiać
      client.activeMultiRoulettes.delete(threadId);

      if (game.bets.length === 0) {
        await client.api.sendMessage('🎡 **Ruletka wieloosobowa**: Czas minął! Nikt nie postawił zakładu, gra zostaje anulowana.', threadId);
        return;
      }

      await client.api.sendMessage('🎡 **Krupier zamyka stół! Trwa kręcenie kołem...**', threadId);

      // Symulacja losowania
      setTimeout(async () => {
        try {
          const result = await withData(store => {
            const rand = Math.random();
            let rolledColor;
            let rolledNumber;

            if (rand < 0.01) {
              rolledColor = 'green';
              rolledNumber = 0;
            } else if (rand < 0.505) {
              rolledColor = 'red';
              const reds = Array.from(RED_NUMBERS);
              rolledNumber = reds[Math.floor(Math.random() * reds.length)];
            } else {
              rolledColor = 'black';
              const blacks = [];
              for (let i = 1; i <= 36; i++) {
                if (!RED_NUMBERS.has(i)) {
                  blacks.push(i);
                }
              }
              rolledNumber = blacks[Math.floor(Math.random() * blacks.length)];
            }

            const processedBets = [];
            for (const bet of game.bets) {
              const user = createUser(bet.userId, store.users);
              const inventory = ensureInventoryRecord(store.inventory, bet.userId);

              let won = false;
              let multiplier = 0;

              if (bet.target.type === 'color') {
                won = rolledColor === bet.target.value;
                multiplier = bet.target.value === 'green' ? 36 : 2;
              } else if (bet.target.type === 'parity') {
                won = rolledNumber !== 0 && ((rolledNumber % 2 === 0 && bet.target.value === 'even') || (rolledNumber % 2 === 1 && bet.target.value === 'odd'));
                multiplier = 2;
              } else if (bet.target.type === 'number') {
                won = rolledNumber === bet.target.value;
                multiplier = rolledNumber === 0 ? 18 : 12;
              }

              let badgeSaved = false;
              let szkarlatneOkoSaved = false;
              let ananasSaved = false;
              let kosciRefunded = false;
              let activeBadgeName = '';
              if (!won) {
                let helperChance = 0;
                let badgeChance = 0;
                if (user.badges) {
                  if (user.badges.includes(config.badges.bog)) {
                    badgeChance = 0.015;
                    activeBadgeName = config.badges.bog;
                  } else if (user.badges.includes(config.badges.rekin)) {
                    badgeChance = 0.01;
                    activeBadgeName = config.badges.rekin;
                  } else if (user.badges.includes(config.badges.hazardzista)) {
                    badgeChance = 0.005;
                    activeBadgeName = config.badges.hazardzista;
                  }
                }
                helperChance += badgeChance;
                const hasOko = hasItem(inventory, 'szkarlatne_oko');
                if (hasOko) {
                  helperChance += 0.015;
                }
                const ananasBonus = getPassiveMultiplier(inventory, 'ananas_na_pizzy', 0.02);
                helperChance += ananasBonus;

                let wasRescued = false;
                if (helperChance > 0) {
                  const secondRoll = Math.random();
                  if (secondRoll < helperChance) {
                    won = true;
                    multiplier = bet.target.type === 'color' ? (bet.target.value === 'green' ? 36 : 2) : 2;
                    let current = 0;
                    if (secondRoll < (current += badgeChance)) {
                      badgeSaved = true;
                    } else if (hasOko && secondRoll < (current += 0.015)) {
                      szkarlatneOkoSaved = true;
                    } else if (ananasBonus > 0 && secondRoll < (current += ananasBonus)) {
                      ananasSaved = true;
                    }
                    wasRescued = true;
                  }
                }

                if (!wasRescued) {
                  const kosciBonusPct = getPassiveMultiplier(inventory, 'kosci_oszusta', 0.02);
                  if (kosciBonusPct > 0 && Math.random() < kosciBonusPct) {
                    won = true;
                    multiplier = 1.0;
                    kosciRefunded = true;
                  }
                }
              }

              let payout = won ? (kosciRefunded ? bet.betAmount : bet.betAmount * multiplier) : 0;
              if (won && !kosciRefunded && user.badges && user.badges.includes(config.badges.uzalezniony)) {
                const profit = payout - bet.betAmount;
                if (profit > 0) {
                  payout += Math.round(profit * 0.03);
                }
              }
              user.balance += payout;

              const net = payout - bet.betAmount;
              const xpResult = recordGame(user, net, 25, inventory);
              refreshBadges(user, inventory);

              processedBets.push({
                ...bet,
                won,
                payout,
                net,
                badgeSaved,
                szkarlatneOkoSaved,
                ananasSaved,
                kosciRefunded,
                activeBadgeName,
                newBalance: user.balance,
                xpResult
              });
            }

            return { rolledColor, rolledNumber, processedBets };
          });

          // Prezentacja wyników
          const colorLabel = result.rolledColor === 'red' ? 'Czerwone' : result.rolledColor === 'black' ? 'Czarne' : 'Zielone';
          const rolledEmoji = result.rolledColor === 'red' ? '🔴' : result.rolledColor === 'black' ? '⚫' : '🟢';
          const outcome = `${result.rolledNumber} (${colorLabel})`;

          let replyText = `🎡 **RULETKA WIELOOSOBOWA: WYNIK** 🎡\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🎰 Wylosowano: ${rolledEmoji} **${outcome}**\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📊 **Wyniki graczy:**\n`;

          for (const p of result.processedBets) {
            const winStatus = p.won 
              ? `🎉 **WYGRANA!** (+${formatCurrency(p.net)})` 
              : `❌ **PRZEGRANA** (-${formatCurrency(p.betAmount)})`;
            
            replyText += `👤 **${p.userName}** (typ: ${p.target.label})\n` +
                         `   ↳ Status: ${winStatus}\n` +
                         `   ↳ Balans: ${formatCurrency(p.newBalance)}`;

            if (p.badgeSaved && p.activeBadgeName) {
              replyText += `\n   ↳ 🍀 Odznaka **${p.activeBadgeName}** dała dodatkową szansę i uratowała przed przegraną!`;
            }
            if (p.szkarlatneOkoSaved) {
              replyText += `\n   ↳ 👁️ **Szkarłatne Oko Krupiera** dało dodatkową szansę i uratowało przed przegraną!`;
            }
            if (p.ananasSaved) {
              replyText += `\n   ↳ 🍕 **Ananas na Pizzy** dał dodatkową szansę i uratował przed przegraną!`;
            }
            if (p.kosciRefunded) {
              replyText += `\n   ↳ 🎲 **Kości Oszusta** uratowały przed stratą i zwróciły stawkę!`;
            }
            if (p.xpResult && p.xpResult.leveledUp) {
              replyText += `\n   ↳ 🎉 **AWANS!** Poziom ${p.xpResult.newLevel}!`;
            }
            replyText += '\n\n';
          }

          await client.api.sendMessage(replyText.trim(), threadId);
        } catch (err) {
          console.error('[MULTI-ROULETKA] Blad podczas przetwarzania losowania:', err);
          await client.api.sendMessage('❌ Wystąpił błąd podczas losowania ruletki wieloosobowej.', threadId);
        }
      }, 3000); // 3s na "kręcenie kołem"
    }, 45000); // 45s
  }
};
