import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { scrapeProductInfo } from '@/lib/utils-app'
import { Link as LinkIcon, Camera } from 'lucide-react'

interface ProductInputModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onProductAdded?: () => void
}

export function ProductInputModal({ open, onOpenChange, onProductAdded }: ProductInputModalProps) {
    const { user } = useAuth()
    const [loading, setLoading] = useState(false)
    const [scraping, setScraping] = useState(false)

    // Form state
    const [url, setUrl] = useState('')
    const [name, setName] = useState('')
    const [price, setPrice] = useState('')
    const [currency, setCurrency] = useState('USD')
    const [imageUrl, setImageUrl] = useState('')

    // Screenshot state
    const [isExtracting, setIsExtracting] = useState(false)
    const [isDragging, setIsDragging] = useState(false)

    // Reset form on open/close
    useEffect(() => {
        if (!open) {
            setUrl('')
            setName('')
            setPrice('')
            setCurrency('USD')
            setImageUrl('')
            setIsDragging(false)
        } else if (user) {
            // Fetch user's default currency when modal opens
            const fetchDefaultCurrency = async () => {
                const { data } = await supabase
                    .from('user_settings')
                    .select('default_currency')
                    .eq('id', user.id)
                    .single()

                if (data?.default_currency) {
                    setCurrency(data.default_currency)
                }
            }
            fetchDefaultCurrency()
        }
    }, [open, user])

    const handleUrlBlur = async () => {
        if (!url || !url.startsWith('http')) return

        setScraping(true)
        const info = await scrapeProductInfo(url)
        if (info) {
            if (info.name) setName(info.name)
            if (info.price) setPrice(info.price.toString())
            if (info.currency) setCurrency(info.currency)
            if (info.image) setImageUrl(info.image)
            toast.success('Product info auto-filled!')
        }
        setScraping(false)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user || !name || !price) return

        setLoading(true)
        try {
            const numPrice = parseFloat(price.replace(/[^0-9.]/g, ''))

            const { error } = await supabase.from('products').insert({
                user_id: user.id,
                name: name,
                url: url || null,
                current_price: numPrice,
                currency: currency,
                image_url: imageUrl || null
            })

            if (error) throw error

            toast.success('Product added to tracking!')
            onProductAdded?.()
            onOpenChange(false)
        } catch (err) {
            toast.error('Failed to add product')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleScreenshotUpload = async (file: File) => {
        setIsExtracting(true)
        try {
            const Tesseract = await import('tesseract.js')
            const result = await Tesseract.recognize(file, 'eng')
            const text = result.data.text

            // Try to find a price
            const priceMatch = text.match(/\$\s*(\d+[.,]\d{2})/) || text.match(/(\d+[.,]\d{2})/)
            if (priceMatch) {
                setPrice(priceMatch[1].replace(',', '.'))
                toast.success('Price extracted from image!')
            } else {
                toast.warning('Found text, but no price. Please enter manually.')
            }
        } catch (err) {
            toast.error('OCR failed')
        } finally {
            setIsExtracting(false)
        }
    }

    // Drag and drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file && file.type.startsWith('image/')) {
            handleScreenshotUpload(file)
        }
    }

    // Paste handler
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (!open) return
            const items = e.clipboardData?.items
            if (!items) return
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile()
                    if (blob) handleScreenshotUpload(blob)
                    break
                }
            }
        }
        window.addEventListener('paste', handlePaste)
        return () => window.removeEventListener('paste', handlePaste)
    }, [open])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#1A1A1A] border-[#2A2A2A] text-[#EDEDED] sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-[#FF9EB5]">Add New Product</DialogTitle>
                    <DialogDescription className="text-[#9CA3AF]">
                        Start tracking a product price from any online store.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="url" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-[#0A0A0A] border border-[#2A2A2A] mb-4 p-1">
                        <TabsTrigger value="url" className="text-[#9CA3AF] data-[state=active]:bg-[#FF9EB5] data-[state=active]:text-black gap-2 font-medium">
                            <LinkIcon className="w-4 h-4" /> Store URL
                        </TabsTrigger>
                        <TabsTrigger value="screenshot" className="text-[#9CA3AF] data-[state=active]:bg-[#FF9EB5] data-[state=active]:text-black gap-2 font-medium">
                            <Camera className="w-4 h-4" /> Scan Image
                        </TabsTrigger>
                    </TabsList>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <TabsContent value="url" className="space-y-4 mt-0">
                            <div className="space-y-2">
                                <Label htmlFor="url">Store URL</Label>
                                <Input
                                    id="url"
                                    placeholder="Paste Amazon, eBay, etc. link..."
                                    value={url}
                                    onChange={(e) => {
                                        setUrl(e.target.value)
                                        // Trigger scraping if URL looks complete (starts with http and has some length)
                                        // But onBlur is safer to avoid excessive proxy calls
                                    }}
                                    onBlur={handleUrlBlur}
                                    className="bg-[#0A0A0A] border-[#2A2A2A] text-[#EDEDED] focus:border-[#FF9EB5]"
                                />
                                {scraping && <p className="text-xs text-[#FF9EB5] animate-pulse">Fetching details...</p>}
                            </div>
                        </TabsContent>

                        <TabsContent value="screenshot" className="space-y-4 mt-0">
                            <div
                                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all group overflow-hidden relative
                                    ${isDragging ? 'border-[#FF9EB5] bg-[#FF9EB5]/20' : 'border-[#FF9EB5]/30 bg-[#FF9EB5]/5 hover:border-[#FF9EB5] hover:bg-[#FF9EB5]/10'}`}
                                onClick={() => document.getElementById('modal-screenshot-input')?.click()}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <input
                                    id="modal-screenshot-input"
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) handleScreenshotUpload(file)
                                    }}
                                />
                                {isExtracting ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF9EB5]"></div>
                                        <p className="text-[#FF9EB5] font-medium animate-pulse">Extracting Price...</p>
                                    </div>
                                ) : (
                                    <div className="text-[#EDEDED]">
                                        <Camera className="w-12 h-12 mx-auto mb-3 text-[#FF9EB5] opacity-80 group-hover:scale-110 transition-transform" />
                                        <p className="text-lg font-semibold">Upload or Paste Image</p>
                                        <p className="text-xs text-[#9CA3AF] mt-1">Drag files or Ctrl+V here</p>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <div className="space-y-4 border-t border-[#2A2A2A] pt-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Product Name</Label>
                                <Input
                                    id="name"
                                    placeholder="Enter product name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="bg-[#0A0A0A] border-[#2A2A2A] text-[#EDEDED] focus:border-[#FF9EB5]"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="price">Current Price</Label>
                                    <Input
                                        id="price"
                                        placeholder="0.00"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        className="bg-[#0A0A0A] border-[#2A2A2A] text-[#EDEDED] focus:border-[#FF9EB5]"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="currency">Currency</Label>
                                    <select
                                        id="currency"
                                        value={currency}
                                        onChange={(e) => setCurrency(e.target.value)}
                                        className="w-full h-10 px-3 rounded-md bg-[#0A0A0A] border border-[#2A2A2A] text-[#EDEDED] focus:border-[#FF9EB5] focus:outline-none"
                                    >
                                        <option value="USD">USD ($)</option>
                                        <option value="EUR">EUR (€)</option>
                                        <option value="GBP">GBP (£)</option>
                                        <option value="JPY">JPY (¥)</option>
                                    </select>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={loading || scraping || !name || !price}
                                className="w-full bg-[#FF9EB5] hover:bg-[#B3688A] text-black font-bold h-12"
                            >
                                {loading ? 'Saving...' : 'Start Tracking'}
                            </Button>
                        </div>
                    </form>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
