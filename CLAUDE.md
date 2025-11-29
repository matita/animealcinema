# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an automated content aggregator and static site generator that tracks Japanese anime movie releases in Italian theaters. The system fetches articles from RSS feeds, uses OpenAI's GPT-4 to extract anime movie information, enriches data with TMDB metadata and images, and generates a static website using Eleventy.

## Development Commands

### Core Operations
- `npm run fetch` - Run the data collection pipeline (fetches articles, extracts movie data, updates JSON files)
- `npm run build` - Build the static site using Eleventy (generates `_site/` directory)
- `npm run dev` - Build with live server for local development
- `npm run deploy` - Deploy to animealcinema.surge.sh
- `npm run deploy-site` - Deploy to prova.animealcinemainitalia.it

### Environment Variables
Required in `.env` file:
- `OPENAI_API_KEY` - For GPT-4 article analysis
- `TMDB_API_KEY` - For The Movie Database API access

## Architecture

### Data Pipeline (`src/index.mjs`)

The main fetch script runs hourly via GitHub Actions and follows this flow:

1. **RSS Ingestion**: Fetches articles from Google Alerts RSS feed (configured in `_input/_data/sources.json`)
2. **Article Extraction**: Uses `@extractus/article-extractor` to parse article content
3. **AI Analysis**: Sends article text to OpenAI GPT-4 with a structured prompt to extract:
   - Movie titles
   - Theater release dates (`theaterReleaseDate`)
   - Theater end dates (`theaterEndDate`)
4. **Movie Processing**: Merges new movie data with existing data in `_input/_data/movies.json`:
   - Uses slug-based matching to prevent duplicates
   - Tracks sources (articles) for each movie
   - Updates only if source is newer than last update
5. **TMDB Enrichment**: For movies without TMDB data:
   - Searches TMDB for matching movies
   - Downloads poster images (w342, w500) and backdrop images (w1280)
   - Stores images in `_input/images/` organized by size
6. **Logging**: Creates timestamped markdown logs in `_input/fetchlogs/`

### Data Models

**Movie Object** (`_input/_data/movies.json`):
```json
{
  "title": "string",
  "slug": "string",
  "theaterReleaseDate": "YYYY-MM-DD",
  "theaterEndDate": "YYYY-MM-DD",
  "lastSourceDate": "Date",
  "alternativeTitles": ["string"],
  "sources": [
    {
      "url": "string",
      "title": "string",
      "description": "string",
      "publishedDate": "Date"
    }
  ],
  "tmdbMovie": {
    "id": "number",
    "poster_path": "string",
    "backdrop_path": "string",
    "popularity": "number",
    ...
  },
  "aliases": ["string"]
}
```

**Source Object** (`_input/_data/sources.json`):
```json
{
  "name": "string",
  "url": "string",
  "lastUpdateDate": "ISO timestamp"
}
```

### Static Site Generation (Eleventy)

- **Input Directory**: `_input/`
- **Output Directory**: `_site/`
- **Templates**: EJS templates with Liquid for specific pages, Nunjucks for feed
- **Data Files**: JSON files in `_input/_data/` are automatically available as global data
- **Main Template** (`_input/index.ejs`):
  - Categorizes movies by relative time periods (weeks/months/years)
  - Filters movies into: showing now, coming soon, and announced
  - Uses most popular movie backdrop as hero image
  - Displays movies grouped by release date proximity
- **Movie Detail Pages** (`_input/movie.ejs`):
  - Uses pagination to generate individual pages for each movie
  - URL pattern: `/movie/{slug}/`
  - Shows all sources that mentioned the movie
  - Displays TMDB metadata (poster, backdrop, synopsis)
- **RSS/Atom Feed** (`_input/feed.njk`):
  - Generated at `/coming-soon.xml`
  - Contains movies with release dates in the next two weeks (from today)
  - Sorted by release date (earliest first)
  - Includes poster images, synopsis, and source links

### Utility Modules

- **`src/api/tmdb.mjs`**: TMDB API integration
  - `searchMovie(title)` - Finds movie by title, returns most popular match
  - `getImagePath(fileName, { size })` - Constructs TMDB image URLs

- **`src/utils.mjs`**: Helper functions
  - Date/time formatting
  - `download(url, filePath)` - Downloads files with directory creation, skips if exists

### Automation

GitHub Actions workflow (`.github/workflows/fetch.yml`) runs hourly:
1. Fetches new articles and updates data
2. Builds static site
3. Commits changes to repository
4. Deploys to Surge.sh

## Key Implementation Details

### OpenAI Prompt Strategy
The GPT-4 prompt is carefully designed to:
- Only extract **Japanese anime movies** scheduled for **Italian theaters**
- Return structured JSON (with fallback handling for markdown code blocks)
- Include dates only when certain
- Consider article publication date as context for date interpretation

### Duplicate Prevention and Merging
Movies are matched and deduplicated in two stages:

**Stage 1: Title-based matching** (`processMovie`):
- Matches using slugified titles and `aliases` field
- Tracks alternative titles in `alternativeTitles` array
- Only updates if the source article is newer than `lastSourceDate`
- Preserves existing TMDB data to avoid redundant API calls

**Stage 2: TMDB-based merging** (`mergeMoviesByTmdbId`):
- After TMDB enrichment, identifies movies with the same TMDB ID
- Merges duplicate entries into a single movie object
- Combines all sources, titles, and aliases from duplicates
- Uses the earliest release date and latest end date
- Tracks all title variations in `alternativeTitles` array

### Image Management
Images are organized by size in `_input/images/`:
- `w342/` - Small posters
- `w500/` - Medium posters
- `w1280/` - Backdrop images

Downloads are idempotent (skipped if file exists).

### Fetch Logging
Every fetch operation creates a timestamped markdown log in `_input/fetchlogs/` with:
- RSS feed items found
- Articles extracted
- Movies identified
- TMDB searches performed
- URLs are automatically converted to markdown links
