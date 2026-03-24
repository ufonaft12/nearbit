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
import { useTranslations } from 'next-intl';
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';
import {
  Mic, MicOff,
  MapPin, MapPinOff, Loader2,
  Search as SearchIcon, Coins, ShoppingBasket,
  AlertTriangle, ListChecks,
} from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { clearBasket, removeItem } from '@/lib/store/basketSlice';
import { useLocale } from '@/app/providers';
import { ListInput } from './ListInput';
import { validateQuery } from '@/lib/validateQuery';
import { parseBasketCommand } from '@/lib/utils/basketCommands';
import { vibrate } from '@/lib/utils/vibrate';
import { MIN_QUERY_LENGTH, MAX_QUERY_LENGTH } from '@/lib/search';
import { SUGGESTIONS_BY_LOCALE, STT_LANG, type Locale } from '@/lib/i18n/config';
import type { SearchStrategy } from '@/types/nearbit';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LocStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable';

interface Props {
  strategy:         SearchStrategy;
  isFetching:       boolean;
  /** Called whenever committedQuery changes (parent fires the search) */
  onCommit:         (query: string) => void;
  /** Called when the user's location updates */
  onLocationChange: (loc: { lat: number; lng: number } | null) => void;
  onStrategyChange: (s: SearchStrategy) => void;
  /**
   * Called when an "add X" voice/text command is detected.
   * label = toast text, query = pending auto-add search term (null to clear).
   */
  onPendingAdd:     (label: string | null, query: string | null) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 400;
const THROTTLE_MS = 800;
const BASKET_RE   = /[,،]|\s+(?:and|ו|או|и|или)\s+/gi;

// ─── Component ────────────────────────────────────────────────────────────────

export function SearchBox({
  strategy,
  isFetching,
  onCommit,
  onLocationChange,
  onStrategyChange,
  onPendingAdd,
}: Props) {
  const tSearch   = useTranslations('search');
  const tVoice    = useTranslations('voice');
  const tLocation = useTranslations('location');

  const { locale } = useLocale();
  const suggestions = SUGGESTIONS_BY_LOCALE[locale as Locale] ?? SUGGESTIONS_BY_LOCALE['he'];

  const dispatch = useAppDispatch();
  const { items } = useAppSelector((s) => s.basket);

  // ── Local state ─────────────────────────────────────────────────────────────
  const [inputValue, setInputValue]           = useState('');
  const [localCommitted, setLocalCommitted]   = useState('');
  const [locStatus, setLocStatus]             = useState<LocStatus>('idle');
  const [isListening, setIsListening]         = useState(false);
  const [sttLang, setSttLang]                 = useState<'he-IL' | 'ru-RU' | 'en-US'>(STT_LANG[locale as Locale] ?? 'he-IL');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [inputMode, setInputMode]             = useState<'text' | 'list'>('text');
  const [listItems, setListItems]             = useState<string[]>([]);

  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // ── Keep sttLang in sync with locale ────────────────────────────────────────
  useEffect(() => {
    setSttLang(STT_LANG[locale as Locale] ?? 'he-IL');
  }, [locale]);

  // ── Auto-resize textarea ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [inputValue]);

  // ── Commit helper (updates local + notifies parent) ──────────────────────────
  const commit = useCallback((q: string) => {
    setLocalCommitted(q);
    onCommit(q);
  }, [onCommit]);

  // ── Basket detection ─────────────────────────────────────────────────────────
  const isBasketQueryFromText = useMemo(() => {
    const parts = localCommitted
      .split(BASKET_RE)
      .map((s) => s.trim())
      .filter((s) => s.length >= MIN_QUERY_LENGTH);
    return parts.length >= 2;
  }, [localCommitted]);
  const isBasketQuery = inputMode === 'list' ? listItems.length >= 2 : isBasketQueryFromText;

  // ── Debounce ─────────────────────────────────────────────────────────────────
  const debouncedCommit = useRef(
    debounce((value: string) => {
      const trimmed = value.trim();
      if (trimmed.length >= MIN_QUERY_LENGTH) commit(trimmed);
    }, DEBOUNCE_MS),
  ).current;

  useEffect(() => () => debouncedCommit.cancel(), [debouncedCommit]);

  // ── List mode handlers ───────────────────────────────────────────────────────
  const handleListItemsChange = useCallback((next: string[]) => {
    setListItems(next);
  }, []);

  const handleBackToText = useCallback(() => {
    setInputMode('text');
    setListItems([]);
    commit('');
    setInputValue('');
  }, [commit]);

  const handleSwitchToList = useCallback(() => {
    const segments = inputValue
      .split(/[,،\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    setListItems(segments);
    setInputMode('list');
    debouncedCommit.cancel();
  }, [inputValue, debouncedCommit]);

  // ── Focus management on mode switch ─────────────────────────────────────────
  // Re-focus the textarea whenever we return to text mode so the mobile keyboard
  // does not close and the user can keep typing without an extra tap.
  useEffect(() => {
    if (inputMode === 'text') {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [inputMode]);

  // ── Input change handler ─────────────────────────────────────────────────────
  // No auto-switching: mode changes are strictly manual via the toggle button.
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value.slice(0, MAX_QUERY_LENGTH));
      setValidationError(null);
    },
    [],
  );

  // ── Execute search (on Submit / Enter) ───────────────────────────────────────
  const executeSearch = useCallback(() => {
    debouncedCommit.cancel();

    // Smart parse: in text mode split on commas and newlines so that
    // "хумус, молоко" is sent as two separate basket intents rather than one.
    const trimmed = inputMode === 'list'
      ? listItems.filter((s) => s.trim().length >= MIN_QUERY_LENGTH).join(', ')
      : inputValue
          .split(/[,،\n]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .join(', ');

    if (trimmed.length < MIN_QUERY_LENGTH) return;

    const validation = validateQuery(trimmed);
    if (!validation.ok) {
      setValidationError(validation.reason ?? 'Invalid query');
      return;
    }
    setValidationError(null);

    const cmd = parseBasketCommand(trimmed);
    if (cmd) {
      if (cmd.type === 'clear') { dispatch(clearBasket()); setInputValue(''); return; }
      if (cmd.type === 'remove') {
        const needle = cmd.name.toLowerCase();
        const match  = items.find((i) => i.name.toLowerCase().includes(needle));
        if (match) dispatch(removeItem(match.id));
        setInputValue('');
        return;
      }
      if (cmd.type === 'add') {
        onPendingAdd(cmd.query, cmd.query);
        commit(cmd.query);
        setInputValue(cmd.query);
        return;
      }
    }

    commit(trimmed);
  }, [inputValue, inputMode, listItems, debouncedCommit, dispatch, items, onPendingAdd, commit]);

  const handleSubmit = useCallback(
    (e: FormEvent) => { e.preventDefault(); executeSearch(); },
    [executeSearch],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter') return;
      const withMeta = e.ctrlKey || e.metaKey;
      if (withMeta) {
        // Ctrl+Enter / Cmd+Enter: always search, regardless of mode
        e.preventDefault();
        executeSearch();
      } else if (inputMode === 'text') {
        // Plain Enter in text mode: search (standard mobile "Go" / "Search" behavior)
        e.preventDefault();
        executeSearch();
      }
      // Plain Enter in list mode: allow default — inserts a new line
    },
    [executeSearch, inputMode],
  );

  // ── Voice input ──────────────────────────────────────────────────────────────
  const handleMic = useCallback(() => {
    if (inputMode === 'list') return; // guarded: no mic in list mode

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    if (isListening) { recognitionRef.current?.stop(); return; }

    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = sttLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setIsListening(true);
    rec.onend   = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      const transcript: string = event.results[0][0].transcript;
      setInputValue((prev) => {
        const next       = prev ? `${prev}\n${transcript}` : transcript;
        const sliced     = next.slice(0, MAX_QUERY_LENGTH);
        return sliced;
      });
    };
    rec.start();
  }, [inputMode, isListening, sttLang, debouncedCommit]);

  // ── Suggestions ──────────────────────────────────────────────────────────────
  const throttledSuggestion = useRef(
    throttle(
      (s: string) => { setInputValue(s); commit(s); },
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
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setLocStatus('active');
            onLocationChange(loc);
            vibrate([30, 50, 30]);
          },
          (err) => { setLocStatus(err.code === 1 ? 'denied' : 'idle'); },
          { timeout: 10_000 },
        );
      },
      3000,
      { leading: true, trailing: false },
    ),
  ).current;

  // ── Derived ──────────────────────────────────────────────────────────────────
  const nearLimit = inputValue.length > MAX_QUERY_LENGTH * 0.8;

  const sttLangName = sttLang === 'he-IL' ? tVoice('he') : sttLang === 'ru-RU' ? tVoice('ru') : tVoice('en');

  const isSubmitDisabled = isFetching || (
    inputMode === 'list'
      ? listItems.filter((s) => s.trim().length >= MIN_QUERY_LENGTH).length === 0
      : inputValue.trim().length < MIN_QUERY_LENGTH
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <section>
      <form onSubmit={handleSubmit} className="flex items-start gap-2">
        <div className="relative flex-1">
          {inputMode === 'list' ? (
            <ListInput
              items={listItems}
              onItemsChange={handleListItemsChange}
              onBack={handleBackToText}
              autoFocus
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
              inputMode="search"
              enterKeyHint="search"
              className="w-full resize-none overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 pb-9 text-base text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 shadow-sm transition-shadow"
              style={{ minHeight: '56px' }}
            />
          )}

          {/* List mode toggle — text mode only.
              min-h/w-[44px] ensures ≥44×44 px touch target on mobile. */}
          {inputMode === 'text' && (
            <button
              type="button"
              onClick={handleSwitchToList}
              title={tSearch('listMode')}
              aria-label={tSearch('listMode')}
              className="absolute bottom-1 left-1 flex items-center gap-1 min-h-[44px] min-w-[44px] rounded-lg px-3 py-2 text-[10px] font-semibold text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
            >
              <ListChecks size={13} />
              {tSearch('listMode')}
            </button>
          )}

          {/* Mic controls — text mode only */}
          {inputMode === 'text' && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSttLang((l) =>
                  l === 'he-IL' ? 'ru-RU' : l === 'ru-RU' ? 'en-US' : 'he-IL'
                )}
                title={tVoice('langTitle', { lang: sttLangName })}
                className="rounded-full px-2 py-0.5 text-[10px] font-bold text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
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

        {/* Submit + Location stacked */}
        <div className="flex flex-col gap-1.5">
          <button
            type="submit"
            disabled={isSubmitDisabled}
            aria-busy={isFetching}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-5 py-3 text-sm font-semibold text-white transition-all disabled:opacity-40 shadow-sm"
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
            className={`flex items-center justify-center rounded-2xl border px-3 py-2.5 transition-all disabled:opacity-40 ${
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

      {/* Help text */}
      <p className="mt-1 text-xs text-zinc-400">
        {tSearch('helpText')} <Mic className="inline mb-0.5" size={11} /> (HE / RU / EN)
      </p>

      {/* Validation error */}
      {validationError && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          <AlertTriangle size={12} /> {validationError}
        </p>
      )}

      {/* Char count */}
      {nearLimit && inputMode === 'text' && (
        <p className="mt-0.5 text-right text-xs text-zinc-400">
          {tSearch('charCount', { count: inputValue.length, max: MAX_QUERY_LENGTH })}
        </p>
      )}

      {/* Basket mode indicator */}
      {isBasketQuery && (
        <div className="mt-2 rounded-full bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 w-fit">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <ShoppingBasket size={13} /> {tSearch('basketMode')}
          </p>
        </div>
      )}

      {/* Strategy toggle — shown when location is active */}
      {locStatus === 'active' && (
        <div className="mt-3 flex items-center gap-1 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-1 w-fit shadow-sm">
          <button
            type="button"
            onClick={() => onStrategyChange('near')}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              strategy === 'near'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <MapPin size={12} /> {tSearch('nearMe')}
          </button>
          <button
            type="button"
            onClick={() => onStrategyChange('cheap')}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              strategy === 'cheap'
                ? 'bg-blue-600 text-white shadow-sm'
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
            className="rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-sm text-zinc-600 dark:text-zinc-300 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all shadow-sm"
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}
