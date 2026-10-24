import React, { useState, useEffect, useRef } from 'react';
import type { WagoSearchResult, Addon } from '../types';
import { invoke } from '@tauri-apps/api/core';
import {
  Search,
  Download,
  Loader2,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { GithubIcon } from './GithubIcon';

interface Props {
  installedAddons: Addon[];
  onSelectAddon: (slug: string) => void;
  onQuickInstall: (slug: string) => void;
  onAddGithub: (repo: string) => void;
  installingId: string | null;
}

const CATEGORIES = [
  { id: 'all', label: 'All Categories' },
  { id: '19', label: 'Combat' },
  { id: '16', label: 'Unit Frames' },
  { id: '14', label: 'Boss Encounters' },
  { id: '9', label: 'Bags & Inventory' },
  { id: '18', label: 'Action Bars' },
  { id: '4', label: 'PvP' },
  { id: '1', label: 'Chat & Communication' },
];

export const BrowseView: React.FC<Props> = ({
  installedAddons,
  onSelectAddon,
  onQuickInstall,
  onAddGithub,
  installingId,
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<WagoSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // GitHub Accordion state
  const [showGithubBox, setShowGithubBox] = useState(false);
  const [githubInput, setGithubInput] = useState('');
  const [githubLoading, setGithubLoading] = useState(false);

  const loaderRef = useRef<HTMLDivElement>(null);

  // Fetch when search or category changes
  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(true);
    fetchCatalog(1, true);
  }, [search, category]);

  // Autocomplete debounce
  useEffect(() => {
    if (!search.trim() || search.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await invoke<WagoSearchResult[]>('browse_addons', {
          page: 1,
          query: search.trim(),
          category: null,
        });
        const titles = results.slice(0, 5).map((r) => r.name);
        setSuggestions(titles);
        setShowSuggestions(titles.length > 0);
      } catch (e) {
        console.error(e);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && hasMore) {
          loadNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [loading, hasMore, page]);

  const fetchCatalog = async (targetPage: number, reset: boolean = false) => {
    setLoading(true);
    try {
      const results = await invoke<WagoSearchResult[]>('browse_addons', {
        page: targetPage,
        query: search.trim() ? search.trim() : null,
        category: category === 'all' ? null : category,
      });

      if (results.length === 0) {
        setHasMore(false);
      } else {
        setItems((prev) => (reset ? results : [...prev, ...results]));
      }
    } catch (err) {
      console.error('Failed to browse addons:', err);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const loadNextPage = () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchCatalog(nextPage, false);
  };

  const handleGithubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubInput.trim()) return;
    setGithubLoading(true);
    try {
      await onAddGithub(githubInput.trim());
      setGithubInput('');
      setShowGithubBox(false);
    } finally {
      setGithubLoading(false);
    }
  };

  // Smart matching: matches slug, normalized name, or folders
  const isAddonInstalled = (slug: string, name: string) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanSlug = norm(slug);
    const cleanName = norm(name);

    return installedAddons.some((a) => {
      if (a.wago_slug && norm(a.wago_slug) === cleanSlug) return true;
      if (norm(a.name) === cleanName) return true;

      const cleanInstalled = norm(a.name);
      if (cleanInstalled.length >= 4 && (cleanSlug.includes(cleanInstalled) || cleanName.includes(cleanInstalled))) {
        return true;
      }

      // Check folders
      if (a.folders && a.folders.some((f) => {
        const cleanF = norm(f);
        return cleanF === cleanSlug || cleanSlug.startsWith(cleanF) || cleanName.startsWith(cleanF);
      })) {
        return true;
      }

      return false;
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card & Search Controls */}
      <div className="bg-[#161922] p-5 rounded-2xl border border-[#262c3d] space-y-4">
        {/* Search Input with Autocomplete */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search size={16} className="absolute left-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Search thousands of WoW Addons on Wago (e.g. details, weakauras, plater)..."
              className="w-full bg-[#0d0f15] border border-[#262c3d] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Autocomplete Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1e29] border border-[#262c3d] rounded-xl shadow-2xl z-30 overflow-hidden">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSearch(s);
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-slate-200 hover:bg-[#222736] hover:text-amber-400 flex items-center gap-2 border-b border-[#262c3d]/50 last:border-0"
                >
                  <Search size={12} className="text-slate-500" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Categories Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                category === cat.id
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-[#0d0f15] text-slate-400 hover:text-white border border-[#262c3d]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* GitHub Accordion Trigger */}
        <div className="pt-2 border-t border-[#262c3d]/60">
          <button
            onClick={() => setShowGithubBox(!showGithubBox)}
            className="flex items-center justify-between w-full text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors py-1"
          >
            <div className="flex items-center gap-2">
              <GithubIcon size={16} />
              <span>Import Your Custom Addon or Open-Source project from GitHub</span>
            </div>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${showGithubBox ? 'rotate-180' : ''}`}
            />
          </button>

          {showGithubBox && (
            <form onSubmit={handleGithubSubmit} className="mt-3 flex gap-2">
              <input
                type="text"
                value={githubInput}
                onChange={(e) => setGithubInput(e.target.value)}
                placeholder="Enter GitHub repo: username/my-wow-addon or full URL..."
                className="flex-1 bg-[#0d0f15] border border-[#262c3d] rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                disabled={githubLoading || !githubInput.trim()}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shrink-0"
              >
                {githubLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Import & Track
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Catalog Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {items.map((addon) => {
          const installed = isAddonInstalled(addon.slug, addon.name);
          const isBusy = installingId === `wago:${addon.slug}`;

          return (
            <div
              key={addon.slug}
              onClick={() => onSelectAddon(addon.slug)}
              className="p-4 rounded-2xl bg-[#161922] border border-[#262c3d] hover:border-amber-500/40 hover:bg-[#1a1e29] transition-all cursor-pointer flex flex-col justify-between space-y-3 group"
            >
              <div className="flex items-start gap-3.5">
                {addon.image_url ? (
                  <img
                    src={addon.image_url}
                    alt={addon.name}
                    className="w-12 h-12 rounded-xl object-cover bg-[#0d0f15] border border-[#262c3d] shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-lg shrink-0">
                    <Layers size={20} />
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors truncate">
                      {addon.name}
                    </h3>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2">
                    {addon.summary || 'No summary available.'}
                  </p>

                  <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                    <span>by {addon.author}</span>
                    {addon.downloads && (
                      <>
                        <span>•</span>
                        <span className="text-cyan-400 font-medium">📥 {addon.downloads}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Install button in card footer */}
              <div
                className="pt-2 border-t border-[#262c3d]/60 flex items-center justify-between"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-[10px] text-slate-500 group-hover:text-amber-400/80 transition-colors flex items-center gap-1">
                  <Sparkles size={11} /> Click to view versions & screenshots
                </span>

                <button
                  onClick={() => onQuickInstall(addon.slug)}
                  disabled={isBusy}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    installed
                      ? 'bg-[#202534] text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                  }`}
                >
                  {isBusy ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Installing...
                    </>
                  ) : installed ? (
                    <>
                      <CheckCircle2 size={13} />
                      Installed
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      Install
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Infinite Scroll Loader & End Status */}
      <div ref={loaderRef} className="py-8 text-center text-xs text-slate-500">
        {loading && (
          <div className="flex items-center justify-center gap-2 text-amber-400 font-semibold">
            <Loader2 size={16} className="animate-spin" />
            Loading more addons...
          </div>
        )}
        {!hasMore && items.length > 0 && <span>You have reached the end of the catalog.</span>}
      </div>
    </div>
  );
};
