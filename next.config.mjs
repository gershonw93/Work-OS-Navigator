/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  /**
   * The marketing site moved from /homepage to the root.
   *
   * WHY IT MOVED. Google reads a site's name from the homepage of the DOMAIN -
   * the root URL. The root used to answer 307 Temporary Redirect to /homepage,
   * which tells Google the root is still the root and this is only a detour, so
   * it kept https://www.sytenav.com/ as the homepage. That URL rendered no HTML
   * at all, while every naming signal - the WebSite and Organization JSON-LD,
   * og:site_name - lived on the redirect target. Google had nowhere to read the
   * name from and fell back to what it had learned from the vercel.app copy:
   * "Vercel". No amount of correct markup on /homepage could have fixed that.
   *
   * /homepage was also a routing detail that was never meant to be public, and
   * it was showing up in every search result as "sytenav.com > homepage > ...".
   *
   * These redirects are PERMANENT (308). Every one of those URLs is indexed,
   * linked, and in the sitemap Google has already fetched; a temporary redirect
   * would leave the old URL as the one Google keeps - which is the exact
   * mistake being corrected here.
   *
   * `:path+` NOT `:path*`. The star matches ZERO or more segments, so it also
   * matched a bare /homepage and resolved to an EMPTY destination - the old
   * marketing homepage, the most-linked URL of the whole set, redirected to
   * nowhere. The plus requires at least one segment, so /homepage falls
   * through to the rule below it.
   */
  async redirects() {
    return [
      { source: '/homepage/:path+', destination: '/:path+', permanent: true },
      { source: '/homepage', destination: '/', permanent: true },
    ]
  },
}

export default nextConfig
