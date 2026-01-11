export async function scrapeProductInfo(url: string, defaultCurrency: string = 'USD') {
    // List of CORS proxies - prioritized by CORS reliability (JSON-wrapping proxies first)
    const proxies = [
        (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, // JSON-wrapped bypasses CORS best
        (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
        (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        (u: string) => `https://cors-anywhere.herokuapp.com/${u}`, // Fallback
        (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` // Repeat for rotation
    ]

    // Determine if we should try the mobile version (Amazon specific trick)
    let targetUrl = url;
    if (url.includes('amazon.com') && !url.includes('m.amazon.com')) {
        // Occasionally try mobile site which has lighter bot protection
        if (Math.random() > 0.5) {
            targetUrl = url.replace('www.amazon.com', 'm.amazon.com');
        }
    }

    for (let i = 0; i < proxies.length; i++) {
        const getProxyUrl = proxies[i]
        try {
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, i * 300 + Math.random() * 200))
            }

            const proxyUrl = getProxyUrl(targetUrl)

            // Simplified fetch to avoid preflight (no custom headers)
            const response = await fetch(proxyUrl, {
                cache: 'no-store'
            })

            if (!response.ok) {
                if (response.status === 429 || response.status === 503) {
                    console.warn(`Scraper: Proxy ${i} throttled (Status ${response.status})`)
                }
                continue
            }

            let html = ''
            if (proxyUrl.includes('allorigins.win')) {
                const data = await response.json()
                html = data.contents
            } else {
                html = await response.text()
            }

            if (!html || html.length < 500) continue

            // Enhanced check for anti-bot pages
            const botSignals = ['captcha', 'api-services-support@amazon.com', 'robot check', 'automated access']

            if (botSignals.some(signal => html.toLowerCase().includes(signal))) {
                console.warn(`Scraper: Blocked by bot protection on proxy ${i}`)
                continue
            }

            // Create a temporary document to parse the HTML
            const parser = new DOMParser()
            const doc = parser.parseFromString(html, 'text/html')

            // 1. Extract from JSON-LD (Structured Data) - Very reliable for Shopify/WooCommerce/BigCommerce
            const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]')
            let jsonName = '', jsonPrice: number | null = null, jsonCurrency = ''

            for (const script of jsonLdScripts) {
                try {
                    const data = JSON.parse(script.textContent || '{}')
                    const items = Array.isArray(data) ? data : [data]
                    const productData = items.find(i => i['@type'] === 'Product' || i['@type']?.includes('Product'))

                    if (productData) {
                        if (!jsonName) jsonName = productData.name || ''
                        const offers = Array.isArray(productData.offers) ? productData.offers : [productData.offers]
                        const offer = offers.find((o: any) => o && (o.price || o.lowPrice))
                        if (offer) {
                            if (jsonPrice === null) jsonPrice = parseFloat(offer.price || offer.lowPrice)
                            if (!jsonCurrency) jsonCurrency = offer.priceCurrency || ''
                        }
                    }
                } catch { /* ignore */ }
            }

            // 2. Extract Name - use more specific selectors for big sites
            let name = jsonName ||
                doc.querySelector('#productTitle')?.textContent?.trim() || // Amazon
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

            // 3. Extract Price & Currency
            let price: number | null = jsonPrice
            let currency = jsonCurrency || defaultCurrency

            // Try meta tags if JSON-LD failed
            if (price === null) {
                const priceMeta = doc.querySelector('meta[property="product:price:amount"]') ||
                    doc.querySelector('meta[property="og:price:amount"]') ||
                    doc.querySelector('meta[name="twitter:data1"]') ||
                    doc.querySelector('[itemprop="price"]')

                if (priceMeta) {
                    const priceStr = priceMeta.getAttribute('content') || priceMeta.textContent || ''
                    const num = parseFloat(priceStr.replace(/[^0-9.]/g, ''))
                    if (!isNaN(num)) price = num
                }
            }

            if (!jsonCurrency) {
                const currencyMeta = doc.querySelector('meta[property="product:price:currency"]') ||
                    doc.querySelector('meta[property="og:price:currency"]') ||
                    doc.querySelector('[itemprop="priceCurrency"]')

                if (currencyMeta) {
                    currency = currencyMeta.getAttribute('content') || currencyMeta.textContent || currency
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
                    '[class*="price-item"]',
                    '.product-price',
                    '[id*="price"]',
                    '[class*="PriceDisplay"]'
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

            // Fallback 2: Regex search through all text (useful for search snippets)
            if (price === null) {
                const innerText = doc.body.innerText || ''
                const priceRegex = /[\$£€]\d{1,4}(?:\.\d{2})?/g
                const matches = innerText.match(priceRegex)
                if (matches && matches.length > 0) {
                    // Take the most likely price (often the first one in a snippet)
                    const found = matches[0]
                    price = parseFloat(found.replace(/[^0-9.]/g, ''))
                    if (found.includes('$')) currency = 'USD'
                    else if (found.includes('€')) currency = 'EUR'
                    else if (found.includes('£')) currency = 'GBP'
                }
            }

            // 4. Extract Image
            const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
                doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
                doc.querySelector('#landingImage')?.getAttribute('src') ||
                doc.querySelector('#imgBlkFront')?.getAttribute('src') ||
                doc.querySelector('[itemprop="image"]')?.getAttribute('content') ||
                doc.querySelector('.product-image img')?.getAttribute('src') ||
                ''

            // 5. Final Validation
            if (price !== null && (isNaN(price) || price <= 0 || price > 1000000)) price = null

            // If we've got at least a name or price, return it
            if (name || price) {
                return { name, price, currency, image, url: targetUrl }
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
    // Tiered query simplification - move aggressive cleaning here
    const cleanQuery = query.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim()
    const t1 = cleanQuery.split(' ').slice(0, 8).join(' ') // First 8 words max for stability
    const t2 = cleanQuery.split(' ').slice(0, 4).join(' ') // First 4 words
    const t3 = cleanQuery.split(' ')[0] // Just the brand/first word

    const targets = [
        { name: 'Amazon', url: 'https://www.amazon.com/s?k=', icon: '📦' },
        { name: 'eBay', url: 'https://www.ebay.com/sch/i.html?_nkw=', icon: '🏷️' },
        { name: 'Google', url: 'https://www.google.com/search?tbm=shop&q=', icon: '🔍' }
    ]

    const results = await Promise.all(targets.map(async (target) => {
        try {
            // Tier 1: Detailed Search
            let info = await scrapeProductInfo(target.url + encodeURIComponent(t1))

            // Tier 2: Simplified Search
            if (!info || !info.price) {
                info = await scrapeProductInfo(target.url + encodeURIComponent(t2))
            }

            // Tier 3: Ultra-Simplified (Brand only) as last ditch attempt
            if (!info || !info.price) {
                info = await scrapeProductInfo(target.url + encodeURIComponent(t3))
            }

            if (info && info.price) {
                return {
                    store: target.name,
                    url: info.url,
                    price: info.price,
                    currency: info.currency,
                    icon: target.icon
                }
            }

            return { store: target.name, url: target.url + encodeURIComponent(t1), price: null, currency: 'USD', icon: target.icon }
        } catch {
            return { store: target.name, url: target.url + encodeURIComponent(t1), price: null, currency: 'USD', icon: target.icon }
        }
    }))

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
