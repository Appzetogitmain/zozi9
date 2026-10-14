import React, { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineXMark } from "react-icons/hi2";

/**
 * Small searchable multi/single picker for categories, sellers and products.
 *
 * options: [{ value, label }]       - local list (categories, sellers)
 * onSearch(term) => Promise<options> - optional server search (products)
 * value: array of ids (multi) or id string (single)
 * knownLabels: { [id]: label }      - labels for ids that are selected but not in the current results
 */
const EntityPicker = ({
  label,
  options = [],
  onSearch,
  value,
  onChange,
  multiple = true,
  placeholder = "Search...",
  knownLabels = {},
}) => {
  const [term, setTerm] = useState("");
  const [remote, setRemote] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const cache = useRef({ ...knownLabels });

  const selected = multiple ? value || [] : value ? [value] : [];

  useEffect(() => {
    if (!onSearch || !term.trim()) {
      setRemote([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await onSearch(term.trim());
        if (!cancelled) setRemote(rows);
      } catch {
        if (!cancelled) setRemote([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, onSearch]);

  const pool = onSearch ? remote : options;
  pool.forEach((o) => {
    cache.current[o.value] = o.label;
  });

  const visible = useMemo(() => {
    const t = term.trim().toLowerCase();
    const rows = onSearch ? pool : pool.filter((o) => !t || o.label.toLowerCase().includes(t));
    return rows.filter((o) => !selected.includes(o.value)).slice(0, 30);
  }, [pool, term, selected, onSearch]);

  const add = (id) => {
    onChange(multiple ? [...selected, id] : id);
    setTerm("");
    if (!multiple) setFocused(false);
  };
  const remove = (id) => onChange(multiple ? selected.filter((v) => v !== id) : "");

  return (
    <div className="space-y-1.5">
      {label && <label className="ds-label">{label}</label>}
      <div className="flex flex-wrap gap-1.5">
        {selected.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-bold text-primary"
          >
            {cache.current[id] || knownLabels[id] || `${String(id).slice(-6)}`}
            <button type="button" onClick={() => remove(id)} aria-label="Remove" className="hover:text-red-500">
              <HiOutlineXMark className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      {(multiple || selected.length === 0) && (
        <div className="relative">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={placeholder}
            className="ds-input w-full"
            autoComplete="off"
          />
          {focused && (term || !onSearch) && (
            <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200">
              {loading && <li className="px-3 py-2 text-xs font-semibold text-slate-400">Searching...</li>}
              {!loading && visible.length === 0 && (
                <li className="px-3 py-2 text-xs font-semibold text-slate-400">
                  {onSearch && !term ? "Type to search" : "No matches"}
                </li>
              )}
              {visible.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(o.value)}
                    className="w-full px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-brand-50"
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default EntityPicker;
