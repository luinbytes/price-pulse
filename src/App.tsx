import { useState, useEffect, useCallback } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PlusCircle } from 'lucide-react'
import { generateRandomUsername } from '@/lib/utils-app'
import { ProductInputModal } from '@/components/product-input-modal'
import { ProductList } from '@/components/product-list'
import { ProductDetail } from '@/components/product-detail'
import { Settings } from '@/components/settings'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/lib/database.types'
import './App.css'

interface UserProfile {
  username: string | null
  avatar_url: string | null
}

function LoginPage() {
  const { signInWithGitHub, signInWithGoogle } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center gradient-mesh p-4">
      <Card className="w-full max-w-md glass-card border-[rgba(255,255,255,0.1)] animate-slide-up">
        <CardHeader className="text-center space-y-3 pb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#FF9EB5] to-[#794A63]">
            <span className="text-3xl">💰</span>
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">
            <span className="text-gradient">PricePulse</span>
          </CardTitle>
          <CardDescription className="text-[#9CA3AF]">
            Track product prices across the web and never miss a deal
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          <Button
            onClick={signInWithGitHub}
            className="w-full bg-[#24292e] hover:bg-[#2f363d] text-white h-12 text-base font-medium transition-all hover:scale-[1.02] hover:shadow-lg"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            Continue with GitHub
          </Button>
          <Button
            onClick={signInWithGoogle}
            variant="outline"
            className="w-full border-[rgba(255,255,255,0.1)] bg-transparent hover:bg-[rgba(255,255,255,0.05)] text-[#EDEDED] h-12 text-base font-medium transition-all hover:scale-[1.02]"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Dashboard() {
  const { user, signOut } = useAuth()
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [stats, setStats] = useState({ total: 0, drops: 0, savings: 0 })
  const [profile, setProfile] = useState<UserProfile>({ username: null, avatar_url: null })
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [inputOpen, setInputOpen] = useState(false)

  const fetchStats = useCallback(async () => {
    if (!user) return

    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)

    setStats({
      total: products?.length || 0,
      drops: 0,
      savings: 0
    })
  }, [user])

  const fetchProfile = useCallback(async () => {
    if (!user) return

    const { data } = await supabase
      .from('user_settings')
      .select('username, avatar_url')
      .eq('id', user.id)
      .single()

    if (data) {
      setProfile({ username: data.username, avatar_url: data.avatar_url })
    }
  }, [user])

  useEffect(() => {
    if (user) {
      fetchStats()
      fetchProfile()
    }
    // fetchStats and fetchProfile only depend on 'user', so we don't need them in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshTrigger])

  const handleProductAdded = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product)
    setDetailOpen(true)
  }

  const handleProductDeleted = () => {
    setDetailOpen(false)
    setRefreshTrigger(prev => prev + 1)
  }

  const handleProductUpdate = (updatedProduct: Product) => {
    setSelectedProduct(updatedProduct)
    setRefreshTrigger(prev => prev + 1)
  }

  // Use random username generator or fallback to email handle
  const [randomName] = useState(() => generateRandomUsername())
  const displayName = profile.username || randomName

  return (
    <div className="min-h-screen gradient-mesh">
      {/* Header */}
      <header className="border-b border-[rgba(255,255,255,0.08)] glass-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold">
              <span className="text-gradient">PricePulse</span>
            </h1>
            <Button
              onClick={() => setInputOpen(true)}
              className="hidden sm:flex items-center gap-2 bg-gradient-to-r from-[#FF9EB5] to-[#B3688A] hover:opacity-90 text-black font-medium h-9 px-4 rounded-full transition-opacity"
            >
              <PlusCircle className="w-4 h-4" />
              Add Product
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setInputOpen(true)}
              variant="outline"
              size="icon"
              className="sm:hidden border-[rgba(255,158,181,0.2)] bg-transparent text-[#FF9EB5] hover:bg-[#FF9EB5]/10"
            >
              <PlusCircle className="w-5 h-5" />
            </Button>

            <div className="flex items-center gap-2 pr-2 border-r border-[rgba(255,255,255,0.08)]">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full object-cover border border-[#FF9EB5]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#794A63] to-[#FF9EB5] flex items-center justify-center text-sm font-bold text-white uppercase">
                  {displayName[0]}
                </div>
              )}
              <span className="text-sm text-[#EDEDED] font-medium hidden md:block truncate max-w-[120px] lg:max-w-[200px]" title={displayName as string}>
                {displayName}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-[#9CA3AF] hover:text-[#EDEDED] hover:bg-[rgba(255,255,255,0.05)]"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="glass-card border-[rgba(255,255,255,0.1)] p-1">
            <TabsTrigger
              value="dashboard"
              className="text-[#9CA3AF] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF9EB5] data-[state=active]:to-[#B3688A] data-[state=active]:text-black transition-all"
            >
              Dashboard
            </TabsTrigger>
            <TabsTrigger
              value="products"
              className="text-[#9CA3AF] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF9EB5] data-[state=active]:to-[#B3688A] data-[state=active]:text-black transition-all"
            >
              Products
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="text-[#9CA3AF] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF9EB5] data-[state=active]:to-[#B3688A] data-[state=active]:text-black transition-all"
            >
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="glass-card border-[rgba(255,255,255,0.1)] group hover:border-[#FF9EB5]/30 transition-all animate-slide-up stagger-1">
                <CardHeader className="pb-3">
                  <CardDescription className="text-[#9CA3AF] text-xs uppercase tracking-wider">Total Products</CardDescription>
                  <CardTitle className="text-4xl font-bold text-[#EDEDED]">{stats.total}</CardTitle>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF9EB5]/20 to-[#B3688A]/20 flex items-center justify-center">
                      📦
                    </div>
                    <span className="text-xs text-[#6B7280]">Being tracked</span>
                  </div>
                </CardHeader>
              </Card>

              <Card className="glass-card border-[rgba(255,255,255,0.1)] group hover:border-green-400/30 transition-all animate-slide-up stagger-2">
                <CardHeader className="pb-3">
                  <CardDescription className="text-[#9CA3AF] text-xs uppercase tracking-wider">Price Drops</CardDescription>
                  <CardTitle className="text-4xl font-bold text-green-400">{stats.drops}</CardTitle>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400/20 to-emerald-500/20 flex items-center justify-center">
                      📉
                    </div>
                    <span className="text-xs text-[#6B7280]">This month</span>
                  </div>
                </CardHeader>
              </Card>

              <Card className="glass-card border-[rgba(255,255,255,0.1)] group hover:border-[#FF9EB5]/30 transition-all animate-slide-up stagger-3">
                <CardHeader className="pb-3">
                  <CardDescription className="text-[#9CA3AF] text-xs uppercase tracking-wider">Total Savings</CardDescription>
                  <CardTitle className="text-4xl font-bold text-gradient">${stats.savings.toFixed(2)}</CardTitle>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF9EB5]/20 to-[#794A63]/20 flex items-center justify-center">
                      💰
                    </div>
                    <span className="text-xs text-[#6B7280]">All time</span>
                  </div>
                </CardHeader>
              </Card>
            </div>

            <div className="animate-slide-up stagger-4">
              <ProductList
                refreshTrigger={refreshTrigger}
                onProductSelect={handleProductSelect}
              />
            </div>
          </TabsContent>

          <TabsContent value="products" className="mt-6">
            <ProductList
              refreshTrigger={refreshTrigger}
              onProductSelect={handleProductSelect}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <Settings onProfileUpdate={fetchProfile} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Modals */}
      <ProductInputModal
        open={inputOpen}
        onOpenChange={setInputOpen}
        onProductAdded={handleProductAdded}
      />

      <ProductDetail
        product={selectedProduct}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onDelete={handleProductDeleted}
        onUpdate={handleProductUpdate}
      />
    </div>
  )
}

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-transparent border-t-[#FF9EB5] border-r-[#B3688A]"></div>
          <p className="text-[#9CA3AF] text-sm">Loading PricePulse...</p>
        </div>
      </div>
    )
  }

  return user ? <Dashboard /> : <LoginPage />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster />
    </AuthProvider>
  )
}

export default App
