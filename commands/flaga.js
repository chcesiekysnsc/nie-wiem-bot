const { formatCurrency } = require('../utils/economy');
const config = require('../config/config');

const flagsList = [
  {
    "emoji": "🇦🇨",
    "answers": [
      "ascension island"
    ],
    "name": "Ascension Island",
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
      "côte d’ivoire"
    ],
    "name": "Côte d’Ivoire",
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
      "clipperton island"
    ],
    "name": "Clipperton Island",
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
      "european union"
    ],
    "name": "European Union",
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
      "sra hongkong (chiny)"
    ],
    "name": "SRA Hongkong (Chiny)",
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
      "canary islands"
    ],
    "name": "Canary Islands",
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
      "saint lucia"
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
      "sra makau (chiny)"
    ],
    "name": "SRA Makau (Chiny)",
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
      "norfolk"
    ],
    "name": "Norfolk",
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
      "pitcairn"
    ],
    "name": "Pitcairn",
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
      "united nations"
    ],
    "name": "United Nations",
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
      "england"
    ],
    "name": "England",
    "region": "europe_na"
  },
  {
    "emoji": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    "answers": [
      "scotland"
    ],
    "name": "Scotland",
    "region": "europe_na"
  },
  {
    "emoji": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    "answers": [
      "wales"
    ],
    "name": "Wales",
    "region": "europe_na"
  }
];

function getGameSettings(region) {
  let time = 20; // fallback
  let minPrize = 20000;
  let maxPrize = 200000;

  if (region === 'europe_na') {
    time = 10;
    minPrize = 40000;
    maxPrize = 80000;
  } else if (region === 'sa_asia') {
    time = 15;
    minPrize = 80000;
    maxPrize = 140000;
  } else if (region === 'africa') {
    time = 20;
    minPrize = 140000;
    maxPrize = 180000;
  } else if (region === 'oceania') {
    time = 20;
    minPrize = 160000;
    maxPrize = 220000;
  }

  const prize = Math.floor(Math.random() * (maxPrize - minPrize + 1)) + minPrize;
  return { time, prize };
}

module.exports = {
  name: 'flaga',
  aliases: [],
  flagsList,
  getGameSettings,
  async execute(client, message, args) {
    if (!config.admins.includes(message.author.id)) {
      await message.reply('❌ Brak uprawnień administratora.');
      return;
    }

    if (!client.activeFlags) {
      client.activeFlags = new Map();
    }

    const threadId = message.guild.id;
    const randomFlag = flagsList[Math.floor(Math.random() * flagsList.length)];
    const { time, prize } = getGameSettings(randomFlag.region);

    client.activeFlags.set(threadId, {
      emoji: randomFlag.emoji,
      answers: randomFlag.answers,
      countryName: randomFlag.name,
      prize,
      active: true,
      timestamp: Date.now()
    });

    // Auto-cleanup after time limit
    setTimeout(() => {
      const game = client.activeFlags.get(threadId);
      if (game && game.emoji === randomFlag.emoji && game.active) {
        client.activeFlags.delete(threadId);
        const { loadData } = require('../utils/storage');
        const profiles = loadData('profiles');
        const settings = (profiles.threadSettings || {})[threadId] || {};
        if (!settings.blockNotifications && client.api) {
          client.api.sendMessage(`⌛ **ZGADNIJ KRAJ** ⌛\nCzas minął! Nikt nie zgadł flagi **${randomFlag.emoji}** (${randomFlag.name}) na czas.`, threadId);
        }
      }
    }, time * 1000).unref();

    await message.reply(
      `🏳️ **ZGADNIJ KRAJ** 🏳️\nJaki kraj reprezentuje ta flaga?\n\n` +
      `👉 **${randomFlag.emoji}**\n\n` +
      `💰 Nagroda: ${formatCurrency(prize)}!\n` +
      `⏱️ Masz ${time} sekund na odpowiedź.`
    );
  }
};
