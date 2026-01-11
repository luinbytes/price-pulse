/**
 * @deprecated Client-side scraping has been removed due to CORS limitations.
 * Price scraping is now handled server-side by the GitHub Actions worker.
 * This file only contains utility functions that don't require scraping.
 */

export function generateRandomUsername() {
    const adjectives = ['Cool', 'Swift', 'Bright', 'Neon', 'Lunar', 'Turbo', 'Zen', 'Pulse', 'Hyper', 'Elite', 'Vivid', 'Silent', 'Warp', 'Cyber', 'Atomic']
    const nouns = ['Shopper', 'Tracker', 'Falcon', 'Nova', 'Pulse', 'Vortex', 'Siren', 'Spectre', 'Alpha', 'Gamer', 'Seeker', 'Raven', 'Ghost', 'Pilot', 'Nomad']
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    const num = Math.floor(Math.random() * 90000) + 10000 // 5-digit number for better uniqueness
    return `${adj}${noun}${num}`
}

/**
 * Extract a clean product name from a URL
 * Used for generating search queries when the stored product name is a placeholder
 */
export function extractProductNameFromUrl(url: string): string | null {
    try {
        const urlObj = new URL(url)
        // Extract product slug from path
        const pathParts = urlObj.pathname.split('/').filter(p =>
            p && p.length > 3 && !/^(dp|gp|product|item|s|search|sch|browse|category)$/i.test(p)
        )

        if (pathParts.length > 0) {
            // Get the most descriptive part (usually the product name slug)
            const slug = pathParts.find(p => p.length > 10) || pathParts[pathParts.length - 1]

            return slug
                .replace(/[-_]/g, ' ')
                .replace(/B0[A-Z0-9]+/g, '') // Remove Amazon ASINs
                .replace(/\d{10,}/g, '') // Remove long numbers (product IDs)
                .replace(/\s+/g, ' ')
                .trim()
        }

        return null
    } catch {
        return null
    }
}
