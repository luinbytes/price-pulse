import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import fetch from 'node-fetch'

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function scrapePrice(url: string): Promise<{ price: number; currency: string } | null> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        })

        if (!response.ok) return null

        const html = await response.text()
        const $ = cheerio.load(html)

        let price: number | null = null
        let currency = 'USD'

        // 1. Try meta tags
        const priceMeta = $('meta[property="product:price:amount"]').attr('content') ||
            $('meta[property="og:price:amount"]').attr('content')

        const currencyMeta = $('meta[property="product:price:currency"]').attr('content') ||
            $('meta[property="og:price:currency"]').attr('content')

        if (priceMeta) {
            const num = parseFloat(priceMeta.replace(/[^0-9.]/g, ''))
            if (!isNaN(num)) price = num
        }
        if (currencyMeta) currency = currencyMeta

        // 2. Try common selectors if meta failed
        if (price === null) {
            const selectors = [
                '.a-price-whole', '#priceblock_ourprice', '#priceblock_dealprice', // Amazon
                '.price-item--sale', '.price-item--regular', // Shopify
                '[data-testid="price-label"]', '.price'
            ]

            for (const selector of selectors) {
                const text = $(selector).first().text().trim()
                if (text) {
                    const num = parseFloat(text.replace(/[^0-9.]/g, ''))
                    if (!isNaN(num)) {
                        price = num
                        if (text.includes('$')) currency = 'USD'
                        else if (text.includes('€')) currency = 'EUR'
                        else if (text.includes('£')) currency = 'GBP'
                        break
                    }
                }
            }
        }

        return price !== null ? { price, currency } : null
    } catch (err) {
        console.error(`Scraping failed for ${url}:`, err)
        return null
    }
}

async function sendDiscordNotification(webhookUrl: string, product: any, oldPrice: number, newPrice: number) {
    const diff = oldPrice - newPrice
    const percent = ((diff / oldPrice) * 100).toFixed(1)

    const payload = {
        embeds: [{
            title: '🚨 Price Drop Alert!',
            description: `**${product.name}** just dropped in price!`,
            url: product.url,
            color: 0xFF9EB5, // PricePulse Pink
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
    console.log('--- PricePulse Worker Start ---')

    // 1. Fetch all products with URLs
    const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .not('url', 'is', null)

    if (error) {
        console.error('Failed to fetch products:', error)
        return
    }

    console.log(`Checking ${products?.length || 0} products...`)

    for (const product of products || []) {
        console.log(`Checking: ${product.name}...`)
        const result = await scrapePrice(product.url!)

        if (result) {
            const oldPrice = product.current_price
            const newPrice = result.price

            // Update last_checked
            await supabase
                .from('products')
                .update({ last_checked: new Date().toISOString() })
                .eq('id', product.id)

            if (oldPrice && newPrice < oldPrice) {
                console.log(`🤑 Price drop found for ${product.name}: ${oldPrice} -> ${newPrice}`)

                // Update product current price
                await supabase
                    .from('products')
                    .update({ current_price: newPrice })
                    .eq('id', product.id)

                // Insert history
                await supabase
                    .from('price_history')
                    .insert({
                        product_id: product.id,
                        price: newPrice,
                        currency: result.currency,
                        source: 'price_worker_automation'
                    })

                // Fetch User Settings for Discord Webhook
                const { data: settings } = await supabase
                    .from('user_settings')
                    .select('discord_webhook')
                    .eq('id', product.user_id)
                    .single()

                if (settings?.discord_webhook) {
                    console.log(`🔔 Sending Discord alert to user ${product.user_id}...`)
                    await sendDiscordNotification(settings.discord_webhook, product, oldPrice, newPrice)
                }
            } else if (!oldPrice || newPrice !== oldPrice) {
                // If no history yet, record current price as first history entry if changed
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
            console.warn(`⚠️ Could not scrape price for: ${product.name}`)
        }
    }

    console.log('--- PricePulse Worker Complete ---')
}

runPriceCheck()
