const { formatCurrency } = require('../utils/economy');
const config = require('../config/config');

const flagsList = [
  {
    "emoji": "🇦🇨",
    "answers": [
      "ascension island",
      "wyspa wniebowstąpienia",
      "wyspa wniebowstapienia"
    ],
    "name": "Wyspa Wniebowstąpienia",
    "region": "europe_na"
  },
  {
    "emoji": "🇦🇩",
    "answers": [
      "andora"
    ],
    "name": "Andora",
    "region": "europe_na"
  },
  {
    "emoji": "🇦🇪",
    "answers": [
      "zjednoczone emiraty arabskie",
      "zea",
      "emiraty"
    ],
    "name": "Zjednoczone Emiraty Arabskie",
    "region": "sa_asia"
  },
  {
    "emoji": "🇦🇫",
    "answers": [
      "afganistan"
    ],
    "name": "Afganistan",
    "region": "sa_asia"
  },
  {
    "emoji": "🇦🇬",
    "answers": [
      "antigua i barbuda"
    ],
    "name": "Antigua i Barbuda",
    "region": "europe_na"
  },
  {
    "emoji": "🇦🇮",
    "answers": [
      "anguilla"
    ],
    "name": "Anguilla",
    "region": "europe_na"
  },
  {
    "emoji": "🇦🇱",
    "answers": [
      "albania"
    ],
    "name": "Albania",
    "region": "europe_na"
  },
  {
    "emoji": "🇦🇲",
    "answers": [
      "armenia"
    ],
    "name": "Armenia",
    "region": "sa_asia"
  },
  {
    "emoji": "🇦🇴",
    "answers": [
      "angola"
    ],
    "name": "Angola",
    "region": "africa"
  },
  {
    "emoji": "🇦🇶",
    "answers": [
      "antarktyda"
    ],
    "name": "Antarktyda",
    "region": "europe_na"
  },
  {
    "emoji": "🇦🇷",
    "answers": [
      "argentyna"
    ],
    "name": "Argentyna",
    "region": "sa_asia"
  },
  {
    "emoji": "🇦🇸",
    "answers": [
      "samoa amerykańskie"
    ],
    "name": "Samoa Amerykańskie",
    "region": "oceania"
  },
  {
    "emoji": "🇦🇹",
    "answers": [
      "austria"
    ],
    "name": "Austria",
    "region": "europe_na"
  },
  {
    "emoji": "🇦🇺",
    "answers": [
      "australia"
    ],
    "name": "Australia",
    "region": "oceania"
  },
  {
    "emoji": "🇦🇼",
    "answers": [
      "aruba"
    ],
    "name": "Aruba",
    "region": "europe_na"
  },
  {
    "emoji": "🇦🇽",
    "answers": [
      "wyspy alandzkie"
    ],
    "name": "Wyspy Alandzkie",
    "region": "europe_na"
  },
  {
    "emoji": "🇦🇿",
    "answers": [
      "azerbejdżan"
    ],
    "name": "Azerbejdżan",
    "region": "sa_asia"
  },
  {
    "emoji": "🇧🇦",
    "answers": [
      "bośnia i hercegowina"
    ],
    "name": "Bośnia i Hercegowina",
    "region": "europe_na"
  },
  {
    "emoji": "🇧🇧",
    "answers": [
      "barbados"
    ],
    "name": "Barbados",
    "region": "europe_na"
  },
  {
    "emoji": "🇧🇩",
    "answers": [
      "bangladesz"
    ],
    "name": "Bangladesz",
    "region": "sa_asia"
  },
  {
    "emoji": "🇧🇪",
    "answers": [
      "belgia"
    ],
    "name": "Belgia",
    "region": "europe_na"
  },
  {
    "emoji": "🇧🇫",
    "answers": [
      "burkina faso"
    ],
    "name": "Burkina Faso",
    "region": "africa"
  },
  {
    "emoji": "🇧🇬",
    "answers": [
      "bułgaria"
    ],
    "name": "Bułgaria",
    "region": "europe_na"
  },
  {
    "emoji": "🇧🇭",
    "answers": [
      "bahrajn"
    ],
    "name": "Bahrajn",
    "region": "sa_asia"
  },
  {
    "emoji": "🇧🇮",
    "answers": [
      "burundi"
    ],
    "name": "Burundi",
    "region": "africa"
  },
  {
    "emoji": "🇧🇯",
    "answers": [
      "benin"
    ],
    "name": "Benin",
    "region": "africa"
  },
  {
    "emoji": "🇧🇱",
    "answers": [
      "saint-barthélemy"
    ],
    "name": "Saint-Barthélemy",
    "region": "europe_na"
  },
  {
    "emoji": "🇧🇲",
    "answers": [
      "bermudy"
    ],
    "name": "Bermudy",
    "region": "europe_na"
  },
  {
    "emoji": "🇧🇳",
    "answers": [
      "brunei"
    ],
    "name": "Brunei",
    "region": "sa_asia"
  },
  {
    "emoji": "🇧🇴",
    "answers": [
      "boliwia"
    ],
    "name": "Boliwia",
    "region": "sa_asia"
  },
  {
    "emoji": "🇧🇶",
    "answers": [
      "niderlandy karaibskie"
    ],
    "name": "Niderlandy Karaibskie",
    "region": "europe_na"
  },
  {
    "emoji": "🇧🇷",
    "answers": [
      "brazylia"
    ],
    "name": "Brazylia",
    "region": "sa_asia"
  },
  {
    "emoji": "🇧🇸",
    "answers": [
      "bahamy"
    ],
    "name": "Bahamy",
    "region": "europe_na"
  },
  {
    "emoji": "🇧🇹",
    "answers": [
      "bhutan"
    ],
    "name": "Bhutan",
    "region": "sa_asia"
  },
  {
    "emoji": "🇧🇻",
    "answers": [
      "wyspa bouveta"
    ],
    "name": "Wyspa Bouveta",
    "region": "europe_na"
  },
  {
    "emoji": "🇧🇼",
    "answers": [
      "botswana"
    ],
    "name": "Botswana",
    "region": "africa"
  },
  {
    "emoji": "🇧🇾",
    "answers": [
      "białoruś"
    ],
    "name": "Białoruś",
    "region": "europe_na"
  },
  {
    "emoji": "🇧🇿",
    "answers": [
      "belize"
    ],
    "name": "Belize",
    "region": "europe_na"
  },
  {
    "emoji": "🇨🇦",
    "answers": [
      "kanada"
    ],
    "name": "Kanada",
    "region": "europe_na"
  },
  {
    "emoji": "🇨🇨",
    "answers": [
      "wyspy kokosowe"
    ],
    "name": "Wyspy Kokosowe",
    "region": "sa_asia"
  },
  {
    "emoji": "🇨🇩",
    "answers": [
      "demokratyczna republika konga"
    ],
    "name": "Demokratyczna Republika Konga",
    "region": "africa"
  },
  {
    "emoji": "🇨🇫",
    "answers": [
      "republika środkowoafrykańska"
    ],
    "name": "Republika Środkowoafrykańska",
    "region": "africa"
  },
  {
    "emoji": "🇨🇬",
    "answers": [
      "kongo"
    ],
    "name": "Kongo",
    "region": "africa"
  },
  {
    "emoji": "🇨🇭",
    "answers": [
      "szwajcaria"
    ],
    "name": "Szwajcaria",
    "region": "europe_na"
  },
  {
    "emoji": "🇨🇮",
    "answers": [
      "côte d'ivoire",
      "wybrzeże kości słoniowej",
      "wybrzeze kosci sloniowej",
      "wks"
    ],
    "name": "Wybrzeże Kości Słoniowej",
    "region": "africa"
  },
  {
    "emoji": "🇨🇰",
    "answers": [
      "wyspy cooka"
    ],
    "name": "Wyspy Cooka",
    "region": "oceania"
  },
  {
    "emoji": "🇨🇱",
    "answers": [
      "chile"
    ],
    "name": "Chile",
    "region": "sa_asia"
  },
  {
    "emoji": "🇨🇲",
    "answers": [
      "kamerun"
    ],
    "name": "Kamerun",
    "region": "africa"
  },
  {
    "emoji": "🇨🇳",
    "answers": [
      "chiny"
    ],
    "name": "Chiny",
    "region": "sa_asia"
  },
  {
    "emoji": "🇨🇴",
    "answers": [
      "kolumbia"
    ],
    "name": "Kolumbia",
    "region": "sa_asia"
  },
  {
    "emoji": "🇨🇵",
    "answers": [
      "clipperton island",
      "wyspa clipperton",
      "clipperton"
    ],
    "name": "Wyspa Clipperton",
    "region": "europe_na"
  },
  {
    "emoji": "🇨🇷",
    "answers": [
      "kostaryka"
    ],
    "name": "Kostaryka",
    "region": "europe_na"
  },
  {
    "emoji": "🇨🇺",
    "answers": [
      "kuba"
    ],
    "name": "Kuba",
    "region": "europe_na"
  },
  {
    "emoji": "🇨🇻",
    "answers": [
      "republika zielonego przylądka"
    ],
    "name": "Republika Zielonego Przylądka",
    "region": "africa"
  },
  {
    "emoji": "🇨🇼",
    "answers": [
      "curaçao"
    ],
    "name": "Curaçao",
    "region": "europe_na"
  },
  {
    "emoji": "🇨🇽",
    "answers": [
      "wyspa bożego narodzenia"
    ],
    "name": "Wyspa Bożego Narodzenia",
    "region": "sa_asia"
  },
  {
    "emoji": "🇨🇾",
    "answers": [
      "cypr"
    ],
    "name": "Cypr",
    "region": "europe_na"
  },
  {
    "emoji": "🇨🇿",
    "answers": [
      "czechy"
    ],
    "name": "Czechy",
    "region": "europe_na"
  },
  {
    "emoji": "🇩🇪",
    "answers": [
      "niemcy"
    ],
    "name": "Niemcy",
    "region": "europe_na"
  },
  {
    "emoji": "🇩🇬",
    "answers": [
      "diego garcia"
    ],
    "name": "Diego Garcia",
    "region": "europe_na"
  },
  {
    "emoji": "🇩🇯",
    "answers": [
      "dżibuti"
    ],
    "name": "Dżibuti",
    "region": "africa"
  },
  {
    "emoji": "🇩🇰",
    "answers": [
      "dania"
    ],
    "name": "Dania",
    "region": "europe_na"
  },
  {
    "emoji": "🇩🇲",
    "answers": [
      "dominika"
    ],
    "name": "Dominika",
    "region": "europe_na"
  },
  {
    "emoji": "🇩🇴",
    "answers": [
      "dominikana"
    ],
    "name": "Dominikana",
    "region": "europe_na"
  },
  {
    "emoji": "🇩🇿",
    "answers": [
      "algieria"
    ],
    "name": "Algieria",
    "region": "africa"
  },
  {
    "emoji": "🇪🇦",
    "answers": [
      "ceuta & melilla"
    ],
    "name": "Ceuta & Melilla",
    "region": "europe_na"
  },
  {
    "emoji": "🇪🇨",
    "answers": [
      "ekwador"
    ],
    "name": "Ekwador",
    "region": "sa_asia"
  },
  {
    "emoji": "🇪🇪",
    "answers": [
      "estonia"
    ],
    "name": "Estonia",
    "region": "europe_na"
  },
  {
    "emoji": "🇪🇬",
    "answers": [
      "egipt"
    ],
    "name": "Egipt",
    "region": "africa"
  },
  {
    "emoji": "🇪🇭",
    "answers": [
      "sahara zachodnia"
    ],
    "name": "Sahara Zachodnia",
    "region": "africa"
  },
  {
    "emoji": "🇪🇷",
    "answers": [
      "erytrea"
    ],
    "name": "Erytrea",
    "region": "africa"
  },
  {
    "emoji": "🇪🇸",
    "answers": [
      "hiszpania"
    ],
    "name": "Hiszpania",
    "region": "europe_na"
  },
  {
    "emoji": "🇪🇹",
    "answers": [
      "etiopia"
    ],
    "name": "Etiopia",
    "region": "africa"
  },
  {
    "emoji": "🇪🇺",
    "answers": [
      "european union",
      "unia europejska",
      "ue"
    ],
    "name": "Unia Europejska",
    "region": "europe_na"
  },
  {
    "emoji": "🇫🇮",
    "answers": [
      "finlandia"
    ],
    "name": "Finlandia",
    "region": "europe_na"
  },
  {
    "emoji": "🇫🇯",
    "answers": [
      "fidżi"
    ],
    "name": "Fidżi",
    "region": "oceania"
  },
  {
    "emoji": "🇫🇰",
    "answers": [
      "falklandy"
    ],
    "name": "Falklandy",
    "region": "sa_asia"
  },
  {
    "emoji": "🇫🇲",
    "answers": [
      "mikronezja"
    ],
    "name": "Mikronezja",
    "region": "oceania"
  },
  {
    "emoji": "🇫🇴",
    "answers": [
      "wyspy owcze"
    ],
    "name": "Wyspy Owcze",
    "region": "europe_na"
  },
  {
    "emoji": "🇫🇷",
    "answers": [
      "francja"
    ],
    "name": "Francja",
    "region": "europe_na"
  },
  {
    "emoji": "🇬🇦",
    "answers": [
      "gabon"
    ],
    "name": "Gabon",
    "region": "africa"
  },
  {
    "emoji": "🇬🇧",
    "answers": [
      "wielka brytania",
      "anglia",
      "uk"
    ],
    "name": "Wielka Brytania",
    "region": "europe_na"
  },
  {
    "emoji": "🇬🇩",
    "answers": [
      "grenada"
    ],
    "name": "Grenada",
    "region": "europe_na"
  },
  {
    "emoji": "🇬🇪",
    "answers": [
      "gruzja"
    ],
    "name": "Gruzja",
    "region": "sa_asia"
  },
  {
    "emoji": "🇬🇫",
    "answers": [
      "gujana francuska"
    ],
    "name": "Gujana Francuska",
    "region": "sa_asia"
  },
  {
    "emoji": "🇬🇬",
    "answers": [
      "guernsey"
    ],
    "name": "Guernsey",
    "region": "europe_na"
  },
  {
    "emoji": "🇬🇭",
    "answers": [
      "ghana"
    ],
    "name": "Ghana",
    "region": "africa"
  },
  {
    "emoji": "🇬🇮",
    "answers": [
      "gibraltar"
    ],
    "name": "Gibraltar",
    "region": "europe_na"
  },
  {
    "emoji": "🇬🇱",
    "answers": [
      "grenlandia"
    ],
    "name": "Grenlandia",
    "region": "europe_na"
  },
  {
    "emoji": "🇬🇲",
    "answers": [
      "gambia"
    ],
    "name": "Gambia",
    "region": "africa"
  },
  {
    "emoji": "🇬🇳",
    "answers": [
      "gwinea"
    ],
    "name": "Gwinea",
    "region": "africa"
  },
  {
    "emoji": "🇬🇵",
    "answers": [
      "gwadelupa"
    ],
    "name": "Gwadelupa",
    "region": "europe_na"
  },
  {
    "emoji": "🇬🇶",
    "answers": [
      "gwinea równikowa"
    ],
    "name": "Gwinea Równikowa",
    "region": "africa"
  },
  {
    "emoji": "🇬🇷",
    "answers": [
      "grecja"
    ],
    "name": "Grecja",
    "region": "europe_na"
  },
  {
    "emoji": "🇬🇸",
    "answers": [
      "georgia południowa i sandwich południowy"
    ],
    "name": "Georgia Południowa i Sandwich Południowy",
    "region": "europe_na"
  },
  {
    "emoji": "🇬🇹",
    "answers": [
      "gwatemala"
    ],
    "name": "Gwatemala",
    "region": "europe_na"
  },
  {
    "emoji": "🇬🇺",
    "answers": [
      "guam"
    ],
    "name": "Guam",
    "region": "oceania"
  },
  {
    "emoji": "🇬🇼",
    "answers": [
      "gwinea bissau"
    ],
    "name": "Gwinea Bissau",
    "region": "africa"
  },
  {
    "emoji": "🇬🇾",
    "answers": [
      "gujana"
    ],
    "name": "Gujana",
    "region": "sa_asia"
  },
  {
    "emoji": "🇭🇰",
    "answers": [
      "sra hongkong (chiny)",
      "hongkong",
      "hong kong"
    ],
    "name": "Hongkong",
    "region": "sa_asia"
  },
  {
    "emoji": "🇭🇲",
    "answers": [
      "wyspy heard i mcdonalda"
    ],
    "name": "Wyspy Heard i McDonalda",
    "region": "europe_na"
  },
  {
    "emoji": "🇭🇳",
    "answers": [
      "honduras"
    ],
    "name": "Honduras",
    "region": "europe_na"
  },
  {
    "emoji": "🇭🇷",
    "answers": [
      "chorwacja"
    ],
    "name": "Chorwacja",
    "region": "europe_na"
  },
  {
    "emoji": "🇭🇹",
    "answers": [
      "haiti"
    ],
    "name": "Haiti",
    "region": "europe_na"
  },
  {
    "emoji": "🇭🇺",
    "answers": [
      "węgry"
    ],
    "name": "Węgry",
    "region": "europe_na"
  },
  {
    "emoji": "🇮🇨",
    "answers": [
      "canary islands",
      "wyspy kanaryjskie",
      "kanary"
    ],
    "name": "Wyspy Kanaryjskie",
    "region": "europe_na"
  },
  {
    "emoji": "🇮🇩",
    "answers": [
      "indonezja"
    ],
    "name": "Indonezja",
    "region": "sa_asia"
  },
  {
    "emoji": "🇮🇪",
    "answers": [
      "irlandia"
    ],
    "name": "Irlandia",
    "region": "europe_na"
  },
  {
    "emoji": "🇮🇱",
    "answers": [
      "izrael"
    ],
    "name": "Izrael",
    "region": "sa_asia"
  },
  {
    "emoji": "🇮🇲",
    "answers": [
      "wyspa man"
    ],
    "name": "Wyspa Man",
    "region": "europe_na"
  },
  {
    "emoji": "🇮🇳",
    "answers": [
      "indie"
    ],
    "name": "Indie",
    "region": "sa_asia"
  },
  {
    "emoji": "🇮🇴",
    "answers": [
      "brytyjskie terytorium oceanu indyjskiego"
    ],
    "name": "Brytyjskie Terytorium Oceanu Indyjskiego",
    "region": "sa_asia"
  },
  {
    "emoji": "🇮🇶",
    "answers": [
      "irak"
    ],
    "name": "Irak",
    "region": "sa_asia"
  },
  {
    "emoji": "🇮🇷",
    "answers": [
      "iran"
    ],
    "name": "Iran",
    "region": "sa_asia"
  },
  {
    "emoji": "🇮🇸",
    "answers": [
      "islandia"
    ],
    "name": "Islandia",
    "region": "europe_na"
  },
  {
    "emoji": "🇮🇹",
    "answers": [
      "włochy"
    ],
    "name": "Włochy",
    "region": "europe_na"
  },
  {
    "emoji": "🇯🇪",
    "answers": [
      "jersey"
    ],
    "name": "Jersey",
    "region": "europe_na"
  },
  {
    "emoji": "🇯🇲",
    "answers": [
      "jamajka"
    ],
    "name": "Jamajka",
    "region": "europe_na"
  },
  {
    "emoji": "🇯🇴",
    "answers": [
      "jordania"
    ],
    "name": "Jordania",
    "region": "sa_asia"
  },
  {
    "emoji": "🇯🇵",
    "answers": [
      "japonia"
    ],
    "name": "Japonia",
    "region": "sa_asia"
  },
  {
    "emoji": "🇰🇪",
    "answers": [
      "kenia"
    ],
    "name": "Kenia",
    "region": "africa"
  },
  {
    "emoji": "🇰🇬",
    "answers": [
      "kirgistan"
    ],
    "name": "Kirgistan",
    "region": "sa_asia"
  },
  {
    "emoji": "🇰🇭",
    "answers": [
      "kambodża"
    ],
    "name": "Kambodża",
    "region": "sa_asia"
  },
  {
    "emoji": "🇰🇮",
    "answers": [
      "kiribati"
    ],
    "name": "Kiribati",
    "region": "oceania"
  },
  {
    "emoji": "🇰🇲",
    "answers": [
      "komory"
    ],
    "name": "Komory",
    "region": "africa"
  },
  {
    "emoji": "🇰🇳",
    "answers": [
      "saint kitts i nevis"
    ],
    "name": "Saint Kitts i Nevis",
    "region": "europe_na"
  },
  {
    "emoji": "🇰🇵",
    "answers": [
      "korea północna"
    ],
    "name": "Korea Północna",
    "region": "sa_asia"
  },
  {
    "emoji": "🇰🇷",
    "answers": [
      "korea południowa"
    ],
    "name": "Korea Południowa",
    "region": "sa_asia"
  },
  {
    "emoji": "🇰🇼",
    "answers": [
      "kuwejt"
    ],
    "name": "Kuwejt",
    "region": "sa_asia"
  },
  {
    "emoji": "🇰🇾",
    "answers": [
      "kajmany"
    ],
    "name": "Kajmany",
    "region": "europe_na"
  },
  {
    "emoji": "🇰🇿",
    "answers": [
      "kazachstan"
    ],
    "name": "Kazachstan",
    "region": "sa_asia"
  },
  {
    "emoji": "🇱🇦",
    "answers": [
      "laos"
    ],
    "name": "Laos",
    "region": "sa_asia"
  },
  {
    "emoji": "🇱🇧",
    "answers": [
      "liban"
    ],
    "name": "Liban",
    "region": "sa_asia"
  },
  {
    "emoji": "🇱🇨",
    "answers": [
      "saint lucia",
      "święta łucja",
      "swieta lucja"
    ],
    "name": "Saint Lucia",
    "region": "europe_na"
  },
  {
    "emoji": "🇱🇮",
    "answers": [
      "liechtenstein"
    ],
    "name": "Liechtenstein",
    "region": "europe_na"
  },
  {
    "emoji": "🇱🇰",
    "answers": [
      "sri lanka"
    ],
    "name": "Sri Lanka",
    "region": "sa_asia"
  },
  {
    "emoji": "🇱🇷",
    "answers": [
      "liberia"
    ],
    "name": "Liberia",
    "region": "africa"
  },
  {
    "emoji": "🇱🇸",
    "answers": [
      "lesotho"
    ],
    "name": "Lesotho",
    "region": "africa"
  },
  {
    "emoji": "🇱🇹",
    "answers": [
      "litwa"
    ],
    "name": "Litwa",
    "region": "europe_na"
  },
  {
    "emoji": "🇱🇺",
    "answers": [
      "luksemburg"
    ],
    "name": "Luksemburg",
    "region": "europe_na"
  },
  {
    "emoji": "🇱🇻",
    "answers": [
      "łotwa"
    ],
    "name": "Łotwa",
    "region": "europe_na"
  },
  {
    "emoji": "🇱🇾",
    "answers": [
      "libia"
    ],
    "name": "Libia",
    "region": "africa"
  },
  {
    "emoji": "🇲🇦",
    "answers": [
      "maroko"
    ],
    "name": "Maroko",
    "region": "africa"
  },
  {
    "emoji": "🇲🇨",
    "answers": [
      "monako"
    ],
    "name": "Monako",
    "region": "europe_na"
  },
  {
    "emoji": "🇲🇩",
    "answers": [
      "mołdawia"
    ],
    "name": "Mołdawia",
    "region": "europe_na"
  },
  {
    "emoji": "🇲🇪",
    "answers": [
      "czarnogóra"
    ],
    "name": "Czarnogóra",
    "region": "europe_na"
  },
  {
    "emoji": "🇲🇫",
    "answers": [
      "saint-martin"
    ],
    "name": "Saint-Martin",
    "region": "europe_na"
  },
  {
    "emoji": "🇲🇬",
    "answers": [
      "madagaskar"
    ],
    "name": "Madagaskar",
    "region": "africa"
  },
  {
    "emoji": "🇲🇭",
    "answers": [
      "wyspy marshalla"
    ],
    "name": "Wyspy Marshalla",
    "region": "oceania"
  },
  {
    "emoji": "🇲🇰",
    "answers": [
      "macedonia północna"
    ],
    "name": "Macedonia Północna",
    "region": "europe_na"
  },
  {
    "emoji": "🇲🇱",
    "answers": [
      "mali"
    ],
    "name": "Mali",
    "region": "africa"
  },
  {
    "emoji": "🇲🇲",
    "answers": [
      "mjanma (birma)"
    ],
    "name": "Mjanma (Birma)",
    "region": "sa_asia"
  },
  {
    "emoji": "🇲🇳",
    "answers": [
      "mongolia"
    ],
    "name": "Mongolia",
    "region": "sa_asia"
  },
  {
    "emoji": "🇲🇴",
    "answers": [
      "sra makau (chiny)",
      "makau",
      "macao"
    ],
    "name": "Makau",
    "region": "sa_asia"
  },
  {
    "emoji": "🇲🇵",
    "answers": [
      "mariany północne"
    ],
    "name": "Mariany Północne",
    "region": "oceania"
  },
  {
    "emoji": "🇲🇶",
    "answers": [
      "martynika"
    ],
    "name": "Martynika",
    "region": "europe_na"
  },
  {
    "emoji": "🇲🇷",
    "answers": [
      "mauretania"
    ],
    "name": "Mauretania",
    "region": "africa"
  },
  {
    "emoji": "🇲🇸",
    "answers": [
      "montserrat"
    ],
    "name": "Montserrat",
    "region": "europe_na"
  },
  {
    "emoji": "🇲🇹",
    "answers": [
      "malta"
    ],
    "name": "Malta",
    "region": "europe_na"
  },
  {
    "emoji": "🇲🇺",
    "answers": [
      "mauritius"
    ],
    "name": "Mauritius",
    "region": "africa"
  },
  {
    "emoji": "🇲🇻",
    "answers": [
      "malediwy"
    ],
    "name": "Malediwy",
    "region": "sa_asia"
  },
  {
    "emoji": "🇲🇼",
    "answers": [
      "malawi"
    ],
    "name": "Malawi",
    "region": "africa"
  },
  {
    "emoji": "🇲🇽",
    "answers": [
      "meksyk"
    ],
    "name": "Meksyk",
    "region": "europe_na"
  },
  {
    "emoji": "🇲🇾",
    "answers": [
      "malezja"
    ],
    "name": "Malezja",
    "region": "sa_asia"
  },
  {
    "emoji": "🇲🇿",
    "answers": [
      "mozambik"
    ],
    "name": "Mozambik",
    "region": "africa"
  },
  {
    "emoji": "🇳🇦",
    "answers": [
      "namibia"
    ],
    "name": "Namibia",
    "region": "africa"
  },
  {
    "emoji": "🇳🇨",
    "answers": [
      "nowa kaledonia"
    ],
    "name": "Nowa Kaledonia",
    "region": "oceania"
  },
  {
    "emoji": "🇳🇪",
    "answers": [
      "niger"
    ],
    "name": "Niger",
    "region": "africa"
  },
  {
    "emoji": "🇳🇫",
    "answers": [
      "norfolk",
      "wyspa norfolk"
    ],
    "name": "Wyspa Norfolk",
    "region": "oceania"
  },
  {
    "emoji": "🇳🇬",
    "answers": [
      "nigeria"
    ],
    "name": "Nigeria",
    "region": "africa"
  },
  {
    "emoji": "🇳🇮",
    "answers": [
      "nikaragua"
    ],
    "name": "Nikaragua",
    "region": "europe_na"
  },
  {
    "emoji": "🇳🇱",
    "answers": [
      "holandia"
    ],
    "name": "Holandia",
    "region": "europe_na"
  },
  {
    "emoji": "🇳🇴",
    "answers": [
      "norwegia"
    ],
    "name": "Norwegia",
    "region": "europe_na"
  },
  {
    "emoji": "🇳🇵",
    "answers": [
      "nepal"
    ],
    "name": "Nepal",
    "region": "sa_asia"
  },
  {
    "emoji": "🇳🇷",
    "answers": [
      "nauru"
    ],
    "name": "Nauru",
    "region": "oceania"
  },
  {
    "emoji": "🇳🇺",
    "answers": [
      "niue"
    ],
    "name": "Niue",
    "region": "oceania"
  },
  {
    "emoji": "🇳🇿",
    "answers": [
      "nowa zelandia"
    ],
    "name": "Nowa Zelandia",
    "region": "oceania"
  },
  {
    "emoji": "🇴🇲",
    "answers": [
      "oman"
    ],
    "name": "Oman",
    "region": "sa_asia"
  },
  {
    "emoji": "🇵🇦",
    "answers": [
      "panama"
    ],
    "name": "Panama",
    "region": "europe_na"
  },
  {
    "emoji": "🇵🇪",
    "answers": [
      "peru"
    ],
    "name": "Peru",
    "region": "sa_asia"
  },
  {
    "emoji": "🇵🇫",
    "answers": [
      "polinezja francuska"
    ],
    "name": "Polinezja Francuska",
    "region": "oceania"
  },
  {
    "emoji": "🇵🇬",
    "answers": [
      "papua-nowa gwinea"
    ],
    "name": "Papua-Nowa Gwinea",
    "region": "oceania"
  },
  {
    "emoji": "🇵🇭",
    "answers": [
      "filipiny"
    ],
    "name": "Filipiny",
    "region": "sa_asia"
  },
  {
    "emoji": "🇵🇰",
    "answers": [
      "pakistan"
    ],
    "name": "Pakistan",
    "region": "sa_asia"
  },
  {
    "emoji": "🇵🇱",
    "answers": [
      "polska"
    ],
    "name": "Polska",
    "region": "europe_na"
  },
  {
    "emoji": "🇵🇲",
    "answers": [
      "saint-pierre i miquelon"
    ],
    "name": "Saint-Pierre i Miquelon",
    "region": "europe_na"
  },
  {
    "emoji": "🇵🇳",
    "answers": [
      "pitcairn",
      "wyspy pitcairn"
    ],
    "name": "Wyspy Pitcairn",
    "region": "oceania"
  },
  {
    "emoji": "🇵🇷",
    "answers": [
      "portoryko"
    ],
    "name": "Portoryko",
    "region": "europe_na"
  },
  {
    "emoji": "🇵🇸",
    "answers": [
      "terytoria palestyńskie"
    ],
    "name": "Terytoria Palestyńskie",
    "region": "sa_asia"
  },
  {
    "emoji": "🇵🇹",
    "answers": [
      "portugalia"
    ],
    "name": "Portugalia",
    "region": "europe_na"
  },
  {
    "emoji": "🇵🇼",
    "answers": [
      "palau"
    ],
    "name": "Palau",
    "region": "oceania"
  },
  {
    "emoji": "🇵🇾",
    "answers": [
      "paragwaj"
    ],
    "name": "Paragwaj",
    "region": "sa_asia"
  },
  {
    "emoji": "🇶🇦",
    "answers": [
      "katar"
    ],
    "name": "Katar",
    "region": "sa_asia"
  },
  {
    "emoji": "🇷🇪",
    "answers": [
      "reunion"
    ],
    "name": "Reunion",
    "region": "africa"
  },
  {
    "emoji": "🇷🇴",
    "answers": [
      "rumunia"
    ],
    "name": "Rumunia",
    "region": "europe_na"
  },
  {
    "emoji": "🇷🇸",
    "answers": [
      "serbia"
    ],
    "name": "Serbia",
    "region": "europe_na"
  },
  {
    "emoji": "🇷🇺",
    "answers": [
      "rosja"
    ],
    "name": "Rosja",
    "region": "europe_na"
  },
  {
    "emoji": "🇷🇼",
    "answers": [
      "rwanda"
    ],
    "name": "Rwanda",
    "region": "africa"
  },
  {
    "emoji": "🇸🇦",
    "answers": [
      "arabia saudyjska"
    ],
    "name": "Arabia Saudyjska",
    "region": "sa_asia"
  },
  {
    "emoji": "🇸🇧",
    "answers": [
      "wyspy salomona"
    ],
    "name": "Wyspy Salomona",
    "region": "oceania"
  },
  {
    "emoji": "🇸🇨",
    "answers": [
      "seszele"
    ],
    "name": "Seszele",
    "region": "africa"
  },
  {
    "emoji": "🇸🇩",
    "answers": [
      "sudan"
    ],
    "name": "Sudan",
    "region": "africa"
  },
  {
    "emoji": "🇸🇪",
    "answers": [
      "szwecja"
    ],
    "name": "Szwecja",
    "region": "europe_na"
  },
  {
    "emoji": "🇸🇬",
    "answers": [
      "singapur"
    ],
    "name": "Singapur",
    "region": "sa_asia"
  },
  {
    "emoji": "🇸🇭",
    "answers": [
      "wyspa świętej heleny"
    ],
    "name": "Wyspa Świętej Heleny",
    "region": "africa"
  },
  {
    "emoji": "🇸🇮",
    "answers": [
      "słowenia"
    ],
    "name": "Słowenia",
    "region": "europe_na"
  },
  {
    "emoji": "🇸🇯",
    "answers": [
      "svalbard i jan mayen"
    ],
    "name": "Svalbard i Jan Mayen",
    "region": "europe_na"
  },
  {
    "emoji": "🇸🇰",
    "answers": [
      "słowacja"
    ],
    "name": "Słowacja",
    "region": "europe_na"
  },
  {
    "emoji": "🇸🇱",
    "answers": [
      "sierra leone"
    ],
    "name": "Sierra Leone",
    "region": "africa"
  },
  {
    "emoji": "🇸🇲",
    "answers": [
      "san marino"
    ],
    "name": "San Marino",
    "region": "europe_na"
  },
  {
    "emoji": "🇸🇳",
    "answers": [
      "senegal"
    ],
    "name": "Senegal",
    "region": "africa"
  },
  {
    "emoji": "🇸🇴",
    "answers": [
      "somalia"
    ],
    "name": "Somalia",
    "region": "africa"
  },
  {
    "emoji": "🇸🇷",
    "answers": [
      "surinam"
    ],
    "name": "Surinam",
    "region": "sa_asia"
  },
  {
    "emoji": "🇸🇸",
    "answers": [
      "sudan południowy"
    ],
    "name": "Sudan Południowy",
    "region": "africa"
  },
  {
    "emoji": "🇸🇹",
    "answers": [
      "wyspy świętego tomasza i książęca"
    ],
    "name": "Wyspy Świętego Tomasza i Książęca",
    "region": "africa"
  },
  {
    "emoji": "🇸🇻",
    "answers": [
      "salwador"
    ],
    "name": "Salwador",
    "region": "europe_na"
  },
  {
    "emoji": "🇸🇽",
    "answers": [
      "sint maarten"
    ],
    "name": "Sint Maarten",
    "region": "europe_na"
  },
  {
    "emoji": "🇸🇾",
    "answers": [
      "syria"
    ],
    "name": "Syria",
    "region": "sa_asia"
  },
  {
    "emoji": "🇸🇿",
    "answers": [
      "eswatini"
    ],
    "name": "Eswatini",
    "region": "africa"
  },
  {
    "emoji": "🇹🇦",
    "answers": [
      "tristan da cunha"
    ],
    "name": "Tristan da Cunha",
    "region": "europe_na"
  },
  {
    "emoji": "🇹🇨",
    "answers": [
      "turks i caicos"
    ],
    "name": "Turks i Caicos",
    "region": "europe_na"
  },
  {
    "emoji": "🇹🇩",
    "answers": [
      "czad"
    ],
    "name": "Czad",
    "region": "africa"
  },
  {
    "emoji": "🇹🇫",
    "answers": [
      "francuskie terytoria południowe i antarktyczne"
    ],
    "name": "Francuskie Terytoria Południowe i Antarktyczne",
    "region": "europe_na"
  },
  {
    "emoji": "🇹🇬",
    "answers": [
      "togo"
    ],
    "name": "Togo",
    "region": "africa"
  },
  {
    "emoji": "🇹🇭",
    "answers": [
      "tajlandia"
    ],
    "name": "Tajlandia",
    "region": "sa_asia"
  },
  {
    "emoji": "🇹🇯",
    "answers": [
      "tadżykistan"
    ],
    "name": "Tadżykistan",
    "region": "sa_asia"
  },
  {
    "emoji": "🇹🇰",
    "answers": [
      "tokelau"
    ],
    "name": "Tokelau",
    "region": "oceania"
  },
  {
    "emoji": "🇹🇱",
    "answers": [
      "timor wschodni"
    ],
    "name": "Timor Wschodni",
    "region": "oceania"
  },
  {
    "emoji": "🇹🇲",
    "answers": [
      "turkmenistan"
    ],
    "name": "Turkmenistan",
    "region": "sa_asia"
  },
  {
    "emoji": "🇹🇳",
    "answers": [
      "tunezja"
    ],
    "name": "Tunezja",
    "region": "africa"
  },
  {
    "emoji": "🇹🇴",
    "answers": [
      "tonga"
    ],
    "name": "Tonga",
    "region": "oceania"
  },
  {
    "emoji": "🇹🇷",
    "answers": [
      "turcja"
    ],
    "name": "Turcja",
    "region": "sa_asia"
  },
  {
    "emoji": "🇹🇹",
    "answers": [
      "trynidad i tobago"
    ],
    "name": "Trynidad i Tobago",
    "region": "europe_na"
  },
  {
    "emoji": "🇹🇻",
    "answers": [
      "tuvalu"
    ],
    "name": "Tuvalu",
    "region": "oceania"
  },
  {
    "emoji": "🇹🇼",
    "answers": [
      "tajwan"
    ],
    "name": "Tajwan",
    "region": "sa_asia"
  },
  {
    "emoji": "🇹🇿",
    "answers": [
      "tanzania"
    ],
    "name": "Tanzania",
    "region": "africa"
  },
  {
    "emoji": "🇺🇦",
    "answers": [
      "ukraina"
    ],
    "name": "Ukraina",
    "region": "europe_na"
  },
  {
    "emoji": "🇺🇬",
    "answers": [
      "uganda"
    ],
    "name": "Uganda",
    "region": "africa"
  },
  {
    "emoji": "🇺🇲",
    "answers": [
      "dalekie wyspy mniejsze stanów zjednoczonych"
    ],
    "name": "Dalekie Wyspy Mniejsze Stanów Zjednoczonych",
    "region": "oceania"
  },
  {
    "emoji": "🇺🇳",
    "answers": [
      "united nations",
      "narody zjednoczone",
      "onz",
      "organizacja narodów zjednoczonych"
    ],
    "name": "Narody Zjednoczone (ONZ)",
    "region": "europe_na"
  },
  {
    "emoji": "🇺🇸",
    "answers": [
      "stany zjednoczone",
      "usa",
      "ameryka"
    ],
    "name": "Stany Zjednoczone",
    "region": "europe_na"
  },
  {
    "emoji": "🇺🇾",
    "answers": [
      "urugwaj"
    ],
    "name": "Urugwaj",
    "region": "sa_asia"
  },
  {
    "emoji": "🇺🇿",
    "answers": [
      "uzbekistan"
    ],
    "name": "Uzbekistan",
    "region": "sa_asia"
  },
  {
    "emoji": "🇻🇦",
    "answers": [
      "watykan"
    ],
    "name": "Watykan",
    "region": "europe_na"
  },
  {
    "emoji": "🇻🇨",
    "answers": [
      "saint vincent i grenadyny"
    ],
    "name": "Saint Vincent i Grenadyny",
    "region": "europe_na"
  },
  {
    "emoji": "🇻🇪",
    "answers": [
      "wenezuela"
    ],
    "name": "Wenezuela",
    "region": "sa_asia"
  },
  {
    "emoji": "🇻🇬",
    "answers": [
      "brytyjskie wyspy dziewicze"
    ],
    "name": "Brytyjskie Wyspy Dziewicze",
    "region": "europe_na"
  },
  {
    "emoji": "🇻🇮",
    "answers": [
      "wyspy dziewicze stanów zjednoczonych"
    ],
    "name": "Wyspy Dziewicze Stanów Zjednoczonych",
    "region": "europe_na"
  },
  {
    "emoji": "🇻🇳",
    "answers": [
      "wietnam"
    ],
    "name": "Wietnam",
    "region": "sa_asia"
  },
  {
    "emoji": "🇻🇺",
    "answers": [
      "vanuatu"
    ],
    "name": "Vanuatu",
    "region": "oceania"
  },
  {
    "emoji": "🇼🇫",
    "answers": [
      "wallis i futuna"
    ],
    "name": "Wallis i Futuna",
    "region": "oceania"
  },
  {
    "emoji": "🇼🇸",
    "answers": [
      "samoa"
    ],
    "name": "Samoa",
    "region": "oceania"
  },
  {
    "emoji": "🇽🇰",
    "answers": [
      "kosovo"
    ],
    "name": "Kosovo",
    "region": "europe_na"
  },
  {
    "emoji": "🇾🇪",
    "answers": [
      "jemen"
    ],
    "name": "Jemen",
    "region": "sa_asia"
  },
  {
    "emoji": "🇾🇹",
    "answers": [
      "majotta"
    ],
    "name": "Majotta",
    "region": "africa"
  },
  {
    "emoji": "🇿🇦",
    "answers": [
      "republika południowej afryki"
    ],
    "name": "Republika Południowej Afryki",
    "region": "africa"
  },
  {
    "emoji": "🇿🇲",
    "answers": [
      "zambia"
    ],
    "name": "Zambia",
    "region": "africa"
  },
  {
    "emoji": "🇿🇼",
    "answers": [
      "zimbabwe"
    ],
    "name": "Zimbabwe",
    "region": "africa"
  },
  {
    "emoji": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "answers": [
      "england",
      "anglia"
    ],
    "name": "Anglia",
    "region": "europe_na"
  },
  {
    "emoji": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    "answers": [
      "scotland",
      "szkocja"
    ],
    "name": "Szkocja",
    "region": "europe_na"
  },
  {
    "emoji": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    "answers": [
      "wales",
      "walia"
    ],
    "name": "Walia",
    "region": "europe_na"
  }
];

