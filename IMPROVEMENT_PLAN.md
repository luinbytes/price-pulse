# PricePulse Frontend Improvement Plan

## Critical Issues (Fix Immediately)

### 1. Fix useCallback/useEffect Dependency Cycles
**Files:** App.tsx, product-list.tsx, product-detail.tsx
**Issue:** Circular dependencies causing excessive re-renders and API calls
**Solution:** Remove callback functions from dependency arrays, use only primitive values

### 2. Add Division by Zero Check
**File:** product-detail.tsx:283
**Issue:** `percentChange = ((change / previous) * 100)` crashes if previous is 0
**Solution:** Add guard: `if (previous === 0) return null`

### 3. Fix NaN Handling in Price Input
**File:** product-detail.tsx:218
**Issue:** `parseFloat('')` returns NaN which gets saved to database
**Solution:** Validate parseFloat result before using

### 4. Update ComparisonPrice Interface
**File:** product-detail.tsx:15-23
**Issue:** Missing `is_approximate_match` and `match_score` fields
**Solution:** Add fields to interface to match database schema

## High Priority Fixes

### 5. Extract Duplicate Utility Functions
**Files:** product-list.tsx, product-detail.tsx, settings.tsx
**Issue:** `formatCurrency` and `formatDate` duplicated across files
**Solution:** Move to src/lib/utils-app.ts

### 6. Fix Race Condition in Product Scraping
**File:** product-list.tsx:45-52
**Issue:** Effect marks all scraping products as queued on every render
**Solution:** Track processed products to prevent duplicate updates

### 7. Add Toast Notifications for Errors
**Files:** product-detail.tsx (multiple locations)
**Issue:** Errors logged to console but not shown to user
**Solution:** Add toast.error() calls for all error cases

### 8. Add Timeout to Webhook Test
**File:** settings.tsx:88-116
**Issue:** No timeout for Discord webhook test
**Solution:** Add AbortController with 10s timeout

### 9. Simplify Complex Functions
**Files:** product-detail.tsx, product-input-modal.tsx
**Issue:** Functions with 50+ lines mixing multiple concerns
**Solution:** Extract helper functions

## Medium Priority Refactoring

### 10. Create Custom Hooks
- `useProductData(productId)` - Fetch and subscribe to product
- `useSupabaseSubscription(...)` - Reusable subscription pattern
- `useUserSettings(userId)` - Settings state management

### 11. Split Large Components
- product-detail.tsx (545 lines) → Split into sub-components
- App.tsx (323 lines) → Extract Dashboard sections

### 12. Move Configuration to Constants
- Store icons
- Store locales
- Currency symbols

### 13. Fix Stale Closures
**File:** product-list.tsx:99-114
**Issue:** `deleteProduct` uses stale `products` from closure
**Solution:** Use setState callback: `setProducts(prev => prev.filter(...))`

### 14. Batch State Updates
**File:** product-list.tsx:33-41
**Issue:** Multiple setState calls in forEach loop
**Solution:** Collect updates and apply in single setState

## Low Priority Polish

### 15. Improve URL Validation
**File:** product-input-modal.tsx:33-36
**Solution:** Use URL constructor for proper validation

### 16. Better Type Assertions
**File:** product-detail.tsx:186
**Solution:** Validate schema instead of `as Product` cast

### 17. Improve Error Messages
Make error toasts more specific and actionable

---

## Implementation Order

**Phase 1: Critical Bugs (Today)**
- Items 1-4

**Phase 2: High Priority (This Week)**
- Items 5-9

**Phase 3: Refactoring (Next Sprint)**
- Items 10-14

**Phase 4: Polish (When Time Permits)**
- Items 15-17
