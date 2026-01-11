import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Calculate Levenshtein distance for string similarity
function levenshteinDistance(str1: string, str2: string): number {
    const s1 = str1.toLowerCase()
    const s2 = str2.toLowerCase()
    const len1 = s1.length
    const len2 = s2.length

    const matrix: number[][] = []

    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i]
    }

    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            )
        }
    }

    return matrix[len1][len2]
}

// Calculate similarity score (0-1, where 1 is identical)
function calculateSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length)
    if (maxLen === 0) return 1.0
    const distance = levenshteinDistance(str1, str2)
    return 1 - distance / maxLen
}

// Extract keywords from product name (excluding common words)
function extractKeywords(name: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'for', 'on', 'at', 'to', 'from', 'by', 'of', 'as'])
    return name
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w))
}

// Calculate keyword overlap score
function calculateKeywordScore(targetName: string, resultTitle: string): number {
    const targetKeywords = new Set(extractKeywords(targetName))
    const resultKeywords = extractKeywords(resultTitle)

    if (targetKeywords.size === 0) return 0

    let matches = 0
    for (const keyword of resultKeywords) {
        if (targetKeywords.has(keyword)) {
            matches++
        }
    }

    return matches / targetKeywords.size
}

// Extract key specifications from product name for better search matching
function extractProductSpecs(name: string): { brand: string; specs: string[]; cleanName: string } {
    const specs: string[] = []

    // Extract size/volume specs (e.g., 32oz, 40oz, 1L, 500ml)
    const sizeMatch = name.match(/(\d+(?:\.\d+)?)\s*(oz|ml|l|liter|litre|fl\.?\s*oz|gallon|gal|quart|qt)/gi)
    if (sizeMatch) specs.push(...sizeMatch.map(s => s.trim()))

    // Extract capacity/storage specs (e.g., 256GB, 1TB, 16GB RAM)
    const storageMatch = name.match(/(\d+)\s*(GB|TB|MB)/gi)
    if (storageMatch) specs.push(...storageMatch.map(s => s.trim()))

    // Extract screen size (e.g., 15.6", 27 inch)
    const screenMatch = name.match(/(\d+(?:\.\d+)?)\s*["']?\s*(inch|in)?/gi)
    if (screenMatch) specs.push(...screenMatch.filter(s => parseFloat(s) >= 5 && parseFloat(s) <= 100).map(s => s.trim()))

    // Extract dimensions (e.g., 40x30, large, small, medium)
    const dimMatch = name.match(/\b(small|medium|large|xl|xxl|xs)\b/gi)
    if (dimMatch) specs.push(...dimMatch.map(s => s.trim()))

    // Get first word as potential brand (if it looks like a brand name)
    const words = name.split(/\s+/)
    const brand = words[0]?.length > 2 ? words[0] : ''

    return { brand, specs, cleanName: name }
}

// Locale-specific store configurations
const STORE_CONFIGS: Record<string, Array<{
    name: string
    searchUrl: (query: string) => string
    priceSelector: string
    titleSelector: string
    waitSelector: string
}>> = {
    'USD': [
        { name: 'Amazon', searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`, priceSelector: '.a-price .a-offscreen, .a-price-whole', titleSelector: 'h2 a span, h2 span', waitSelector: '[data-component-type="s-search-result"]' },
        { name: 'eBay', searchUrl: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`, priceSelector: '.s-item__price', titleSelector: '.s-item__title', waitSelector: '.s-item' },
        { name: 'Walmart', searchUrl: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`, priceSelector: '[data-automation-id="product-price"] span', titleSelector: '[data-automation-id="product-title"]', waitSelector: '[data-item-id]' },
        { name: 'Target', searchUrl: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`, priceSelector: '[data-test="current-price"]', titleSelector: '[data-test="product-title"]', waitSelector: '[data-test="product-card"]' },
        { name: 'Best Buy', searchUrl: (q) => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`, priceSelector: '.priceView-customer-price span', titleSelector: '.sku-title', waitSelector: '.sku-item' }
    ],
    'GBP': [
        { name: 'Amazon', searchUrl: (q) => `https://www.amazon.co.uk/s?k=${encodeURIComponent(q)}`, priceSelector: '.a-price .a-offscreen, .a-price-whole, span.a-price', titleSelector: 'h2 a span, h2 span', waitSelector: '[data-component-type="s-search-result"]' },
        { name: 'eBay', searchUrl: (q) => `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(q)}`, priceSelector: '.s-item__price, .s-card__price, .x-price-primary span', titleSelector: '.s-item__title', waitSelector: '.s-item, .s-card' },
        { name: 'Argos', searchUrl: (q) => `https://www.argos.co.uk/search/${encodeURIComponent(q)}/`, priceSelector: '[data-test="component-product-card-price"], .ProductCardstyles__Price', titleSelector: '[data-test="component-product-card-title"]', waitSelector: '[data-test="component-product-card"]' },
        { name: 'John Lewis', searchUrl: (q) => `https://www.johnlewis.com/search?search-term=${encodeURIComponent(q)}`, priceSelector: '.price, [class*="price"]', titleSelector: '[data-testid="product-title"]', waitSelector: '[data-testid="product-card"]' },
        { name: 'PriceRunner', searchUrl: (q) => `https://www.pricerunner.com/results?q=${encodeURIComponent(q)}`, priceSelector: 'a[href*="/pl/"] span', titleSelector: 'a[href*="/pl/"]', waitSelector: 'a[href*="/pl/"]' }
    ],
    'EUR': [
        { name: 'Amazon', searchUrl: (q) => `https://www.amazon.de/s?k=${encodeURIComponent(q)}`, priceSelector: '.a-price .a-offscreen, .a-price-whole', titleSelector: 'h2 a span, h2 span', waitSelector: '[data-component-type="s-search-result"]' },
        { name: 'eBay', searchUrl: (q) => `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(q)}`, priceSelector: '.s-item__price', titleSelector: '.s-item__title', waitSelector: '.s-item' },
        { name: 'Idealo', searchUrl: (q) => `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(q)}`, priceSelector: '[data-testid="price"]', titleSelector: '[data-testid="product-title"]', waitSelector: '[data-testid="product-item"]' },
        { name: 'MediaMarkt', searchUrl: (q) => `https://www.mediamarkt.de/de/search.html?query=${encodeURIComponent(q)}`, priceSelector: '[data-test="price"]', titleSelector: '[data-test="product-name"]', waitSelector: '[data-test="product-tile"]' }
    ],
    'CAD': [
        { name: 'Amazon', searchUrl: (q) => `https://www.amazon.ca/s?k=${encodeURIComponent(q)}`, priceSelector: '.a-price .a-offscreen, .a-price-whole', titleSelector: 'h2 a span, h2 span', waitSelector: '[data-component-type="s-search-result"]' },
        { name: 'eBay', searchUrl: (q) => `https://www.ebay.ca/sch/i.html?_nkw=${encodeURIComponent(q)}`, priceSelector: '.s-item__price', titleSelector: '.s-item__title', waitSelector: '.s-item' },
        { name: 'Best Buy CA', searchUrl: (q) => `https://www.bestbuy.ca/en-ca/search?search=${encodeURIComponent(q)}`, priceSelector: '[data-automation="product-price"]', titleSelector: '[data-automation="product-title"]', waitSelector: '[data-automation="product-item"]' },
        { name: 'Walmart CA', searchUrl: (q) => `https://www.walmart.ca/search?q=${encodeURIComponent(q)}`, priceSelector: '[data-automation="product-price"]', titleSelector: '[data-automation="product-title"]', waitSelector: '[data-automation="product-item"]' }
    ],
    'AUD': [
        { name: 'Amazon', searchUrl: (q) => `https://www.amazon.com.au/s?k=${encodeURIComponent(q)}`, priceSelector: '.a-price .a-offscreen, .a-price-whole', titleSelector: 'h2 a span, h2 span', waitSelector: '[data-component-type="s-search-result"]' },
        { name: 'eBay', searchUrl: (q) => `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(q)}`, priceSelector: '.s-item__price', titleSelector: '.s-item__title', waitSelector: '.s-item' },
        { name: 'Kogan', searchUrl: (q) => `https://www.kogan.com/au/search/?q=${encodeURIComponent(q)}`, priceSelector: '[data-testid="price"]', titleSelector: '[data-testid="product-title"]', waitSelector: '[data-testid="product-card"]' },
        { name: 'JB Hi-Fi', searchUrl: (q) => `https://www.jbhifi.com.au/search?q=${encodeURIComponent(q)}`, priceSelector: '.price', titleSelector: '.product-title', waitSelector: '.product-tile' }
    ]
}

function getStoresForCurrency(currency: string) {
    return STORE_CONFIGS[currency] || STORE_CONFIGS['USD']
}

interface ScrapedProduct {
    id: string
    user_id: string
    name: string
    url: string
    current_price: number
    currency: string
    image_url?: string
}

interface SearchResult {
    title: string
    price: number
    url?: string
    position: number
}

// Scrape multiple search results and find the best match
async function scrapeSearchResults(
    url: string,
    priceSelector: string,
    titleSelector: string,
    waitSelector: string,
    targetProductName: string,
    referencePrice: number | null,
    expectedCurrency: string = 'USD',
    maxResults: number = 10
): Promise<{ price: number; currency: string; title: string; score: number } | null> {
    let browser
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        })

        const page = await browser.newPage()
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        await page.setViewport({ width: 1920, height: 1080 })

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })

        // Wait for search results
        try {
            await page.waitForSelector(waitSelector, { timeout: 10000 })
        } catch {
            // Continue anyway
        }

        // Extra wait for dynamic content
        await new Promise(r => setTimeout(r, 2000))

        // Extract multiple results
        const results = await page.evaluate((pSelector, tSelector, wSelector, maxRes) => {
            const results: Array<{ title: string; price: number; position: number }> = []

            // Find all result containers
            const containers = document.querySelectorAll(wSelector)

            for (let i = 0; i < Math.min(containers.length, maxRes); i++) {
                const container = containers[i]

                // Extract title from this result
                let title = ''
                const titleSelectors = [
                    tSelector,
                    'h2',
                    'h3',
                    '[data-testid="product-title"]',
                    '[data-test="product-title"]',
                    '.s-item__title',
                    '.product-title',
                    'a[href*="/"]'
                ].filter(s => s) as string[]

                for (const sel of titleSelectors) {
                    const titleEl = container.querySelector(sel)
                    if (titleEl?.textContent?.trim()) {
                        title = titleEl.textContent.trim().substring(0, 150)
                        break
                    }
                }

                // Extract price from this result
                let price = 0
                const priceElements = container.querySelectorAll(pSelector)

                for (const el of priceElements) {
                    const text = el.textContent?.trim() || ''
                    if (text) {
                        const match = text.match(/[$£€]?\s*(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)/)
                        if (match) {
                            let priceStr = match[1].replace(/\s/g, '')

                            // Handle EU format (comma as decimal separator)
                            if (priceStr.match(/,\d{2}$/) && !priceStr.includes('.')) {
                                priceStr = priceStr.replace(',', '.')
                            } else {
                                priceStr = priceStr.replace(/,/g, '')
                            }

                            const parsedPrice = parseFloat(priceStr)
                            if (parsedPrice > 0 && parsedPrice < 100000) {
                                price = parsedPrice
                                break
                            }
                        }
                    }
                }

                if (title && price > 0) {
                    results.push({ title, price, position: i })
                }
            }

            return results
        }, priceSelector, titleSelector, waitSelector, maxResults)

        if (!results || results.length === 0) {
            return null
        }

        console.log(`    📊 Found ${results.length} results, scoring matches...`)

        // Score each result
        interface ScoredResult extends SearchResult {
            score: number
        }

        const scoredResults: ScoredResult[] = results.map(result => {
            // Calculate title similarity (0-1)
            const titleSimilarity = calculateSimilarity(targetProductName, result.title)

            // Calculate keyword overlap (0-1)
            const keywordScore = calculateKeywordScore(targetProductName, result.title)

            // Position score (first results are more relevant, score 0.5-1.0)
            const positionScore = 1 - (result.position * 0.05)

            // Price reasonableness score (if we have a reference price)
            let priceScore = 0.5 // neutral if no reference
            if (referencePrice && referencePrice > 0) {
                const priceRatio = result.price / referencePrice
                // Prefer prices within 50% to 150% of reference price
                if (priceRatio >= 0.5 && priceRatio <= 1.5) {
                    // Best score for prices close to reference
                    priceScore = 1 - Math.abs(1 - priceRatio)
                } else if (priceRatio < 0.5) {
                    // Too cheap might be wrong product
                    priceScore = 0.2
                } else {
                    // Too expensive might be bundle or wrong product
                    priceScore = 0.3
                }
            }

            // Weighted total score
            const totalScore = (
                titleSimilarity * 0.4 +
                keywordScore * 0.3 +
                positionScore * 0.2 +
                priceScore * 0.1
            )

            return {
                ...result,
                score: totalScore
            }
        })

        // Sort by score and take the best
        scoredResults.sort((a, b) => b.score - a.score)

        const bestMatch = scoredResults[0]

        console.log(`    🏆 Best match: "${bestMatch.title.substring(0, 50)}..." (score: ${bestMatch.score.toFixed(2)}, price: ${expectedCurrency} ${bestMatch.price})`)

        // Only return if score is above threshold (0.3 is reasonable)
        if (bestMatch.score >= 0.3) {
            return {
                price: bestMatch.price,
                currency: expectedCurrency,
                title: bestMatch.title,
                score: bestMatch.score
            }
        }

        console.log(`    ⚠️ Best match score too low (${bestMatch.score.toFixed(2)}), rejecting`)
        return null

    } catch (err) {
        console.error(`    ❌ Search scrape failed:`, err)
        return null
    } finally {
        if (browser) await browser.close()
    }
}