const insaneEmojis = new Set([
  "🇦🇶", "🇦🇽", "🇧🇱", "🇲🇫", "🇵🇲", "🇬🇸", "🇸🇯", "🇸🇭", "🇬🇬", "🇯🇪", "🇮🇲", "🇫🇴",
  "🇬🇱", "🇳🇨", "🇷🇪", "🇬🇵", "🇦🇸", "🇲🇵", "🇻🇮", "🇬🇺", "🇨🇨", "🇹🇨", "🇦🇮", "🇰🇾",
  "🇲🇸", "🇻🇬", "🇫🇰", "🇹🇰", "🇳🇺", "🇼🇸", "🇸🇧", "🇻🇺", "🇰🇲", "🇸🇹", "🇵🇼", "🇫🇲",
  "🇲🇭", "🇰🇮", "🇳🇷", "🇹🇻", "🇧🇶", "🇹🇫", "🇭🇲", "🇧🇻", "🇮🇴", "🇺🇲", "🇵🇳", "🇨🇽",
  "🇳🇫", "🇼🇫", "🇲🇶", "🇾🇹"
]);

for (const flag of flagsList) {
  if (insaneEmojis.has(flag.emoji)) {
    flag.region = "insane";
  }
}

function getGameSettings(region) {
  let time = 20; // fallback
  let minPrize = 20000;
  let maxPrize = 200000;

  if (region === 'europe_na') {
    time = 10;
    minPrize = 40000;
    maxPrize = 80000;
  } else if (region === 'sa_asia') {
    time = 15; // 15s limit for medium
    minPrize = 80000;
    maxPrize = 140000;
  } else if (region === 'africa' || region === 'oceania') {
    time = 15; // 15s limit for hard
    minPrize = 140000;
    maxPrize = 220000;
  } else if (region === 'insane') {
    time = 20; // 20s limit for insane
    minPrize = 220000;
    maxPrize = 300000;
  }

  const prize = Math.floor(Math.random() * (maxPrize - minPrize + 1)) + minPrize;
  return { time, prize };
}

