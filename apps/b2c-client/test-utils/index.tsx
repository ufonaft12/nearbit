/**
 * Shared testing utilities for Nearbit component tests.
 */

import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import basketReducer, { type BasketState } from '@/lib/store/basketSlice';
import type { SearchResultWithStore, BasketItem } from '@/types/nearbit';

// ─── Messages — must match en.json keys exactly ───────────────────────────────

export const TEST_MESSAGES = {
  header: {
    tagline: '/ local store search',
  },
  theme: {
    toLightMode: 'Switch to light mode',
    toDarkMode:  'Switch to dark mode',
  },
  search: {
    placeholder:        'Search products...',
    ariaLabel:          'Search products',
    helpText:           'Enter to search · Shift+Enter for new line · Voice',
    button:             'Search',
    basketMode:         'Basket mode — comparing prices across stores',
    nearMe:             'Near Me',
    lowestPrice:        'Lowest Price',
    initialHint:        'Type at least {min} characters — or try a basket: "{example}"',
    suggestionsLabel:   'Quick suggestions',
    charCount:          '{count} / {max}',
    listMode:           'List mode',
    addItemPlaceholder: 'Add item...',
    addItemAriaLabel:   'Add item to list',
    removeItemAriaLabel:'Remove {name} from list',
    backToSearch:       'Back to text search',
    listHelpText:       'Enter to add · Esc for text search',
  },
  voice: {
    stopListening:  'Stop listening',
    startListening: 'Start voice input',
    listeningTitle: 'Listening… (click to stop)',
    voiceTitle:     'Voice input',
    langTitle:      'Voice: {lang} — click to switch',
    he:             'Hebrew',
    ru:             'Russian',
    en:             'English',
  },
  location: {
    ariaLabel:   'Share location',
    active:      'Location active — click to refresh',
    denied:      'Blocked — enable location in browser settings',
    unavailable: 'Geolocation not supported by this browser',
    requesting:  'Requesting location…',
    idle:        'Share my location for closer results',
  },
  results: {
    ariaLabel:           'Search results',
    assistant:           'Assistant',
    share:               'Share',
    shareAriaLabel:      'Share answer on WhatsApp',
    resultsCount:        '{count, plural, one {# result} other {# results}} for "{query}"',
    productListAriaLabel:'Product results',
    noResults:           'No products found',
    noResultsTip:        'Try a different search term, or run <cmd>npm run seed</cmd> to populate the database.',
    loading:             'Loading results',
  },
  product: {
    addToBasket:      'Add {name} to basket',
    removeFromBasket: 'Remove {name} from basket',
    share:            'Share',
    shareAriaLabel:   'Share {name} on WhatsApp',
    openInWaze:       'Open {store} in Waze',
    openInMaps:       'Open {store} in Google Maps',
    lowStock:         '{qty} left!',
    outOfStock:       'Out of stock',
    match:            '{score}% match',
    priceSame:        '→ Same price',
  },
  basket: {
    mode:               'Basket Mode',
    maxSavings:         'Max savings',
    shareBasketSummary: 'Share basket',
    itemsFound:         '{found}/{total} items',
    adding:             'Adding "{label}" to basket…',
    itemCount:          '{count, plural, one {# item in basket} other {# items in basket}}',
    estimated:          'Estimated:',
    stores:             '{count, plural, one {# store} other {# stores}}',
    clearAll:           'Clear all',
    removeItem:         'Remove {name} from basket',
    chooseStore:        'Choose store to navigate to',
    waze:               'Yalla! Waze',
    shareWhatsApp:      'Share basket',
  },
  errors: {
    connectionTitle:   'Connection error',
    connectionMessage: 'Could not reach the server. Check your connection and try again.',
    searchFailed:      'Search failed. Please try again.',
  },
  auth: {
    signin_title:     'Sign in',
    signup_title:     'Create account',
    email_placeholder:'Email address',
    password_placeholder: 'Password',
    signin_submit:    'Sign in',
    signup_submit:    'Create account',
    google_button:    'Continue with Google',
    switch_to_signup: "Don't have an account? Sign up",
    switch_to_signin: 'Already have an account? Sign in',
    loading:          'Loading…',
    check_email:      'Check your email for a confirmation link.',
    signout:          'Sign out',
    error_invalid:    'Invalid email or password.',
  },
  profile: {
    title:            'My Profile',
    signout:          'Sign out',
    history_title:    'Search History',
    history_empty:    'No searches yet',
    purchases_title:  'My Purchases',
    purchases_empty:  'No purchases recorded yet',
    mark_purchased:   'Mark as purchased',
    bought_at:        'Bought on {date}',
    price_then:       'Price then: ₪{price}',
    no_analytics:     'No price data yet',
  },
  whatsapp: {
    productText:    'Hey, check what I found on Nearbit! 🛒\n{name} – {price}\n📍 {store}\nGreat deal! 🤩',
    answerText:     'Hey, I asked Nearbit about "{query}" and here\'s what I found:\n\n{answer}\n\n🛒 nearbit.app',
    basketHeader:   'Hey, here\'s my basket from Nearbit 🛒',
    basketTotal:    '💰 Total: ₪{total}',
    basketFooter:   'Awesome! 🤩',
    basketBestDeal: 'Hey, I found the best basket deal on Nearbit! 🧺\n{items}\n🏆 {store}: ₪{total}\nCool! 🤩',
    basketFallback: 'Found basket "{query}" on Nearbit 🛒',
  },
} as const;

// ─── Store factory ────────────────────────────────────────────────────────────

export function makeStore(preloadedBasket?: Partial<BasketState>) {
  return configureStore({
    reducer: { basket: basketReducer },
    preloadedState: preloadedBasket
      ? { basket: { items: [], strategy: 'cheap' as const, hydrated: true, ...preloadedBasket } }
      : undefined,
  });
}

// ─── Custom render ────────────────────────────────────────────────────────────

interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  store?: ReturnType<typeof makeStore>;
}

export function renderWithProviders(
  ui: React.ReactElement,
  { store = makeStore(), ...options }: ExtendedRenderOptions = {},
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider store={store}>
        <NextIntlClientProvider locale="en" messages={TEST_MESSAGES}>
          {children}
        </NextIntlClientProvider>
      </Provider>
    );
  }
  return { store, ...render(ui, { wrapper: Wrapper, ...options }) };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export function sampleResult(overrides: Partial<SearchResultWithStore> = {}): SearchResultWithStore {
  return {
    id:             'prod-1',
    storeId:        'store-1',
    storeName:      'Super Market',
    normalizedName: 'milk',
    nameHe:         'חלב',
    nameRu:         'молоко',
    nameEn:         'milk',
    category:       'dairy',
    price:          8.90,
    previousPrice:  null,
    quantity:       20,
    unit:           'liter',
    barcode:        null,
    similarity:     0.92,
    storeLat:       32.08,
    storeLng:       34.78,
    distanceKm:     1.2,
    ...overrides,
  };
}

export function sampleBasketItem(overrides: Partial<BasketItem> = {}): BasketItem {
  return {
    id:        'prod-1',
    name:      'חלב',
    price:     8.90,
    storeName: 'Super Market',
    storeId:   'store-1',
    query:     'milk',
    storeLat:  32.08,
    storeLng:  34.78,
    ...overrides,
  };
}
