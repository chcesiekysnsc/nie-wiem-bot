const COUNTRIES = [
  "albania", "algieria", "andora", "angola", "argentyna", "armenia", "australia", "austria", "azerbejdzan", "azerbejdżan",
  "bahamy", "bahrajn", "bangladesz", "belgia", "benin", "bhutan", "bialorus", "białoruś", "boliwia", "botswana",
  "brazylia", "bulgaria", "bułgaria", "chile", "chiny", "chorwacja", "cypr", "czad", "czarnogora", "czarnogóra",
  "czechy", "dania", "dominikana", "egipt", "ekwador", "erytrea", "estonia", "etiopia", "fidzi", "fidżi",
  "filipiny", "finlandia", "francja", "gabon", "gambia", "ghana", "grecja", "gruzja", "gwatemala", "gwinea",
  "haiti", "hiszpania", "holandia", "honduras", "indie", "indonezja", "irak", "iran", "irlandia", "islandia",
  "izrael", "jamajka", "japonia", "jemen", "jordania", "kambodza", "kambodża", "kamerun", "kanada", "katar",
  "kazachstan", "kenia", "kirgistan", "kolumbia", "kongo", "korea", "kostaryka", "kuba", "kuwejt", "laos",
  "lesotho", "liban", "liberia", "libia", "liechtenstein", "litwa", "luksemburg", "lotwa", "łotwa", "macedonia",
  "madagaskar", "malezja", "malediwy", "mali", "malta", "maroko", "mauretania", "meksyk", "mołdawia", "moldawia",
  "monako", "mongolia", "mozambik", "mjanma", "namibia", "nepal", "niemcy", "niger", "nigeria", "nikaragua",
  "norwegia", "nowa zelandia", "oman", "pakistan", "palau", "panama", "paragwaj", "peru", "polska", "portugalia",
  "rosja", "rumunia", "rwanda", "salwador", "samoa", "senegal", "serbia", "seszele", "singapur", "slowacja",
  "słowacja", "slowenia", "słowenia", "somalia", "sri lanka", "sudan", "surinam", "szwajcaria", "szwecja", "syria",
  "tadzykistan", "tadżykistan", "tajlandia", "tajwan", "tanzania", "togo", "tonga", "trynidad", "tunezja", "turcja",
  "turkmenistan", "tuvalu", "uganda", "ukraina", "urugwaj", "uzbekistan", "watykan", "wenezuela", "wegry", "węgry",
  "wielka brytania", "wietnam", "wlochy", "włochy", "zambia", "zimbabwe"
];

const CITIES = [
  "warszawa", "krakow", "kraków", "lodz", "łódź", "wroclaw", "wrocław", "poznan", "poznań", "gdansk",
  "gdańsk", "szczecin", "bydgoszcz", "lublin", "bialystok", "białystok", "katowice", "gdynia", "czestochowa", "częstochowa",
  "radom", "torun", "toruń", "sosnowiec", "rzeszow", "rzeszów", "kielce", "gliwice", "zabrze", "olsztyn",
  "bielsko-biala", "bielsko-biała", "bytom", "zielona gora", "zielona góra", "rybnik", "ruda slaska", "ruda śląska", "opole", "tychy",
  "gorzow wielkopolski", "gorzów wielkopolski", "elblag", "elbląg", "plock", "płock", "dabrowa gornicza", "dąbrowa górnicza", "walbrzych", "wałbrzych",
  "wloclawek", "włocławek", "tarnow", "tarnów", "chorzow", "chorzów", "koszalin", "kalisz", "legnica", "grudziadz",
  "grudziądz", "jaworzno", "slupsk", "słupsk", "jastrzebie-zdroj", "jastrzębie-zdrój", "nowy sacz", "nowy sącz", "jelenia gora", "jelenia góra",
  "konin", "piotrkow trybunalski", "piotrków trybunalski", "siedlce", "inowroclaw", "inowrocław", "myslowice", "mysłowice", "lubin", "pila",
  "piła", "ostrow wielkopolski", "ostrów wielkopolski", "ostrowiec swietokrzyski", "ostrowiec świętokrzyski", "gniezno", "suwalki", "suwałki", "stargard", "glogow",
  "głogów", "siemianowice slaskie", "siemianowice śląskie", "pabianice", "zamosc", "zamość", "leszno", "chelm", "chełm", "tomaszow mazowiecki",
  "tomaszów mazowiecki", "lomza", "łomża", "stalowa wola", "przemysl", "przemyśl", "kedzierzyn-kozle", "kędzierzyn-koźle", "piaseczno", "elk",
  "ełk", "mielec", "tarnobrzeg", "krosno", "tczew", "belchatow", "bełchatów", "swidnica", "świdnica", "bedzin",
  "będzin", "zgierz", "piekary slaskie", "piekary śląskie", "raciborz", "racibórz", "legionowo", "ostroleka", "ostrołęka", "swietochlowice",
  "świętochłowice", "zawiercie", "wejherowo", "wodzislaw slaski", "wodzisław śląski", "starachowice", "pulawy", "puławy", "biala podlaska", "biała podlaska",
  "kolobrzeg", "kołobrzeg", "skarzysko-kamienna", "skarżysko-kamienna", "radomsko", "zory", "żory", "swidnik", "świdnik", "otwock",
  "knurow", "knurów", "jaroslaw", "jarosław", "wolomin", "wołomin", "zabki", "ząbki", "chojnice", "malbork",
  "jaslo", "jasło", "trzebinia", "sanok", "kwidzyn", "nowy targ", "debica", "dębica", "srem", "śrem",
  "lebork", "lębork", "gryfino", "hajnowka", "hajnówka", "klodzko", "kłodzko", "lowicz", "łowicz", "wieliczka",
  "berlin", "paryz", "paryż", "londyn", "rzym", "madryt", "wieden", "wiedeń", "praga", "budapeszt",
  "bruksela", "amsterdam", "ateny", "lizbona", "kijow", "kijów", "minsk", "mińsk", "wilno", "ryga",
  "tallinn", "dublin", "oslo", "sztokholm", "kopenhaga", "helsinki", "berno", "sofia", "belgrad", "zagrzeb",
  "lublana", "skopje", "tirana", "podgorica", "bukareszt", "bratyslawa", "bratysława", "moskwa", "pekin", "tokio",
  "waszyngton", "ottawa", "nowy jork", "los angeles", "chicago", "toronto", "sydney", "melbourne", "kair", "nowe delhi",
  "bombaj", "seul", "bangkok", "manila", "dzakarta", "dżakarta", "kuala lumpur", "singapur", "hanoi", "ankara",
  "jerozolima", "rijad", "dubai", "dubaj", "bagdad", "teheran", "kabul", "islamabad", "lima", "bogota",
  "caracas", "quito", "santiago", "buenos aires", "rio de janeiro", "sao paulo", "brasilia", "montevideo", "asuncion", "la paz"
];

module.exports = {
  COUNTRIES: new Set(COUNTRIES),
  CITIES: new Set(CITIES)
};
