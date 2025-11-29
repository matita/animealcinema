import ejsPlugin from '@11ty/eleventy-plugin-ejs';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(ejsPlugin);
  eleventyConfig.addPassthroughCopy({
    '_input/images': '/images',
  });

  // Filter to get movies showing in the next two weeks
  eleventyConfig.addFilter('filterUpcomingMovies', (movies) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    return movies.filter(movie => {
      if (!movie.theaterReleaseDate) return false;
      const releaseDate = new Date(movie.theaterReleaseDate);
      releaseDate.setHours(0, 0, 0, 0);
      return releaseDate >= now && releaseDate <= twoWeeksFromNow;
    }).sort((a, b) => {
      return new Date(a.theaterReleaseDate) - new Date(b.theaterReleaseDate);
    });
  });

  // Filter to get newest date from movies
  eleventyConfig.addFilter('getNewestDate', (movies) => {
    const dates = movies
      .filter(m => m.lastSourceDate)
      .map(m => new Date(m.lastSourceDate));

    if (dates.length === 0) {
      return new Date().toISOString();
    }

    const newest = new Date(Math.max(...dates));
    return newest.toISOString();
  });

  // Filter to format date as ISO string
  eleventyConfig.addFilter('formatISO', (date) => {
    if (!date) return new Date().toISOString();
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString();
  });

  // Filter to format date in Italian
  eleventyConfig.addFilter('formatDateItalian', (date) => {
    if (!date) return '';
    if (typeof date === 'string' && /^\d{4}$/.test(date)) {
      return date;
    }
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat('it', { dateStyle: 'full' }).format(d);
  });

  // Filter to sort sources by date
  eleventyConfig.addFilter('sortByDate', (sources) => {
    return [...sources].sort((a, b) => {
      return new Date(b.publishedDate) - new Date(a.publishedDate);
    });
  });
}