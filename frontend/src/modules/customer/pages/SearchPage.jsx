import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation as useRouterLocation } from 'react-router-dom';
import { Search, Mic, ArrowLeft, X, ChevronRight, History, MapPin, AlertCircle } from 'lucide-react';
import { customerApi } from '../services/customerApi';
import ProductCard from '../components/shared/ProductCard';
import { useProductDetail } from '../context/ProductDetailContext';
import { useSettings } from '@core/context/SettingsContext';
import { cn } from '@/lib/utils';
import { useLocation as useAppLocation } from '../context/LocationContext';

const RECENT_KEY = 'appzeto_recent_searches';
const MAX_QUERY_LENGTH = 60;
const MAX_RECENT = 10;
const DEBOUNCE_MS = 350;
const SEARCH_LIMIT = 100;
const FALLBACK_IMAGE =
    'https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400';

// Collapse repeated spaces and trim, so "  basmati   rice " === "basmati rice"
const normalizeQuery = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const readRecentSearches = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        return Array.isArray(parsed)
            ? parsed.filter((t) => typeof t === 'string' && t.trim()).slice(0, MAX_RECENT)
            : [];
    } catch {
        return [];
    }
};

const extractProducts = (response) => {
    const rawResult = response?.data?.result;
    if (Array.isArray(response?.data?.results)) return response.data.results;
    if (Array.isArray(rawResult?.items)) return rawResult.items;
    if (Array.isArray(rawResult)) return rawResult;
    return [];
};

const formatProduct = (p) => ({
    ...p,
    id: p._id,
    image: p.mainImage || p.image || FALLBACK_IMAGE,
    price: p.salePrice || p.price,
    originalPrice: p.price,
    weight: p.weight || '1 unit',
    deliveryTime: '8-15 mins',
});

// Lower score = better match: exact name, name starts with, a word starts with, contains, other fields
const relevanceScore = (product, query) => {
    const name = String(product.name || '').toLowerCase();
    const q = query.toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.split(/[\s\-_/(),]+/).some((word) => word.startsWith(q))) return 2;
    if (name.includes(q)) return 3;
    return 4;
};