async function scrapeWithPuppeteer(url: string, priceSelector: string, waitSelector?: string, expectedCurrency: string = 'USD'): Promise<{ price: number; currency: string; title?: string } | null> {
    let browser
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        })

        const page = await browser.newPage()
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        await page.setViewport({ width: 1920, height: 1080 })

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })

        // Wait for content to load
        if (waitSelector) {
            try {
                await page.waitForSelector(waitSelector, { timeout: 10000 })
            } catch {
                // Continue anyway
            }
        }

        // Extra wait for dynamic content
        await new Promise(r => setTimeout(r, 2000))

        // Extract price and title
        const scrapeData = await page.evaluate((selector, priorityTitleSelector) => {
            // Get page title - try common product title selectors first
            const titleSelectors = [
                priorityTitleSelector,      // Use the store-specific wait selector first!
                '#productTitle',           // Amazon
                '[data-test="product-title"]', // Argos, Target
                '[data-testid="product-title"]', // Walmart
                '[data-testid="x-item-title"]', // eBay
                '.product-name h1',
                '.product-title',
                'h1'                        // Fallback to first h1
            ].filter(s => s) as string[]

            let title = ''
            for (const sel of titleSelectors) {
                const el = document.querySelector(sel)
                if (el?.textContent?.trim()) {
                    title = el.textContent.trim()
                    // Limit length and clean up
                    title = title.substring(0, 100).replace(/\s+/g, ' ').trim()
                    break
                }
            }

            // Get price
            const elements = Array.from(document.querySelectorAll(selector))
            for (const el of elements) {
                const text = el.textContent?.trim() || ''
                if (text) {
                    // Match price patterns - handle different formats
                    const match = text.match(/[$£€]?\s*(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)/)
                    if (match) {
                        // Normalize price - handle both 1,234.56 and 1.234,56 formats
                        let priceStr = match[1].replace(/\s/g, '')
                        // If comma is the decimal separator (EU format like 12,99)
                        if (priceStr.match(/,\d{2}$/) && !priceStr.includes('.')) {
                            priceStr = priceStr.replace(',', '.')
                        } else {
                            // Remove thousand separators
                            priceStr = priceStr.replace(/,/g, '')
                        }
                        const price = parseFloat(priceStr)
                        if (price > 0 && price < 100000) {
                            return { price, title }
                        }
                    }
                }
            }
            return title ? { price: 0, title } : null
        }, priceSelector, waitSelector)

        if (scrapeData && scrapeData.price > 0) {
            return { price: scrapeData.price, currency: expectedCurrency, title: scrapeData.title || undefined }
        }
        return null
    } catch (err) {
        console.error(`Puppeteer scrape failed for ${url}:`, err)
        return null
    } finally {
        if (browser) await browser.close()
    }
}

