import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const TAP_MOVE_PX = 8;
const SWIPE_PX = 60;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Full-screen image viewer with pinch-zoom, double-tap zoom, mouse-wheel zoom and
 * drag-to-pan. When not zoomed, swiping left/right moves between images.
 */
const ImageZoomViewer = ({ images = [], startIndex = 0, open, onClose, alt = '' }) => {
    const [index, setIndex] = useState(startIndex);
    const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
    const [animate, setAnimate] = useState(true);
    const [showHint, setShowHint] = useState(true);

    const stageRef = useRef(null);
    const imgRef = useRef(null);
    const viewRef = useRef(view);
    const pointers = useRef(new Map());
    const gesture = useRef(null);
    const lastTap = useRef({ time: 0, x: 0, y: 0 });

    viewRef.current = view;
    const count = images.length;

    useLayoutEffect(() => {
        if (open) setIndex(clamp(startIndex, 0, Math.max(0, count - 1)));
    }, [open, startIndex, count]);

    // Every image starts un-zoomed
    useEffect(() => {
        setAnimate(true);
        setView({ scale: 1, x: 0, y: 0 });
    }, [index, open]);

    useEffect(() => {
        if (!open) return undefined;
        setShowHint(true);
        const timer = setTimeout(() => setShowHint(false), 2500);
        return () => clearTimeout(timer);
    }, [open]);

    /* ---- geometry: keep the zoomed image covering the screen, never dragged off it ---- */
    const bounds = useCallback((scale) => {
        const stage = stageRef.current;
        const img = imgRef.current;
        if (!stage || !img) return { maxX: 0, maxY: 0 };
        const cw = stage.clientWidth;
        const ch = stage.clientHeight;
        const nw = img.naturalWidth || cw;
        const nh = img.naturalHeight || ch;
        const fit = Math.min(cw / nw, ch / nh);
        return {
            maxX: Math.max(0, (nw * fit * scale - cw) / 2),
            maxY: Math.max(0, (nh * fit * scale - ch) / 2),
        };
    }, []);

    const clampView = useCallback((next) => {
        const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
        const { maxX, maxY } = bounds(scale);
        return { scale, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
    }, [bounds]);

    // Point relative to the stage centre (the transform origin)
    const toStagePoint = useCallback((clientX, clientY) => {
        const rect = stageRef.current.getBoundingClientRect();
        return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
    }, []);

    // Zoom so the point under the finger / cursor stays in place
    const zoomAt = useCallback((targetScale, point, base = viewRef.current) => {
        const scale = clamp(targetScale, MIN_SCALE, MAX_SCALE);
        const ratio = scale / base.scale;
        return clampView({
            scale,
            x: point.x - (point.x - base.x) * ratio,
            y: point.y - (point.y - base.y) * ratio,
        });
    }, [clampView]);

    const zoomBy = (factor) => {
        setAnimate(true);
        setView((v) => zoomAt(v.scale * factor, { x: 0, y: 0 }, v));
    };

    const go = useCallback((step) => {
        if (count < 2) return;
        setIndex((i) => (i + step + count) % count);
    }, [count]);

    /* ---- keyboard, scroll lock ---- */
    useEffect(() => {
        if (!open) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight') go(1);
            else if (e.key === 'ArrowLeft') go(-1);
            else if (e.key === '+' || e.key === '=') zoomBy(1.5);
            else if (e.key === '-') zoomBy(1 / 1.5);
        };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKey);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, onClose, go]);

    /* ---- mouse wheel / trackpad (non-passive so the page does not scroll) ---- */
    useEffect(() => {
        const stage = stageRef.current;
        if (!open || !stage) return undefined;
        const onWheel = (e) => {
            e.preventDefault();
            setAnimate(false);
            const factor = Math.exp(-e.deltaY * 0.0025);
            setView((v) => zoomAt(v.scale * factor, toStagePoint(e.clientX, e.clientY), v));
        };
        stage.addEventListener('wheel', onWheel, { passive: false });
        return () => stage.removeEventListener('wheel', onWheel);
    }, [open, index, zoomAt, toStagePoint]);

    /* ---- pointer gestures: pinch, pan, swipe, double-tap ---- */
    const startGesture = () => {
        const pts = [...pointers.current.values()];
        const v = viewRef.current;
        if (pts.length >= 2) {
            const [a, b] = pts;
            gesture.current = {
                type: 'pinch',
                dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
                mid: toStagePoint((a.x + b.x) / 2, (a.y + b.y) / 2),
                view: v,
            };
        } else if (pts.length === 1) {
            gesture.current = {
                type: v.scale > 1.01 ? 'pan' : 'swipe',
                start: pts[0],
                time: Date.now(),
                view: v,
                moved: false,
                multi: gesture.current?.multi || false,
            };
        }
    };

    const onPointerDown = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const wasMulti = pointers.current.size > 0;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        setAnimate(false);
        startGesture();
        if (wasMulti && gesture.current) gesture.current.multi = true;
    };

    const onPointerMove = (e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g = gesture.current;
        if (!g) return;

        if (g.type === 'pinch') {
            const [a, b] = [...pointers.current.values()];
            if (!b) return;
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            const mid = toStagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
            const scale = clamp(g.view.scale * (dist / g.dist), MIN_SCALE, MAX_SCALE);
            const ratio = scale / g.view.scale;
            setView(clampView({
                scale,
                x: mid.x - (g.mid.x - g.view.x) * ratio,
                y: mid.y - (g.mid.y - g.view.y) * ratio,
            }));
            return;
        }

        const dx = e.clientX - g.start.x;
        const dy = e.clientY - g.start.y;
        if (Math.hypot(dx, dy) > TAP_MOVE_PX) g.moved = true;
        if (g.type === 'pan') {
            setView(clampView({ scale: g.view.scale, x: g.view.x + dx, y: g.view.y + dy }));
        }
    };

    const onPointerUp = (e) => {
        if (!pointers.current.has(e.pointerId)) return;
        const g = gesture.current;
        pointers.current.delete(e.pointerId);

        if (pointers.current.size > 0) {
            // One finger lifted during a pinch: continue as a pan with the remaining finger
            startGesture();
            if (gesture.current) gesture.current.multi = true;
            return;
        }
        gesture.current = null;
        setAnimate(true);
        if (!g) return;

        if (g.type === 'swipe' && !g.multi) {
            const dx = e.clientX - g.start.x;
            const dy = e.clientY - g.start.y;
            if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
                go(dx < 0 ? 1 : -1);
                return;
            }
        }

        if (!g.moved && !g.multi && Date.now() - g.time < 300) {
            const toggleZoom = () => setView((v) => (v.scale > 1.01
                ? { scale: 1, x: 0, y: 0 }
                : zoomAt(DOUBLE_TAP_SCALE, toStagePoint(e.clientX, e.clientY), v)));

            // Mouse: one click toggles. Touch: double-tap, so a single tap never zooms by accident
            if (e.pointerType === 'mouse') {
                toggleZoom();
                return;
            }
            const now = Date.now();
            const near = Math.hypot(e.clientX - lastTap.current.x, e.clientY - lastTap.current.y) < 40;
            if (now - lastTap.current.time < DOUBLE_TAP_MS && near) {
                lastTap.current = { time: 0, x: 0, y: 0 };
                toggleZoom();
                return;
            }
            lastTap.current = { time: now, x: e.clientX, y: e.clientY };
        }

        if (viewRef.current.scale < 1.02) setView({ scale: 1, x: 0, y: 0 });
    };

    if (!open || count === 0) return null;

    const zoomed = view.scale > 1.01;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={alt ? `${alt} image viewer` : 'Image viewer'}
            className="fixed inset-0 z-[10000] flex flex-col bg-black/95 text-white select-none"
        >
            {/* top bar */}
            <div className="relative z-10 flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+12px)]">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold tabular-nums">
                    {count > 1 ? `${index + 1} / ${count}` : ''}
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 active:scale-90"
                >
                    <X size={22} />
                </button>
            </div>

            {/* image stage */}
            <div
                ref={stageRef}
                className={cn(
                    'relative min-h-0 flex-1 overflow-hidden touch-none',
                    zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
                )}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                <img
                    ref={imgRef}
                    key={images[index]}
                    src={applyCloudinaryTransform(images[index], 'f_auto,q_auto:best,w_2000,dpr_auto')}
                    alt={alt ? `${alt} ${index + 1}` : ''}
                    draggable={false}
                    className="pointer-events-none h-full w-full object-contain"
                    style={{
                        transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                        transition: animate ? 'transform 220ms ease-out' : 'none',
                        willChange: 'transform',
                    }}
                />

                {count > 1 && !zoomed && (
                    <>
                        <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => go(-1)}
                            aria-label="Previous image"
                            className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 sm:flex"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => go(1)}
                            aria-label="Next image"
                            className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 sm:flex"
                        >
                            <ChevronRight size={24} />
                        </button>
                    </>
                )}

                <p
                    className={cn(
                        'pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/15 px-4 py-2 text-xs font-semibold backdrop-blur transition-opacity duration-500',
                        showHint && !zoomed ? 'opacity-100' : 'opacity-0'
                    )}
                >
                    Pinch or double-tap to zoom
                </p>
            </div>

            {/* bottom controls */}
            <div className="relative z-10 flex flex-col items-center gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
                <div className="flex items-center gap-2 rounded-full bg-white/10 p-1">
                    <button
                        type="button"
                        onClick={() => zoomBy(1 / 1.5)}
                        disabled={!zoomed}
                        aria-label="Zoom out"
                        className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/15 disabled:opacity-40"
                    >
                        <ZoomOut size={20} />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setAnimate(true);
                            setView({ scale: 1, x: 0, y: 0 });
                        }}
                        className="min-w-[56px] rounded-full px-2 text-xs font-bold tabular-nums"
                        aria-label="Reset zoom"
                    >
                        {Math.round(view.scale * 100)}%
                    </button>
                    <button
                        type="button"
                        onClick={() => zoomBy(1.5)}
                        disabled={view.scale >= MAX_SCALE - 0.01}
                        aria-label="Zoom in"
                        className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/15 disabled:opacity-40"
                    >
                        <ZoomIn size={20} />
                    </button>
                </div>

                {count > 1 && (
                    <div className="flex max-w-full gap-2 overflow-x-auto no-scrollbar">
                        {images.map((src, i) => (
                            <button
                                key={`${src}-${i}`}
                                type="button"
                                onClick={() => setIndex(i)}
                                aria-label={`Show image ${i + 1}`}
                                className={cn(
                                    'h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition',
                                    i === index ? 'border-white' : 'border-transparent opacity-50 hover:opacity-90'
                                )}
                            >
                                <img
                                    src={applyCloudinaryTransform(src, 'f_auto,q_auto:best,w_120,dpr_auto')}
                                    alt=""
                                    loading="lazy"
                                    className="h-full w-full object-contain p-0.5"
                                />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default ImageZoomViewer;
