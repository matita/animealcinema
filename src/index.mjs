import 'dotenv/config';
import { extract } from '@extractus/article-extractor';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as htmlparser2 from 'htmlparser2';
import * as fs from 'fs/promises';
import slug from 'slug';

class Logger {
  date
  filePath
  lastOperation

  constructor() {
    this.date = new Date();
    const formattedDate = `${formatDate(this.date)} ${formatTime(this.date)}`;
    this.filePath = `./_input/fetchlogs/${formattedDate}.md`;
    this.appendLine(`# ${formattedDate}`);
  }

  log(...args) {
    globalThis.console.log(...args);
    return this.appendLine(args.join(' '));
  }

  async appendLine(text) {
    await this.lastOperation;
    const textWithLinks = text
      .replace(/(https?:\/\/[^$\s]+)/g, '[$1]($1)')
    return this.lastOperation = fs.appendFile(this.filePath, `${textWithLinks}  \n`);
  }
}

let console;

const { OPENAI_API_KEY } = process.env;

async function fetchArticles(rssUrl) {
  console.log('Fetching rss from', rssUrl);
  const feedResponse = await axios.get(rssUrl);
  const feed = htmlparser2.parseFeed(feedResponse.data, { xmlMode: true });
  console.log(`Found ${feed.items.length} items`);

  feed.items.forEach((item) => {
    const googleUrl = new URL(item.link);
    const articleUrl = googleUrl.host === 'www.google.com'
      ? googleUrl.searchParams.get('url')
      : item.link;

    item.link = articleUrl;
  });

  return feed;
}

const pad = (n) => `0${n}`.slice(-2);
const formatDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const formatTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

async function extractAnimeMoviesFromText(articleText, publishedDate) {
  const prompt = `
    ${publishedDate ? `Current date is ${formatDate(publishedDate)}.` : ''}
    Extract all Japanese anime movies mentioned in this article that you are sure will be going to be released in italian movie theaters
    with their next and last release dates in italian movie theaters as a JSON array. 
    Format: [{"title": "Movie Title", "theaterReleaseDate": "YYYY-MM-DD", "theaterEndDate": "YYYY-MM-DD"}]. 
    If you're not sure of the release date in Italian movie theaters, do not return the "theaterReleaseDate" field.
    If end date is unknown, do not return the field "theaterEndDate".
    Always respond with only JSON, never wrap it in markdown.
    Article: ${articleText}`.trim().replace(/[\n\s]+/g, ' ');

  console.log('--- prompt ---');
  console.log(prompt);
  
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const message = response.data?.choices?.[0]?.message
    const answer = message.content
      .trim()
      // Sometimes OpenAI returns the JSON result by wrapping it with the markdown to show the formatted JSON,
      // removing the markdown formatting if present
      .replace(/^```json/, '')
      .replace(/```$/, '')
      .trim();

    try {
      const animeList = JSON.parse(answer);
      return animeList;
    } catch (error) {
      console.error('Error parsing response as JSON:', answer);
    }
  } catch (error) {
    console.error('API request failed:', error.response ? error.response.data : error.message);
  }

  return null;
}

async function extractAnimeMovies(link, pubDate) {
  try {
    const article = await extract(link);
    if (!article) {
      console.log('No article found at', link);
      return null;
    }
  
    const publishedDate = (article.published && new Date(article.published)) || pubDate;
  
    const $ = cheerio.load(article.content);
    const articleText = $.text().trim().replace(/[\n\s]+/g, ' ');
    
    return {
      ...article,
      publishedDate,
      animeList: await extractAnimeMoviesFromText(articleText, publishedDate),
    };
  } catch (err) {
    console.log(`!!! Error while extracting article from '${link}'`);
    console.log(err);
    return null;
  }
}

function processMovie(movie, fromArticle, existingMovies) {
  const movieSlug = slug(movie.title);
  const existingMovie = existingMovies[movieSlug] || Object.values(existingMovies).find((m) => m.aliases?.includes(movieSlug));
  const finalSlug = existingMovie?.slug ?? movieSlug;
  if (existingMovie?.lastSourceDate >= fromArticle.publishedDate) {
    return;
  }

  const sources = existingMovie?.sources ?? [];
  if (!sources.some((source) => source.url === fromArticle.url)) {
    const { url, title, description, publishedDate } = fromArticle;
    sources.push({ url, title, description, publishedDate });
  }

  const updatedMovie = {
    ...(existingMovie ?? {}),
    title: existingMovie?.title ?? movie.title ?? '',
    slug: finalSlug,
    lastSourceDate: fromArticle.publishedDate,
    theaterReleaseDate: existingMovie?.theaterReleaseDate ?? movie.theaterReleaseDate,
    theaterEndDate: existingMovie?.theaterEndDate ?? movie.theaterEndDate,
    sources,
  };
  existingMovies[finalSlug] = updatedMovie;
}

async function loadExistingMovies(path) {
  const content = await fs.readFile(path);
  const movies = JSON.parse(content);
  return movies.reduce((aggregator, movie) => {
    aggregator[movie.slug] = movie;
    return aggregator;
  }, {});
}

const SOURCES_FILE = './_input/_data/sources.json';
const MOVIES_FILE = './_input/_data/movies.json';

console = new Logger();
const sources = JSON.parse(`${await fs.readFile(SOURCES_FILE)}`);
const existingMovies = await loadExistingMovies(MOVIES_FILE);
console.log(`Currently known movies:`, Object.values(existingMovies).length);

