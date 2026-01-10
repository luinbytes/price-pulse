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
        if (!url.startsWith('http')) {
            toast.error('Please enter a valid URL')
            return
        }

        setLoading(true)

        try {
            // Get domain for a temporary name
            let domain = 'Product'
            try {
                domain = new URL(url).hostname.replace('www.', '').split('.')[0]
                domain = domain.charAt(0).toUpperCase() + domain.slice(1)
            } catch { /* ignore */ }

            // Insert immediately with 'scraping' status
            const { error } = await supabase.from('products').insert({
                user_id: user.id,
                name: `Scraping: ${domain}...`,
                url: url,
                current_price: 0,
                currency: 'USD',
                status: 'scraping'
            })

            if (error) throw error

            toast.info('Tracking started in background...')
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