async function scrapeProductPrice(url: string, expectedCurrency: string = 'USD'): Promise<{ price: number; currency: string; title?: string } | null> {
    // Determine which selectors to use based on the URL
    let selectors: string
    let waitSelector: string | undefined

    if (url.includes('amazon.')) {
        // Amazon-specific selectors
        selectors = [
            '.a-price .a-offscreen',
            '#corePrice_feature_div .a-offscreen',
            '#corePriceDisplay_desktop_feature_div .a-offscreen',
            '.a-price-whole',
            '#priceblock_ourprice',
            '#priceblock_dealprice',
            '#price_inside_buybox',
            'span.a-price span.a-offscreen'
        ].join(', ')
        waitSelector = '#productTitle, #title'
    } else if (url.includes('argos.co.uk')) {
        // Argos-specific selectors (UK)
        selectors = [
            '[data-test="product-price-primary"]',
            '[data-test="product-price"]',
            '.ProductPrice',
            '[class*="price" i]'
        ].join(', ')
        waitSelector = '[data-test="product-title"]'
    } else if (url.includes('ebay.')) {
        // eBay-specific selectors (works for all locales)
        selectors = [
            '[data-testid="x-price-primary"]',
            '.x-price-primary',
            '.x-price-approx',
            '.mainPrice',
            '.ux-textspans.ux-textspans--BOLD'
        ].join(', ')
        waitSelector = '[data-testid="x-item-title"]'
    } else if (url.includes('walmart.')) {
        // Walmart-specific selectors
        selectors = [
            '[data-automation-id="product-price"]',
            '[data-testid="price-main"]',
            '.f1.bold',
            '#price'
        ].join(', ')
        waitSelector = '[data-testid="product-title"]'
    } else if (url.includes('target.com')) {
        // Target-specific selectors
        selectors = [
            '[data-test="product-price"]',
            '[data-test="current-price"]',
            '.styles__CurrentPriceFull'
        ].join(', ')
        waitSelector = '[data-test="product-title"]'
    } else if (url.includes('bestbuy.')) {
        // Best Buy-specific selectors
        selectors = [
            '.priceView-customer-price span',
            '[data-testid="customer-price"]',
            '.pricing-price__regular-price'
        ].join(', ')
        waitSelector = '.sku-title'
    } else if (url.includes('johnlewis.com')) {
        // John Lewis-specific selectors (UK)
        selectors = [
            '.price--now',
            '.price',
            '[data-test="product-price"]',
            '[class*="price"]'
        ].join(', ')
        waitSelector = '[data-test="product-title"]'
    } else if (url.includes('pricerunner.')) {
        // PriceRunner selectors
        selectors = [
            'span[class*="Price"]',
            'span[class*="price"]',
            '[data-testid="price"]'
        ].join(', ')
        waitSelector = 'h1'
    } else {
        // Generic selectors for other sites
        selectors = [
            'meta[property="product:price:amount"]',
            'meta[property="og:price:amount"]',
            '[data-testid="price"]',
            '[data-test="price"]',
            '.price',
            '.product-price',
            '.Price',
            '#price'
        ].join(', ')
    }

    return scrapeWithPuppeteer(url, selectors, waitSelector, expectedCurrency)
}

