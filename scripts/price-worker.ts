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

// Locale-specific store configurations
const STORE_CONFIGS: Record<string, Array<{
    name: string
    searchUrl: (query: string) => string
    priceSelector: string
    waitSelector: string
}>> = {
    'USD': [
        { name: 'Amazon', searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`, priceSelector: '.a-price .a-offscreen, .a-price-whole', waitSelector: '[data-component-type="s-search-result"]' },
        { name: 'eBay', searchUrl: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`, priceSelector: '.s-item__price', waitSelector: '.s-item' },
        { name: 'Walmart', searchUrl: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`, priceSelector: '[data-automation-id="product-price"] span', waitSelector: '[data-item-id]' }
    ],
    'GBP': [
        { name: 'Amazon', searchUrl: (q) => `https://www.amazon.co.uk/s?k=${encodeURIComponent(q)}`, priceSelector: '.a-price .a-offscreen, .a-price-whole, span.a-price', waitSelector: '[data-component-type="s-search-result"]' },
        { name: 'eBay', searchUrl: (q) => `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(q)}`, priceSelector: '.s-item__price, .x-price-primary span, [data-testid="item-price"]', waitSelector: '.srp-results' },
        { name: 'Argos', searchUrl: (q) => `https://www.argos.co.uk/search/${encodeURIComponent(q)}/`, priceSelector: '[data-test="product-card-price"], .ProductCardstyles__Price, [class*="Price"]', waitSelector: '[data-test="component-product-card"]' }
    ],
    'EUR': [
        { name: 'Amazon', searchUrl: (q) => `https://www.amazon.de/s?k=${encodeURIComponent(q)}`, priceSelector: '.a-price .a-offscreen, .a-price-whole', waitSelector: '[data-component-type="s-search-result"]' },
        { name: 'eBay', searchUrl: (q) => `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(q)}`, priceSelector: '.s-item__price', waitSelector: '.s-item' },
        { name: 'Idealo', searchUrl: (q) => `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(q)}`, priceSelector: '[data-testid="price"]', waitSelector: '[data-testid="product-item"]' }
    ],
    'CAD': [
        { name: 'Amazon', searchUrl: (q) => `https://www.amazon.ca/s?k=${encodeURIComponent(q)}`, priceSelector: '.a-price .a-offscreen, .a-price-whole', waitSelector: '[data-component-type="s-search-result"]' },
        { name: 'eBay', searchUrl: (q) => `https://www.ebay.ca/sch/i.html?_nkw=${encodeURIComponent(q)}`, priceSelector: '.s-item__price', waitSelector: '.s-item' },
        { name: 'Best Buy CA', searchUrl: (q) => `https://www.bestbuy.ca/en-ca/search?search=${encodeURIComponent(q)}`, priceSelector: '[data-automation="product-price"]', waitSelector: '[data-automation="product-item"]' }
    ],
    'AUD': [
        { name: 'Amazon', searchUrl: (q) => `https://www.amazon.com.au/s?k=${encodeURIComponent(q)}`, priceSelector: '.a-price .a-offscreen, .a-price-whole', waitSelector: '[data-component-type="s-search-result"]' },
        { name: 'eBay', searchUrl: (q) => `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(q)}`, priceSelector: '.s-item__price', waitSelector: '.s-item' },
        { name: 'Kogan', searchUrl: (q) => `https://www.kogan.com/au/search/?q=${encodeURIComponent(q)}`, priceSelector: '[data-testid="price"]', waitSelector: '[data-testid="product-card"]' }
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

async function scrapeWithPuppeteer(url: string, priceSelector: string, waitSelector?: string, expectedCurrency: string = 'USD'): Promise<{ price: number; currency: string } | null> {
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

        // Extract price - just get the number, use expected currency
        const priceData = await page.evaluate((selector) => {
            const elements = document.querySelectorAll(selector)
            for (const el of elements) {
                const text = el.textContent?.trim() || ''
                if (text) {
                    // Match price patterns - handle different formats
                    const match = text.match(/[\$£€]?\s*(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)/)
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
                            return { price }
                        }
                    }
                }
            }
            return null
        }, priceSelector)

        if (priceData) {
            return { price: priceData.price, currency: expectedCurrency }
        }
        return null
    } catch (err) {
        console.error(`Puppeteer scrape failed for ${url}:`, err)
        return null
    } finally {
        if (browser) await browser.close()
    }
}

