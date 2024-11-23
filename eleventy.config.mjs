import ejsPlugin from '@11ty/eleventy-plugin-ejs';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(ejsPlugin);
  eleventyConfig.addPassthroughCopy({
    '_input/images': '/images',
  });
}