// Catálogo de sites mainstream por país + frases de busca por idioma.
// Categorias: news sports tech shopping entertainment finance travel food health auto home spirituality fitness

export const CATEGORIES = ['news', 'sports', 'tech', 'shopping', 'entertainment', 'finance', 'travel', 'food', 'health', 'auto', 'home', 'spirituality', 'fitness'];

export const GLOBAL = {
  news: ['bbc.com', 'reuters.com', 'apnews.com'],
  sports: ['espn.com', 'olympics.com'],
  tech: ['theverge.com', 'wired.com', 'techradar.com'],
  shopping: ['ebay.com', 'aliexpress.com'],
  entertainment: ['imdb.com', 'rottentomatoes.com'],
  finance: ['investopedia.com', 'bloomberg.com'],
  travel: ['tripadvisor.com', 'booking.com'],
  food: ['allrecipes.com', 'bbcgoodfood.com'],
  health: ['healthline.com', 'mayoclinic.org'],
  auto: ['caranddriver.com', 'motortrend.com'],
  home: ['ikea.com', 'housebeautiful.com'],
  spirituality: ['biddytarot.com', 'labyrinthos.co', 'tarot.com', 'astrology.com', 'mindbodygreen.com', 'insighttimer.com', 'psychologytoday.com', 'tinybuddha.com', 'chopra.com', 'dailyom.com', 'gaia.com', 'verywellmind.com', 'psychcentral.com', 'lonerwolf.com', 'hayhouse.com'],
  fitness: ['menshealth.com', 'womenshealthmag.com', 'shape.com', 'runnersworld.com', 'acefitness.org', 'nerdfitness.com', 'yogajournal.com'],
};

