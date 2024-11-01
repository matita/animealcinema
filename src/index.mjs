import 'dotenv/config';
import { extract } from '@extractus/article-extractor';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as htmlparser2 from 'htmlparser2';
import * as fs from 'fs/promises';

const {
  GOOGLE_ALERT_RSS,
  OPENAI_API_KEY,
} = process.env;

async function fetchArticles(rssUrl) {
  const feedResponse = await axios.get(rssUrl);
  const feed = htmlparser2.parseFeed(feedResponse.data, { xmlMode: true });
  const articlesAndAnime = [];
  for (const item of feed.items) {
    const googleUrl = new URL(item.link);
    const articleUrl = googleUrl.host === 'www.google.com'
      ? googleUrl.searchParams.get('url')
      : item.link; 

    articlesAndAnime.push({
      title: item.title,
      link: articleUrl,
      description: item.description,
      pubDate: item.pubDate,
      animeMovies: await extractAnimeMovies(articleUrl),
    });
  }
  
  return articlesAndAnime;
}

async function extractAnimeMovies(link) {
  const article = await extract(link);
  if (!article) {
    console.log('No article found at', link);
    return null;
  }

  const $ = cheerio.load(article.content);
  const articleText = $.text().trim().replace(/[\n\s]+/g, ' ');
  
  const prompt = `
    ${article.published ? `Current date is ${article.published.split('T')[0]}.` : ''}
    Extract all Japanese anime movies mentioned in this article that you are sure will be going to be released in italian movie theaters
    with their next and last release dates in italian movie theaters as a JSON array. 
    Format: [{"title": "Movie Title", "release_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"}]. 
    If you're not sure of the release date, do not return the "release_date" field.
    If end date is unknown, do not return the field "end_date".
    Always respond with only JSON, never wrap it in markdown.
    Article: ${articleText}`.trim().replace(/[\n\s]+/g, ' ');
  
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
      // console.log('Extracted Anime Movies:', animeList);
      return animeList;
    } catch (error) {
      console.error('Error parsing response as JSON:', answer);
      return null;
    }
  } catch (error) {
    console.error('API request failed:', error.response ? error.response.data : error.message);
  }
}

const articles = await fetchArticles(GOOGLE_ALERT_RSS);
await fs.writeFile('articles.json', JSON.stringify(articles, null, 2));


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