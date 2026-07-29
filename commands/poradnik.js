module.exports = {
  name: 'poradnik',
  aliases: ['guide'],
  async execute(client, message, args) {
    const poradnikText = `*keorkie wprwoadzenie*
1. najlepiej sie zarabia komendą work
2. warto upowac paczki w sklepie poniewaz kazda paczka zawiera rozne itemy ktore daja rozne bonusy (!artefakty)
3. mozna okradac komendą !rob nawet po id wiec nie musi byc kogos na danej grp wystarczy miec jego id
4.wojny gngow mozna wywoywac nawet przez nazwe gangu oraz warto przejmowac !trytoria oraz !gang skok
5. warto byc w topce aby na koneic sezonu dsotac eventowe itemy (!eventitemy)
6.warto kuowac firmy oraz domy`;

    await message.reply(poradnikText);
  }
};
