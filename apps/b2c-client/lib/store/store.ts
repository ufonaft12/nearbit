import { configureStore } from '@reduxjs/toolkit';
import basketReducer from './basketSlice';

// Factory — called once per browser session inside StoreProvider.
// Using a factory (not a module singleton) is the correct pattern for
// Next.js App Router so each Server Component render gets a fresh store.
export const makeStore = () =>
  configureStore({
    reducer: { basket: basketReducer },
  });

export type AppStore    = ReturnType<typeof makeStore>;
export type RootState   = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
