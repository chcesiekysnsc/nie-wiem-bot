const TIKTOK_REGEX = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?tiktok\.com\/[A-Za-z0-9_./?=&-]+/i;
const text = 'Sprawdź ten filmik: https://vm.tiktok.com/ZMYx7Y2wA/ jest super!';
const match = text.match(TIKTOK_REGEX);
console.log('Match:', match);
