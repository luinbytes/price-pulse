import { useEffect, useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { toast } from 'sonner'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { Product } from '@/lib/database.types'
import { formatCurrency, formatDate } from '@/lib/utils-app'

interface ProductListProps {
    refreshTrigger?: number
    onProductSelect?: (product: Product) => void
}

export function ProductList({ refreshTrigger, onProductSelect }: ProductListProps) {
    const { user } = useAuth()
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)


    // Server-side scraping - just mark as queued, the GitHub Action will handle it
    // Track which products have been processed to avoid duplicate updates
    const processedRef = useRef<Set<string>>(new Set())

    const handleBackgroundScrape = useCallback(async (product: Product) => {
        // Skip if already processed
        if (processedRef.current.has(product.id)) {
            return
        }

        // Mark as processed
        processedRef.current.add(product.id)

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
            // Mark as pending if update fails and remove from processed set
            processedRef.current.delete(product.id)
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
        // handleBackgroundScrape is stable (empty deps), only run when products change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [products])

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
        // fetchProducts only depends on 'user', so we don't need it in deps
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshTrigger, user])

    const deleteProduct = async (id: string) => {
        try {
            const { error} = await supabase
                .from('products')
                .delete()
                .eq('id', id)

            if (error) throw error

            // Use callback form to avoid stale closure
            setProducts(prev => prev.filter(p => p.id !== id))
            toast.success('Product deleted')
        } catch (err) {
            toast.error('Failed to delete product')
            console.error(err)
        }
    }

    if (loading) {
        return (
            <Card className="glass-card border-[rgba(255,255,255,0.1)]">
                <CardContent className="p-8 flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-transparent border-t-[#FF9EB5] border-r-[#B3688A]"></div>
                    <p className="text-[#9CA3AF] text-sm">Loading your products...</p>
                </CardContent>
            </Card>
        )
    }

    if (products.length === 0) {
        return (
            <Card className="glass-card border-[rgba(255,255,255,0.1)]">
                <CardHeader>
                    <CardTitle className="text-[#EDEDED] text-xl font-bold">Your Products</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 space-y-3">
                        <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-[#FF9EB5]/20 to-[#794A63]/20 flex items-center justify-center text-3xl">
                            🛍️
                        </div>
                        <p className="text-[#9CA3AF]">
                            No products yet. Add your first product to start tracking!
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="glass-card border-[rgba(255,255,255,0.1)]">
            <CardHeader className="border-b border-[rgba(255,255,255,0.08)]">
                <CardTitle className="text-[#EDEDED] text-xl font-bold flex items-center gap-2">
                    <span>Your Products</span>
                    <Badge className="bg-gradient-to-r from-[#FF9EB5] to-[#B3688A] text-black font-bold px-2 py-0.5 text-xs">
                        {products.length}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
                <div className="space-y-3">
                    {products.map((product, index) => (
                        <div
                            key={product.id}
                            className="group relative p-4 rounded-xl glass-card border-[rgba(255,255,255,0.08)] hover:border-[#FF9EB5]/40 transition-all cursor-pointer animate-slide-up"
                            style={{ animationDelay: `${index * 0.05}s` }}
                            onClick={() => onProductSelect?.(product)}
                        >

                            <div className="flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-semibold group-hover:text-[#FF9EB5] transition-colors flex items-center gap-2 text-[#EDEDED] line-clamp-2">
                                            {(product.status === 'scraping' || product.status === 'queued') && <Loader2 className="w-4 h-4 text-[#FF9EB5] animate-spin shrink-0" />}
                                            {product.status === 'failed' && <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />}
                                            <span className="break-words">{product.name}</span>
                                        </div>
                                        {(product.status === 'scraping' || product.status === 'queued') && (
                                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] py-0 px-1.5">
                                                QUEUED
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                                        <span>Added {formatDate(product.created_at)}</span>
                                        {product.url && (
                                            <>
                                                <span>•</span>
                                                <a
                                                    href={product.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[#FF9EB5] hover:underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    View →
                                                </a>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 pl-3 border-l border-[rgba(255,255,255,0.08)]">
                                    <div className="text-right">
                                        <p className="text-xl font-bold text-gradient">
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
                                        className="text-red-400/60 hover:text-red-400 hover:bg-red-400/10 h-8 w-8 p-0"
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
