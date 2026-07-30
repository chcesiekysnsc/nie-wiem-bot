module.exports = {
  name: 'poradnik',
  aliases: ['guide'],
  async execute(client, message, args) {
    const poradnikText = `*krótkie wprowadzenie*
1. najlepiej się zarabia komendą !work
2. warto kupować paczki w sklepie ponieważ każda paczka zawiera różne itemy które dają różne bonusy (!artefakty)
3. można okradać komendą !rob nawet po id więc nie musi być kogoś na danej grp wystarczy mieć jego id a id jest w linku do konta na fb na google na samym koncu
4. wojny gangów można wywoływać nawet przez nazwę gangu oraz warto przejmować !terytoria oraz !gang skok
5. warto być w topce aby na końcu sezonu dostać eventowe itemy (!eventitemy)
6. warto kupować firmy oraz domy`;

    await message.reply(poradnikText);
  }
};
