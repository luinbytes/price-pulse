import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { toast } from 'sonner'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { Product } from '@/lib/database.types'

interface ProductListProps {
    refreshTrigger?: number
    onProductSelect?: (product: Product) => void
}

export function ProductList({ refreshTrigger, onProductSelect }: ProductListProps) {
    const { user } = useAuth()
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)


    // Server-side scraping - just mark as queued, the GitHub Action will handle it
    const handleBackgroundScrape = useCallback(async (product: Product) => {
        try {
            // Mark as queued for server-side scraping
            const { error } = await supabase
                .from('products')
                .update({ status: 'queued' })
                .eq('id', product.id)

            if (error) throw error

            setProducts(prev =>
                prev.map(p => p.id === product.id ? { ...p, status: 'queued' } : p)
            )
        } catch {
            // Mark as pending if update fails
            setProducts(prev =>
                prev.map(p => p.id === product.id ? { ...p, status: 'pending' } : p)
            )
        }
    }, [])

    // Background scraping handler
    useEffect(() => {
        const scrapingProducts = products.filter(p => p.status === 'scraping')
        if (scrapingProducts.length > 0) {
            scrapingProducts.forEach(product => {
                handleBackgroundScrape(product)
            })
        }
    }, [products, handleBackgroundScrape])

    const fetchProducts = useCallback(async () => {
        if (!user) return

        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setProducts(data || [])
        } catch (err) {
            toast.error('Failed to load products')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }, [user])

    useEffect(() => {
        fetchProducts()

        // Subscribe to real-time updates for products list
        if (user) {
            const channel = supabase
                .channel('products-list')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'products',
                    filter: `user_id=eq.${user.id}`
                }, (payload) => {
                    console.log('Products list updated:', payload)
                    fetchProducts()
                })
                .subscribe()

            return () => {
                supabase.removeChannel(channel)
            }
        }
    }, [refreshTrigger, fetchProducts, user])

    const deleteProduct = async (id: string) => {
        try {
            const { error } = await supabase
                .from('products')
                .delete()
                .eq('id', id)

            if (error) throw error

            setProducts(products.filter(p => p.id !== id))
            toast.success('Product deleted')
        } catch (err) {
            toast.error('Failed to delete product')
            console.error(err)
        }
    }

    const formatCurrency = (price: number | null, currency: string) => {
        if (price === null) return 'N/A'

        const symbols: Record<string, string> = {
            USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$'
        }

        return `${symbols[currency] || '$'}${price.toFixed(2)}`
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })
    }

    if (loading) {
        return (
            <Card className="glass-card border-[rgba(255,255,255,0.1)]">
                <CardContent className="p-12 flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-transparent border-t-[#FF9EB5] border-r-[#B3688A]"></div>
                        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#FF9EB5] to-[#794A63] opacity-20 blur-xl animate-pulse"></div>
                    </div>
                    <p className="text-[#9CA3AF] text-sm">Loading your products...</p>
                </CardContent>
            </Card>
        )
    }

    if (products.length === 0) {
        return (
            <Card className="glass-card border-[rgba(255,255,255,0.1)] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#FF9EB5]/5 via-transparent to-[#794A63]/5"></div>
                <CardHeader className="relative z-10">
                    <CardTitle className="text-[#EDEDED] text-2xl font-bold">Your Products</CardTitle>
                </CardHeader>
                <CardContent className="relative z-10">
                    <div className="text-center py-12 space-y-4">
                        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-[#FF9EB5]/20 to-[#794A63]/20 flex items-center justify-center text-5xl">
                            🛍️
                        </div>
                        <p className="text-[#9CA3AF] text-lg">
                            No products yet. Add your first product to start tracking!
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="glass-ultra border-[rgba(255,255,255,0.15)] overflow-hidden shadow-xl">
            <CardHeader className="border-b border-[rgba(255,255,255,0.1)]">
                <CardTitle className="text-[#EDEDED] text-2xl font-bold flex items-center gap-3">
                    <span>Your Products</span>
                    <Badge className="bg-gradient-to-r from-[#FF9EB5] to-[#B3688A] text-black font-bold px-3 py-1 shadow-lg">
                        {products.length}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                <div className="space-y-3">
                    {products.map((product, index) => (
                        <div
                            key={product.id}
                            className="glass-parallax group relative overflow-visible p-5 rounded-2xl glass-card border-[rgba(255,255,255,0.12)] hover:border-[#FF9EB5]/50 transition-all cursor-pointer hover:shadow-2xl hover:shadow-[#FF9EB5]/20 animate-slide-up"
                            style={{ animationDelay: `${index * 0.05}s` }}
                            onClick={() => onProductSelect?.(product)}
                        >
                            <div className="glass-layer-1 pointer-events-none"></div>
                            <div className="glass-layer-2 pointer-events-none"></div>
                            <div className="absolute top-0 right-0 w-40 h-40 bg-[#FF9EB5]/8 rounded-full blur-3xl transform translate-x-20 -translate-y-20 group-hover:scale-150 transition-transform duration-700"></div>

                            <div className="relative z-10 flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0 space-y-2">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <div className="text-base font-bold group-hover:text-[#FF9EB5] transition-colors flex items-center gap-2 text-[#EDEDED] line-clamp-2 leading-snug">
                                            {(product.status === 'scraping' || product.status === 'queued') && <Loader2 className="w-4 h-4 text-[#FF9EB5] animate-spin shrink-0" />}
                                            {product.status === 'failed' && <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />}
                                            <span className="break-words">{product.name}</span>
                                        </div>
                                        {(product.status === 'scraping' || product.status === 'queued') && (
                                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] py-0.5 px-2 shimmer">
                                                PROCESSING
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-[#6B7280]">
                                        <span>Added {formatDate(product.created_at)}</span>
                                        {product.url && (
                                            <>
                                                <span>•</span>
                                                <a
                                                    href={product.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[#FF9EB5] hover:underline flex items-center gap-1"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    Visit Store →
                                                </a>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0 pl-4 border-l border-[rgba(255,255,255,0.08)]">
                                    <div className="text-right">
                                        <p className="text-xs text-[#6B7280] mb-1">Current Price</p>
                                        <p className="text-2xl font-black text-gradient tracking-tight">
                                            {formatCurrency(product.current_price, product.currency)}
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            deleteProduct(product.id)
                                        }}
                                        className="text-red-400/60 hover:text-red-400 hover:bg-red-400/10 h-9 w-9 p-0"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
