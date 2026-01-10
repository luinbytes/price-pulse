export async function scrapeProductInfo(url: string) {
    try {
        // Switch to a different CORS proxy that might be more reliable for localhost
        // Using corsproxy.io instead of allorigins.win
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`
        const response = await fetch(proxyUrl)

        if (!response.ok) throw new Error(`Failed to fetch product page: ${response.statusText}`)

        const html = await response.text()

        // Create a temporary document to parse the HTML
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')

        // 1. Extract Name
        let name = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
            doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
            doc.querySelector('h1')?.textContent?.trim() ||
            doc.title ||
            ''

        // Clean up name (remove site name suffixes like "Amazon.co.uk:")
        if (name.includes(':')) {
            const parts = name.split(':')
            if (parts.length > 1 && parts[0].toLowerCase().includes('amazon')) {
                name = parts.slice(1).join(':').trim()
            }
        }
        name = name.split('|')[0].split('-')[0].trim()

        // 2. Extract Price & Currency
        let price: number | null = null
        let currency = 'USD'

        // Try meta tags first
        const priceMeta = doc.querySelector('meta[property="product:price:amount"]') ||
            doc.querySelector('meta[property="og:price:amount"]') ||
            doc.querySelector('meta[name="twitter:data1"]')

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

        // Fallback: If price not found in meta, look for common selectors
        if (price === null) {
            const priceSelectors = [
                '.a-price .a-offscreen', // Amazon hidden price
                '.a-price-whole', // Amazon visible whole
                '#priceblock_ourprice',
                '#priceblock_dealprice',
                '#price_inside_buybox',
                '.priceToPay',
                '.pp-price',
                '[class*="price-actual"]',
                '[class*="price-item"]'
            ]

            const pricePatterns = [
                /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,  // $1,234.56
                /€\d{1,3}(?:\.\d{3})*(?:,\d{2})?/,   // €1.234,56
                /£\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,   // £1,234.56
                /\d{1,3}(?:,\d{3})*(?:\.\d{2})?/      // just numbers
            ]

            for (const selector of priceSelectors) {
                const el = doc.querySelector(selector)
                if (el) {
                    const text = el.textContent || ''
                    // Try to extract num from text directly first
                    const num = parseFloat(text.replace(/[^0-9.]/g, ''))
                    if (!isNaN(num) && num > 0) {
                        price = num
                        // Detect currency
                        if (text.includes('$')) currency = 'USD'
                        else if (text.includes('€')) currency = 'EUR'
                        else if (text.includes('£')) currency = 'GBP'
                        break
                    }

                    // Try patterns if direct parse fails
                    for (const pattern of pricePatterns) {
                        const match = text.match(pattern)
                        if (match) {
                            price = parseFloat(match[0].replace(/[^0-9.]/g, ''))
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
            doc.querySelector('#landingImage')?.getAttribute('src') ||
            doc.querySelector('#imgBlkFront')?.getAttribute('src') ||
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