function getFlagsByDifficulty(difficulty) {
  if (difficulty === 'easy') {
    return flagsList.filter(f => f.region === 'europe_na');
  } else if (difficulty === 'medium') {
    return flagsList.filter(f => f.region === 'sa_asia');
  } else if (difficulty === 'hard') {
    return flagsList.filter(f => f.region === 'africa' || f.region === 'oceania');
  } else if (difficulty === 'insane') {
    return flagsList.filter(f => f.region === 'insane');
  }
  return flagsList; // fallback
}

async function startNextFlag(client, threadId) {
  const game = client.activeFlagTournaments?.get(threadId);
  if (!game || game.state !== 'playing') return;

  const flagNum = (game.currentRound - 1) * 3 + game.currentFlagIndex;
  if (flagNum > 15) {
    endFlagTournament(client, threadId);
    return;
  }

  const currentFlagData = game.flagsQueue[flagNum - 1];
  game.currentFlag = currentFlagData;
  game.currentFlagGuesses = [];

  let roundTime = 10000;
  if (game.difficulty === 'medium' || game.difficulty === 'hard') {
    roundTime = 15000;
  } else if (game.difficulty === 'insane') {
    roundTime = 20000;
  }

  const api = client.api;
  const msg = `🚩 **Runda ${game.currentRound}/5, Flaga ${game.currentFlagIndex}/3** 🚩\n` +
              `Jaki kraj reprezentuje ta flaga?\n\n` +
              `👉 **${currentFlagData.emoji}**\n\n` +
              `⏱️ Masz ${roundTime / 1000} sekund na odpowiedź!`;

  if (api) {
    api.sendMessage(msg, threadId);
  }

  game.timeoutId = setTimeout(() => {
    finishFlagTurn(client, threadId);
  }, roundTime);
}

