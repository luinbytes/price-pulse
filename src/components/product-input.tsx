import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

interface ProductInputProps {
    onProductAdded?: () => void
}

export function ProductInput({ onProductAdded }: ProductInputProps) {
    const { user } = useAuth()
    const [loading, setLoading] = useState(false)

    // URL form state
    const [url, setUrl] = useState('')
    const [urlName, setUrlName] = useState('')
    const [urlPrice, setUrlPrice] = useState('')

    // Manual form state
    const [manualName, setManualName] = useState('')
    const [manualPrice, setManualPrice] = useState('')
    const [manualCurrency, setManualCurrency] = useState('USD')

    // Screenshot state
    const [screenshot, setScreenshot] = useState<File | null>(null)
    const [screenshotName, setScreenshotName] = useState('')
    const [extractedPrice, setExtractedPrice] = useState('')
    const [isExtracting, setIsExtracting] = useState(false)

    const handleUrlSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user || !urlName || !urlPrice) return

        setLoading(true)
        try {
            const price = parseFloat(urlPrice.replace(/[^0-9.]/g, ''))
            const currency = detectCurrency(urlPrice)

            const { error } = await supabase.from('products').insert({
                user_id: user.id,
                name: urlName,
                url: url,
                current_price: price,
                currency: currency
            })

            if (error) throw error

            toast.success('Product added successfully!')
            setUrl('')
            setUrlName('')
            setUrlPrice('')
            onProductAdded?.()
        } catch (err) {
            toast.error('Failed to add product')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user || !manualName || !manualPrice) return

        setLoading(true)
        try {
            const price = parseFloat(manualPrice.replace(/[^0-9.]/g, ''))

            const { error } = await supabase.from('products').insert({
                user_id: user.id,
                name: manualName,
                current_price: price,
                currency: manualCurrency
            })

            if (error) throw error

            toast.success('Product added successfully!')
            setManualName('')
            setManualPrice('')
            onProductAdded?.()
        } catch (err) {
            toast.error('Failed to add product')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleScreenshotUpload = async (file: File) => {
        setScreenshot(file)
        setIsExtracting(true)

        try {
            // Dynamic import of Tesseract.js for code splitting
            const Tesseract = await import('tesseract.js')

            const result = await Tesseract.recognize(file, 'eng', {
                logger: (m) => console.log(m)
            })

            const text = result.data.text
            const price = extractPriceFromText(text)

            if (price) {
                setExtractedPrice(price)
                toast.success(`Price extracted: ${price}`)
            } else {
                toast.warning('Could not find a price. Please enter manually.')
            }
        } catch (err) {
            toast.error('OCR failed. Please enter the price manually.')
            console.error(err)
        } finally {
            setIsExtracting(false)
        }
    }

    const handleScreenshotSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user || !screenshotName || !extractedPrice) return

        setLoading(true)
        try {
            const price = parseFloat(extractedPrice.replace(/[^0-9.]/g, ''))
            const currency = detectCurrency(extractedPrice)

            const { error } = await supabase.from('products').insert({
                user_id: user.id,
                name: screenshotName,
                current_price: price,
                currency: currency
            })

            if (error) throw error

            toast.success('Product added successfully!')
            setScreenshot(null)
            setScreenshotName('')
            setExtractedPrice('')
            onProductAdded?.()
        } catch (err) {
            toast.error('Failed to add product')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="bg-[#1A1A1A] border-[#2A2A2A]">
            <CardHeader>
                <CardTitle className="text-[#EDEDED]">Add Product</CardTitle>
                <CardDescription className="text-[#9CA3AF]">
                    Track a product by URL, screenshot, or manual entry
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="url" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-[#0A0A0A] border border-[#2A2A2A]">
                        <TabsTrigger value="url" className="data-[state=active]:bg-[#FF9EB5] data-[state=active]:text-black">
                            URL
                        </TabsTrigger>
                        <TabsTrigger value="screenshot" className="data-[state=active]:bg-[#FF9EB5] data-[state=active]:text-black">
                            Screenshot
                        </TabsTrigger>
                        <TabsTrigger value="manual" className="data-[state=active]:bg-[#FF9EB5] data-[state=active]:text-black">
                            Manual
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="url" className="mt-4">
                        <form onSubmit={handleUrlSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="url" className="text-[#EDEDED]">Product URL</Label>
                                <Input
                                    id="url"
                                    type="url"
                                    placeholder="https://amazon.com/product..."
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="bg-[#0A0A0A] border-[#2A2A2A] text-[#EDEDED] placeholder:text-[#9CA3AF]"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="urlName" className="text-[#EDEDED]">Product Name</Label>
                                <Input
                                    id="urlName"
                                    placeholder="iPhone 15 Pro Max"
                                    value={urlName}
                                    onChange={(e) => setUrlName(e.target.value)}
                                    className="bg-[#0A0A0A] border-[#2A2A2A] text-[#EDEDED] placeholder:text-[#9CA3AF]"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="urlPrice" className="text-[#EDEDED]">Current Price</Label>
                                <Input
                                    id="urlPrice"
                                    placeholder="$999.99"
                                    value={urlPrice}
                                    onChange={(e) => setUrlPrice(e.target.value)}
                                    className="bg-[#0A0A0A] border-[#2A2A2A] text-[#EDEDED] placeholder:text-[#9CA3AF]"
                                    required
                                />
                            </div>
                            <Button
                                type="submit"
                                disabled={loading || !urlName || !urlPrice}
                                className="w-full bg-[#FF9EB5] hover:bg-[#B3688A] text-black font-semibold"
                            >
                                {loading ? 'Adding...' : 'Add Product'}
                            </Button>
                        </form>
                    </TabsContent>

                    <TabsContent value="screenshot" className="mt-4">
                        <form onSubmit={handleScreenshotSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-[#EDEDED]">Upload Screenshot</Label>
                                <div
                                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                    ${screenshot ? 'border-[#FF9EB5] bg-[#FF9EB5]/10' : 'border-[#2A2A2A] hover:border-[#FF9EB5]'}`}
                                    onClick={() => document.getElementById('screenshot-input')?.click()}
                                >
                                    <input
                                        id="screenshot-input"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) handleScreenshotUpload(file)
                                        }}
                                    />
                                    {isExtracting ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF9EB5]"></div>
                                            <p className="text-[#9CA3AF]">Extracting price...</p>
                                        </div>
                                    ) : screenshot ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <svg className="w-8 h-8 text-[#FF9EB5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <p className="text-[#EDEDED]">{screenshot.name}</p>
                                            {extractedPrice && (
                                                <p className="text-[#FF9EB5] font-semibold">Found: {extractedPrice}</p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <svg className="w-8 h-8 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <p className="text-[#9CA3AF]">Click to upload a screenshot</p>
                                            <p className="text-xs text-[#9CA3AF]">We'll extract the price using OCR</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="screenshotName" className="text-[#EDEDED]">Product Name</Label>
                                <Input
                                    id="screenshotName"
                                    placeholder="Product name"
                                    value={screenshotName}
                                    onChange={(e) => setScreenshotName(e.target.value)}
                                    className="bg-[#0A0A0A] border-[#2A2A2A] text-[#EDEDED] placeholder:text-[#9CA3AF]"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="extractedPrice" className="text-[#EDEDED]">Price (edit if needed)</Label>
                                <Input
                                    id="extractedPrice"
                                    placeholder="$0.00"
                                    value={extractedPrice}
                                    onChange={(e) => setExtractedPrice(e.target.value)}
                                    className="bg-[#0A0A0A] border-[#2A2A2A] text-[#EDEDED] placeholder:text-[#9CA3AF]"
                                    required
                                />
                            </div>
                            <Button
                                type="submit"
                                disabled={loading || !screenshotName || !extractedPrice}
                                className="w-full bg-[#FF9EB5] hover:bg-[#B3688A] text-black font-semibold"
                            >
                                {loading ? 'Adding...' : 'Add Product'}
                            </Button>
                        </form>
                    </TabsContent>

                    <TabsContent value="manual" className="mt-4">
                        <form onSubmit={handleManualSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="manualName" className="text-[#EDEDED]">Product Name</Label>
                                <Input
                                    id="manualName"
                                    placeholder="Product name"
                                    value={manualName}
                                    onChange={(e) => setManualName(e.target.value)}
                                    className="bg-[#0A0A0A] border-[#2A2A2A] text-[#EDEDED] placeholder:text-[#9CA3AF]"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="manualPrice" className="text-[#EDEDED]">Price</Label>
                                    <Input
                                        id="manualPrice"
                                        placeholder="99.99"
                                        value={manualPrice}
                                        onChange={(e) => setManualPrice(e.target.value)}
                                        className="bg-[#0A0A0A] border-[#2A2A2A] text-[#EDEDED] placeholder:text-[#9CA3AF]"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="manualCurrency" className="text-[#EDEDED]">Currency</Label>
                                    <select
                                        id="manualCurrency"
                                        value={manualCurrency}
                                        onChange={(e) => setManualCurrency(e.target.value)}
                                        className="w-full h-10 px-3 rounded-md bg-[#0A0A0A] border border-[#2A2A2A] text-[#EDEDED]"
                                    >
                                        <option value="USD">$ USD</option>
                                        <option value="EUR">€ EUR</option>
                                        <option value="GBP">£ GBP</option>
                                        <option value="JPY">¥ JPY</option>
                                        <option value="CAD">$ CAD</option>
                                        <option value="AUD">$ AUD</option>
                                    </select>
                                </div>
                            </div>
                            <Button
                                type="submit"
                                disabled={loading || !manualName || !manualPrice}
                                className="w-full bg-[#FF9EB5] hover:bg-[#B3688A] text-black font-semibold"
                            >
                                {loading ? 'Adding...' : 'Add Product'}
                            </Button>
                        </form>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}

// Helper functions
function detectCurrency(priceText: string): string {
    if (priceText.includes('$')) return 'USD'
    if (priceText.includes('€')) return 'EUR'
    if (priceText.includes('£')) return 'GBP'
    if (priceText.includes('¥')) return 'JPY'
    return 'USD' // default
}

function extractPriceFromText(text: string): string | null {
    // Common price patterns
    const patterns = [
        /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,  // $1,234.56
        /€\d{1,3}(?:\.\d{3})*(?:,\d{2})?/,   // €1.234,56
        /£\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,   // £1,234.56
        /¥\d{1,3}(?:,\d{3})*/,               // ¥1,234
        /\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|EUR|GBP)/i, // 1,234.56 USD
    ]

    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match) return match[0]
    }

    return null
}