async function scrapeComparisonPrices(productName: string, productId: string, currency: string, referencePrice: number | null = null): Promise<void> {
    // Extract specs from product name for more accurate searching
    const { brand, specs } = extractProductSpecs(productName)

    // Build search query: brand + key words + specs
    const words = productName
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(w => w.length > 2 && !/^(with|the|and|for|from)$/i.test(w))

    // Take brand + first 3-4 keywords + include any extracted specs
    const keyWords = words.slice(0, 5)

    // Add specs to the query if they exist (e.g., "40oz", "1L", "256GB")
    const specTerms = specs.filter(s => !keyWords.some(kw => kw.toLowerCase().includes(s.toLowerCase())))
    const cleanQuery = [...keyWords, ...specTerms].join(' ')

    console.log(`🔍 Searching comparison prices for: "${cleanQuery}" (${currency})`)
    if (referencePrice) {
        console.log(`   Reference price: ${currency} ${referencePrice}`)
    }

    const stores = getStoresForCurrency(currency)

    for (const store of stores) {
        try {
            const searchUrl = store.searchUrl(cleanQuery)
            console.log(`  → Checking ${store.name}...`)

            // Use intelligent multi-result scraping with product matching
            const result = await scrapeSearchResults(
                searchUrl,
                store.priceSelector,
                store.titleSelector,
                store.waitSelector,
                productName,
                referencePrice,
                currency,
                10 // Check up to 10 results
            )

            if (result && result.price > 0) {
                console.log(`    ✅ Match found: ${result.currency} ${result.price}`)

                // Upsert comparison price
                await supabase
                    .from('comparison_prices')
                    .upsert({
                        product_id: productId,
                        store_name: store.name,
                        store_url: searchUrl,
                        price: result.price,
                        currency: result.currency,
                        last_checked: new Date().toISOString(),
                        is_available: true
                    }, { onConflict: 'product_id,store_name' })
            } else {
                console.log(`    ⚠️ No matching product found`)

                // Update as unavailable but keep link
                await supabase
                    .from('comparison_prices')
                    .upsert({
                        product_id: productId,
                        store_name: store.name,
                        store_url: searchUrl,
                        price: null,
                        last_checked: new Date().toISOString(),
                        is_available: false
                    }, { onConflict: 'product_id,store_name' })
            }

            // Rate limiting - wait between stores
            await new Promise(r => setTimeout(r, 3000))
        } catch (err) {
            console.error(`    ❌ Error scraping ${store.name}:`, err)
        }
    }
}