// lang = idioma; g = domínio do Google; sites = sobreposição local (substitui o global quando existe)
export const COUNTRIES = {
  US: { lang: 'en', g: 'com', sites: {
    news: ['cnn.com', 'nytimes.com', 'foxnews.com', 'usatoday.com', 'npr.org', 'nbcnews.com', 'weather.com'],
    sports: ['espn.com', 'nba.com', 'nfl.com', 'cbssports.com', 'mlb.com'],
    tech: ['theverge.com', 'cnet.com', 'arstechnica.com', 'wired.com', 'engadget.com'],
    shopping: ['amazon.com', 'walmart.com', 'target.com', 'bestbuy.com', 'ebay.com', 'etsy.com'],
    entertainment: ['imdb.com', 'rottentomatoes.com', 'variety.com', 'billboard.com'],
    finance: ['finance.yahoo.com', 'marketwatch.com', 'cnbc.com', 'nerdwallet.com'],
    travel: ['tripadvisor.com', 'expedia.com', 'kayak.com'],
    food: ['allrecipes.com', 'foodnetwork.com', 'simplyrecipes.com', 'delish.com'],
    health: ['webmd.com', 'mayoclinic.org', 'healthline.com'],
    auto: ['edmunds.com', 'caranddriver.com', 'kbb.com'],
    home: ['homedepot.com', 'lowes.com', 'wayfair.com'],
  } },
  BR: { lang: 'pt', g: 'com.br', sites: {
    news: ['g1.globo.com', 'uol.com.br', 'folha.uol.com.br', 'r7.com', 'terra.com.br', 'cnnbrasil.com.br'],
    sports: ['ge.globo.com', 'espn.com.br', 'lance.com.br', 'cbf.com.br'],
    tech: ['tecmundo.com.br', 'canaltech.com.br', 'olhardigital.com.br', 'tecnoblog.net'],
    shopping: ['mercadolivre.com.br', 'americanas.com.br', 'magazineluiza.com.br', 'kabum.com.br', 'casasbahia.com.br'],
    entertainment: ['adorocinema.com', 'omelete.com.br', 'purepeople.com.br'],
    finance: ['infomoney.com.br', 'exame.com', 'valor.globo.com'],
    travel: ['decolar.com', 'tripadvisor.com.br', 'viajarbarato.com.br'],
    food: ['tudogostoso.com.br', 'panelinha.com.br', 'receitasnestle.com.br'],
    health: ['tuasaude.com', 'minhavida.com.br', 'drauziovarella.uol.com.br'],
    auto: ['webmotors.com.br', 'quatrorodas.abril.com.br', 'autoesporte.globo.com'],
    home: ['leroymerlin.com.br', 'tokstok.com.br', 'casaeconstrucao.com.br'],
    spirituality: ['personare.com.br', 'astrocentro.com.br', 'mdemulher.abril.com.br', 'insighttimer.com'],
    fitness: ['mundoboaforma.com.br', 'tuasaude.com', 'minhavida.com.br', 'saude.abril.com.br', 'runnersworld.com.br'],
  } },
  GB: { lang: 'en', g: 'co.uk', sites: {
    news: ['bbc.co.uk', 'theguardian.com', 'dailymail.co.uk', 'news.sky.com', 'independent.co.uk'],
    sports: ['skysports.com', 'bbc.co.uk/sport', 'premierleague.com'],
    tech: ['techradar.com', 'trustedreviews.com', 'theverge.com'],
    shopping: ['amazon.co.uk', 'argos.co.uk', 'johnlewis.com', 'ebay.co.uk'],
    entertainment: ['radiotimes.com', 'imdb.com'],
    finance: ['moneysavingexpert.com', 'thisismoney.co.uk'],
    travel: ['skyscanner.net', 'tripadvisor.co.uk'],
    food: ['bbcgoodfood.com', 'jamieoliver.com'],
    health: ['nhs.uk', 'healthline.com'],
    auto: ['autotrader.co.uk', 'autocar.co.uk'],
    home: ['diy.com', 'ikea.com'],
  } },
  CA: { lang: 'en', g: 'ca', sites: {
    news: ['cbc.ca', 'globalnews.ca', 'thestar.com', 'ctvnews.ca'],
    sports: ['tsn.ca', 'sportsnet.ca', 'nhl.com'],
    shopping: ['amazon.ca', 'canadiantire.ca', 'bestbuy.ca'],
    finance: ['theglobeandmail.com', 'financialpost.com'],
    auto: ['autotrader.ca', 'caranddriver.com'],
  } },
  AU: { lang: 'en', g: 'com.au', sites: {
    news: ['abc.net.au', 'smh.com.au', 'news.com.au', '9news.com.au'],
    sports: ['foxsports.com.au', 'afl.com.au'],
    shopping: ['amazon.com.au', 'kogan.com', 'jbhifi.com.au'],
    auto: ['carsales.com.au'],
    home: ['bunnings.com.au'],
  } },
  DE: { lang: 'de', g: 'de', sites: {
    news: ['spiegel.de', 'zeit.de', 'tagesschau.de', 'bild.de', 'focus.de'],
    sports: ['kicker.de', 'sportschau.de'],
    tech: ['heise.de', 'chip.de', 'computerbild.de'],
    shopping: ['amazon.de', 'otto.de', 'ebay.de', 'mediamarkt.de'],
    finance: ['finanzen.net', 'handelsblatt.com'],
    food: ['chefkoch.de'],
    health: ['apotheken-umschau.de'],
    auto: ['auto-motor-und-sport.de', 'mobile.de'],
    home: ['obi.de'],
  } },
  FR: { lang: 'fr', g: 'fr', sites: {
    news: ['lemonde.fr', 'lefigaro.fr', 'francetvinfo.fr', '20minutes.fr'],
    sports: ['lequipe.fr'],
    tech: ['numerama.com', 'frandroid.com'],
    shopping: ['amazon.fr', 'cdiscount.com', 'fnac.com', 'leboncoin.fr'],
    entertainment: ['allocine.fr'],
    finance: ['boursorama.com', 'lesechos.fr'],
    food: ['marmiton.org', '750g.com'],
    health: ['doctissimo.fr'],
    auto: ['largus.fr'],
    home: ['leroymerlin.fr'],
  } },
  ES: { lang: 'es', g: 'es', sites: {
    news: ['elpais.com', 'elmundo.es', '20minutos.es', 'lavanguardia.com'],
    sports: ['marca.com', 'as.com'],
    tech: ['xataka.com', 'genbeta.com'],
    shopping: ['amazon.es', 'elcorteingles.es', 'pccomponentes.com', 'wallapop.com'],
    entertainment: ['filmaffinity.com'],
    finance: ['expansion.com'],
    food: ['directoalpaladar.com'],
    auto: ['coches.net'],
  } },
  IT: { lang: 'it', g: 'it', sites: {
    news: ['repubblica.it', 'corriere.it', 'ansa.it'],
    sports: ['gazzetta.it'],
    tech: ['hwupgrade.it'],
    shopping: ['amazon.it', 'subito.it'],
    entertainment: ['mymovies.it'],
    finance: ['ilsole24ore.com'],
    food: ['giallozafferano.it'],
    auto: ['quattroruote.it'],
  } },
  MX: { lang: 'es', g: 'com.mx', sites: {
    news: ['eluniversal.com.mx', 'milenio.com', 'infobae.com'],
    sports: ['espn.com.mx'],
    tech: ['xataka.com.mx'],
    shopping: ['mercadolibre.com.mx', 'amazon.com.mx', 'liverpool.com.mx'],
    food: ['kiwilimon.com'],
  } },
  AR: { lang: 'es', g: 'com.ar', sites: {
    news: ['clarin.com', 'lanacion.com.ar', 'infobae.com'],
    sports: ['ole.com.ar'],
    shopping: ['mercadolibre.com.ar'],
  } },
  PT: { lang: 'pt', g: 'pt', sites: {
    news: ['publico.pt', 'rtp.pt', 'jn.pt', 'observador.pt'],
    sports: ['record.pt', 'abola.pt'],
    shopping: ['olx.pt', 'worten.pt'],
  } },
  RO: { lang: 'en', g: 'ro', sites: {
    news: ['digi24.ro', 'hotnews.ro', 'libertatea.ro', 'stirileprotv.ro'],
    sports: ['gsp.ro', 'prosport.ro'],
    tech: ['playtech.ro', 'mobilissimo.ro'],
    shopping: ['emag.ro', 'olx.ro', 'altex.ro'],
    finance: ['zf.ro'],
    auto: ['autovit.ro'],
  } },
  NL: { lang: 'nl', g: 'nl', sites: {
    news: ['nos.nl', 'nu.nl', 'telegraaf.nl'],
    sports: ['voetbalprimeur.nl'],
    shopping: ['bol.com', 'marktplaats.nl'],
  } },
  IN: { lang: 'en', g: 'co.in', sites: {
    news: ['timesofindia.indiatimes.com', 'ndtv.com', 'thehindu.com', 'hindustantimes.com'],
    sports: ['cricbuzz.com', 'espncricinfo.com'],
    shopping: ['flipkart.com', 'amazon.in', 'myntra.com'],
    entertainment: ['bollywoodhungama.com'],
  } },
  PL: { lang: 'pl', g: 'pl', sites: {
    news: ['onet.pl', 'wp.pl', 'interia.pl'],
    shopping: ['allegro.pl', 'olx.pl'],
  } },
  JP: { lang: 'ja', g: 'co.jp', sites: {
    news: ['nhk.or.jp', 'asahi.com', 'yahoo.co.jp'],
    shopping: ['rakuten.co.jp', 'amazon.co.jp'],
  } },
};

