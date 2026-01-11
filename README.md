# PricePulse

PricePulse is a modern, real-time price tracking and comparison dashboard built with React and TypeScript. It helps you track product prices across various e-commerce websites, visualize price trends, and automatically find the best deals.

## Features

- **📊 Price Trend Analysis**: Visual charts to track price history over time.
- **🛍️ Product Management**: Easily add, edit, and delete products to track.
- **📉 Automated Price Drops**: Detects price changes and calculates savings.
- **🔍 Price Comparison**: Automatically scrapes and compares prices across multiple stores (Amazon, eBay, Walmart, etc.).
- **🌓 Modern UI**: Beautiful glassmorphism design with Dark/Light mode support.
- **🔐 Secure Authentication**: User accounts powered by Supabase Auth.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS, Tailwind Animate, Lucide React
- **Backend/Database**: Supabase (PostgreSQL, Auth)
- **Scraping**: Puppeteer (headless browser for price checking)
- **Charts**: Recharts
- **State Management**: React Hooks

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A Supabase project

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/luinbytes/price-tracker.git
   cd price-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with the following credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```
   *Note: `SUPABASE_SERVICE_ROLE_KEY` is required for the server-side scraping script.*

4. Start the development server:
   ```bash
   npm run dev
   ```

### Running the Price Scraper

To manually trigger the price check and comparison script:

```bash
npm run price-check
```

## Scripts

- `npm run dev`: Start the development server.
- `npm run build`: Build the project for production.
- `npm run price-check`: Run the headless scraper to update prices.
- `npm run lint`: Run ESLint.

## License

MIT
