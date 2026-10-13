import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { HiChevronDown, HiMagnifyingGlass, HiCheck, HiXMark } from "react-icons/hi2";
import { cn } from "@/lib/utils";

/**
 * A select with a built-in search box.
 *
 * options: [{ value, label }]
 * Keyboard: Enter/Space/ArrowDown open, type to filter, Up/Down move, Enter pick, Esc close.
 * The list is rendered in a portal so it is never clipped by a scrolling modal.
 */
const SearchableSelect = ({
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No matches found",
  disabled = false,
  clearable = false,
  className,
  triggerClassName,
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState(null);

  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const popoverRef = useRef(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    return options.filter((o) => {
      const label = String(o.label || "").toLowerCase();
      return words.every((w) => label.includes(w));
    });
  }, [options, search]);

  const measure = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 280 && r.top > spaceBelow;
    setRect({
      left: r.left,
      width: r.width,
      top: openUp ? undefined : r.bottom + 6,
      bottom: openUp ? window.innerHeight - r.top + 6 : undefined,
    });
  }, []);

  const openList = () => {
    if (disabled) return;
    measure();
    setSearch("");
    const idx = options.findIndex((o) => String(o.value) === String(value));
    setActiveIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  const closeList = useCallback((refocus = true) => {
    setOpen(false);
    setSearch("");
    if (refocus) triggerRef.current?.focus();
  }, []);

  const pick = (option) => {
    onChange?.(option.value);
    closeList();
  };

  // focus the search box when opening
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  // close on outside click / reposition on resize / close on outer scroll
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (
        popoverRef.current?.contains(e.target) ||
        triggerRef.current?.contains(e.target)
      )
        return;
      closeList(false);
    };
    const onScroll = (e) => {
      if (popoverRef.current?.contains(e.target)) return;
      measure();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, measure, closeList]);

  // keep the active row visible and the index valid while filtering
  useEffect(() => {
    if (activeIndex > filtered.length - 1) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, activeIndex]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const onTriggerKeyDown = (e) => {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      openList();
    }
  };

  const onSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIndex]) pick(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // do not close a parent modal
      closeList();
    } else if (e.key === "Tab") {
      closeList(false);
    }
  };

  const hasValue = selected !== null;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-bold outline-none cursor-pointer flex items-center justify-between gap-2 text-left focus:ring-2 focus:ring-primary/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", !hasValue && "text-slate-500 font-semibold")}>
          {hasValue ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && hasValue && !disabled && (
            <span
              role="button"
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                onChange?.("");
              }}
              className="p-0.5 rounded-full text-slate-400 hover:text-rose-700 hover:bg-white"
            >
              <HiXMark className="h-4 w-4" />
            </span>
          )}
          <HiChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              left: rect.left,
              width: rect.width,
              top: rect.top,
              bottom: rect.bottom,
              zIndex: 10000,
            }}
            className="rounded-xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
              <HiMagnifyingGlass className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400 placeholder:font-medium"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    searchRef.current?.focus();
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <HiXMark className="h-4 w-4" />
                </button>
              )}
            </div>
            <ul ref={listRef} role="listbox" className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-xs font-semibold text-slate-500">{emptyText}</li>
              ) : (
                filtered.map((option, index) => {
                  const isSelected = String(option.value) === String(value);
                  return (
                    <li
                      key={option.value}
                      data-index={index}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(option)}
                      className={cn(
                        "flex items-center justify-between gap-2 px-4 py-2 text-sm font-semibold cursor-pointer",
                        index === activeIndex ? "bg-primary/10 text-primary" : "text-slate-700",
                        isSelected && "font-bold",
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected && <HiCheck className="h-4 w-4 shrink-0" />}
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default SearchableSelect;
