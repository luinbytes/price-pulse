import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { scrapeProductInfo } from '@/lib/utils-app'
import { Link as LinkIcon, Loader2, AlertCircle } from 'lucide-react'

interface ProductInputModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onProductAdded?: () => void
}

export function ProductInputModal({ open, onOpenChange, onProductAdded }: ProductInputModalProps) {
    const { user } = useAuth()
    const [loading, setLoading] = useState(false)
    const [url, setUrl] = useState('')
    const [scrapingStatus, setScrapingStatus] = useState<'idle' | 'scraping' | 'failed' | 'success'>('idle')

    // Form data from scrape (hidden unless needed for manual entry)
    const [scrapedData, setScrapedData] = useState<{
        name: string
        price: number
        currency: string
        image: string
    } | null>(null)

    // Reset form on open/close
    useEffect(() => {
        if (!open) {
            setUrl('')
            setScrapedData(null)
            setScrapingStatus('idle')
            setLoading(false)
        }
    }, [open])

    const handleStartTracking = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user || !url) return
        if (!url.startsWith('http')) {
            toast.error('Please enter a valid URL')
            return
        }

        setLoading(true)
        setScrapingStatus('scraping')

        try {
            const info = await scrapeProductInfo(url)

            if (info && info.name && info.price !== null) {
                // Success path
                setScrapedData({
                    name: info.name,
                    price: info.price,
                    currency: info.currency,
                    image: info.image
                })

                const { error } = await supabase.from('products').insert({
                    user_id: user.id,
                    name: info.name,
                    url: url,
                    current_price: info.price,
                    currency: info.currency,
                    image_url: info.image || null
                })

                if (error) throw error

                setScrapingStatus('success')
                toast.success('Found details! Product added.')
                onProductAdded?.()
                onOpenChange(false)
            } else {
                // Failure path - Mark as failed but add anyway so user can fix
                setScrapingStatus('failed')

                // Get domain for a better fallback name
                let domain = 'Product'
                try { domain = new URL(url).hostname.replace('www.', '') } catch (e) { /* ignore */ }

                const { error } = await supabase.from('products').insert({
                    user_id: user.id,
                    name: `⚠️ Update: ${domain}`,
                    url: url,
                    current_price: 0,
                    currency: 'USD',
                })

                if (error) throw error

                toast.warning('Could not auto-fill details, but added to your list for manual update.')
                onProductAdded?.()
                onOpenChange(false)
            }
        } catch (err) {
            toast.error('Failed to add product')
            console.error(err)
            setScrapingStatus('failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#1A1A1A] border-[#2A2A2A] text-[#EDEDED] sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-[#FF9EB5]">Add New Product</DialogTitle>
                    <DialogDescription className="text-[#9CA3AF]">
                        Paste a store link to start tracking its price.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleStartTracking} className="space-y-6 pt-4">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="url" className="text-sm font-medium">Store URL</Label>
                            <div className="relative group">
                                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] group-focus-within:text-[#FF9EB5] transition-colors" />
                                <Input
                                    id="url"
                                    placeholder="https://amazon.com/product/..."
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="pl-10 bg-[#0A0A0A] border-[#2A2A2A] text-[#EDEDED] focus:border-[#FF9EB5] h-12 transition-all"
                                    required
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        {scrapingStatus === 'scraping' && (
                            <div className="space-y-3 py-2">
                                <div className="flex items-center justify-between text-xs text-[#FF9EB5]">
                                    <span className="animate-pulse">Analyzing page content...</span>
                                    <span className="font-mono">Rotating proxies...</span>
                                </div>
                                <div className="h-1.5 w-full bg-[#0A0A0A] rounded-full overflow-hidden border border-[#2A2A2A]">
                                    <div className="h-full bg-[#FF9EB5] transition-all duration-1000 ease-in-out animate-[shimmer_2s_infinite]" style={{ width: '70%' }}></div>
                                </div>
                            </div>
                        )}

                        {scrapingStatus === 'failed' && (
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <p>We couldn't extract details from this link. You'll need to update them manually in the dashboard.</p>
                            </div>
                        )}
                    </div>

                    <Button
                        type="submit"
                        disabled={loading || !url}
                        className="w-full bg-[#FF9EB5] hover:bg-[#B3688A] text-black font-bold h-12 group transition-all"
                    >
                        {loading ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Scraping...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <LinkIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                <span>Start Tracking</span>
                            </div>
                        )}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
