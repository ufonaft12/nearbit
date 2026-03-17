'use client';

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react';
import type { BasketItem, SearchStrategy } from '@/types/nearbit';

// ─── State ────────────────────────────────────────────────────────────────────

interface BasketState {
  items:    BasketItem[];
  strategy: SearchStrategy;
}

const DEFAULT_STATE: BasketState = { items: [], strategy: 'cheap' };

// ─── Actions ──────────────────────────────────────────────────────────────────

type BasketAction =
  | { type: 'ADD_ITEM';     item:     BasketItem     }
  | { type: 'REMOVE_ITEM';  id:       string         }
  | { type: 'CLEAR'                                  }
  | { type: 'SET_STRATEGY'; strategy: SearchStrategy };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function basketReducer(state: BasketState, action: BasketAction): BasketState {
  switch (action.type) {
    case 'ADD_ITEM':
      if (state.items.some((i) => i.id === action.item.id)) return state;
      return { ...state, items: [...state.items, action.item] };

    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };

    case 'CLEAR':
      return { ...state, items: [] };

    case 'SET_STRATEGY':
      return { ...state, strategy: action.strategy };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface BasketContextValue {
  items:       BasketItem[];
  strategy:    SearchStrategy;
  totalCost:   number;
  addItem:     (item: BasketItem)      => void;
  removeItem:  (id: string)            => void;
  clearBasket: ()                      => void;
  setStrategy: (s: SearchStrategy)    => void;
  hasItem:     (id: string)            => boolean;
}

const BasketContext = createContext<BasketContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nearbit:basket';

function loadFromStorage(): BasketState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as BasketState) : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(basketReducer, undefined, loadFromStorage);

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* quota exceeded — silently skip */ }
  }, [state]);

  const totalCost = state.items.reduce((sum, i) => sum + (i.price ?? 0), 0);

  const value: BasketContextValue = {
    items:       state.items,
    strategy:    state.strategy,
    totalCost,
    addItem:     (item) => dispatch({ type: 'ADD_ITEM',     item     }),
    removeItem:  (id)   => dispatch({ type: 'REMOVE_ITEM',  id       }),
    clearBasket: ()     => dispatch({ type: 'CLEAR'                  }),
    setStrategy: (s)    => dispatch({ type: 'SET_STRATEGY', strategy: s }),
    hasItem:     (id)   => state.items.some((i) => i.id === id),
  };

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBasket(): BasketContextValue {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error('useBasket must be used inside <BasketProvider>');
  return ctx;
}