const SearchPage = () => {
    const navigate = useNavigate();
    const location = useRouterLocation();
    const { isOpen: isProductDetailOpen } = useProductDetail();
    const { settings } = useSettings();
    const { currentLocation } = useAppLocation();

    const initialQuery = (
        location.state?.query || new URLSearchParams(location.search).get('q') || ''
    ).slice(0, MAX_QUERY_LENGTH);

    const [query, setQuery] = useState(initialQuery);
    const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
    const [results, setResults] = useState([]);
    const [totalFound, setTotalFound] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [retryTick, setRetryTick] = useState(0);

    const [lowestPriceProducts, setLowestPriceProducts] = useState([]);
    const [isLoadingLowest, setIsLoadingLowest] = useState(false);

    const [isListening, setIsListening] = useState(false);
    const [voiceMessage, setVoiceMessage] = useState('');
    const [pastSearches, setPastSearches] = useState(readRecentSearches);

    const inputRef = useRef(null);
    const recognitionRef = useRef(null);
    const searchRequestId = useRef(0);

    const hasValidLocation =
        Number.isFinite(currentLocation?.latitude) &&
        Number.isFinite(currentLocation?.longitude);

    const trimmedQuery = normalizeQuery(query);
    const trimmedDebounced = normalizeQuery(debouncedQuery);

    // Debounce typing
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [query]);

    // Keep ?q= in the address bar in sync (shareable / refresh-safe) without adding history entries
    useEffect(() => {
        try {
            const url = new URL(window.location.href);
            if (trimmedDebounced) url.searchParams.set('q', trimmedDebounced);
            else url.searchParams.delete('q');
            window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        } catch {
            /* non-critical */
        }
    }, [trimmedDebounced]);

    // Search on the server so every product is searchable, not just the first page
    useEffect(() => {
        if (!trimmedDebounced) {
            searchRequestId.current += 1; // drop any in-flight response
            setResults([]);
            setTotalFound(0);
            setSearchError('');
            setIsSearching(false);
            return;
        }
        if (!hasValidLocation) {
            setResults([]);
            setTotalFound(0);
            setIsSearching(false);
            return;
        }

        const requestId = ++searchRequestId.current;
        setIsSearching(true);
        setSearchError('');

        customerApi
            .getProducts({
                search: trimmedDebounced,
                limit: SEARCH_LIMIT,
                lat: currentLocation.latitude,
                lng: currentLocation.longitude,
            })
            .then((response) => {
                if (requestId !== searchRequestId.current) return; // stale response
                if (!response?.data?.success) throw new Error('Search failed');
                const items = extractProducts(response)
                    .map(formatProduct)
                    .map((p, index) => ({ p, index, score: relevanceScore(p, trimmedDebounced) }))
                    .sort((a, b) => a.score - b.score || a.index - b.index)
                    .map(({ p }) => p);
                setResults(items);
                setTotalFound(Number(response.data.result?.total) || items.length);
            })
            .catch((error) => {
                if (requestId !== searchRequestId.current) return;
                console.error('Search error:', error);
                setResults([]);
                setTotalFound(0);
                setSearchError(
                    error?.response?.data?.message ||
                        'Something went wrong while searching. Please try again.',
                );
            })
            .finally(() => {
                if (requestId === searchRequestId.current) setIsSearching(false);
            });
    }, [trimmedDebounced, hasValidLocation, currentLocation?.latitude, currentLocation?.longitude, retryTick]);

    // "Lowest price" suggestions (small request instead of downloading 100 products)
    useEffect(() => {
        if (!hasValidLocation) {
            setLowestPriceProducts([]);
            return;
        }
        let cancelled = false;
        setIsLoadingLowest(true);
        customerApi
            .getProducts({
                limit: 10,
                sort: 'price-asc',
                lat: currentLocation.latitude,
                lng: currentLocation.longitude,
            })
            .then((response) => {
                if (cancelled || !response?.data?.success) return;
                setLowestPriceProducts(extractProducts(response).map(formatProduct));
            })
            .catch((error) => console.error('Error fetching products:', error))
            .finally(() => {
                if (!cancelled) setIsLoadingLowest(false);
            });
        return () => {
            cancelled = true;
        };
    }, [hasValidLocation, currentLocation?.latitude, currentLocation?.longitude]);

    // Stop the microphone if the page is left while listening
    useEffect(() => () => recognitionRef.current?.abort?.(), []);

    const saveSearch = useCallback((term) => {
        const clean = normalizeQuery(term);
        if (!clean) return;
        setPastSearches((prev) => {
            const updated = [
                clean,
                ...prev.filter((s) => s.toLowerCase() !== clean.toLowerCase()),
            ].slice(0, MAX_RECENT);
            try {
                localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
            } catch {
                /* storage full / blocked */
            }
            return updated;
        });
    }, []);

    const handleRemoveSearch = (e, term) => {
        e.stopPropagation();
        setPastSearches((prev) => {
            const updated = prev.filter((s) => s !== term);
            try {
                localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
            } catch {
                /* ignore */
            }
            return updated;
        });
    };

    // Search immediately (skip the debounce) for deliberate actions
    const runSearchNow = (term) => {
        const next = String(term || '').slice(0, MAX_QUERY_LENGTH);
        setQuery(next);
        setDebouncedQuery(next);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!trimmedQuery) return;
        runSearchNow(query);
        saveSearch(trimmedQuery);
        inputRef.current?.blur(); // hides the mobile keyboard
    };

    const handleClear = () => {
        runSearchNow('');
        inputRef.current?.focus();
    };

    const handleVoiceSearch = () => {
        if (isListening) {
            recognitionRef.current?.stop?.();
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setVoiceMessage('Voice search is not supported in this browser. Please try Chrome.');
            return;
        }
        setVoiceMessage('');

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'en-IN';
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
            setIsListening(true);
            setQuery('');
        };
        recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
        };
        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcript += event.results[i][0].transcript;
            }
            transcript = transcript.slice(0, MAX_QUERY_LENGTH);
            if (!transcript) return;
            setQuery(transcript);
            if (event.results[event.results.length - 1].isFinal) {
                setDebouncedQuery(transcript);
                saveSearch(transcript);
            }
        };
        recognition.onerror = (event) => {
            setIsListening(false);
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                setVoiceMessage('Microphone access is blocked. Enable it in your browser settings.');
            } else if (event.error === 'no-speech') {
                setVoiceMessage("We didn't hear anything. Tap the mic and try again.");
            } else if (event.error !== 'aborted') {
                setVoiceMessage('Voice search stopped. Please try again.');
            }
        };

        try {
            recognition.start();
        } catch (e) {
            console.error('Recognition start error:', e);
            setIsListening(false);
        }
    };

    // Typing has changed but results for it have not arrived yet
    const isPending = !!trimmedQuery && (trimmedQuery !== trimmedDebounced || isSearching);
    const showResultsSection = !!trimmedQuery;
    const primaryColor = settings?.primaryColor || 'var(--primary)';

    const lowestPriceList = useMemo(() => lowestPriceProducts, [lowestPriceProducts]);

    return (
        <div className="min-h-screen bg-white font-outfit">
            {/* Header / Search Input */}
            <div className={cn(
                "sticky top-0 z-50 bg-linear-to-r from-primary to-[var(--brand-400)] shadow-[0_4px_20px_rgba(0,0,0,0.12)] relative overflow-hidden",
                isProductDetailOpen && "hidden md:block"
            )}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12 blur-xl pointer-events-none" />

                <div className="px-4 pt-5 pb-6 flex items-center md:justify-center gap-3 relative z-10">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        aria-label="Go back"
                        className="flex items-center justify-center w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full text-white backdrop-blur-md border border-white/10 transition-all flex-shrink-0 shadow-sm active:scale-90"
                    >
                        <ArrowLeft size={22} strokeWidth={2.5} />
                    </button>

                    <form
                        role="search"
                        onSubmit={handleSubmit}
                        className="flex-1 relative md:flex-none md:w-[500px] lg:w-[600px]"
                    >
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                            <Search size={18} strokeWidth={3} className="text-slate-400" />
                        </div>
                        <input
                            ref={inputRef}
                            autoFocus
                            type="search"
                            inputMode="search"
                            enterKeyHint="search"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            maxLength={MAX_QUERY_LENGTH}
                            aria-label="Search products"
                            placeholder={isListening ? 'Listening...' : 'Search items, categories...'}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full h-12 bg-white rounded-2xl pl-11 pr-24 shadow-xl shadow-black/10 border-none outline-none text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-medium focus:ring-4 focus:ring-white/20 transition-all [&::-webkit-search-cancel-button]:hidden"
                        />

                        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1">
                            {query && (
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    aria-label="Clear search"
                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
                                >
                                    <X size={12} strokeWidth={3} className="text-slate-600" />
                                </button>
                            )}
                            <div className="w-[1px] h-6 bg-slate-100 mx-1" />
                            <button
                                type="button"
                                onClick={handleVoiceSearch}
                                aria-label={isListening ? 'Stop voice search' : 'Start voice search'}
                                className={cn(
                                    "p-2 transition-all rounded-full relative",
                                    isListening ? "text-red-500 bg-red-50 scale-110" : "text-slate-400 hover:text-primary hover:bg-slate-50"
                                )}
                            >
                                <Mic size={20} strokeWidth={2.5} className={cn(isListening && "animate-pulse")} />
                                {isListening && (
                                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="p-5 space-y-10 pb-24">
                {voiceMessage && (
                    <div
                        role="status"
                        className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm font-semibold text-amber-800"
                    >
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span className="flex-1">{voiceMessage}</span>
                        <button type="button" onClick={() => setVoiceMessage('')} aria-label="Dismiss">
                            <X size={14} />
                        </button>
                    </div>
                )}

                {showResultsSection ? (
                    <section aria-live="polite">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-slate-800 tracking-tight">Search Results</h2>
                            {!isPending && !searchError && hasValidLocation && (
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                    {totalFound > results.length
                                        ? `Top ${results.length} of ${totalFound}`
                                        : `${results.length} found`}
                                </span>
                            )}
                        </div>

                        {!hasValidLocation ? (
                            <div className="py-16 flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                    <MapPin size={28} className="text-slate-400" />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight mb-2">Select your location</h3>
                                <p className="text-slate-500 font-medium max-w-xs">
                                    We show items available near you. Choose a delivery location to start searching.
                                </p>
                            </div>
                        ) : isPending ? (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-x-2 md:gap-x-4 gap-y-4 md:gap-y-6">
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="h-52 md:h-64 bg-slate-50 rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        ) : searchError ? (
                            <div className="py-16 flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                                    <AlertCircle size={28} className="text-red-400" />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight mb-2">Couldn't search</h3>
                                <p className="text-slate-500 font-medium max-w-xs mb-5">{searchError}</p>
                                <button
                                    type="button"
                                    onClick={() => setRetryTick((n) => n + 1)}
                                    className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-black active:scale-95 transition-transform"
                                >
                                    Try again
                                </button>
                            </div>
                        ) : results.length > 0 ? (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-x-2 md:gap-x-4 gap-y-4 md:gap-y-6">
                                {results.map((product) => (
                                    <div key={product.id} onClick={() => saveSearch(trimmedQuery)} className="flex justify-center">
                                        <ProductCard product={product} compact={true} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-16 flex flex-col items-center text-center">
                                <div className="w-48 h-48 md:w-64 md:h-64 mb-6 flex items-center justify-center">
                                    <video
                                        src="/coming-soon-banner-animation-gif-download-6584143.mp4"
                                        autoPlay
                                        loop
                                        muted
                                        playsInline
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight mb-2">No items found</h3>
                                <p className="text-slate-500 font-medium max-w-xs break-words">
                                    We couldn't find anything for "{trimmedQuery}". Check the spelling or try fewer or different keywords.
                                </p>
                            </div>
                        )}
                    </section>
                ) : (
                    <>
                        {pastSearches.length > 0 && (
                            <section>
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Recently Searched</h3>
                                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                                    {pastSearches.map((term) => (
                                        <div
                                            key={term}
                                            role="button"
                                            tabIndex={0}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 shadow-sm rounded-full whitespace-nowrap active:scale-95 transition-transform cursor-pointer"
                                            onClick={() => runSearchNow(term)}
                                            onKeyDown={(e) => e.key === 'Enter' && runSearchNow(term)}
                                        >
                                            <div className="h-5 w-5 rounded flex items-center justify-center" style={{ backgroundColor: primaryColor + '20' }}>
                                                <History size={12} style={{ color: primaryColor }} />
                                            </div>
                                            <span className="text-sm font-bold text-slate-700">{term}</span>
                                            <button
                                                type="button"
                                                onClick={(e) => handleRemoveSearch(e, term)}
                                                aria-label={`Remove ${term}`}
                                                className="ml-1 p-0.5 hover:bg-slate-100 rounded-full transition-colors"
                                            >
                                                <X size={12} className="text-slate-400 hover:text-red-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {(isLoadingLowest || lowestPriceList.length > 0) && (
                            <section>
                                <div className="flex justify-between items-center mb-5">
                                    <h2 className="text-xl font-black text-slate-800 tracking-tight">Lowest Price Ever!</h2>
                                    <button
                                        type="button"
                                        className="flex items-center gap-1 md:gap-1.5 px-3 py-1 md:px-4 md:py-1.5 bg-slate-50 hover:bg-slate-100 rounded-full text-xs md:text-sm font-black transition-all"
                                        style={{ color: primaryColor }}
                                        onClick={() => navigate('/category/all')}
                                    >
                                        See All <ChevronRight size={14} strokeWidth={3} />
                                    </button>
                                </div>
                                <div className="flex gap-2 md:gap-4 overflow-x-auto no-scrollbar -mx-5 px-5 pb-3 snap-x">
                                    {isLoadingLowest && lowestPriceList.length === 0 ? (
                                        [...Array(4)].map((_, i) => (
                                            <div key={i} className="min-w-[126px] sm:min-w-[136px] md:min-w-[148px] h-52 md:h-64 bg-slate-50 rounded-2xl animate-pulse" />
                                        ))
                                    ) : lowestPriceList.map((product) => (
                                        <div key={product.id} className="min-w-[126px] sm:min-w-[136px] md:min-w-[148px] snap-start">
                                            <ProductCard product={product} compact={true} />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default SearchPage;
