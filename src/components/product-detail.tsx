import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Product } from '@/lib/database.types'

interface ProductDetailProps {
    product: Product | null
    open: boolean
    onClose: () => void
    onDelete?: () => void
}

interface PriceHistoryItem {
    id: string
    price: number
    currency: string
    recorded_at: string
}

export function ProductDetail({ product, open, onClose, onDelete }: ProductDetailProps) {
    const [priceHistory, setPriceHistory] = useState<PriceHistoryItem[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (product && open) {
            fetchPriceHistory()
        }
    }, [product, open])

    const fetchPriceHistory = async () => {
        if (!product) return

        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('price_history')
                .select('*')
                .eq('product_id', product.id)
                .order('recorded_at', { ascending: false })
                .limit(10)

            if (error) throw error
            setPriceHistory(data || [])
        } catch (err) {
            console.error('Failed to load price history:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!product) return

        try {
            const { error } = await supabase
                .from('products')
                .delete()
                .eq('id', product.id)

            if (error) throw error

            toast.success('Product deleted')
            onDelete?.()
            onClose()
        } catch (err) {
            toast.error('Failed to delete product')
        }
    }

    const formatCurrency = (price: number | null, currency: string) => {
        if (price === null) return 'N/A'
        const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$' }
        return `${symbols[currency] || '$'}${price.toFixed(2)}`
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        })
    }

    const getPriceChangeInfo = () => {
        if (priceHistory.length < 2) return null
        const latest = priceHistory[0].price
        const previous = priceHistory[1].price
        const change = latest - previous
        const percentChange = ((change / previous) * 100).toFixed(1)
        return { change, percentChange, isDown: change < 0 }
    }

    const priceChange = getPriceChangeInfo()

    if (!product) return null

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-[#1A1A1A] border-[#2A2A2A] text-[#EDEDED] max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-[#EDEDED] pr-8">{product.name}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Current Price Section */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-[#0A0A0A] border border-[#2A2A2A]">
                        <div>
                            <p className="text-sm text-[#9CA3AF]">Current Price</p>
                            <p className="text-3xl font-bold text-[#FF9EB5]">
                                {formatCurrency(product.current_price, product.currency)}
                            </p>
                        </div>
                        {priceChange && (
                            <div className={`text-right ${priceChange.isDown ? 'text-green-400' : 'text-red-400'}`}>
                                <p className="text-sm">{priceChange.isDown ? '↓' : '↑'} {Math.abs(priceChange.change).toFixed(2)}</p>
                                <p className="text-lg font-semibold">{priceChange.percentChange}%</p>
                            </div>
                        )}
                    </div>

                    {/* Product Info */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="border-[#3A3A3A] text-[#9CA3AF]">
                                {product.currency}
                            </Badge>
                            <span className="text-sm text-[#6B7280]">Added {formatDate(product.created_at)}</span>
                        </div>

                        {product.url && (
                            <a
                                href={product.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-sm text-[#FF9EB5] hover:underline truncate"
                            >
                                {product.url}
                            </a>
                        )}
                    </div>

                    <Separator className="bg-[#2A2A2A]" />

                    {/* Price History */}
                    <div>
                        <h3 className="text-sm font-semibold text-[#EDEDED] mb-2">Price History</h3>
                        {loading ? (
                            <div className="flex justify-center py-4">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FF9EB5]"></div>
                            </div>
                        ) : priceHistory.length > 0 ? (
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {priceHistory.map((item, index) => (
                                    <div
                                        key={item.id}
                                        className="flex items-center justify-between text-sm p-2 rounded bg-[#0A0A0A]"
                                    >
                                        <span className="text-[#9CA3AF]">{formatDate(item.recorded_at)}</span>
                                        <span className={index === 0 ? 'text-[#FF9EB5] font-semibold' : 'text-[#EDEDED]'}>
                                            {formatCurrency(item.price, item.currency)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-[#6B7280] py-4">No price history yet</p>
                        )}
                    </div>

                    <Separator className="bg-[#2A2A2A]" />

                    {/* Price Comparison (Placeholder for future API integration) */}
                    <div>
                        <h3 className="text-sm font-semibold text-[#EDEDED] mb-2">Compare Prices</h3>
                        <div className="p-4 rounded-lg bg-[#0A0A0A] border border-[#2A2A2A] text-center">
                            <p className="text-[#6B7280] text-sm">
                                🔍 Price comparison coming soon!
                            </p>
                            <p className="text-xs text-[#4B5563] mt-1">
                                We'll search other retailers for better deals
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                        {product.url && (
                            <Button
                                variant="outline"
                                className="flex-1 border-[#3A3A3A] bg-transparent hover:bg-[#2A2A2A] text-[#EDEDED]"
                                onClick={() => window.open(product.url!, '_blank')}
                            >
                                Visit Store
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            className="border-red-500/50 bg-transparent hover:bg-red-500/10 text-red-400"
                            onClick={handleDelete}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
