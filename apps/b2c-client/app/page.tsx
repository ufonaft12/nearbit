'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type FormEvent,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';

import {
  Mic, MicOff,
  MapPin, MapPinOff, Loader2,
  Search as SearchIcon, Coins, ShoppingBasket,
  AlertTriangle,
} from 'lucide-react';

import { fetchSearch, SearchError, MIN_QUERY_LENGTH, MAX_QUERY_LENGTH } from '@/lib/search';
import { validateQuery } from '@/lib/validateQuery';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { addItem, removeItem, clearBasket, setStrategy } from '@/lib/store/basketSlice';
import { useLocale } from '@/app/providers';
import { BasketFloatingBar } from '@/app/components/BasketFloatingBar';
import { ListInput } from '@/app/components/ListInput';
import { ThemeToggle } from '@/app/components/ThemeToggle';
import { LanguageSwitcher } from '@/app/components/LanguageSwitcher';
import { BasketSummaryCard } from '@/app/components/BasketSummaryCard';
import { ProductCard } from '@/app/components/ProductCard';
import { SkeletonAnswer, SkeletonCard } from '@/app/components/Skeleton';
import { vibrate } from '@/lib/utils/vibrate';
import { parseBasketCommand } from '@/lib/utils/basketCommands';
import {
  SUGGESTIONS_BY_LOCALE,
  STT_LANG,
} from '@/lib/i18n/config';
import type { SearchResultWithStore, BasketItem, SearchStrategy } from '@/types/nearbit';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 400;
const THROTTLE_MS = 800;
const BASKET_RE   = /[,،]|\s+(?:and|ו|או|и|или)\s+/gi;

// ─── Home ─────────────────────────────────────────────────────────────────────

type LocStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable';

