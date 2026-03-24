import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { BasketItem, SearchStrategy } from '@/types/nearbit';

// ─── State ────────────────────────────────────────────────────────────────────

export interface BasketState {
  items:    BasketItem[];
  strategy: SearchStrategy;
  /**
   * True once the client-side localStorage hydration has been applied.
   * Guards against rendering basket-dependent UI before hydration completes,
   * preventing SSR / client hydration mismatches.
   */
  hydrated: boolean;
}

const INITIAL_STATE: BasketState = {
  items:    [],
  strategy: 'cheap',
  hydrated: false,
};

// ─── Slice ────────────────────────────────────────────────────────────────────

export const basketSlice = createSlice({
  name: 'basket',
  initialState: INITIAL_STATE,
  reducers: {
    /**
     * Called once from StoreProvider's useEffect after reading localStorage.
     * Replaces the placeholder initial state with persisted data.
     */
    hydrateBasket(
      state,
      action: PayloadAction<Pick<BasketState, 'items' | 'strategy'>>,
    ) {
      state.items    = action.payload.items;
      state.strategy = action.payload.strategy;
      state.hydrated = true;
    },

    addItem(state, action: PayloadAction<BasketItem>) {
      if (!state.items.some((i) => i.id === action.payload.id)) {
        state.items.push(action.payload);
      }
    },

    removeItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter((i) => i.id !== action.payload);
    },

    clearBasket(state) {
      state.items = [];
    },

    setStrategy(state, action: PayloadAction<SearchStrategy>) {
      state.strategy = action.payload;
    },
  },
});

export const {
  hydrateBasket,
  addItem,
  removeItem,
  clearBasket,
  setStrategy,
} = basketSlice.actions;

export default basketSlice.reducer;
