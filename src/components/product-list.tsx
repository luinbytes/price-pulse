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


    const handleBackgroundScrape = useCallback(async (product: Product) => {
        try {
            // Fetch user's default currency for fallback
            const { data: settings } = await supabase
                .from('user_settings')
                .select('default_currency')
                .eq('id', product.user_id)
                .single()

            const defaultCurrency = settings?.default_currency || 'USD'
            const { scrapeProductInfo } = await import('@/lib/utils-app')
            const info = await scrapeProductInfo(product.url!, defaultCurrency)

            if (info && info.name && info.price !== null) {
                const { error } = await supabase
                    .from('products')
                    .update({
                        name: info.name,
                        current_price: info.price,
                        currency: info.currency,
                        image_url: info.image || null,
                        status: 'tracking'
                    })
                    .eq('id', product.id)

                if (error) throw error

                // Refresh the local list
                setProducts(prev =>
                    prev.map(p => p.id === product.id ? {
                        ...p,
                        name: info.name,
                        current_price: info.price,
                        currency: info.currency,
                        image_url: info.image || null,
                        status: 'tracking'
                    } : p)
                )
            } else {
                // Mark as failed
                await supabase
                    .from('products')
                    .update({ status: 'failed' })
                    .eq('id', product.id)

                setProducts(prev =>
                    prev.map(p => p.id === product.id ? { ...p, status: 'failed' } : p)
                )
            }
        } catch {
            // Ignore background error
        }
    }, []) // supabase removed from deps

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
        } catch {
            toast.error('Failed to load products')
        } finally {
            setLoading(false)
        }
    }, [user])

    useEffect(() => {
        if (user) {
            fetchProducts()
        }
    }, [user, refreshTrigger, fetchProducts])

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
            <Card className="bg-[#1A1A1A] border-[#2A2A2A]">
                <CardContent className="p-8 flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF9EB5]"></div>
                </CardContent>
            </Card>
        )
    }

    if (products.length === 0) {
        return (
            <Card className="bg-[#1A1A1A] border-[#2A2A2A]">
                <CardHeader>
                    <CardTitle className="text-[#EDEDED]">Your Products</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-center text-[#9CA3AF] py-8">
                        No products yet. Add your first product to start tracking!
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="bg-[#1A1A1A] border-[#2A2A2A]">
            <CardHeader>
                <CardTitle className="text-[#EDEDED]">Your Products ({products.length})</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {products.map((product) => (
                        <div
                            key={product.id}
                            className="flex items-center justify-between p-4 rounded-lg bg-[#0A0A0A] border border-[#2A2A2A] hover:border-[#FF9EB5] transition-colors cursor-pointer"
                            onClick={() => onProductSelect?.(product)}
                        >
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <CardTitle className="text-sm font-semibold truncate group-hover:text-[#FF9EB5] transition-colors flex items-center gap-2 text-[#EDEDED]">
                                        {product.status === 'scraping' && <Loader2 className="w-4 h-4 text-[#FF9EB5] animate-spin" />}
                                        {product.status === 'failed' && <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />}
                                        {product.name}
                                    </CardTitle>
                                    {product.status === 'scraping' && (
                                        <Badge className="bg-[#FF9EB5]/20 text-[#FF9EB5] border-[#FF9EB5]/30 animate-pulse text-[10px] py-0 px-1">
                                            SCRAPING
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-sm text-[#9CA3AF] mt-1">
                                    Added {formatDate(product.created_at)}
                                    {product.url && (
                                        <a
                                            href={product.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="ml-2 text-[#FF9EB5] hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            View →
                                        </a>
                                    )}
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className="text-xl font-bold text-[#FF9EB5]">
                                        {formatCurrency(product.current_price, product.currency)}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onProductSelect?.(product)
                                    }}
                                    className="border-[#FF9EB5]/30 text-[#FF9EB5] hover:bg-[#FF9EB5]/10 h-8 px-3 text-xs"
                                >
                                    Compare
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        deleteProduct(product.id)
                                    }}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