async function scrapeProductPrice(url: string): Promise<{ price: number; currency: string } | null> {
    // Use common selectors for product pages
    const selectors = [
        // Meta tags (most reliable)
        'meta[property="product:price:amount"]',
        'meta[property="og:price:amount"]',
        // Common price selectors
        '.a-price .a-offscreen',
        '.a-price-whole',
        '#priceblock_ourprice',
        '#priceblock_dealprice',
        '.price-item--sale',
        '.price-item--regular',
        '[data-testid="price"]',
        '.product-price',
        '.price'
    ].join(', ')

    return scrapeWithPuppeteer(url, selectors)
}

async function scrapeComparisonPrices(productName: string, productId: string, currency: string): Promise<void> {
    // Clean query - take first 5 meaningful words
    const cleanQuery = productName
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, 5)
        .join(' ')

    console.log(`🔍 Searching comparison prices for: "${cleanQuery}" (${currency})`)

    const stores = getStoresForCurrency(currency)

    for (const store of stores) {
        try {
            const searchUrl = store.searchUrl(cleanQuery)
            console.log(`  → Checking ${store.name}...`)

            // Pass expected currency so the result uses the correct currency
            const result = await scrapeWithPuppeteer(searchUrl, store.priceSelector, store.waitSelector, currency)

            if (result && result.price > 0) {
                console.log(`    ✅ Found price: ${result.currency} ${result.price}`)

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
                console.log(`    ⚠️ No price found`)

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
        console.log(`\n📍 Processing: ${product.name.substring(0, 50)}...`)

        // Step 1: Scrape main product price
        const result = await scrapeProductPrice(product.url!)

        if (result) {
            const oldPrice = product.current_price
            const newPrice = result.price

            // Update last_checked
            await supabase
                .from('products')
                .update({ last_checked: new Date().toISOString(), status: 'tracking' })
                .eq('id', product.id)

            if (oldPrice && newPrice < oldPrice) {
                console.log(`   🤑 PRICE DROP: ${oldPrice} → ${newPrice}`)

                await supabase
                    .from('products')
                    .update({ current_price: newPrice })
                    .eq('id', product.id)

                await supabase
                    .from('price_history')
                    .insert({
                        product_id: product.id,
                        price: newPrice,
                        currency: result.currency,
                        source: 'price_worker_automation'
                    })

                // Send Discord notification
                const { data: settings } = await supabase
                    .from('user_settings')
                    .select('discord_webhook')
                    .eq('id', product.user_id)
                    .single()

                if (settings?.discord_webhook) {
                    console.log(`   🔔 Sending Discord alert...`)
                    await sendDiscordNotification(settings.discord_webhook, product, oldPrice, newPrice)
                }
            } else if (!oldPrice || newPrice !== oldPrice) {
                await supabase
                    .from('products')
                    .update({ current_price: newPrice })
                    .eq('id', product.id)

                await supabase
                    .from('price_history')
                    .insert({
                        product_id: product.id,
                        price: newPrice,
                        currency: result.currency,
                        source: 'price_worker_automation'
                    })
            }
        } else {
            console.warn(`   ⚠️ Could not scrape main product price`)
            await supabase
                .from('products')
                .update({ status: 'scrape_failed' })
                .eq('id', product.id)
        }

        // Step 2: Scrape comparison prices from other stores (locale-aware)
        await scrapeComparisonPrices(product.name, product.id, product.currency || 'USD')

        // Rate limiting between products
        await new Promise(r => setTimeout(r, 5000))
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ PricePulse Worker Complete')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

runPriceCheck()
