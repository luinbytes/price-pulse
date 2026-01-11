import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { LineChart, Line, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Loader2, ExternalLink, Clock, TrendingDown } from 'lucide-react'
import type { Product } from '@/lib/database.types'
import { formatDistanceToNow } from 'date-fns'

interface ComparisonPrice {
    id: string
    store_name: string
    store_url: string
    price: number | null
    currency: string
    last_checked: string
    is_available: boolean
}

interface ProductDetailProps {
    product: Product | null
    open: boolean
    onClose: () => void
    onDelete?: () => void
    onUpdate?: (updatedProduct: Product) => void
}

interface PriceHistoryItem {
    id: string
    price: number
    currency: string
    recorded_at: string
}

const STORE_ICONS: Record<string, string> = {
    'Amazon': '📦',
    'eBay': '🏷️',
    'Walmart': '🛒',
    'Google': '🔍',
    'Argos': '🏪',
    'Idealo': '💶',
    'Best Buy CA': '🍁',
    'Kogan': '🦘'
}

export function ProductDetail({ product, open, onClose, onDelete, onUpdate }: ProductDetailProps) {
    const [priceHistory, setPriceHistory] = useState<PriceHistoryItem[]>([])
    const [loading, setLoading] = useState(false)

    const [isEditing, setIsEditing] = useState(false)
    const [editedName, setEditedName] = useState('')
    const [editedPrice, setEditedPrice] = useState('')
    const [editedCurrency, setEditedCurrency] = useState('USD')

    const [comparisonPrices, setComparisonPrices] = useState<ComparisonPrice[]>([])
    const [comparisonLoading, setComparisonLoading] = useState(false)

    const fetchPriceHistory = useCallback(async () => {
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
        } catch {
            console.error('Failed to load price history')
        } finally {
            setLoading(false)
        }
    }, [product])

    const fetchComparisonPrices = useCallback(async () => {
        if (!product) return
        setComparisonLoading(true)
        try {
            const { data, error } = await supabase
                .from('comparison_prices')
                .select('*')
                .eq('product_id', product.id)
                .order('price', { ascending: true })

            if (error) throw error

            // If no cached data exists, generate placeholder links for immediate access
            if (!data || data.length === 0) {
                const cleanQuery = product.name.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ')
                const encoded = encodeURIComponent(cleanQuery)

                // Locale-aware store URLs based on product currency
                const currency = product.currency || 'USD'
                const storeLocales: Record<string, { amazon: string; ebay: string; local: string; localName: string }> = {
                    'GBP': { amazon: 'amazon.co.uk', ebay: 'ebay.co.uk', local: 'argos.co.uk/search', localName: 'Argos' },
                    'EUR': { amazon: 'amazon.de', ebay: 'ebay.de', local: 'idealo.de/preisvergleich/MainSearchProductCategory.html?q', localName: 'Idealo' },
                    'CAD': { amazon: 'amazon.ca', ebay: 'ebay.ca', local: 'bestbuy.ca/en-ca/search?search', localName: 'Best Buy CA' },
                    'AUD': { amazon: 'amazon.com.au', ebay: 'ebay.com.au', local: 'kogan.com/au/search/?q', localName: 'Kogan' },
                    'USD': { amazon: 'amazon.com', ebay: 'ebay.com', local: 'walmart.com/search?q', localName: 'Walmart' }
                }
                const locale = storeLocales[currency] || storeLocales['USD']

                const placeholders: ComparisonPrice[] = [
                    { id: 'amazon-placeholder', store_name: 'Amazon', store_url: `https://www.${locale.amazon}/s?k=${encoded}`, price: null, currency, last_checked: new Date().toISOString(), is_available: true },
                    { id: 'ebay-placeholder', store_name: 'eBay', store_url: `https://www.${locale.ebay}/sch/i.html?_nkw=${encoded}`, price: null, currency, last_checked: new Date().toISOString(), is_available: true },
                    { id: 'local-placeholder', store_name: locale.localName, store_url: `https://www.${locale.local}=${encoded}`, price: null, currency, last_checked: new Date().toISOString(), is_available: true }
                ]
                setComparisonPrices(placeholders)
            } else {
                setComparisonPrices(data)
            }
        } catch (err) {
            console.error('Failed to fetch comparison prices:', err)
        } finally {
            setComparisonLoading(false)
        }
    }, [product])

    useEffect(() => {
        if (product && open) {
            fetchPriceHistory()
            fetchComparisonPrices()
            setEditedName(product.name)
            setEditedPrice(product.current_price?.toString() || '0')
            setEditedCurrency(product.currency || 'USD')
            setIsEditing(false)
        }
    }, [product, open, fetchPriceHistory, fetchComparisonPrices])

    const handleUpdate = async () => {
        if (!product) return

        try {
            const numPrice = parseFloat(editedPrice.replace(/[^0-9.]/g, ''))
            const { error } = await supabase
                .from('products')
                .update({
                    name: editedName,
                    current_price: numPrice,
                    currency: editedCurrency,
                    status: 'tracking'
                })
                .eq('id', product.id)

            if (error) throw error

            const updatedProduct = {
                ...product,
                name: editedName,
                current_price: numPrice,
                currency: editedCurrency,
                status: 'tracking'
            }

            toast.success('Product updated')
            onUpdate?.(updatedProduct)
            setIsEditing(false)
        } catch {
            toast.error('Failed to update product')
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
        } catch {
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

    const getBestPrice = () => {
        const validPrices = comparisonPrices.filter(p => p.price && p.price > 0)
        if (validPrices.length === 0) return null
        return validPrices.reduce((min, p) => (p.price! < min.price!) ? p : min)
    }

    if (!product) return null

    const priceChange = getPriceChangeInfo()
    const bestPrice = getBestPrice()

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-[#1A1A1A] border-[#2A2A2A] text-[#EDEDED] max-w-lg w-[calc(100vw-2rem)] p-0 gap-0 max-h-[90vh] overflow-hidden">
                <div className="p-6 space-y-5 overflow-y-auto overflow-x-hidden max-h-[calc(90vh-80px)]">
                    <DialogHeader className="space-y-2">
                        <DialogTitle className="text-lg font-bold text-[#EDEDED] leading-snug pr-8 line-clamp-3">
                            {isEditing ? 'Edit Product Details' : product.name}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            View and manage price tracking details for this product.
                        </DialogDescription>
                        {!isEditing && (
                            <div className="flex items-center gap-2 opacity-60">
                                <Badge variant="outline" className="border-[#3A3A3A] text-xs py-0">
                                    {product.currency}
                                </Badge>
                                <span className="text-xs">Added {formatDate(product.created_at)}</span>
                            </div>
                        )}
                    </DialogHeader>

                    <div className="space-y-4">
                        {isEditing ? (
                            <div className="space-y-4 p-4 rounded-xl bg-[#0A0A0A]/50 border border-[#FF9EB5]/20">
                                <div className="space-y-2">
                                    <Label className="text-[#9CA3AF] text-xs">Product Name</Label>
                                    <Input
                                        value={editedName}
                                        onChange={e => setEditedName(e.target.value)}
                                        className="bg-[#1A1A1A] border-[#2A2A2A] focus:border-[#FF9EB5] text-[#EDEDED] h-10"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[#9CA3AF] text-xs">Price</Label>
                                        <Input
                                            value={editedPrice}
                                            onChange={e => setEditedPrice(e.target.value)}
                                            className="bg-[#1A1A1A] border-[#2A2A2A] focus:border-[#FF9EB5] text-[#EDEDED] h-10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[#9CA3AF] text-xs">Currency</Label>
                                        <select
                                            value={editedCurrency}
                                            onChange={(e) => setEditedCurrency(e.target.value)}
                                            className="w-full h-10 px-3 rounded-md bg-[#1A1A1A] border border-[#2A2A2A] text-[#EDEDED] focus:border-[#FF9EB5] focus:outline-none text-sm"
                                        >
                                            <option value="USD">USD ($)</option>
                                            <option value="EUR">EUR (€)</option>
                                            <option value="GBP">GBP (£)</option>
                                            <option value="JPY">JPY (¥)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <Button onClick={handleUpdate} className="flex-1 bg-[#FF9EB5] hover:bg-[#B3688A] text-black font-bold">
                                        Save Changes
                                    </Button>
                                    <Button variant="ghost" onClick={() => setIsEditing(false)} className="text-[#9CA3AF] hover:text-[#EDEDED]">
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {/* Current Price Hero */}
                                <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] border border-[#2A2A2A]">
                                    <div className="relative z-10 flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-medium text-[#9CA3AF] uppercase tracking-wider mb-1">Current Price</p>
                                            <p className="text-4xl font-black text-[#FF9EB5] tracking-tight">
                                                {formatCurrency(product.current_price, product.currency)}
                                            </p>
                                        </div>
                                        {priceChange && (
                                            <div className={`text-right ${priceChange.isDown ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'} border p-2 rounded-xl min-w-[80px]`}>
                                                <p className="text-xs font-bold leading-none mb-1">{priceChange.isDown ? '↓' : '↑'} {Math.abs(priceChange.change).toFixed(2)}</p>
                                                <p className="text-lg font-black leading-none">{priceChange.percentChange}%</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF9EB5]/5 blur-3xl -mr-16 -mt-16"></div>
                                </div>

                                {/* Store Link */}
                                {product.url && (
                                    <a
                                        href={product.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] hover:border-[#FF9EB5] transition-colors group"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center shrink-0">
                                            <span className="text-lg">🛒</span>
                                        </div>
                                        <span className="text-xs text-[#9CA3AF] group-hover:text-[#FF9EB5] truncate flex-1 transition-colors">
                                            {product.url}
                                        </span>
                                        <ExternalLink className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#FF9EB5] shrink-0" />
                                    </a>
                                )}

                                <Separator className="bg-[#2A2A2A]" />

                                {/* Compare Stores - Now fetches from DB */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xs font-bold text-[#EDEDED] uppercase tracking-widest opacity-50">Compare Stores</h3>
                                            {comparisonLoading && <Loader2 className="w-3 h-3 animate-spin text-[#FF9EB5]" />}
                                        </div>
                                        {comparisonPrices.length > 0 && comparisonPrices[0]?.last_checked && (
                                            <div className="flex items-center gap-1 text-[10px] text-[#6B7280]">
                                                <Clock className="w-3 h-3" />
                                                {comparisonPrices[0].id.includes('placeholder')
                                                    ? 'Prices sync in ~2h'
                                                    : `Updated ${formatDistanceToNow(new Date(comparisonPrices[0].last_checked), { addSuffix: true })}`
                                                }
                                            </div>
                                        )}
                                    </div>

                                    {comparisonPrices.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-2">
                                            {comparisonPrices.map(cp => {
                                                const isBest = bestPrice && cp.id === bestPrice.id && cp.price
                                                return (
                                                    <a
                                                        key={cp.id}
                                                        href={cp.store_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:-translate-y-0.5 ${isBest
                                                            ? 'bg-green-500/10 border-green-500/30 hover:border-green-400'
                                                            : 'bg-[#0A0A0A] border-[#2A2A2A] hover:border-[#FF9EB5]'
                                                            }`}
                                                    >
                                                        <span className="text-xl shrink-0">{STORE_ICONS[cp.store_name] || '🏪'}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[10px] text-[#9CA3AF] font-bold uppercase">{cp.store_name}</p>
                                                            {cp.price ? (
                                                                <p className={`text-lg font-black leading-tight ${isBest ? 'text-green-400' : 'text-[#FF9EB5]'}`}>
                                                                    {formatCurrency(cp.price, cp.currency)}
                                                                </p>
                                                            ) : (
                                                                <p className="text-sm text-[#6B7280]">View Store →</p>
                                                            )}
                                                        </div>
                                                        {isBest && (
                                                            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-[10px] font-bold">
                                                                <TrendingDown className="w-3 h-3" />
                                                                BEST
                                                            </div>
                                                        )}
                                                        <ExternalLink className="w-4 h-4 text-[#6B7280] shrink-0" />
                                                    </a>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 text-[#6B7280] text-xs">
                                            {comparisonLoading ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Loading comparison prices...
                                                </div>
                                            ) : (
                                                <p className="italic">No comparison data yet. Prices update automatically every 2 hours.</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold text-[#EDEDED] uppercase tracking-widest opacity-50">Price History</h3>
                                    <div className="rounded-2xl border border-[#2A2A2A] overflow-hidden bg-[#0A0A0A]">
                                        {priceHistory.length > 1 && (
                                            <div className="h-32 w-full p-2 border-b border-[#2A2A2A]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={[...priceHistory].reverse()}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                                                        <Tooltip
                                                            contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '12px' }}
                                                            labelStyle={{ display: 'none' }}
                                                            formatter={(value) => [formatCurrency(Number(value), product.currency), 'Price']}
                                                        />
                                                        <Line type="monotone" dataKey="price" stroke="#FF9EB5" strokeWidth={3} dot={false} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                        <div className="max-h-32 overflow-y-auto">
                                            {loading ? (
                                                <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#FF9EB5]" /></div>
                                            ) : priceHistory.length > 0 ? (
                                                <div className="divide-y divide-[#2A2A2A]">
                                                    {priceHistory.map((item, index) => (
                                                        <div key={item.id} className="flex items-center justify-between px-4 py-2 text-xs">
                                                            <span className="text-[#9CA3AF]">{formatDate(item.recorded_at)}</span>
                                                            <span className={index === 0 ? 'text-[#FF9EB5] font-black' : 'text-[#EDEDED]'}>
                                                                {formatCurrency(item.price, item.currency)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-center text-[#6B7280] py-6 text-xs italic">No history available yet</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Fixed Footer */}
                {!isEditing && (
                    <div className="flex gap-2 p-4 border-t border-[#2A2A2A] bg-[#1A1A1A] shrink-0">
                        <Button variant="outline" className="flex-1 border-[#3A3A3A] bg-[#2A2A2A] hover:bg-[#3A3A3A] text-[#EDEDED]" onClick={() => setIsEditing(true)}>Edit</Button>
                        <Button variant="default" className="flex-1 bg-[#FF9EB5] hover:bg-[#B3688A] text-black font-bold" onClick={() => window.open(product?.url!, '_blank')}>Visit Store</Button>
                        <Button variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-10 w-10 p-0 shrink-0" onClick={handleDelete} title="Delete Product">
                            🗑️
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
