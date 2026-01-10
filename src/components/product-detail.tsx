import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Product } from '@/lib/database.types'
import { searchProductPrices } from '@/lib/utils-app'

interface ComparisonResult {
    store: string
    url: string
    price: number | null
    currency: string
    icon: string
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

export function ProductDetail({ product, open, onClose, onDelete, onUpdate }: ProductDetailProps) {
    const [priceHistory, setPriceHistory] = useState<PriceHistoryItem[]>([])
    const [loading, setLoading] = useState(false)

    const [isEditing, setIsEditing] = useState(false)
    const [editedName, setEditedName] = useState('')
    const [editedPrice, setEditedPrice] = useState('')
    const [editedCurrency, setEditedCurrency] = useState('USD')

    const [comparisonResults, setComparisonResults] = useState<ComparisonResult[]>([])
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

    const fetchComparison = useCallback(async () => {
        if (!product) return
        setComparisonLoading(true)
        try {
            const results = await searchProductPrices(product.name)
            setComparisonResults(results)
        } catch {
            console.error('Failed to fetch comparison prices')
        } finally {
            setComparisonLoading(false)
        }
    }, [product])

    useEffect(() => {
        if (product && open) {
            fetchPriceHistory()
            setEditedName(product.name)
            setEditedPrice(product.current_price?.toString() || '0')
            setEditedCurrency(product.currency || 'USD')
            setIsEditing(false)
            fetchComparison()
        }
    }, [product, open, fetchPriceHistory, fetchComparison])

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
                    status: 'tracking' // Clear scraping/failed status on manual update
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

    const fetchComparison = async () => {
        if (!product) return
        setComparisonLoading(true)
        try {
            const results = await searchProductPrices(product.name)
            setComparisonResults(results)
        } catch (_err) {
            console.error('Failed to fetch comparison prices:', _err)
        } finally {
            setComparisonLoading(false)
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

    const getComparisonLinks = (name: string) => {
        const query = encodeURIComponent(name)
        return [
            { name: 'Amazon', url: `https://www.amazon.com/s?k=${query}`, icon: '📦' },
            { name: 'eBay', url: `https://www.ebay.com/sch/i.html?_nkw=${query}`, icon: '🏷️' },
            { name: 'Google', url: `https://www.google.com/search?tbm=shop&q=${query}`, icon: '🔍' }
        ]
    }

    if (!product) return null

    const priceChange = getPriceChangeInfo()
    const comparisonLinks = getComparisonLinks(product.name)

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-[#1A1A1A] border-[#2A2A2A] text-[#EDEDED] max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-[#EDEDED] pr-8 line-clamp-2 leading-tight">
                        {isEditing ? 'Edit Product Details' : product.name}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {isEditing ? (
                        <div className="space-y-4 p-4 rounded-lg bg-[#0A0A0A] border border-[#FF9EB5]/30">
                            <div className="space-y-2">
                                <Label className="text-[#9CA3AF]">Product Name</Label>
                                <Input
                                    value={editedName}
                                    onChange={e => setEditedName(e.target.value)}
                                    className="bg-[#1A1A1A] border-[#2A2A2A] focus:border-[#FF9EB5] text-[#EDEDED]"
                                    placeholder="Enter product name"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[#9CA3AF]">Price</Label>
                                    <Input
                                        value={editedPrice}
                                        onChange={e => setEditedPrice(e.target.value)}
                                        className="bg-[#1A1A1A] border-[#2A2A2A] focus:border-[#FF9EB5] text-[#EDEDED]"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[#9CA3AF]">Currency</Label>
                                    <select
                                        value={editedCurrency}
                                        onChange={(e) => setEditedCurrency(e.target.value)}
                                        className="w-full h-10 px-3 rounded-md bg-[#1A1A1A] border border-[#2A2A2A] text-[#EDEDED] focus:border-[#FF9EB5] focus:outline-none"
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
                                <Button variant="ghost" onClick={() => setIsEditing(false)} className="text-[#9CA3AF] hover:text-[#EDEDED] hover:bg-[#1A1A1A]">
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
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
                        </>
                    )}

                    <Separator className="bg-[#2A2A2A]" />

                    {/* ... rest of the content (Price History, Compare, Actions) ... */}
                    {/* Simplified for the sake of the edit button insertion */}

                    {!isEditing && (
                        <>
                            {/* Price History */}
                            {/* Price History Chart */}
                            {priceHistory.length > 1 && (
                                <div className="h-48 w-full bg-[#0A0A0A] p-2 rounded-lg border border-[#2A2A2A]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={[...priceHistory].reverse()}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                                            <XAxis
                                                dataKey="recorded_at"
                                                hide
                                            />
                                            <YAxis
                                                hide
                                                domain={['auto', 'auto']}
                                            />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }}
                                                labelStyle={{ display: 'none' }}
                                                formatter={(value: any) => [formatCurrency(Number(value), product.currency), 'Price']}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="price"
                                                stroke="#FF9EB5"
                                                strokeWidth={2}
                                                dot={{ fill: '#FF9EB5', r: 4 }}
                                                activeDot={{ r: 6, stroke: '#1A1A1A', strokeWidth: 2 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold text-[#EDEDED]">Price Comparison</h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={fetchComparison}
                                        disabled={comparisonLoading}
                                        className="h-7 text-[10px] text-[#FF9EB5] hover:text-[#FF9EB5] hover:bg-[#FF9EB5]/10"
                                    >
                                        {comparisonLoading ? 'Searching...' : 'Refresh'}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {comparisonResults.length > 0 ? (
                                        comparisonResults.map(link => (
                                            <a
                                                key={link.store}
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 p-3 rounded bg-[#0A0A0A] border border-[#2A2A2A] hover:border-[#FF9EB5] transition-colors group"
                                            >
                                                <span className="text-xl">{link.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] text-[#9CA3AF] font-medium leading-none mb-1">{link.store}</p>
                                                    <p className="text-sm font-bold text-[#FF9EB5] truncate">
                                                        {link.price ? formatCurrency(link.price, link.currency) : 'View Shop'}
                                                    </p>
                                                </div>
                                            </a>
                                        ))
                                    ) : (
                                        comparisonLinks.map(link => (
                                            <a
                                                key={link.name}
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 p-3 rounded bg-[#0A0A0A] border border-[#2A2A2A] hover:border-[#FF9EB5] transition-colors group"
                                            >
                                                <span className="text-xl">{link.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] text-[#9CA3AF] font-medium leading-none mb-1">{link.name}</p>
                                                    <p className="text-sm font-bold text-[#FF9EB5] truncate">Check Price</p>
                                                </div>
                                            </a>
                                        ))
                                    )}
                                </div>
                                {comparisonLoading && (
                                    <p className="text-[10px] text-center text-[#9CA3AF] mt-2 animate-pulse">Searching other stores for best deals...</p>
                                )}
                            </div>

                            <div>
                                <h3 className="text-sm font-semibold text-[#EDEDED] mb-2">Price History</h3>
                                {loading ? (
                                    <div className="flex justify-center py-4">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FF9EB5]"></div>
                                    </div>
                                ) : priceHistory.length > 0 ? (
                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                        {[...priceHistory].map((item, index) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between text-sm p-2 rounded bg-[#0A0A0A] border border-[#2A2A2A]/50"
                                            >
                                                <span className="text-[#9CA3AF] text-xs">{formatDate(item.recorded_at)}</span>
                                                <span className={index === 0 ? 'text-[#FF9EB5] font-semibold' : 'text-[#EDEDED]'}>
                                                    {formatCurrency(item.price, item.currency)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-[#6B7280] py-4 text-xs">No price history yet</p>
                                )}
                            </div>

                            <Separator className="bg-[#2A2A2A]" />

                            <div className="flex flex-wrap gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    className="flex-1 min-w-[120px] border-[#3A3A3A] bg-transparent hover:bg-[#2A2A2A] text-[#EDEDED]"
                                    onClick={() => setIsEditing(true)}
                                >
                                    Edit Details
                                </Button>
                                {product.url && (
                                    <Button
                                        variant="outline"
                                        className="flex-1 min-w-[120px] border-[#3A3A3A] bg-transparent hover:bg-[#2A2A2A] text-[#EDEDED]"
                                        onClick={() => window.open(product.url as string, '_blank')}
                                    >
                                        Visit Store
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    className="border-red-500/50 bg-transparent hover:bg-red-500/10 text-red-400 min-w-[80px]"
                                    onClick={handleDelete}
                                >
                                    Delete
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
