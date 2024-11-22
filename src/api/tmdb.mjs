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

export const getImagePath = (fileName) => `https://image.tmdb.org/t/p/w500${fileName}`;