export default function Home() {
  const tSearch   = useTranslations('search');
  const tVoice    = useTranslations('voice');
  const tLocation = useTranslations('location');
  const tResults  = useTranslations('results');
  const tErrors   = useTranslations('errors');
  const tWa       = useTranslations('whatsapp');
  const tHeader   = useTranslations('header');

  const { locale } = useLocale();
  const suggestions = SUGGESTIONS_BY_LOCALE[locale];

  const [inputValue, setInputValue]         = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [userLocation, setUserLocation]     = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus]           = useState<LocStatus>('idle');
  const [isListening, setIsListening]       = useState(false);
  const [sttLang, setSttLang]               = useState<'he-IL' | 'ru-RU' | 'en-US'>(STT_LANG[locale]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── List (basket) input mode ─────────────────────────────────────────────────
  // 'text'  — normal textarea (default)
  // 'list'  — chip-based list builder (auto-activated on comma / newline)
  const [inputMode, setInputMode] = useState<'text' | 'list'>('text');
  const [listItems, setListItems] = useState<string[]>([]);

  // Keep sttLang in sync when user switches app language
  useEffect(() => {
    setSttLang(STT_LANG[locale]);
  }, [locale]);

  const dispatch = useAppDispatch();
  const { items, strategy } = useAppSelector((s) => s.basket);
  const hasItem = useCallback((id: string) => items.some((i) => i.id === id), [items]);

  const handleAddItem    = useCallback((item: BasketItem) => dispatch(addItem(item)),    [dispatch]);
  const handleRemoveItem = useCallback((id: string)      => dispatch(removeItem(id)),    [dispatch]);

  const throttledSetStrategy = useRef(
    throttle((s: SearchStrategy) => dispatch(setStrategy(s)), 400, { leading: true, trailing: false }),
  ).current;

  const pendingAutoAddQueryRef = useRef<string | null>(null);
  const [pendingAddLabel, setPendingAddLabel] = useState<string | null>(null);

  const resultsAnchorRef = useRef<HTMLDivElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef   = useRef<any>(null);

  // ── Share helpers ────────────────────────────────────────────────────────────
  const shareAnswerToWhatsApp = useCallback((answer: string, query: string) => {
    const text = tWa('answerText', { query, answer });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }, [tWa]);

  // ── List-mode: keep committedQuery in sync when chips change ─────────────────
  // Fix: sync for any list length ≥1 (not only ≥2) so single-chip search works.
  // Clear committedQuery when list becomes empty to avoid stale results.
  const handleListItemsChange = useCallback(
    (next: string[]) => {
      setListItems(next);
      if (next.length === 0) {
        setCommittedQuery('');
      } else {
        const joined = next.filter((s) => s.trim().length >= MIN_QUERY_LENGTH).join(', ');
        if (joined) setCommittedQuery(joined);
      }
    },
    [],
  );

  const handleBackToText = useCallback(() => {
    setInputMode('text');
    setListItems([]);
    setCommittedQuery('');
    setInputValue('');
  }, []);

  // ── Basket detection ─────────────────────────────────────────────────────────
  const isBasketQueryFromText = useMemo(() => {
    const parts = committedQuery
      .split(BASKET_RE)
      .map((s) => s.trim())
      .filter((s) => s.length >= MIN_QUERY_LENGTH);
    return parts.length >= 2;
  }, [committedQuery]);
  const isBasketQuery = inputMode === 'list' ? listItems.length >= 2 : isBasketQueryFromText;

  // ── Debounce ─────────────────────────────────────────────────────────────────
  const debouncedCommit = useRef(
    debounce((value: string) => {
      const trimmed = value.trim();
      if (trimmed.length >= MIN_QUERY_LENGTH) setCommittedQuery(trimmed);
    }, DEBOUNCE_MS),
  ).current;

  useEffect(() => () => debouncedCommit.cancel(), [debouncedCommit]);

  // ── Auto-resize textarea ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [inputValue]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value.slice(0, MAX_QUERY_LENGTH);
      setInputValue(value);
      setValidationError(null);

      // Auto-transform to list mode on comma or newline with ≥2 segments
      if (value.includes(',') || value.includes('\n')) {
        const segments = value
          .split(/[,،\n]/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2);
        if (segments.length >= 2) {
          setListItems(segments);
          setInputMode('list');
          debouncedCommit.cancel();
          setCommittedQuery('');
          return;
        }
      }

      const normalized = value.split('\n').map((l) => l.trim()).filter(Boolean).join(', ');
      debouncedCommit(normalized);
    },
    [debouncedCommit],
  );

  const executeSearch = useCallback(() => {
    debouncedCommit.cancel();

    // In list mode: join all valid chips as a basket query
    const trimmed = inputMode === 'list'
      ? listItems.filter((s) => s.trim().length >= MIN_QUERY_LENGTH).join(', ')
      : inputValue.split('\n').map((l) => l.trim()).filter(Boolean).join(', ');

    if (trimmed.length < MIN_QUERY_LENGTH) return;

    const validation = validateQuery(trimmed);
    if (!validation.ok) {
      setValidationError(validation.reason ?? 'Invalid search query.');
      return;
    }
    setValidationError(null);

    const cmd = parseBasketCommand(trimmed);
    if (cmd) {
      if (cmd.type === 'clear') {
        dispatch(clearBasket());
        setInputValue('');
        return;
      }
      if (cmd.type === 'remove') {
        const needle = cmd.name.toLowerCase();
        const match  = items.find((i) => i.name.toLowerCase().includes(needle));
        if (match) dispatch(removeItem(match.id));
        setInputValue('');
        return;
      }
      if (cmd.type === 'add') {
        pendingAutoAddQueryRef.current = cmd.query;
        setPendingAddLabel(cmd.query);
        setCommittedQuery(cmd.query);
        setInputValue(cmd.query);
        return;
      }
    }

    setCommittedQuery(trimmed);
  }, [inputValue, inputMode, listItems, debouncedCommit, dispatch, items]);

  const handleSubmit = useCallback(
    (e: FormEvent) => { e.preventDefault(); executeSearch(); },
    [executeSearch],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        executeSearch();
      }
    },
    [executeSearch],
  );

  // ── Voice input ──────────────────────────────────────────────────────────────
  const handleMic = useCallback(() => {
    // Only available in text mode
    if (inputMode === 'list') return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang             = sttLang;
    rec.interimResults   = false;
    rec.maxAlternatives  = 1;

    rec.onstart = () => setIsListening(true);
    rec.onend   = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      const transcript: string = event.results[0][0].transcript;
      setInputValue((prev) => {
        const next       = prev ? `${prev}\n${transcript}` : transcript;
        const sliced     = next.slice(0, MAX_QUERY_LENGTH);
        const normalized = sliced.split('\n').map((l: string) => l.trim()).filter(Boolean).join(', ');
        debouncedCommit(normalized);
        return sliced;
      });
    };

    rec.start();
  }, [inputMode, isListening, sttLang, debouncedCommit]);

  const throttledSuggestion = useRef(
    throttle(
      (s: string) => { setInputValue(s); setCommittedQuery(s); },
      THROTTLE_MS,
      { trailing: false },
    ),
  ).current;

  const handleSuggestion = useCallback(
    (s: string) => { debouncedCommit.cancel(); throttledSuggestion(s); },
    [debouncedCommit, throttledSuggestion],
  );

  // ── Geolocation ──────────────────────────────────────────────────────────────
  const requestLocation = useRef(
    throttle(
      () => {
        if (!navigator.geolocation) { setLocStatus('unavailable'); return; }
        setLocStatus('requesting');
        vibrate(30);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setLocStatus('active');
            vibrate([30, 50, 30]);
          },
          (err) => {
            setLocStatus(err.code === 1 ? 'denied' : 'idle');
          },
          { timeout: 10_000 },
        );
      },
      3000,
      { leading: true, trailing: false },
    ),
  ).current;

  // ── TanStack Query ───────────────────────────────────────────────────────────
  const { data, isFetching, isError, error, isSuccess } = useQuery({
    queryKey: ['search', committedQuery, userLocation, strategy] as const,
    queryFn:  ({ signal }) =>
      fetchSearch(committedQuery, signal, userLocation ?? undefined, strategy),
    enabled:  committedQuery.length >= MIN_QUERY_LENGTH,
  });

  // ── Haptic + scroll + auto-add ───────────────────────────────────────────────
  useEffect(() => {
    if (!data) return;
    vibrate(50);
    resultsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const pendingQuery = pendingAutoAddQueryRef.current;
    if (pendingQuery && data.results.length > 0) {
      const top = data.results[0];
      dispatch(addItem({
        id:        top.id,
        name:      top.nameHe ?? top.normalizedName,
        price:     top.price,
        storeName: top.storeName,
        storeId:   top.storeId,
        query:     pendingQuery,
        storeLat:  top.storeLat,
        storeLng:  top.storeLng,
      }));
      pendingAutoAddQueryRef.current = null;
    }
    setPendingAddLabel(null);
  }, [data, dispatch]);

  useEffect(() => {
    if (isError) {
      pendingAutoAddQueryRef.current = null;
      setPendingAddLabel(null);
    }
  }, [isError]);

  // ── Derived state ─────────────────────────────────────────────────────────────
  const isNetworkError  = isError && error instanceof SearchError && error.isNetworkError;
  const hasResults      = isSuccess && data.results.length > 0;
  const showInitialHint = !isFetching && !isSuccess && !isError;
  const nearLimit       = inputValue.length > MAX_QUERY_LENGTH * 0.8;

  // Submit disabled: respect current input mode
  const isSubmitDisabled = isFetching || (
    inputMode === 'list'
      ? listItems.filter((s) => s.trim().length >= MIN_QUERY_LENGTH).length === 0
      : inputValue.trim().length < MIN_QUERY_LENGTH
  );

  // STT language display name
  const sttLangName = sttLang === 'he-IL' ? tVoice('he') : sttLang === 'ru-RU' ? tVoice('ru') : tVoice('en');

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 py-3">
        <div className="mx-auto max-w-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Nearbit
            </span>
            <span className="text-sm text-zinc-400 hidden sm:inline">{tHeader('tagline')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10 pb-40 flex flex-col gap-8">

        {/* ── Search box ── */}
        <section>
          <form onSubmit={handleSubmit} className="flex items-start gap-2">
            <div className="relative flex-1">
              {/* List mode: chip builder */}
              {inputMode === 'list' ? (
                <ListInput
                  items={listItems}
                  onItemsChange={handleListItemsChange}
                  onBack={handleBackToText}
                />
              ) : (
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={tSearch('placeholder')}
                  dir="auto"
                  autoComplete="off"
                  spellCheck={false}
                  rows={1}
                  maxLength={MAX_QUERY_LENGTH}
                  aria-label={tSearch('ariaLabel')}
                  className="w-full resize-none overflow-hidden rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 pb-9 text-base text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                  style={{ minHeight: '48px' }}
                />
              )}

              {/* Mic controls — text mode only */}
              {inputMode === 'text' && (
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  {/* STT language cycle: HE → RU → EN → HE */}
                  <button
                    type="button"
                    onClick={() => setSttLang((l) =>
                      l === 'he-IL' ? 'ru-RU' : l === 'ru-RU' ? 'en-US' : 'he-IL'
                    )}
                    title={tVoice('langTitle', { lang: sttLangName })}
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {sttLang === 'he-IL' ? 'HE' : sttLang === 'ru-RU' ? 'RU' : 'EN'}
                  </button>

                  <button
                    type="button"
                    onClick={handleMic}
                    aria-label={isListening ? tVoice('stopListening') : tVoice('startListening')}
                    title={isListening ? tVoice('listeningTitle') : tVoice('voiceTitle')}
                    className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                      isListening
                        ? 'text-red-500 bg-red-50 dark:bg-red-950/30 animate-pulse'
                        : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                  </button>
                </div>
              )}
            </div>

            {/* Submit + location stacked vertically */}
            <div className="flex flex-col gap-1.5">
              <button
                type="submit"
                disabled={isSubmitDisabled}
                aria-busy={isFetching}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 dark:bg-zinc-50 px-5 py-3 text-sm font-semibold text-white dark:text-zinc-900 transition-opacity disabled:opacity-40 hover:opacity-80"
              >
                {isFetching
                  ? <Loader2 size={16} className="animate-spin" />
                  : <><SearchIcon size={15} /> {tSearch('button')}</>
                }
              </button>

              <button
                type="button"
                onClick={requestLocation}
                disabled={locStatus === 'requesting' || locStatus === 'denied' || locStatus === 'unavailable'}
                title={
                  locStatus === 'active'      ? tLocation('active')      :
                  locStatus === 'denied'      ? tLocation('denied')      :
                  locStatus === 'unavailable' ? tLocation('unavailable') :
                  locStatus === 'requesting'  ? tLocation('requesting')  :
                  tLocation('idle')
                }
                aria-label={tLocation('ariaLabel')}
                className={`flex items-center justify-center rounded-xl border px-3 py-2.5 transition-colors disabled:opacity-40 ${
                  locStatus === 'active'
                    ? 'border-green-400 text-green-500 bg-green-50 dark:bg-green-950/30'
                    : locStatus === 'denied' || locStatus === 'unavailable'
                    ? 'border-red-300 dark:border-red-800 text-red-400'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {locStatus === 'requesting'
                  ? <Loader2 size={18} className="animate-spin" />
                  : locStatus === 'denied' || locStatus === 'unavailable'
                  ? <MapPinOff size={18} />
                  : <MapPin size={18} />
                }
              </button>
            </div>
          </form>

          <p className="mt-1 text-xs text-zinc-400">
            {tSearch('helpText')} <Mic className="inline mb-0.5" size={11} /> (HE / RU / EN)
          </p>

          {/* Validation error */}
          {validationError && (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
              <AlertTriangle size={12} />
              {validationError}
            </p>
          )}

          {nearLimit && inputMode === 'text' && (
            <p className="mt-0.5 text-right text-xs text-zinc-400">
              {tSearch('charCount', { count: inputValue.length, max: MAX_QUERY_LENGTH })}
            </p>
          )}

          {/* Basket mode indicator */}
          {isBasketQuery && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <ShoppingBasket size={13} /> {tSearch('basketMode')}
            </p>
          )}

          {/* Strategy toggle — shown once location is active */}
          {locStatus === 'active' && (
            <div className="mt-3 flex items-center gap-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 p-1 w-fit">
              <button
                type="button"
                onClick={() => throttledSetStrategy('near')}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  strategy === 'near'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <MapPin size={12} /> {tSearch('nearMe')}
              </button>
              <button
                type="button"
                onClick={() => throttledSetStrategy('cheap')}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  strategy === 'cheap'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <Coins size={12} /> {tSearch('lowestPrice')}
              </button>
            </div>
          )}

          {/* Suggestion chips */}
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={tSearch('suggestionsLabel')}>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestion(s)}
                className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* ── Initial hint ── */}
        {showInitialHint && (
          <p className="text-center text-sm text-zinc-400">
            {tSearch('initialHint', { min: MIN_QUERY_LENGTH, example: suggestions.slice(0, 3).join(', ') })}
          </p>
        )}

        {/* ── Network error ── */}
        {isNetworkError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{tErrors('connectionTitle')}</p>
            <p className="mt-0.5 text-sm text-red-600/80 dark:text-red-400/80">
              {tErrors('connectionMessage')}
            </p>
          </div>
        )}

        {/* ── API error ── */}
        {isError && !isNetworkError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error instanceof Error ? error.message : tErrors('searchFailed')}
          </div>
        )}

        {/* ── Skeleton loaders ── */}
        {isFetching && (
          <div aria-busy="true" aria-label={tResults('loading')} className="flex flex-col gap-3">
            <SkeletonAnswer />
            <ul className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </ul>
          </div>
        )}

        {/* Invisible scroll anchor */}
        <div ref={resultsAnchorRef} className="-mt-4" aria-hidden="true" />

        {/* ── Results ── */}
        {!isFetching && isSuccess && (
          <section aria-label={tResults('ariaLabel')} className="flex flex-col gap-4">

            {/* LLM answer card */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {tResults('assistant')}
                </p>
                <button
                  type="button"
                  onClick={() => shareAnswerToWhatsApp(data.answer, committedQuery)}
                  aria-label={tResults('shareAriaLabel')}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-500 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                >
                  <span className="text-green-600 dark:text-green-500">
                    {/* WhatsApp icon inline to avoid extra import in this slot */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.856L.054 23.25a.75.75 0 0 0 .918.919l5.451-1.485A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.693-.512-5.228-1.405l-.375-.217-3.888 1.059 1.025-3.801-.233-.389A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                    </svg>
                  </span>
                  {tResults('share')}
                </button>
              </div>
              <p className="text-base leading-relaxed text-zinc-800 dark:text-zinc-200" dir="auto">
                {data.answer}
              </p>
            </div>

            {/* Basket summary */}
            {data.basket && (
              <BasketSummaryCard basket={data.basket} query={committedQuery} />
            )}

            {/* Product list */}
            {hasResults ? (
              <>
                <p className="px-1 text-xs text-zinc-400">
                  {tResults('resultsCount', { count: data.results.length, query: committedQuery })}
                </p>
                <ul className="flex flex-col gap-2" role="list" aria-label={tResults('productListAriaLabel')}>
                  {data.results.map((r) => (
                    <ProductCard
                      key={r.id}
                      result={r}
                      searchQuery={committedQuery}
                      inBasket={hasItem(r.id)}
                      onAdd={handleAddItem}
                      onRemove={handleRemoveItem}
                      onVibrate={vibrate}
                    />
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-zinc-400">
                <SearchIcon size={36} aria-hidden="true" />
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  {tResults('noResults')}
                </p>
                <p className="max-w-xs text-center text-xs">
                  {tResults.rich('noResultsTip', {
                    cmd: (chunks) => (
                      <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 font-mono">
                        {chunks}
                      </code>
                    ),
                  })}
                </p>
              </div>
            )}
          </section>
        )}

      </main>

      {/* Floating basket bar */}
      <BasketFloatingBar pendingAddLabel={pendingAddLabel} />
    </div>
  );
}
