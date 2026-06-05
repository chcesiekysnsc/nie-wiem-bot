module.exports = {
  name: 'testpv',
  aliases: ['pvtest', 'testpm'],
  async execute(client, message, args) {
    const targetId = message.author.id;
    const targetName = message.author.username || 'Gracz';
    const groupThreadId = message.guild?.id;

    if (!groupThreadId) {
      await message.reply('❌ Tę komendę należy wywołać na czacie grupowym.');
      return;
    }

    await message.reply(`⏳ Próbuję wysłać wiadomość testową na PV do **@${targetName}** (ID: ${targetId})...`);

    client.api.sendMessage(
      `👋 **Hej ${targetName}!** To jest testowa wiadomość prywatna wysłana przez bota.\n\n` +
      `Jeśli to widzisz, oznacza to, że komunikacja PV działa poprawnie! 🎉`,
      targetId,
      async (err, msgInfo) => {
        if (err) {
          console.error(`[TESTPV] Error sending PM to ${targetId}:`, err);
          
          const errMsg = err.error || err.message || JSON.stringify(err);
          let resolutionHint = '';
          
          if (errMsg.includes('Not reachable') || errMsg.includes('1357004')) {
            resolutionHint = '\n\n💡 **Rozwiązanie:** Facebook zablokował dostarczenie wiadomości, ponieważ nie macie się w znajomych lub nigdy nie pisałeś do bota na PV. **Dodaj bota do znajomych i wyślij do niego dowolną wiadomość prywatną**, a następnie spróbuj ponownie!';
          } else if (errMsg.includes('1545003') || errMsg.includes('block')) {
            resolutionHint = '\n\n💡 **Rozwiązanie:** Bot ma tymczasową blokadę funkcji wysyłania wiadomości prywatnych od Facebooka (spam-block/feature-block).';
          }
          
          await client.api.sendMessage(
            `❌ **Nie udało się dostarczyć wiadomości na PV** do **@${targetName}**!\n` +
            `🔴 **Błąd:** \`${errMsg}\`${resolutionHint}`,
            groupThreadId
          );
        } else {
          await client.api.sendMessage(
            `✅ **Wiadomość testowa została pomyślnie wysłana** na PV do **@${targetName}**!\n\n` +
            `Jeśli jej nie widzisz, koniecznie sprawdź folder **Inne / Spam / Wiadomości od nieznajomych (Message Requests)** w aplikacji Messenger!`,
            groupThreadId
          );
        }
      }
    );
  }
};
