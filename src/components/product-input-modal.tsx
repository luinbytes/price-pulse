import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Link as LinkIcon, Loader2 } from 'lucide-react'

interface ProductInputModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onProductAdded?: () => void
}

export function ProductInputModal({ open, onOpenChange, onProductAdded }: ProductInputModalProps) {
    const { user } = useAuth()
    const [loading, setLoading] = useState(false)
    const [url, setUrl] = useState('')

    // Reset form on open/close
    useEffect(() => {
        if (!open) {
            setUrl('')
            setLoading(false)
        }
    }, [open])

    const handleStartTracking = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user || !url) return

        // Validate URL using URL constructor
        let urlObj: URL
        try {
            urlObj = new URL(url)
            // Only allow http and https protocols
            if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
                toast.error('Please enter a valid HTTP or HTTPS URL')
                return
            }
        } catch {
            toast.error('Please enter a valid URL')
            return
        }

        setLoading(true)

        try {
            // Extract meaningful product name and currency from URL
            let productName = 'New Product'
            let currency = 'USD'

            const hostname = urlObj.hostname.toLowerCase()

            // Determine currency from domain
            if (hostname.includes('.co.uk')) currency = 'GBP'
            else if (hostname.includes('.de') || hostname.includes('.fr') || hostname.includes('.it') || hostname.includes('.es')) currency = 'EUR'
            else if (hostname.includes('.ca')) currency = 'CAD'
            else if (hostname.includes('.com.au')) currency = 'AUD'

            // Extract product name from URL path
            const pathParts = urlObj.pathname.split('/').filter(p => p && p.length > 0)

            // For Amazon URLs: /Product-Name-Here/dp/B09NSLTW5R
            const dpIndex = pathParts.findIndex(p => p === 'dp')
            if (dpIndex > 0) {
                productName = pathParts[dpIndex - 1].replace(/[-_]/g, ' ').trim()
            } else {
                // For other URLs, find the longest slug-like part
                const slugPart = pathParts.find(p =>
                    p.length > 5 &&
                    p.includes('-') &&
                    !/^(product|item|s|search|sch|p|buy|shop)$/i.test(p)
                )
                if (slugPart) {
                    productName = slugPart.replace(/[-_]/g, ' ').trim()
                } else {
                    // Try to find a product ID from the URL
                    const idPart = pathParts.find(p => /^\d+$/.test(p))
                    if (idPart) {
                        // Get store name for context
                        const storeName = hostname.replace('www.', '').split('.')[0]
                        productName = `${storeName.charAt(0).toUpperCase() + storeName.slice(1)} #${idPart}`
                    } else {
                        // Use generic pending name - worker will update with actual title
                        productName = 'Pending...'
                    }
                }
            }

            // Capitalize first letter of each word
            productName = productName.replace(/\b\w/g, c => c.toUpperCase())

            // Insert with extracted name and currency, 'queued' status
            const { error } = await supabase.from('products').insert({
                user_id: user.id,
                name: productName,
                url: url,
                current_price: 0,
                currency: currency,
                status: 'queued'
            })

            if (error) throw error

            // Trigger GitHub Workflow checks (with cooldown to prevent spam)
            const COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes
            const lastTrigger = localStorage.getItem('last_workflow_trigger')
            const now = Date.now()

            if (!lastTrigger || (now - parseInt(lastTrigger)) > COOLDOWN_MS) {
                // Trigger the workflow
                const githubToken = import.meta.env.VITE_GITHUB_TOKEN
                if (githubToken) {
                    await fetch('https://api.github.com/repos/luinbytes/price-pulse/dispatches', {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Authorization': `token ${githubToken}`,
                        },
                        body: JSON.stringify({
                            event_type: 'price-check-trigger'
                        })
                    })

                    localStorage.setItem('last_workflow_trigger', now.toString())
                    toast.success(`Added "${productName}" - price check started!`)
                } else {
                    toast.success(`Added "${productName}" - price check queued (scheduled)`)
                }
            } else {
                toast.info(`Added "${productName}" to queue (cooldown active). Will be checked in the next run.`)
            }

            onProductAdded?.()
            onOpenChange(false)

        } catch (err) {
            toast.error('Failed to start tracking')
            console.error(err)
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
                    </div>

                    <Button
                        type="submit"
                        disabled={loading || !url}
                        className="w-full bg-[#FF9EB5] hover:bg-[#B3688A] text-black font-bold h-12 group transition-all"
                    >
                        {loading ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Starting...</span>
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
