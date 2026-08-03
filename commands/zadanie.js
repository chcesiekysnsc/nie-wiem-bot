const { withData, createUser, ensureInventoryRecord } = require('../utils/storage');
const { formatCurrency } = require('../utils/economy');
const { pickChallenge, getActiveChallenge, advanceChallenge, claimChallengeReward } = require('../utils/challenges');

module.exports = {
  name: 'zadanie',
  aliases: ['quest', 'challenge', 'wyzwanie_daily'],
  async execute(client, message, args) {
    const userId = message.author.id;
    const action = String(args[0] || '').toLowerCase();

    const result = await withData(store => {
      const challenge = getActiveChallenge(userId, store);

      if (action === 'postep' || action === 'progress' || action === 'status') {
        if (!challenge) return { status: 'none' };
        const remaining = Math.max(0, challenge.target - challenge.progress);
        const percent = Math.min(100, Math.round((challenge.progress / challenge.target) * 100));
        const timeLeft = challenge.expiresAt - Date.now();
        const hoursLeft = Math.max(0, Math.floor(timeLeft / (1000 * 60 * 60)));
        const minutesLeft = Math.max(0, Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60)));
        return {
          status: 'active',
          label: challenge.label,
          description: challenge.description,
          progress: challenge.progress,
          target: challenge.target,
          percent,
          remaining,
          hoursLeft,
          minutesLeft,
          completed: challenge.completed,
          claimed: challenge.claimed,
          reward: challenge.reward
        };
      }

      if (action === 'nagroda' || action === 'odbierz' || action === 'claim') {
        if (!challenge || !challenge.completed) return { error: '❌ Nie masz ukończonego zadania do odbioru nagrody.' };
        if (challenge.claimed) return { error: '❌ Nagroda za to zadanie została już odebrana.' };
        const rewardResult = claimChallengeReward(userId, store);
        if (!rewardResult) return { error: '❌ Nie udało się odebrać nagrody.' };
        return {
          claimed: true,
          reward: rewardResult.reward,
          label: rewardResult.challenge.label
        };
      }

      if (action === 'nowe' || action === 'new' || action === 'losuj') {
        const now = Date.now();
        const existing = store.profiles.dailyChallenges && store.profiles.dailyChallenges[userId];
        if (existing) {
          if (existing.completed && !existing.claimed) {
            return { error: '❌ Masz ukończone zadanie. Odbierz nagrodę (!zadanie nagroda), aby wziąć nowe.' };
          }
          if (existing.claimed) {
            if (now < existing.nextAvailableAt) {
              const left = existing.nextAvailableAt - now;
              const hoursLeft = Math.max(0, Math.floor(left / (1000 * 60 * 60)));
              const minutesLeft = Math.max(0, Math.floor((left % (1000 * 60 * 60)) / (1000 * 60)));
              return { error: `❌ Musisz poczekać jeszcze ${hoursLeft}h ${minutesLeft}m przed wzięciem nowego zadania.` };
            }
            delete store.profiles.dailyChallenges[userId];
          } else if (existing.expiresAt > now) {
            return { error: '❌ Masz już aktywne zadanie. Poczekaj na jego zakończenie lub porzuć je (!zadanie porzuc).' };
          } else {
            delete store.profiles.dailyChallenges[userId];
          }
        }
      }

      const now = Date.now();
      const existing = store.profiles.dailyChallenges && store.profiles.dailyChallenges[userId];

      if (existing && existing.completed && !existing.claimed) {
        return {
          status: 'active',
          label: existing.label,
          description: existing.description,
          progress: existing.progress,
          target: existing.target,
          percent: 100,
          remaining: 0,
          hoursLeft: 0,
          minutesLeft: 0,
          completed: true,
          claimed: false,
          reward: existing.reward
        };
      }

      if (existing && existing.claimed && now < existing.nextAvailableAt) {
        const left = existing.nextAvailableAt - now;
        const hoursLeft = Math.max(0, Math.floor(left / (1000 * 60 * 60)));
        const minutesLeft = Math.max(0, Math.floor((left % (1000 * 60 * 60)) / (1000 * 60)));
        return { error: `❌ Musisz poczekać jeszcze ${hoursLeft}h ${minutesLeft}m przed wzięciem nowego zadania.` };
      }

      const newChallenge = pickChallenge(userId, store);
      const timeLeft = newChallenge.expiresAt - Date.now();
      const hoursLeft = Math.max(0, Math.floor(timeLeft / (1000 * 60 * 60)));
      const minutesLeft = Math.max(0, Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60)));

      return {
        picked: true,
        label: newChallenge.label,
        description: newChallenge.description,
        target: newChallenge.target,
        progress: newChallenge.progress,
        hoursLeft,
        minutesLeft,
        completed: newChallenge.completed,
        claimed: newChallenge.claimed,
        reward: newChallenge.reward
      };
    });

    if (result.status === 'none') {
      await message.reply('📋 Nie masz aktywnego zadania. Wpisz **!zadanie** aby wziąć nowe.');
      return;
    }

    if (result.error) {
      await message.reply(result.error);
      return;
    }

    if (result.claimed) {
      await message.reply(
        `🎉 Zadanie **${result.label}** ukończone!\n` +
        `Odebrano nagrodę: **${formatCurrency(result.reward)}**`
      );
      return;
    }

    if (result.picked) {
      let reply = `📋 **Nowe zadanie: ${result.label}**\n${result.description}\n` +
        `Nagroda: **${formatCurrency(result.reward)}**\n` +
        `Czas na wykonanie: **${result.hoursLeft}h ${result.minutesLeft}m**\n\n` +
        `Postęp: **${result.progress}/${result.target}** (${Math.min(100, Math.round((result.progress / result.target) * 100))}%)\n\n` +
        `Sprawdz postep: **!zadanie postep**\n` +
        `Odbierz nagrode po ukonczeniu: **!zadanie nagroda**`;
      await message.reply(reply);
      return;
    }

    let reply = `📋 **${result.label}**\n${result.description}\n` +
      `Nagroda: **${formatCurrency(result.reward)}**\n` +
      `Postęp: **${result.progress}/${result.target}** (${result.percent}%)\n` +
      `Pozostalo: **${result.remaining}**\n` +
      `Czas: **${result.hoursLeft}h ${result.minutesLeft}m**\n`;

    if (result.completed) {
      reply += `\n✅ Zadanie ukonczone! Odbierz nagrode: **!zadanie nagroda**`;
    } else {
      reply += `\nWykonuj komendy: !work, !bet, !coinflip, !chickenroad, !blackjack`;
    }

    await message.reply(reply);
  }
};