async function finishFlagTurn(client, threadId) {
  const game = client.activeFlagTournaments?.get(threadId);
  if (!game || game.state !== 'playing' || !game.currentFlag) return;

  if (game.timeoutId) {
    clearTimeout(game.timeoutId);
    game.timeoutId = null;
  }

  const correctFlag = game.currentFlag;
  game.currentFlag = null; // Uniemożliwia zgadywanie w przerwie między rundami

  const correctCountry = correctFlag.name;
  let summary = `⌛ **Koniec czasu dla flagi ${correctFlag.emoji}** ⌛\n` +
                `Poprawna odpowiedź: **${correctCountry}**\n\n` +
                `🏆 **Punkty w tej turze:**\n`;

  if (game.currentFlagGuesses.length === 0) {
    summary += `*Nikt nie odgadł tej flagi.*\n`;
  } else {
    for (let i = 0; i < game.currentFlagGuesses.length; i++) {
      const g = game.currentFlagGuesses[i];
      const points = i === 0 ? 3 : (i === 1 ? 2 : 1);
      const player = game.players.find(p => p.id === g.userId);
      if (player) {
        player.score += points;
        summary += `${i + 1}. **${player.username}** (+${points} pkt)\n`;
      }
    }
  }

  summary += `\n📊 **Aktualna klasyfikacja generalna:**\n`;
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  sorted.forEach((p, idx) => {
    summary += `${idx + 1}. **${p.username}**: ${p.score} pkt\n`;
  });

  game.currentFlagIndex += 1;
  if (game.currentFlagIndex > 3) {
    game.currentFlagIndex = 1;
    game.currentRound += 1;
  }

  const isFinished = ((game.currentRound - 1) * 3 + game.currentFlagIndex) > 15;
  if (isFinished) {
    summary += `\n🏁 **To była ostatnia flaga turnieju!** Podsumowanie końcowe za chwilę...`;
  } else {
    summary += `\n⏱️ Następna flaga za **10 sekund**...`;
  }

  if (client.api) {
    client.api.sendMessage(summary, threadId);
  }

  setTimeout(() => {
    if (isFinished) {
      endFlagTournament(client, threadId);
    } else {
      startNextFlag(client, threadId);
    }
  }, 10000);
}

