import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import type { AppDispatch, RootState } from './store';

/** Typed dispatch hook — infers async thunk types automatically. */
export const useAppDispatch = () => useDispatch<AppDispatch>();

/** Typed selector hook — no need to annotate `state` parameter in each call. */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
