import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

/** Typed version of useDispatch */
export const useAppDispatch = () => useDispatch<AppDispatch>();

/** Typed version of useSelector */
export const useAppSelector = <T>(selector: (state: RootState) => T): T =>
  useSelector<RootState, T>(selector);
