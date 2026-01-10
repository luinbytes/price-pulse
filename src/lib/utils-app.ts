export async function scrapeProductInfo(url: string) {
    try {
        // Using a public CORS proxy (allorigins.win) to fetch the HTML
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
        const response = await fetch(proxyUrl)

        if (!response.ok) throw new Error('Failed to fetch product page')

        const data = await response.json()
        const html = data.contents

        // Create a temporary document to parse the HTML
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')

        // 1. Extract Name
        let name = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
            doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
            doc.title ||
            ''

        // Clean up name (remove site name suffixes)
        name = name.split('|')[0].split('-')[0].trim()

        // 2. Extract Price & Currency
        // Try meta tags first (common in Shopify/OpenGraph)
        let price: number | null = null
        let currency = 'USD'

        const priceMeta = doc.querySelector('meta[property="product:price:amount"]') ||
            doc.querySelector('meta[property="og:price:amount"]') ||
            doc.querySelector('meta[name="twitter:data1"]') // Sometimes price is here

        const currencyMeta = doc.querySelector('meta[property="product:price:currency"]') ||
            doc.querySelector('meta[property="og:price:currency"]')

        if (priceMeta) {
            const priceStr = priceMeta.getAttribute('content') || ''
            const num = parseFloat(priceStr.replace(/[^0-9.]/g, ''))
            if (!isNaN(num)) price = num
        }

        if (currencyMeta) {
            currency = currencyMeta.getAttribute('content') || 'USD'
        }

        // Fallback: If price not found in meta, look for common selectors or text patterns
        if (price === null) {
            const pricePatterns = [
                /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,  // $1,234.56
                /€\d{1,3}(?:\.\d{3})*(?:,\d{2})?/,   // €1.234,56
                /£\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,   // £1,234.56
            ]

            // Look in common price containers
            const priceSelectors = [
                '[class*="price"]',
                '[id*="price"]',
                '.a-price-whole', // Amazon
                '.pp-price' // Common
            ]

            for (const selector of priceSelectors) {
                const el = doc.querySelector(selector)
                if (el) {
                    const text = el.textContent || ''
                    for (const pattern of pricePatterns) {
                        const match = text.match(pattern)
                        if (match) {
                            price = parseFloat(match[0].replace(/[^0-9.]/g, ''))
                            // Detect currency from symbol if needed
                            if (match[0].includes('$')) currency = 'USD'
                            else if (match[0].includes('€')) currency = 'EUR'
                            else if (match[0].includes('£')) currency = 'GBP'
                            break
                        }
                    }
                }
                if (price !== null) break
            }
        }

        // 3. Extract Image
        const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
            doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
            ''

        return {
            name,
            price,
            currency,
            image,
            url
        }
    } catch (err) {
        console.error('Scraping error:', err)
        return null
    }
}

export function generateRandomUsername() {
    const adjectives = ['Cool', 'Swift', 'Bright', 'Neon', 'Lunar', 'Turbo', 'Zen', 'Pulse', 'Hyper', 'Elite', 'Vivid', 'Silent', 'Warp', 'Cyber', 'Atomic']
    const nouns = ['Shopper', 'Tracker', 'Falcon', 'Nova', 'Pulse', 'Vortex', 'Siren', 'Spectre', 'Alpha', 'Gamer', 'Seeker', 'Raven', 'Ghost', 'Pilot', 'Nomad']
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    const num = Math.floor(Math.random() * 90000) + 10000 // 5-digit number for better uniqueness
    return `${adj}${noun}${num}`
}
