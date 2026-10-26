import React, { useState, useRef, useEffect } from 'react';
import type { Settings } from '../types';
import {
  Compass,
  Layers,
  RefreshCw,
  ArrowUpCircle,
  FolderOpen,
  Settings as SettingsIcon,
  Shield,
  Scan,
  AlertTriangle,
  ChevronDown,
  Check,
  Share2,
} from 'lucide-react';

interface Props {
  activeTab: 'my-addons' | 'browse';
  onTabChange: (tab: 'my-addons' | 'browse') => void;
  settings: Settings;
  totalInstalled: number;
  updateCount: number;
  checkingUpdates: boolean;
  updatingAll: boolean;
  scanningDisk: boolean;
  onCheckUpdates: () => void;
  onUpdateAll: () => void;
  onScanDisk: () => void;
  onOpenSettings: () => void;
  onOpenFolder: () => void;
  onOpenSharePack: () => void;
  onGameFlavorChange: (flavor: 'retail' | 'forever' | 'all') => void;
}

const GAME_FLAVORS = [
  { id: 'retail', label: 'Retail' },
  { id: 'forever', label: 'WoW Forever' },
  { id: 'all', label: 'All Branches' },
] as const;

export const Navbar: React.FC<Props> = ({
  activeTab,
  onTabChange,
  settings,
  totalInstalled,
  updateCount,
  checkingUpdates,
  updatingAll,
  scanningDisk,
  onCheckUpdates,
  onUpdateAll,
  onScanDisk,
  onOpenSettings,
  onOpenFolder,
  onOpenSharePack,
  onGameFlavorChange,
}) => {
  const [flavorDropdownOpen, setFlavorDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasWowPath = Boolean(settings.wow_path && settings.wow_path.trim());
  const currentFlavor = (settings.game_flavor as 'retail' | 'forever' | 'all') || 'retail';
  const currentFlavorLabel =
    GAME_FLAVORS.find((f) => f.id === currentFlavor)?.label || 'Retail';

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFlavorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="border-b border-[#262c3d] bg-[#12141c]/95 backdrop-blur-md sticky top-0 z-40 px-6 py-3">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Left: Branding & Main Navigation Tabs */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-purple-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <Shield size={20} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-base font-black text-white tracking-wide">
                WoW Addon <span className="text-amber-400">Vault</span>
              </h1>
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                Ad-Free • 0% CurseForge
              </span>
            </div>
          </div>

          {/* Navigation Tabs (like CurseForge) */}
          <div className="flex items-center bg-[#0d0f15] p-1 rounded-xl border border-[#262c3d]">
            <button
              onClick={() => onTabChange('my-addons')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'my-addons'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers size={14} />
              My Addons
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeTab === 'my-addons'
                    ? 'bg-slate-950/20 text-slate-950 font-black'
                    : 'bg-[#1a1e29] text-slate-400'
                }`}
              >
                {totalInstalled}
              </span>
              {updateCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>

            <button
              onClick={() => onTabChange('browse')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'browse'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Compass size={14} />
              Get Addons (Browse)
            </button>
          </div>
        </div>

        {/* Center/Right: CurseForge Style Dropdown & Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Game Flavor Dropdown (CurseForge style) */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setFlavorDropdownOpen(!flavorDropdownOpen)}
              className="bg-[#161922] hover:bg-[#202534] border border-[#262c3d] text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
              title="Select Game Version"
            >
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span>{currentFlavorLabel}</span>
              <ChevronDown
                size={14}
                className={`text-slate-400 transition-transform duration-200 ${
                  flavorDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {flavorDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-40 bg-[#161922] border border-[#262c3d] rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-150">
                {GAME_FLAVORS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      onGameFlavorChange(f.id);
                      setFlavorDropdownOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-xs font-semibold text-left flex items-center justify-between transition-colors ${
                      currentFlavor === f.id
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'text-slate-300 hover:bg-[#202534] hover:text-white'
                    }`}
                  >
                    <span>{f.label}</span>
                    {currentFlavor === f.id && <Check size={14} className="text-amber-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Path button */}
          <button
            onClick={onOpenSettings}
            className="text-xs text-slate-400 hover:text-slate-200 bg-[#161922] border border-[#262c3d] px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors max-w-xs truncate"
            title={hasWowPath ? settings.wow_path : 'Click to configure WoW path'}
          >
            {hasWowPath ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate">{settings.wow_path}</span>
              </>
            ) : (
              <span className="text-amber-400 flex items-center gap-1 font-semibold animate-pulse">
                <AlertTriangle size={13} />
                Set WoW Path
              </span>
            )}
          </button>

          {/* Scan AddOns from PC (TOC Scanner) */}
          <button
            onClick={onScanDisk}
            disabled={scanningDisk || !hasWowPath}
            className="bg-[#1a1e29] hover:bg-[#222736] text-slate-200 border border-[#2e354a] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
            title="Scan existing addons already installed from CurseForge"
          >
            <Scan size={14} className={scanningDisk ? 'animate-spin text-cyan-400' : 'text-cyan-400'} />
            {scanningDisk ? 'Scanning...' : 'Scan PC Addons'}
          </button>

          {/* Share & Sync Addon Pack */}
          <button
            onClick={onOpenSharePack}
            className="bg-[#1a1e29] hover:bg-[#222736] text-purple-300 hover:text-purple-200 border border-purple-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
            title="Export or Import Addon Pack"
          >
            <Share2 size={14} className="text-purple-400" />
            <span>Share Pack</span>
          </button>

          {/* Check Updates */}
          <button
            onClick={onCheckUpdates}
            disabled={checkingUpdates}
            className="bg-[#1a1e29] hover:bg-[#222736] text-slate-200 border border-[#2e354a] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
            title="Check for updates on GitHub & Wago"
          >
            <RefreshCw size={14} className={checkingUpdates ? 'animate-spin text-amber-400' : ''} />
            {checkingUpdates ? 'Checking...' : 'Check Updates'}
          </button>

          {/* Update All Button */}
          {updateCount > 0 && (
            <button
              onClick={onUpdateAll}
              disabled={updatingAll}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <ArrowUpCircle size={14} />
              {updatingAll ? 'Updating...' : `Update All (${updateCount})`}
            </button>
          )}

          {/* Open AddOns folder */}
          <button
            onClick={onOpenFolder}
            className="bg-[#1a1e29] hover:bg-[#222736] text-slate-300 hover:text-white border border-[#2e354a] p-2 rounded-xl text-xs transition-colors"
            title="Open Interface/AddOns folder in Explorer"
          >
            <FolderOpen size={15} />
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="bg-[#1a1e29] hover:bg-[#222736] text-slate-300 hover:text-white border border-[#2e354a] p-2 rounded-xl text-xs transition-colors"
            title="Settings"
          >
            <SettingsIcon size={15} />
          </button>
        </div>
      </div>
    </nav>
  );
};
