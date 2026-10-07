import type { MetadataRoute } from 'next'
import { helpSitemap } from '@/lib/help/site'

// help.sytenav.com/sitemap.xml - the help host's middleware rewrites it here.
// The URLs inside are the help host's, which is the only host this sitemap is
// allowed to list. Before the subdomain exists the same entries go in the main
// sitemap instead (app/sitemap.ts), never both.
export default function sitemap(): MetadataRoute.Sitemap {
  return helpSitemap()
}
