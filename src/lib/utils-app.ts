export async function scrapeProductInfo(url: string, defaultCurrency: string = 'USD') {
    // List of CORS proxies to try
    const proxies = [
        (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
        (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`
    ]

    for (const getProxyUrl of proxies) {
        try {
            const proxyUrl = getProxyUrl(url)
            const response = await fetch(proxyUrl, {
                // allorigins needs no-cache sometimes to avoid stale 403s
                cache: 'no-store'
            })

            if (!response.ok) continue // Try next proxy

            let html = ''
            if (proxyUrl.includes('allorigins.win')) {
                const data = await response.json()
                html = data.contents
            } else {
                html = await response.text()
            }

            if (!html || html.length < 100) continue

            // Basic check for anti-bot pages
            if (html.includes('api-services-support@amazon.com') || html.includes('captcha')) {
                console.warn('Scraper: Blocked by bot protection on this proxy')
                continue
            }

            // Create a temporary document to parse the HTML
            const parser = new DOMParser()
            const doc = parser.parseFromString(html, 'text/html')

            // 1. Extract Name - use more specific selectors for big sites
            let name = doc.querySelector('#productTitle')?.textContent?.trim() || // Amazon
                doc.querySelector('.product-title')?.textContent?.trim() || // eBay
                doc.querySelector('h1.page-title')?.textContent?.trim() ||
                doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
                doc.querySelector('h1')?.textContent?.trim() ||
                doc.title ||
                ''

            // Clean up name
            if (name.toLowerCase().includes('page not found')) {
                name = ''
            }
            if (name.includes(':')) {
                const parts = name.split(':')
                if (parts.length > 1 && (parts[0].toLowerCase().includes('amazon') || parts[0].toLowerCase().includes('ebay'))) {
                    name = parts.slice(1).join(':').trim()
                }
            }
            name = name.split('|')[0].split('-')[0].trim()

            // 2. Extract Price & Currency
            let price: number | null = null
            let currency = defaultCurrency

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
                currency = currencyMeta.getAttribute('content') || currency
            } else {
                // Secondary check: look for og:locale or lang attribute
                const locale = doc.querySelector('meta[property="og:locale"]')?.getAttribute('content') ||
                    doc.documentElement.lang || '';

                if (locale.includes('GB') || url.includes('.co.uk')) currency = 'GBP';
                else if (locale.includes('DE') || locale.includes('FR') || url.includes('.de') || url.includes('.fr')) currency = 'EUR';
                else if (locale.includes('JP') || url.includes('.jp')) currency = 'JPY';
                else if (locale.includes('CA') || url.includes('.ca')) currency = 'CAD';
                else if (locale.includes('AU') || url.includes('.au')) currency = 'AUD';
            }

            // Fallback: If price not found in meta, look for common selectors
            if (price === null) {
                const priceSelectors = [
                    '.a-price .a-offscreen',
                    '.a-price-whole',
                    '#priceblock_ourprice',
                    '#priceblock_dealprice',
                    '#price_inside_buybox',
                    '.priceToPay',
                    '.pp-price',
                    '[class*="price-actual"]',
                    '[class*="price-item"]'
                ]

                const pricePatterns = [
                    /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,
                    /€\d{1,3}(?:\.\d{3})*(?:,\d{2})?/,
                    /£\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,
                    /\d{1,3}(?:,\d{3})*(?:\.\d{2})?/
                ]

                for (const selector of priceSelectors) {
                    const el = doc.querySelector(selector)
                    if (el) {
                        const text = el.textContent || ''
                        const num = parseFloat(text.replace(/[^0-9.]/g, ''))
                        if (num > 0) {
                            price = num
                            if (text.includes('$')) currency = 'USD'
                            else if (text.includes('€')) currency = 'EUR'
                            else if (text.includes('£')) currency = 'GBP'
                            else if (text.includes('C$')) currency = 'CAD'
                            else if (text.includes('A$')) currency = 'AUD'
                            else if (text.includes('¥')) currency = 'JPY'
                            break
                        }

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

            // If we've got at least a name or price, return it
            if (name || price) {
                return { name, price, currency, image, url }
            }
        } catch {
            // Silence intermediate errors to keep console clean if rotation is intended
            continue
        }
    }

    console.error('Scraper: All proxies failed or were blocked')
    return null
}

export async function searchProductPrices(query: string) {
    const encodedQuery = encodeURIComponent(query)
    const targets = [
        {
            name: 'Amazon',
            url: `https://www.amazon.com/s?k=${encodedQuery}`,
            priceSelector: '.a-price .a-offscreen',
            icon: '📦'
        },
        {
            name: 'eBay',
            url: `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}`,
            priceSelector: '.s-item__price',
            icon: '🏷️'
        }
    ]

    const results = []

    for (const target of targets) {
        // Try the same proxy rotation strategy
        const info = await scrapeProductInfo(target.url)
        if (info && info.price) {
            results.push({
                store: target.name,
                url: target.url,
                price: info.price,
                currency: info.currency,
                icon: target.icon
            })
        } else {
            // If full scrape fails, at least provide the link
            results.push({
                store: target.name,
                url: target.url,
                price: null,
                currency: 'USD',
                icon: target.icon
            })
        }
    }

    return results
}

export function generateRandomUsername() {
    const adjectives = ['Cool', 'Swift', 'Bright', 'Neon', 'Lunar', 'Turbo', 'Zen', 'Pulse', 'Hyper', 'Elite', 'Vivid', 'Silent', 'Warp', 'Cyber', 'Atomic']
    const nouns = ['Shopper', 'Tracker', 'Falcon', 'Nova', 'Pulse', 'Vortex', 'Siren', 'Spectre', 'Alpha', 'Gamer', 'Seeker', 'Raven', 'Ghost', 'Pilot', 'Nomad']
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    const num = Math.floor(Math.random() * 90000) + 10000 // 5-digit number for better uniqueness
    return `${adj}${noun}${num}`
}
