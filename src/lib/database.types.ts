export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            products: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    url: string | null
                    image_url: string | null
                    current_price: number | null
                    currency: string
                    created_at: string
                    last_checked: string | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    url?: string | null
                    image_url?: string | null
                    current_price?: number | null
                    currency?: string
                    created_at?: string
                    last_checked?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    url?: string | null
                    image_url?: string | null
                    current_price?: number | null
                    currency?: string
                    created_at?: string
                    last_checked?: string | null
                }
            }
            price_history: {
                Row: {
                    id: string
                    product_id: string
                    price: number
                    currency: string
                    source: string | null
                    recorded_at: string
                }
                Insert: {
                    id?: string
                    product_id: string
                    price: number
                    currency: string
                    source?: string | null
                    recorded_at?: string
                }
                Update: {
                    id?: string
                    product_id?: string
                    price?: number
                    currency?: string
                    source?: string | null
                    recorded_at?: string
                }
            }
            user_settings: {
                Row: {
                    id: string
                    discord_webhook: string | null
                    check_frequency: string
                    default_currency: string
                    username: string | null
                    avatar_url: string | null
                    created_at: string
                }
                Insert: {
                    id: string
                    discord_webhook?: string | null
                    check_frequency?: string
                    default_currency?: string
                    username?: string | null
                    avatar_url?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    discord_webhook?: string | null
                    check_frequency?: string
                    default_currency?: string
                    username?: string | null
                    avatar_url?: string | null
                    created_at?: string
                }
            }
        }
    }
}

export type Product = Database['public']['Tables']['products']['Row']
export type PriceHistory = Database['public']['Tables']['price_history']['Row']
export type UserSettings = Database['public']['Tables']['user_settings']['Row']