export function countryInfo(code) {
  return COUNTRIES[code] || { lang: 'en', g: 'com', sites: {} };
}

export function sitesFor(code, category) {
  const info = countryInfo(code);
  const local = info.sites[category];
  const list = local && local.length ? local : GLOBAL[category] || [];
  return list.length ? list : GLOBAL.news;
}

const Q = {
  en: {
    news: ['latest news today', 'weather forecast this weekend'],
    sports: ['game scores last night', 'league standings'],
    tech: ['best smartphone for the money', 'laptop reviews'],
    shopping: ['best deals this week', 'wireless headphones reviews'],
    entertainment: ['new movies this week', 'tv series worth watching'],
    finance: ['stock market today', 'how to save money'],
    travel: ['weekend getaway ideas', 'cheap flights tips'],
    food: ['easy dinner recipes', 'best pasta recipe'],
    health: ['how to sleep better', 'healthy breakfast ideas'],
    auto: ['best used cars', 'car maintenance tips'],
    home: ['home organization ideas', 'diy shelves tutorial'],
    spirituality: ['morning manifestation meditation', 'tarot reading this week', 'law of attraction beginners', 'how to read tarot cards'],
    fitness: ['home workout 20 minutes', 'yoga for beginners', 'full body workout no equipment', 'healthy habits routine'],
  },
  pt: {
    news: ['notícias de hoje', 'previsão do tempo fim de semana'],
    sports: ['resultado dos jogos de ontem', 'tabela do campeonato'],
    tech: ['melhor celular custo benefício', 'review notebook'],
    shopping: ['ofertas da semana', 'fone de ouvido bluetooth bom'],
    entertainment: ['filmes em cartaz', 'séries para assistir'],
    finance: ['como economizar dinheiro', 'cotação do dólar hoje'],
    travel: ['destinos para fim de semana', 'dicas passagens aéreas baratas'],
    food: ['receitas fáceis para o jantar', 'receita de bolo simples'],
    health: ['como dormir melhor', 'café da manhã saudável'],
    auto: ['melhores carros usados', 'dicas de manutenção do carro'],
    home: ['ideias de organização da casa', 'como montar prateleira'],
    spirituality: ['meditação de manifestação', 'tarot leitura da semana', 'lei da atração como funciona', 'significado das cartas de tarot'],
    fitness: ['treino em casa 20 minutos', 'yoga para iniciantes', 'treino de corpo inteiro sem equipamento', 'hábitos saudáveis rotina'],
  },
  es: {
    news: ['noticias de hoy', 'pronóstico del tiempo fin de semana'],
    sports: ['resultados de ayer', 'tabla de posiciones'],
    tech: ['mejor celular calidad precio', 'reseñas de portátiles'],
    shopping: ['ofertas de la semana', 'auriculares inalámbricos opiniones'],
    entertainment: ['estrenos de películas', 'series para ver'],
    finance: ['cómo ahorrar dinero', 'bolsa hoy'],
    travel: ['escapadas fin de semana', 'consejos vuelos baratos'],
    food: ['recetas fáciles para cenar', 'receta de pasta'],
    health: ['cómo dormir mejor', 'desayunos saludables'],
    auto: ['mejores coches usados', 'mantenimiento del coche'],
    home: ['ideas para organizar la casa', 'cómo hacer estantes'],
    spirituality: ['meditación de manifestación', 'lectura de tarot de la semana', 'ley de la atracción cómo funciona', 'significado de las cartas del tarot'],
    fitness: ['rutina de ejercicio en casa', 'yoga para principiantes', 'entrenamiento de cuerpo completo', 'hábitos saludables'],
  },
  de: {
    news: ['Nachrichten heute', 'Wettervorhersage Wochenende'],
    sports: ['Spielergebnisse gestern', 'Bundesliga Tabelle'],
    tech: ['bestes Smartphone Preis Leistung', 'Laptop Test'],
    shopping: ['Angebote der Woche', 'kabellose Kopfhörer Test'],
    entertainment: ['neue Filme im Kino', 'Serien Tipps'],
    finance: ['Geld sparen Tipps', 'DAX aktuell'],
    travel: ['Wochenendtrip Ideen', 'günstige Flüge'],
    food: ['einfache Rezepte Abendessen', 'Nudelauflauf Rezept'],
    health: ['besser schlafen Tipps', 'gesundes Frühstück'],
    auto: ['beste Gebrauchtwagen', 'Auto Wartung Tipps'],
    home: ['Wohnung organisieren Ideen', 'Regal selber bauen'],
  },
  fr: {
    news: ["actualités du jour", 'météo ce week-end'],
    sports: ['résultats hier soir', 'classement championnat'],
    tech: ['meilleur smartphone rapport qualité prix', 'test ordinateur portable'],
    shopping: ['bons plans de la semaine', 'casque sans fil avis'],
    entertainment: ['films à voir cette semaine', 'séries à regarder'],
    finance: ['comment économiser', 'cac 40 aujourd’hui'],
    travel: ['idées week-end', 'vols pas chers astuces'],
    food: ['recettes faciles dîner', 'recette de pâtes'],
    health: ['mieux dormir conseils', 'petit déjeuner sain'],
    auto: ['meilleures voitures d’occasion', 'entretien voiture conseils'],
    home: ['idées rangement maison', 'fabriquer une étagère'],
  },
  it: {
    news: ['notizie di oggi', 'previsioni meteo weekend'],
    sports: ['risultati di ieri sera', 'classifica campionato'],
    tech: ['miglior smartphone qualità prezzo', 'recensioni portatili'],
    shopping: ['offerte della settimana', 'cuffie wireless recensioni'],
    entertainment: ['film in uscita', 'serie tv da guardare'],
    finance: ['come risparmiare', 'borsa oggi'],
    travel: ['idee weekend', 'voli low cost consigli'],
    food: ['ricette facili cena', 'ricetta pasta'],
    health: ['dormire meglio consigli', 'colazione sana'],
    auto: ['migliori auto usate', 'manutenzione auto'],
    home: ['idee organizzare casa', 'come costruire una mensola'],
  },
};

export function queriesFor(lang, category) {
  const bank = Q[lang] || Q.en;
  return bank[category] || Q.en[category] || Q.en.news;
}