async function sendDiscordNotification(webhookUrl: string, product: ScrapedProduct, oldPrice: number, newPrice: number) {
    const diff = oldPrice - newPrice
    const percent = ((diff / oldPrice) * 100).toFixed(1)

    const payload = {
        embeds: [{
            title: '🚨 Price Drop Alert!',
            description: `**${product.name}** just dropped in price!`,
            url: product.url,
            color: 0xFF9EB5,
            fields: [
                { name: 'Old Price', value: `${product.currency} ${oldPrice.toFixed(2)}`, inline: true },
                { name: 'New Price', value: `${product.currency} ${newPrice.toFixed(2)}`, inline: true },
                { name: 'Savings', value: `${product.currency} ${diff.toFixed(2)} (${percent}%)`, inline: false }
            ],
            thumbnail: { url: product.image_url || '' },
            footer: { text: 'PricePulse. Tracking your deals.' },
            timestamp: new Date().toISOString()
        }]
    }

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
    } catch (err) {
        console.error('Failed to send Discord notification:', err)
    }
}

async function runPriceCheck() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🚀 PricePulse Worker Start')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // 1. Fetch all products with URLs
    const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .not('url', 'is', null)

    if (error) {
        console.error('Failed to fetch products:', error)
        return
    }

    console.log(`📦 Found ${products?.length || 0} products to check\n`)

    for (const product of products || []) {
        // Extract real product name and currency from URL if stored values are placeholders
        let productName = product.name
        let productCurrency = product.currency || 'USD'

        if (product.url) {
            try {
                const url = new URL(product.url)

                // Determine currency from domain
                if (url.hostname.includes('.co.uk')) productCurrency = 'GBP'
                else if (url.hostname.includes('.de') || url.hostname.includes('.fr') || url.hostname.includes('.it') || url.hostname.includes('.es')) productCurrency = 'EUR'
                else if (url.hostname.includes('.ca')) productCurrency = 'CAD'
                else if (url.hostname.includes('.com.au')) productCurrency = 'AUD'

                // Extract product name from URL if stored name is a placeholder
                if (productName.toLowerCase().startsWith('scraping') || productName.length < 5) {
                    const pathParts = url.pathname.split('/').filter(p => p && p.length > 0)
                    const dpIndex = pathParts.findIndex(p => p === 'dp')
                    if (dpIndex > 0) {
                        productName = pathParts[dpIndex - 1].replace(/[-_]/g, ' ').trim()
                    } else {
                        const slugPart = pathParts.find(p => p.length > 5 && p.includes('-'))
                        if (slugPart) productName = slugPart.replace(/[-_]/g, ' ').trim()
                    }
                }
            } catch { /* ignore */ }
        }

        console.log(`\n📍 Processing: ${productName.substring(0, 50)}...`)
        console.log(`   URL: ${product.url}`)
        console.log(`   Currency: ${productCurrency}`)

        // Step 1: Scrape main product price with the correct expected currency
        const result = await scrapeProductPrice(product.url!, productCurrency)

        if (result) {
            const oldPrice = product.current_price
            const newPrice = result.price

            // Use scraped title if available, otherwise fallback to URL-extracted name, otherwise keep existing
            // But only if existing name is a placeholder/queued/pending or scraped title is better
            let finalName = product.name

            if (result.title && result.title.length > 5) {
                finalName = result.title
            } else if (productName && productName !== product.name) {
                finalName = productName
            }

            // Update product with proper name, currency, and price
            await supabase
                .from('products')
                .update({
                    name: finalName,
                    currency: productCurrency,
                    current_price: newPrice,
                    last_checked: new Date().toISOString(),
                    status: 'tracking'
                })
                .eq('id', product.id)

            // Update local variable for comparison scraping
            productName = finalName

            console.log(`   ✅ Price: ${productCurrency} ${newPrice}`)

            if (oldPrice && newPrice < oldPrice) {
                console.log(`   🤑 PRICE DROP: ${oldPrice} → ${newPrice}`)

                await supabase
                    .from('price_history')
                    .insert({
                        product_id: product.id,
                        price: newPrice,
                        currency: productCurrency,
                        source: 'price_worker_automation'
                    })
            } else if (oldPrice && newPrice > oldPrice) {
                console.log(`   📈 Price increased: ${oldPrice} → ${newPrice}`)

                await supabase
                    .from('price_history')
                    .insert({
                        product_id: product.id,
                        price: newPrice,
                        currency: productCurrency,
                        source: 'price_worker_automation'
                    })
            }

            // Step 2: Only scrape comparison prices if main product succeeded
            // Pass the current price as reference for better matching
            await scrapeComparisonPrices(productName, product.id, productCurrency, newPrice)
        } else {
            console.warn(`   ⚠️ Could not scrape main product price - skipping comparisons`)
            await supabase
                .from('products')
                .update({ status: 'scrape_failed' })
                .eq('id', product.id)
            // Skip comparison scraping when main product fails
        }

        // Rate limiting between products
        await new Promise(r => setTimeout(r, 5000))
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ PricePulse Worker Complete')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

runPriceCheck()
