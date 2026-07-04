// Sveriges 21 län + kommuner. Extraherad ur SettingsModal.tsx (OpOmr-väljaren) för
// återanvändning i SmsTipsPanel.tsx:s Län/Kommun-geotaggning.
export interface County {
  name: string;
  municipalities: string[];
}

export const SWEDEN: County[] = [
  { name: 'Norrbottens län', municipalities: ['Arjeplog','Arvidsjaur','Boden','Gällivare','Haparanda','Jokkmokk','Kalix','Kiruna','Luleå','Pajala','Piteå','Älvsbyn','Överkalix','Övertorneå'] },
  { name: 'Västerbottens län', municipalities: ['Bjurholm','Dorotea','Lycksele','Malå','Nordmaling','Norsjö','Robertsfors','Skellefteå','Sorsele','Storuman','Umeå','Vilhelmina','Vindeln','Vännäs','Åsele'] },
  { name: 'Jämtlands län', municipalities: ['Berg','Bräcke','Härjedalen','Krokom','Ragunda','Strömsund','Åre','Östersund'] },
  { name: 'Västernorrlands län', municipalities: ['Härnösand','Kramfors','Sollefteå','Sundsvall','Timrå','Ånge','Örnsköldsvik'] },
  { name: 'Gävleborgs län', municipalities: ['Bollnäs','Gävle','Hofors','Hudiksvall','Ljusdal','Nordanstig','Ockelbo','Ovanåker','Sandviken','Söderhamn'] },
  { name: 'Dalarnas län', municipalities: ['Avesta','Borlänge','Falun','Gagnef','Hedemora','Leksand','Ludvika','Malung-Sälen','Mora','Orsa','Rättvik','Smedjebacken','Säter','Vansbro','Älvdalen'] },
  { name: 'Värmlands län', municipalities: ['Arvika','Eda','Filipstad','Forshaga','Grums','Hagfors','Hammarö','Karlstad','Kil','Kristinehamn','Munkfors','Storfors','Sunne','Säffle','Torsby','Årjäng'] },
  { name: 'Örebro län', municipalities: ['Askersund','Degerfors','Hallsberg','Hällefors','Karlskoga','Kumla','Laxå','Lekeberg','Lindesberg','Ljusnarsberg','Nora','Örebro'] },
  { name: 'Västmanlands län', municipalities: ['Arboga','Fagersta','Hallstahammar','Kungsör','Köping','Norberg','Sala','Skinnskatteberg','Surahammar','Västerås'] },
  { name: 'Uppsala län', municipalities: ['Enköping','Heby','Håbo','Knivsta','Tierp','Uppsala','Älvkarleby','Östhammar'] },
  { name: 'Stockholms län', municipalities: ['Botkyrka','Danderyd','Ekerö','Haninge','Huddinge','Järfälla','Lidingö','Nacka','Norrtälje','Nykvarn','Nynäshamn','Salem','Sigtuna','Sollentuna','Solna','Stockholm','Sundbyberg','Södertälje','Tyresö','Täby','Upplands-Bro','Upplands Väsby','Vallentuna','Vaxholm','Värmdö','Österåker'] },
  { name: 'Södermanlands län', municipalities: ['Eskilstuna','Flen','Gnesta','Katrineholm','Nyköping','Oxelösund','Strängnäs','Trosa','Vingåker'] },
  { name: 'Västra Götalands län', municipalities: ['Ale','Alingsås','Bengtsfors','Bollebygd','Borås','Dals-Ed','Essunga','Falköping','Färgelanda','Grästorp','Gullspång','Göteborg','Götene','Herrljunga','Hjo','Härryda','Karlsborg','Kungälv','Lerum','Lidköping','Lilla Edet','Lysekil','Mariestad','Mark','Mellerud','Munkedal','Mölndal','Orust','Partille','Skara','Skövde','Sotenäs','Stenungsund','Strömstad','Svenljunga','Tanum','Tibro','Tidaholm','Tjörn','Tranemo','Trollhättan','Töreboda','Uddevalla','Ulricehamn','Vara','Vårgårda','Åmål','Öckerö'] },
  { name: 'Östergötlands län', municipalities: ['Boxholm','Finspång','Kinda','Linköping','Mjölby','Motala','Norrköping','Söderköping','Vadstena','Valdemarsvik','Ydre','Åtvidaberg','Ödeshög'] },
  { name: 'Gotlands län', municipalities: ['Gotland'] },
  { name: 'Jönköpings län', municipalities: ['Aneby','Eksjö','Gislaved','Gnosjö','Habo','Jönköping','Mullsjö','Nässjö','Sävsjö','Tranås','Vaggeryd','Vetlanda','Värnamo'] },
  { name: 'Kalmar län', municipalities: ['Borgholm','Emmaboda','Hultsfred','Högsby','Kalmar','Mönsterås','Mörbylånga','Nybro','Oskarshamn','Torsås','Vimmerby','Västervik'] },
  { name: 'Hallands län', municipalities: ['Falkenberg','Halmstad','Hylte','Kungsbacka','Laholm','Varberg'] },
  { name: 'Kronobergs län', municipalities: ['Alvesta','Lessebo','Ljungby','Markaryd','Tingsryd','Uppvidinge','Växjö','Älmhult'] },
  { name: 'Blekinge län', municipalities: ['Karlshamn','Karlskrona','Olofström','Ronneby','Sölvesborg'] },
  { name: 'Skåne län', municipalities: ['Bjuv','Bromölla','Burlöv','Båstad','Eslöv','Helsingborg','Hässleholm','Höganäs','Hörby','Höör','Klippan','Kristianstad','Kävlinge','Landskrona','Lomma','Lund','Malmö','Osby','Perstorp','Simrishamn','Sjöbo','Skurup','Staffanstorp','Svalöv','Svedala','Tomelilla','Trelleborg','Vellinge','Ystad','Åstorp','Ängelholm','Örkelljunga','Östra Göinge'] },
];