async function endFlagTournament(client, threadId) {
  const game = client.activeFlagTournaments?.get(threadId);
  if (!game) return;

  client.activeFlagTournaments.delete(threadId);

  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  if (sorted.length === 0) {
    if (client.api) {
      client.api.sendMessage('🏁 **Koniec Turnieju Flag!** Brak uczestników.', threadId);
    }
    return;
  }

  const winner = sorted[0];
  let msg = `🏆 **KONIEC TURNIEJU FLAG!** 🏆\n` +
            `Gratulacje dla zwycięzcy! 🎉\n\n` +
            `🥇 Zwycięzca: **${winner.username}** z wynikiem **${winner.score} pkt**!\n\n` +
            `📊 **Wyniki końcowe:**\n`;

  sorted.forEach((p, idx) => {
    msg += `${idx + 1}. **${p.username}**: ${p.score} pkt\n`;
  });

  if (client.api) {
    client.api.sendMessage(msg, threadId);
  }
}

module.exports = {
  name: 'flaga',
  aliases: ['flagi'],
  flagsList,
  getGameSettings,
  getFlagsByDifficulty,
  startNextFlag,
  finishFlagTurn,
  endFlagTournament,
  async execute(client, message, args) {
    const threadId = message.guild?.id || message.rawEvent?.threadID || message.threadID;
    if (!threadId) {
      await message.reply('❌ Ta komenda może być używana tylko na czatach grupowych.');
      return;
    }

    const { withData } = require('../utils/storage');
    const sub = String(args[0] || '').toLowerCase().trim();

    // Check if group admin is trying to turn off/on flags
    if (sub === 'off' || sub === 'on') {
      const senderId = message.author.id;
      const isBotAdmin = config.admins.includes(senderId);

      let isGroupAdmin = false;
      if (!isBotAdmin && client.api) {
        try {
          const info = await new Promise((resolve) => {
            client.api.getThreadInfo(threadId, (err, ret) => {
              if (err) resolve(null);
              else resolve(ret);
            });
          });
          const adminIDs = (info?.adminIDs || []).map(admin => {
            if (typeof admin === 'object' && admin !== null) {
              return String(admin.id || admin.userID || '').trim();
            }
            return String(admin).trim();
          }).filter(Boolean);
          isGroupAdmin = adminIDs.includes(senderId);
        } catch (e) {
          console.error('[FLAGI] Error checking group admin:', e);
        }
      }

      if (!isBotAdmin && !isGroupAdmin) {
        await message.reply('❌ Tylko administratorzy grupy lub bota mogą zmieniać ustawienia flag.');
        return;
      }

      const turnOff = sub === 'off';
      await withData(store => {
        store.profiles.threadSettings = store.profiles.threadSettings || {};
        store.profiles.threadSettings[threadId] = store.profiles.threadSettings[threadId] || {};
        store.profiles.threadSettings[threadId].blockFlags = turnOff;
      });

      if (turnOff) {
        client.activeFlags?.delete?.(threadId);
        client.activeFlagTournaments?.delete?.(threadId);
        await message.reply('🔒 **Zablokowano komendę flagi oraz turnieje flag** na tej grupie.');
      } else {
        await message.reply('🔓 **Odblokowano komendę flagi oraz turnieje flag** na tej grupie.');
      }
      return;
    }

    // Check if flags are blocked in this thread
    const isBlocked = await withData(store => {
      return !!(store.profiles.threadSettings?.[threadId]?.blockFlags);
    });
    if (isBlocked) {
      await message.reply('❌ Flagi są wyłączone w tej konwersacji przez administratora.');
      return;
    }

    if (!client.activeFlags) {
      client.activeFlags = new Map();
    }
    if (!client.activeFlagTournaments) {
      client.activeFlagTournaments = new Map();
    }

    // 1. Join tournament
    if (sub === 'dolacz' || sub === 'd' || sub === 'join') {
      const lobby = client.activeFlagTournaments.get(threadId);
      if (!lobby) {
        await message.reply('❌ Nie ma żadnego aktywnego lobby turnieju flag.');
        return;
      }
      if (lobby.state !== 'lobby') {
        await message.reply('❌ Turniej już trwa, nie możesz teraz dołączyć.');
        return;
      }
      if (lobby.players.some(p => p.id === message.author.id)) {
        await message.reply(`⚠️ **${message.author.username}**, już jesteś w tym turnieju.`);
        return;
      }
      if (lobby.players.length >= lobby.maxPlayers) {
        await message.reply(`❌ Lobby turniejowe jest już pełne (maksymalnie ${lobby.maxPlayers} graczy).`);
        return;
      }

      lobby.players.push({
        id: message.author.id,
        username: message.author.username,
        score: 0
      });

      await message.reply(`✅ **${message.author.username}** dołączył do turnieju flag! (Graczy: **${lobby.players.length}/${lobby.maxPlayers}**)`);

      // Automatyczny start przy pełnym lobby
      if (lobby.players.length === lobby.maxPlayers) {
        client.startNextFlag = startNextFlag;
        client.finishFlagTurn = finishFlagTurn;
        client.endFlagTournament = endFlagTournament;

        const allFlags = getFlagsByDifficulty(lobby.difficulty);
        const shuffled = [...allFlags].sort(() => Math.random() - 0.5);
        lobby.flagsQueue = shuffled.slice(0, 15);
        lobby.state = 'playing';
        lobby.currentRound = 1;
        lobby.currentFlagIndex = 1;

        await message.reply(`🎬 **Lobby się zapełniło! Automatycznie rozpoczynamy Turniej Flag!** Przygotujcie się... Pierwsza flaga za 3 sekundy.`);
        setTimeout(() => {
          startNextFlag(client, threadId);
        }, 3000);
      }
      return;
    }

    // 2. Start tournament
    if (sub === 'start') {
      const lobby = client.activeFlagTournaments.get(threadId);
      if (!lobby) {
        await message.reply('❌ Brak aktywnego lobby turnieju flag.');
        return;
      }
      if (lobby.state !== 'lobby') {
        await message.reply('❌ Turniej już trwa.');
        return;
      }
      if (lobby.hostId !== message.author.id) {
        await message.reply('❌ Tylko organizator turnieju może go rozpocząć.');
        return;
      }
      if (lobby.players.length < 1) {
        await message.reply('❌ Potrzeba przynajmniej 1 gracza, aby rozpocząć turniej.');
        return;
      }

      client.startNextFlag = startNextFlag;
      client.finishFlagTurn = finishFlagTurn;
      client.endFlagTournament = endFlagTournament;

      const allFlags = getFlagsByDifficulty(lobby.difficulty);
      const shuffled = [...allFlags].sort(() => Math.random() - 0.5);
      lobby.flagsQueue = shuffled.slice(0, 15);
      lobby.state = 'playing';
      lobby.currentRound = 1;
      lobby.currentFlagIndex = 1;

      await message.reply(`🎬 **Rozpoczynamy Turniej Flag!** Przygotujcie się... Pierwsza flaga za 3 sekundy.`);
      setTimeout(() => {
        startNextFlag(client, threadId);
      }, 3000);
      return;
    }

    // 3. Create tournament lobby
    if (sub === 'turniej' || sub === 't' || sub === 'tournament') {
      if (client.activeFlagTournaments.has(threadId)) {
        await message.reply('❌ Na tej grupie trwa już turniej flag!');
        return;
      }
      if (client.activeFlags.has(threadId)) {
        await message.reply('❌ Na tej grupie trwa już pojedyncza zgadywanka flag!');
        return;
      }

      const diffArg = String(args[1] || 'medium').toLowerCase().trim();
      const validDiffs = ['easy', 'medium', 'hard', 'insane'];
      const difficulty = validDiffs.includes(diffArg) ? diffArg : 'medium';

      let maxPlayers = 8;
      const limitArg = args[2];
      if (limitArg !== undefined) {
        const parsed = parseInt(limitArg, 10);
        if (isNaN(parsed) || parsed < 2 || parsed > 8) {
          await message.reply('❌ Limit graczy w turnieju musi wynosić od 2 do 8 osób!');
          return;
        }
        maxPlayers = parsed;
      }

      const lobby = {
        state: 'lobby',
        hostId: message.author.id,
        difficulty,
        maxPlayers,
        players: [{ id: message.author.id, username: message.author.username, score: 0 }],
        currentRound: 1,
        currentFlagIndex: 1,
        flagsQueue: [],
        currentFlag: null,
        currentFlagGuesses: [],
        timeoutId: null,
        timestamp: Date.now()
      };

      client.activeFlagTournaments.set(threadId, lobby);

      await message.reply(
        `🏁 **TURNIEJ FLAG (Trudność: ${difficulty.toUpperCase()})** 🏁\n` +
        `Zapisy otwarte! Limit graczy: **${maxPlayers}** (Gra składa się z **5 rund, po 3 flagi każda**).\n` +
        `Punktacja za każdą flagę: 1. miejsce = 3 pkt, 2. miejsce = 2 pkt, 3. miejsce = 1 pkt.\n\n` +
        `👉 Wpisz **!flagi dolacz**, aby dołączyć do gry.\n` +
        `👉 Organizator wpisuje **!flagi start**, aby rozpocząć!`
      );
      return;
    }

    // 4. Single free flag game
    if (client.activeFlags.has(threadId)) {
      await message.reply('❌ W tym wątku trwa już pojedyncza zgadywanka flag!');
      return;
    }
    if (client.activeFlagTournaments.has(threadId)) {
      await message.reply('❌ W tym wątku trwa już turniej flag!');
      return;
    }

    const diffArg = sub || '';
    const validDiffs = ['easy', 'medium', 'hard', 'insane'];
    const difficulty = validDiffs.includes(diffArg) ? diffArg : null;

    if (!difficulty) {
      await message.reply(
        `🏳️ **FLAGI — Wybierz poziom trudności:** 🏳️\n\n` +
        `🟢 **!flagi easy** — łatwe flagi (10s na odpowiedź)\n` +
        `🟡 **!flagi medium** — średnie flagi (15s na odpowiedź)\n` +
        `🔴 **!flagi hard** — trudne flagi (15s na odpowiedź)\n` +
        `💀 **!flagi insane** — ekstremalnie trudne flagi (20s na odpowiedź)\n\n` +
        `🏁 **!flagi turniej <trudność> <ilość_osób>** — turniej wieloosobowy`
      );
      return;
    }

    const chosenList = getFlagsByDifficulty(difficulty);
    const randomFlag = chosenList[Math.floor(Math.random() * chosenList.length)];
    const { time } = getGameSettings(randomFlag.region);

    client.activeFlags.set(threadId, {
      emoji: randomFlag.emoji,
      answers: randomFlag.answers,
      countryName: randomFlag.name,
      prize: 0, // No money prize
      active: true,
      timestamp: Date.now()
    });

    // Auto-cleanup after time limit
    setTimeout(() => {
      const game = client.activeFlags.get(threadId);
      if (game && game.emoji === randomFlag.emoji && game.active) {
        client.activeFlags.delete(threadId);
        if (client.api) {
          client.api.sendMessage(`⌛ **ZGADNIJ KRAJ** ⌛\nCzas minął! Nikt nie zgadł flagi **${randomFlag.emoji}** (${randomFlag.name}) na czas.`, threadId);
        }
      }
    }, time * 1000).unref();

    await message.reply(
      `🏳️ **ZGADNIJ KRAJ (${difficulty === 'all' ? 'DOWOLNA' : difficulty.toUpperCase()})** 🏳️\n` +
      `Jaki kraj reprezentuje ta flaga?\n\n` +
      `👉 **${randomFlag.emoji}**\n\n` +
      `⏱️ Masz ${time} sekund na odpowiedź.`
    );
  }
};