for (const source of sources) {
  console.log(`Fetching from source ${source.name}`);
  const feed = await fetchArticles(source.url);
  const lastUpdateDate = source.lastUpdateDate && new Date(source.lastUpdateDate);
  if (lastUpdateDate && feed.updated <= lastUpdateDate) {
    console.log(`Skipping source because it was updated before ${lastUpdateDate.toISOString()}`);
    continue;
  }

  const urls = feed.items.map((item) => item.link);
  for (const articleUrl of urls) {
    if (!articleUrl) {
      continue;
    }
  
    console.log(`Extracting movies from ${articleUrl}`);
    const article = await extractAnimeMovies(articleUrl);
    if (!article) {
      continue;
    }

    console.log(`Found ${article.animeList.length} movies`);
    console.log('```json\n' + JSON.stringify(article, null, 2) + '\n```');
  
    for (const movie of article.animeList) {
      console.log(`--- processing movie ---`);
      console.log(JSON.stringify(movie, null, 2));
      processMovie(movie, article, existingMovies);
    }
  }
  
  console.log('Saving movies file');
  await fs.writeFile(MOVIES_FILE, JSON.stringify(Object.values(existingMovies), null, 2));
  console.log('Saved movies file');
  
  source.lastUpdateDate = feed.updated;
  console.log('Saving sources file');
  await fs.writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2));
  console.log('Saved sources file');
}




// Example usage:

// extractAnimeMovies('https://www.lospaziobianco.it/crunchyroll-e-sony-pictures-portano-al-cinema-solo-leveling-reawakening-il-2-3-e-4-dicembre/');
// Solo Leveling -ReAwakening-, dal 2024-12-02 al 2024-12-04

// extractAnimeMovies('https://cinema.everyeye.it/notizie/flow-film-animato-anno-trama-trailer-quando-esce-cinema-italia-751119.html');
// Niente (Flow non è un anime giapponese)

// extractAnimeMovies('https://www.nexodigital.it/anime-al-cinema-autunno-2024/');
// Cyborg 009 Vs Devilman, dal 2024-09-09 al 2024-09-11
// Ken il guerriero – Il film, dal 2024-10-14 al 2024-10-16
// The Last: Naruto The Movie, dal 2024-11-04 al 2024-11-06
// Overlord – Il film: Capitolo del Santo Regno, dal 2024-12-09 al 2024-12-11

// extractAnimeMovies('https://cpop.it/articoli/3-film-da-guardare-questo-weekend-al-cinema-26-28-luglio');
// La storia della Principessa Splendente, dal 2024-07-26

// extractAnimeMovies('https://www.comingsoon.it/film/anime-sbullonate/66334/video/?vid=45570');
// Niente

// extractAnimeMovies('https://www.animeclick.it/news/105055-jeeg-contro-goldrake-tutte-le-info-sullanime-comic-tutto-italiano-di-luca-papeo');
// Niente

// extractAnimeMovies('https://www.voto10.it/anime-comics/solo-leveling-reawakening-nelle-sale-italiane-il-234-dicembre/');
// Solo Leveling -ReAwakening-, dal 2024-12-02 al 2024-12-04

// extractAnimeMovies('https://www.animeclick.it/news/105011-the-last-naruto-the-movie-ecco-il-trailer-il-cast-e-le-sale-dove-vederlo');
// The Last: Naruto The Movie, dal 2024-11-04 al 2024-11-06

// extractAnimeMovies('https://www.animeclick.it/news/104994-anime-in-arrivo-per-i-manga-andiamo-al-karaoke-e-captivated-by-you-di-yama-wayama');
// Niente

// extractAnimeMovies('https://www.animeclick.it/news/105049-look-back-il-film-animato-sara-una-esclusiva-streaming-di-amazon-prime-video');
// Niente

// extractAnimeMovies('https://www.msn.com/it-it/intrattenimento/cinema/dragon-ball-daima-sbarca-su-netflix-il-fenomeno-anime-in-italia-continua-a-correre-veloce/ar-AA1svqPV');

// extractAnimeMovies('https://www.lastampa.it/spettacoli/2024/10/16/news/ken_il_guerriero_riporta_al_cinema_i_ragazzini_degli_anni_ottanta-14722496/');
// Ken il guerriero – Il film, dal 2024-10-14 al 2024-10-16

// extractAnimeMovies('https://www.animeclick.it/news/104981-crunchyroll-in-arrivo-il-film-di-blue-lock-disponibile-planetes');
// Niente

// extractAnimeMovies('https://imperoland.it/flow-un-mondo-da-salvare-dal-7-novembre-al-cinema-il-film-che-ha-incantato-cannes/');
// Niente

// extractAnimeMovies('https://cinema.everyeye.it/notizie/prossimi-film-anime-giapponesi-uscita-cinema-italia-747816.html');
// Ken il Guerriero – Il Film, dal 2024-10-14 al 2024-10-16
// The Last: Naruto The Movie, dal 2024-11-04 al 2024-11-06
// Overlord – Il Film: Capitolo del Santo Regno, dal 2024-12-09 al 2024-12-11

// extractAnimeMovies('https://www.comingsoon.it/cinema/news/my-hero-academia-you-re-next-al-cinema-il-quarto-film-della-saga-anime-da/n189107/');
// My Hero Academia: You're Next, dal 2024-10-10