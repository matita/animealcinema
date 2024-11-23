import axios from "axios";

export const searchMovie = async (title) => {
  const cleanTitle = title.replace(/\W+/g, ' ')
  const response = await axios.get('https://api.themoviedb.org/3/search/movie', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${process.env.TMDB_API_KEY}`
    },
    params: {
      query: cleanTitle,
      include_adult: false,
      language: 'it-IT'
    },
  });
  
  return response?.data?.results?.sort((a, b) => b.popularity - a.popularity)?.[0];
}

/**
 * 
 * @param {string} fileName 
 * @param {object} options 
 * @param {'w342'|'w500'|'original'} options.size
 * @returns 
 */
export const getImagePath = (fileName, { size = 'w500' }) => {
  return `https://image.tmdb.org/t/p/${size}${fileName}`;
};