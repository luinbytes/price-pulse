import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

interface SettingsProps {
    onProfileUpdate?: () => void
}

export function Settings({ onProfileUpdate }: SettingsProps) {
    const { user } = useAuth()
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // Profile state
    const [username, setUsername] = useState('')
    const [avatarUrl, setAvatarUrl] = useState('')

    // Notification state
    const [discordWebhook, setDiscordWebhook] = useState('')
    const [checkFrequency, setCheckFrequency] = useState('hourly')
    const [defaultCurrency, setDefaultCurrency] = useState('USD')

    const fetchSettings = useCallback(async () => {
        if (!user) return
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('id', user.id)
                .single()

            if (error) throw error
            if (data) {
                setUsername(data.username || '')
                setAvatarUrl(data.avatar_url || '')
                setDiscordWebhook(data.discord_webhook || '')
                setCheckFrequency(data.check_frequency || '6h')
                setDefaultCurrency(data.default_currency || 'USD')
            }
        } catch {
            toast.error('Failed to load settings')
        } finally {
            setLoading(false)
        }
    }, [user])

    useEffect(() => {
        if (user) {
            fetchSettings()
        }
    }, [user, fetchSettings])

    const saveSettings = async () => {
        if (!user) return

        setSaving(true)
        try {
            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    id: user.id,
                    username: username || null,
                    avatar_url: avatarUrl || null,
                    discord_webhook: discordWebhook || null,
                    check_frequency: checkFrequency,
                    default_currency: defaultCurrency
                })

            if (error) throw error

            toast.success('Settings saved successfully!')
            onProfileUpdate?.()
        } catch (err) {
            toast.error('Failed to save settings')
            console.error(err)
        } finally {
            setSaving(false)
        }
    }

    const testDiscordWebhook = async () => {
        if (!discordWebhook) {
            toast.error('Please enter a Discord webhook URL')
            return
        }

        // Add timeout using AbortController
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

        try {
            const response = await fetch(discordWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: '🔔 PricePulse Test',
                        description: 'Your Discord webhook is working!',
                        color: 0xFF9EB5,
                        timestamp: new Date().toISOString()
                    }]
                }),
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (response.ok) {
                toast.success('Test notification sent!')
            } else {
                toast.error('Webhook test failed')
            }
        } catch (err) {
            clearTimeout(timeoutId)
            if ((err as Error).name === 'AbortError') {
                toast.error('Webhook test timed out after 10 seconds')
            } else {
                toast.error('Failed to send test notification')
            }
        }
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

    return (
        <div className="space-y-6">
            {/* Profile Settings */}
            <Card className="bg-[#1A1A1A] border-[#2A2A2A]">
                <CardHeader>
                    <CardTitle className="text-[#EDEDED]">Profile</CardTitle>
                    <CardDescription className="text-[#9CA3AF]">
                        Customize your display name and avatar
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            {avatarUrl ? (
                                <img
                                    src={avatarUrl}
                                    alt="Avatar"
                                    className="w-20 h-20 rounded-full object-cover border-2 border-[#FF9EB5]"
                                />
                            ) : (
                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#794A63] to-[#FF9EB5] flex items-center justify-center text-2xl font-bold text-white">
                                    {username ? username[0].toUpperCase() : user?.email?.[0].toUpperCase() || '?'}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 space-y-2">
                            <Label htmlFor="avatarUrl" className="text-[#EDEDED]">Avatar URL</Label>
                            <Input
                                id="avatarUrl"
                                type="url"
                                placeholder="https://example.com/your-avatar.png"
                                value={avatarUrl}
                                onChange={(e) => setAvatarUrl(e.target.value)}
                                className="bg-[#0A0A0A] border-[#3A3A3A] text-[#EDEDED] placeholder:text-[#6B7280] focus:border-[#FF9EB5]"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="username" className="text-[#EDEDED]">Display Name</Label>
                        <Input
                            id="username"
                            placeholder="Your display name"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="bg-[#0A0A0A] border-[#3A3A3A] text-[#EDEDED] placeholder:text-[#6B7280] focus:border-[#FF9EB5]"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Notification Settings */}
            <Card className="bg-[#1A1A1A] border-[#2A2A2A]">
                <CardHeader>
                    <CardTitle className="text-[#EDEDED]">Notifications</CardTitle>
                    <CardDescription className="text-[#9CA3AF]">
                        Configure how you receive price drop alerts
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="discordWebhook" className="text-[#EDEDED]">Discord Webhook URL</Label>
                        <div className="flex gap-2">
                            <Input
                                id="discordWebhook"
                                type="url"
                                placeholder="https://discord.com/api/webhooks/..."
                                value={discordWebhook}
                                onChange={(e) => setDiscordWebhook(e.target.value)}
                                className="flex-1 bg-[#0A0A0A] border-[#3A3A3A] text-[#EDEDED] placeholder:text-[#6B7280] focus:border-[#FF9EB5]"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={testDiscordWebhook}
                                className="border-[#3A3A3A] bg-transparent hover:bg-[#2A2A2A] text-[#EDEDED]"
                            >
                                Test
                            </Button>
                        </div>
                        <p className="text-xs text-[#6B7280]">
                            Create a webhook in your Discord server settings → Integrations → Webhooks
                        </p>
                    </div>

                    <Separator className="bg-[#2A2A2A]" />

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="checkFrequency" className="text-[#EDEDED]">Check Frequency</Label>
                            <select
                                id="checkFrequency"
                                value={checkFrequency}
                                onChange={(e) => setCheckFrequency(e.target.value)}
                                className="w-full h-10 px-3 rounded-md bg-[#0A0A0A] border border-[#3A3A3A] text-[#EDEDED] focus:border-[#FF9EB5] focus:outline-none"
                            >
                                <option value="hourly">Every Hour</option>
                                <option value="6hours">Every 6 Hours</option>
                                <option value="12hours">Every 12 Hours</option>
                                <option value="daily">Daily</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="defaultCurrency" className="text-[#EDEDED]">Default Currency</Label>
                            <select
                                id="defaultCurrency"
                                value={defaultCurrency}
                                onChange={(e) => setDefaultCurrency(e.target.value)}
                                className="w-full h-10 px-3 rounded-md bg-[#0A0A0A] border border-[#3A3A3A] text-[#EDEDED] focus:border-[#FF9EB5] focus:outline-none"
                            >
                                <option value="USD">$ USD</option>
                                <option value="EUR">€ EUR</option>
                                <option value="GBP">£ GBP</option>
                                <option value="JPY">¥ JPY</option>
                                <option value="CAD">C$ CAD</option>
                                <option value="AUD">A$ AUD</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Save Button */}
            <Button
                onClick={saveSettings}
                disabled={saving}
                className="w-full bg-[#FF9EB5] hover:bg-[#B3688A] text-black font-semibold"
            >
                {saving ? 'Saving...' : 'Save Settings'}
            </Button>
        </div>
    )
}
