import React, { useState, useMemo } from 'react';
import type { Addon } from '../types';
import {
  Search,
  CheckCircle2,
  ArrowUpCircle,
  Download,
  Loader2,
  Folder,
  Sparkles,
  LayoutList,
  List,
  LayoutGrid,
  Layers,
  MoreVertical,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { GithubIcon } from './GithubIcon';
import { AddonContextMenu } from './AddonContextMenu';

type ViewMode = 'table' | 'list' | 'tiles' | 'grouped';
type SortField = 'name' | 'latest_version' | 'author' | 'status';
type SortOrder = 'asc' | 'desc';

interface Props {
  addons: Addon[];
  installingId: string | null;
  onInstallOrUpdate: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenAddModal: () => void;
  onSelectAddon?: (slug: string) => void;
  onUpdateAddon?: (updated: Addon) => void;
  showToast?: (msg: string) => void;
}

export const AddonList: React.FC<Props> = ({
  addons,
  installingId,
  onInstallOrUpdate,
  onDelete,
  onOpenAddModal,
  onSelectAddon,
  onUpdateAddon,
  showToast = () => {},
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'updates' | 'github' | 'wago' | 'ignored'>('all');

  // View Mode with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('addon_vault_view_mode') as ViewMode) || 'table';
  });

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('addon_vault_view_mode', mode);
  };

  // Sorting for Table view
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Multi-selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    addon: Addon;
  } | null>(null);

  // Collapsed groups in grouped view
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const isAddonUpdatable = (addon: Addon) => {
    if (addon.ignored) return false;
    if (!addon.latest_version || addon.latest_version === '-' || addon.latest_version === 'none') return false;
    return Boolean(addon.has_update);
  };

  // Filter & Search
  const filtered = useMemo(() => {
    return addons.filter((addon) => {
      const matchSearch =
        addon.name.toLowerCase().includes(search.toLowerCase()) ||
        addon.author.toLowerCase().includes(search.toLowerCase()) ||
        (addon.summary && addon.summary.toLowerCase().includes(search.toLowerCase()));

      if (!matchSearch) return false;

      if (filter === 'updates') return isAddonUpdatable(addon);
      if (filter === 'github') return addon.source === 'github';
      if (filter === 'wago') return addon.source === 'wago';
      if (filter === 'ignored') return Boolean(addon.ignored);

      return true;
    });
  }, [addons, search, filter]);

  // Sort filtered list
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'author') {
        comparison = a.author.localeCompare(b.author);
      } else if (sortField === 'latest_version') {
        comparison = (a.latest_version || '').localeCompare(b.latest_version || '');
      } else if (sortField === 'status') {
        const aScore = isAddonUpdatable(a) ? 2 : a.installed_version ? 1 : 0;
        const bScore = isAddonUpdatable(b) ? 2 : b.installed_version ? 1 : 0;
        comparison = aScore - bScore;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filtered, sortField, sortOrder]);

  const updateCount = addons.filter(isAddonUpdatable).length;
  const githubCount = addons.filter((a) => a.source === 'github').length;
  const wagoCount = addons.filter((a) => a.source === 'wago').length;
  const ignoredCount = addons.filter((a) => a.ignored).length;

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((a) => a.id)));
    }
  };

  const handleToggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, addon: Addon) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      addon,
    });
  };

  // Helper for rendering Addon Icon / Avatar
  const renderAvatar = (addon: Addon, sizeClass = 'w-9 h-9 text-xs') => {
    if (addon.image_url) {
      return (
        <img
          src={addon.image_url}
          alt={addon.name}
          className={`${sizeClass} rounded-xl object-cover bg-[#0d0f15] border border-[#262c3d] shrink-0 shadow-md`}
        />
      );
    }
    return (
      <div
        className={`${sizeClass} rounded-xl flex items-center justify-center shrink-0 border font-black shadow-md ${
          addon.source === 'github'
            ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
            : 'bg-gradient-to-br from-amber-500/10 to-purple-600/10 border-[#262c3d] text-amber-400'
        }`}
      >
        {addon.source === 'github' ? (
          <GithubIcon size={16} />
        ) : (
          addon.name.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() || 'W'
        )}
      </div>
    );
  };

  // Helper for rendering Action Button
  const renderActionButton = (addon: Addon, compact = false) => {
    const isBusy = installingId === addon.id;
    const hasUpdate = isAddonUpdatable(addon);

    if (hasUpdate) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInstallOrUpdate(addon.id);
          }}
          disabled={isBusy}
          className={`bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 disabled:opacity-50 ${
            compact ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-xs'
          }`}
        >
          {isBusy ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Updating...</span>
            </>
          ) : addon.installed_version ? (
            <>
              <ArrowUpCircle size={13} />
              <span>Update</span>
            </>
          ) : (
            <>
              <Download size={13} />
              <span>Install</span>
            </>
          )}
        </button>
      );
    }

    if (addon.ignored) {
      return (
        <span
          className={`bg-slate-800/80 text-slate-400 border border-slate-700 rounded-xl font-medium flex items-center justify-center gap-1 select-none ${
            compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
          }`}
        >
          Ignored
        </span>
      );
    }

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onInstallOrUpdate(addon.id);
        }}
        disabled={isBusy}
        className={`bg-[#1d222f] hover:bg-[#252c3d] text-slate-300 rounded-xl font-medium border border-[#2b3347] transition-colors flex items-center justify-center gap-1.5 ${
          compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
        }`}
        title="Reinstall or check files"
      >
        {isBusy ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <CheckCircle2 size={12} className="text-emerald-400" />
        )}
        <span>Up to date</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search, Filter & View Modes Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#161922] p-3 rounded-2xl border border-[#262c3d] shadow-lg">
        {/* Left: Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search installed addons..."
            className="w-full bg-[#0d0f15] border border-[#262c3d] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Center: Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filter === 'all'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({addons.length})
          </button>

          <button
            onClick={() => setFilter('updates')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              filter === 'updates'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Updates ({updateCount})
          </button>

          <button
            onClick={() => setFilter('github')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              filter === 'github'
                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            GitHub ({githubCount})
          </button>

          <button
            onClick={() => setFilter('wago')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              filter === 'wago'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Wago ({wagoCount})
          </button>

          {ignoredCount > 0 && (
            <button
              onClick={() => setFilter('ignored')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                filter === 'ignored'
                  ? 'bg-slate-700 text-slate-200 border border-slate-600'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Ignored ({ignoredCount})
            </button>
          )}
        </div>

        {/* Right: View Mode Toggle Buttons (CurseForge style) */}
        <div className="flex items-center gap-1 bg-[#0d0f15] p-1 rounded-xl border border-[#262c3d] shrink-0 self-end lg:self-center">
          <button
            onClick={() => handleSetViewMode('table')}
            title="Table View (CurseForge Columns)"
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'table'
                ? 'bg-amber-500/20 text-amber-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161922]'
            }`}
          >
            <LayoutList size={16} />
          </button>

          <button
            onClick={() => handleSetViewMode('list')}
            title="List View (Detailed Cards)"
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'list'
                ? 'bg-amber-500/20 text-amber-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161922]'
            }`}
          >
            <List size={16} />
          </button>

          <button
            onClick={() => handleSetViewMode('tiles')}
            title="Tiles View (Grid)"
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'tiles'
                ? 'bg-amber-500/20 text-amber-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161922]'
            }`}
          >
            <LayoutGrid size={16} />
          </button>

          <button
            onClick={() => handleSetViewMode('grouped')}
            title="Grouped View (By Status)"
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'grouped'
                ? 'bg-amber-500/20 text-amber-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161922]'
            }`}
          >
            <Layers size={16} />
          </button>
        </div>
      </div>

      {/* Batch Selection Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-[#1b202d] border border-amber-500/30 px-4 py-2.5 rounded-xl flex items-center justify-between gap-4 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-slate-200">
            <span className="font-bold text-amber-400">{selectedIds.size}</span>
            <span>addon(s) selected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                selectedIds.forEach((id) => onInstallOrUpdate(id));
                setSelectedIds(new Set());
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <ArrowUpCircle size={13} />
              Update Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400 hover:text-slate-200 px-2 py-1 transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {addons.length === 0 ? (
        <div className="text-center py-16 px-4 bg-[#161922] border border-[#262c3d] rounded-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-2xl">
            📦
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Your Vault is Empty</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Scan existing addons on your PC or browse thousands of addons on Wago with zero CurseForge tracking.
            </p>
          </div>
          <button
            onClick={onOpenAddModal}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 inline-flex items-center gap-2"
          >
            <Sparkles size={15} />
            Browse Addons
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 bg-[#161922] border border-[#262c3d] rounded-2xl text-slate-400 text-xs">
          No addons match the current filter or search criteria.
        </div>
      ) : (
        /* Render View Mode */
        <>
          {/* ================= TABLE VIEW (CurseForge style) ================= */}
          {viewMode === 'table' && (
            <div className="bg-[#161922] border border-[#262c3d] rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#242b3d] bg-[#11131a] text-slate-400 font-semibold select-none">
                      <th className="py-3 px-3.5 w-10 text-center">
                        <button
                          onClick={handleSelectAll}
                          className="text-slate-400 hover:text-white transition-colors"
                        >
                          {selectedIds.size === sorted.length && sorted.length > 0 ? (
                            <CheckSquare size={16} className="text-amber-400" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                      <th
                        onClick={() => toggleSort('name')}
                        className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Name</span>
                          {sortField === 'name' ? (
                            sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => toggleSort('status')}
                        className="py-3 px-3 w-32 cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Action</span>
                          {sortField === 'status' && (
                            sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                          )}
                        </div>
                      </th>
                      <th className="py-3 px-3 w-28 text-slate-400">Installed</th>
                      <th
                        onClick={() => toggleSort('latest_version')}
                        className="py-3 px-3 w-32 cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Latest Version</span>
                          {sortField === 'latest_version' && (
                            sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                          )}
                        </div>
                      </th>
                      <th className="py-3 px-3 w-24 text-slate-400">Source</th>
                      <th
                        onClick={() => toggleSort('author')}
                        className="py-3 px-3 w-36 cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Author</span>
                          {sortField === 'author' && (
                            sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                          )}
                        </div>
                      </th>
                      <th className="py-3 px-3 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202636]">
                    {sorted.map((addon) => {
                      const isSelected = selectedIds.has(addon.id);
                      const targetSlug =
                        addon.wago_slug || addon.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

                      return (
                        <tr
                          key={addon.id}
                          onClick={() => onSelectAddon && onSelectAddon(targetSlug)}
                          onContextMenu={(e) => handleContextMenu(e, addon)}
                          className={`hover:bg-[#1a1e2b] transition-colors cursor-pointer group ${
                            isSelected ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td
                            className="py-2.5 px-3.5 text-center"
                            onClick={(e) => handleToggleSelect(addon.id, e)}
                          >
                            <button className="text-slate-400 hover:text-white transition-colors">
                              {isSelected ? (
                                <CheckSquare size={15} className="text-amber-400" />
                              ) : (
                                <Square size={15} />
                              )}
                            </button>
                          </td>

                          {/* Name + Subtitle */}
                          <td className="py-2.5 px-3 min-w-[200px]">
                            <div className="flex items-center gap-3">
                              {renderAvatar(addon, 'w-8 h-8 text-[11px]')}
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-white group-hover:text-amber-400 transition-colors truncate">
                                  {addon.name}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate font-mono">
                                  {addon.folders[0] || addon.id.replace('local:', '')}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Action Button */}
                          <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                            {renderActionButton(addon, true)}
                          </td>

                          {/* Installed Version */}
                          <td className="py-2.5 px-3 font-mono text-slate-300">
                            {addon.installed_version || '—'}
                          </td>

                          {/* Latest Version */}
                          <td className="py-2.5 px-3 font-mono text-amber-400/90 font-medium truncate">
                            {addon.latest_version || '—'}
                          </td>

                          {/* Source */}
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                addon.source === 'github'
                                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                  : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                              }`}
                            >
                              {addon.source === 'github' ? 'GitHub' : 'Wago'}
                            </span>
                          </td>

                          {/* Author */}
                          <td className="py-2.5 px-3 text-slate-400 truncate">
                            {addon.author}
                          </td>

                          {/* Options Menu Button (...) */}
                          <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => handleContextMenu(e, addon)}
                              className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-[#252c3d] transition-colors"
                              title="More options (or right click)"
                            >
                              <MoreVertical size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= LIST VIEW (Detailed Cards) ================= */}
          {viewMode === 'list' && (
            <div className="space-y-2.5">
              {sorted.map((addon) => {
                const isSelected = selectedIds.has(addon.id);
                const targetSlug =
                  addon.wago_slug || addon.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

                return (
                  <div
                    key={addon.id}
                    onClick={() => onSelectAddon && onSelectAddon(targetSlug)}
                    onContextMenu={(e) => handleContextMenu(e, addon)}
                    className={`p-4 rounded-2xl bg-[#161922] border border-[#262c3d] hover:border-[#384259] hover:bg-[#1a1e29] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group cursor-pointer ${
                      isSelected ? 'ring-1 ring-amber-500/40 bg-amber-500/5' : ''
                    }`}
                  >
                    {/* Left: Info */}
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      {/* Checkbox */}
                      <button
                        onClick={(e) => handleToggleSelect(addon.id, e)}
                        className="text-slate-500 hover:text-white pt-1 transition-colors"
                      >
                        {isSelected ? (
                          <CheckSquare size={16} className="text-amber-400" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>

                      {renderAvatar(addon, 'w-11 h-11 text-sm')}

                      {/* Text Details */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors truncate">
                            {addon.name}
                          </h3>

                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              addon.source === 'github'
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                            }`}
                          >
                            {addon.source === 'github' ? 'GitHub' : 'Wago.io'}
                          </span>

                          <span className="text-[11px] text-slate-400">by {addon.author}</span>
                        </div>

                        {addon.summary && (
                          <p className="text-xs text-slate-400 line-clamp-1">{addon.summary}</p>
                        )}

                        {/* Folders in AddOns */}
                        {addon.folders && addon.folders.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 flex-wrap pt-0.5">
                            <Folder size={11} className="text-slate-600" />
                            <span>Folders:</span>
                            {addon.folders.slice(0, 3).map((f) => (
                              <span
                                key={f}
                                className="bg-[#0d0f15] text-slate-400 px-1.5 py-0.5 rounded border border-[#262c3d]"
                              >
                                {f}
                              </span>
                            ))}
                            {addon.folders.length > 3 && (
                              <span className="text-slate-600">+{addon.folders.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Versions & Actions */}
                    <div
                      className="flex items-center gap-3.5 shrink-0 self-end md:self-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="text-[11px] text-slate-500">Installed:</span>
                          <span className="text-xs font-mono font-medium text-slate-300">
                            {addon.installed_version || 'Not Installed'}
                          </span>
                        </div>
                        {addon.latest_version && (
                          <div className="text-[10px] text-slate-500">
                            Latest: <span className="text-amber-400/90 font-mono">{addon.latest_version}</span>
                          </div>
                        )}
                      </div>

                      {renderActionButton(addon)}

                      {/* 3-dots Menu Button */}
                      <button
                        onClick={(e) => handleContextMenu(e, addon)}
                        className="text-slate-500 hover:text-white p-2 rounded-xl hover:bg-[#252c3d] transition-colors"
                        title="Right click menu"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ================= TILES / GRID VIEW ================= */}
          {viewMode === 'tiles' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {sorted.map((addon) => {
                const isSelected = selectedIds.has(addon.id);
                const targetSlug =
                  addon.wago_slug || addon.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

                return (
                  <div
                    key={addon.id}
                    onClick={() => onSelectAddon && onSelectAddon(targetSlug)}
                    onContextMenu={(e) => handleContextMenu(e, addon)}
                    className={`p-3.5 rounded-2xl bg-[#161922] border border-[#262c3d] hover:border-amber-500/40 hover:bg-[#1a1e29] transition-all flex flex-col justify-between gap-3 group cursor-pointer relative shadow-lg ${
                      isSelected ? 'ring-2 ring-amber-500/50 bg-amber-500/5' : ''
                    }`}
                  >
                    {/* Top Row: Checkbox, Avatar, 3-dots */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={(e) => handleToggleSelect(addon.id, e)}
                          className="text-slate-500 hover:text-white transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare size={15} className="text-amber-400" />
                          ) : (
                            <Square size={15} />
                          )}
                        </button>
                        {renderAvatar(addon, 'w-11 h-11 text-sm')}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContextMenu(e, addon);
                        }}
                        className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-[#252c3d] transition-colors"
                      >
                        <MoreVertical size={15} />
                      </button>
                    </div>

                    {/* Middle: Title & Author */}
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-1">
                        {addon.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate">by {addon.author}</p>
                    </div>

                    {/* Bottom: Version & Action Button */}
                    <div className="pt-2 border-t border-[#23293a] flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-slate-400 truncate">
                        v{addon.installed_version || 'none'}
                      </span>
                      <div onClick={(e) => e.stopPropagation()}>
                        {renderActionButton(addon, true)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ================= GROUPED VIEW ================= */}
          {viewMode === 'grouped' && (
            <div className="space-y-4">
              {[
                {
                  key: 'updates',
                  title: 'Updates Available',
                  badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                  items: sorted.filter((a) => isAddonUpdatable(a)),
                },
                {
                  key: 'uptodate',
                  title: 'Up to Date',
                  badgeClass: 'bg-[#222736] text-slate-300 border-[#2d3448]',
                  items: sorted.filter((a) => !isAddonUpdatable(a) && !a.ignored),
                },
                {
                  key: 'ignored',
                  title: 'Ignored from Updates',
                  badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
                  items: sorted.filter((a) => a.ignored),
                },
              ]
                .filter((group) => group.items.length > 0)
                .map((group) => {
                  const isCollapsed = Boolean(collapsedGroups[group.key]);

                  return (
                    <div
                      key={group.key}
                      className="bg-[#161922] border border-[#262c3d] rounded-2xl overflow-hidden shadow-lg"
                    >
                      {/* Group Header */}
                      <button
                        onClick={() => toggleGroup(group.key)}
                        className="w-full px-4 py-3 bg-[#12141c] flex items-center justify-between border-b border-[#242b3d] hover:bg-[#151823] transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          {isCollapsed ? (
                            <ChevronRight size={16} className="text-slate-400" />
                          ) : (
                            <ChevronDown size={16} className="text-slate-400" />
                          )}
                          <span className="font-bold text-xs text-white">{group.title}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${group.badgeClass}`}
                          >
                            {group.items.length}
                          </span>
                        </div>
                      </button>

                      {/* Group Body (CurseForge Table inside group) */}
                      {!isCollapsed && (
                        <div className="divide-y divide-[#202636]">
                          {group.items.map((addon) => {
                            const targetSlug =
                              addon.wago_slug || addon.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                            return (
                              <div
                                key={addon.id}
                                onClick={() => onSelectAddon && onSelectAddon(targetSlug)}
                                onContextMenu={(e) => handleContextMenu(e, addon)}
                                className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-[#1a1e2b] transition-colors cursor-pointer group"
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  {renderAvatar(addon, 'w-8 h-8 text-[11px]')}
                                  <div className="min-w-0">
                                    <p className="font-bold text-xs text-white group-hover:text-amber-400 transition-colors truncate">
                                      {addon.name}
                                    </p>
                                    <p className="text-[10px] text-slate-500">by {addon.author}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-xs font-mono text-slate-400 hidden sm:inline">
                                    v{addon.installed_version || 'none'}
                                  </span>
                                  {renderActionButton(addon, true)}
                                  <button
                                    onClick={(e) => handleContextMenu(e, addon)}
                                    className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-[#252c3d]"
                                  >
                                    <MoreVertical size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </>
      )}

      {/* Floating Right-Click Context Menu */}
      {contextMenu && (
        <AddonContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          addon={contextMenu.addon}
          onClose={() => setContextMenu(null)}
          onSelectAddon={(slug) => {
            onSelectAddon && onSelectAddon(slug);
            setContextMenu(null);
          }}
          onReinstall={(id) => {
            onInstallOrUpdate(id);
            setContextMenu(null);
          }}
          onDelete={(id) => {
            onDelete(id);
            setContextMenu(null);
          }}
          onUpdateAddon={(updated) => {
            onUpdateAddon && onUpdateAddon(updated);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
};
