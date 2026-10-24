import React from 'react';
import type { Settings } from '../types';
import {
  RefreshCw,
  ArrowUpCircle,
  Plus,
  Settings as SettingsIcon,
  FolderOpen,
  AlertTriangle,
  Shield,
} from 'lucide-react';

interface Props {
  settings: Settings;
  updateCount: number;
  checkingUpdates: boolean;
  updatingAll: boolean;
  onCheckUpdates: () => void;
  onUpdateAll: () => void;
  onOpenAddModal: () => void;
  onOpenSettings: () => void;
  onOpenFolder: () => void;
}

export const Header: React.FC<Props> = ({
  settings,
  updateCount,
  checkingUpdates,
  updatingAll,
  onCheckUpdates,
  onUpdateAll,
  onOpenAddModal,
  onOpenSettings,
  onOpenFolder,
}) => {
  const hasWowPath = Boolean(settings.wow_path && settings.wow_path.trim());

  return (
    <header className="border-b border-[#262c3d] bg-[#12141c]/90 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Branding & WoW Path Indicator */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-purple-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
            <Shield size={22} className="text-amber-400" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-white tracking-wide">
                WoW Addon <span className="text-amber-400">Vault</span>
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Ad-Free • No CurseForge
              </span>
            </div>

            {/* Path indicator */}
            <button
              onClick={onOpenSettings}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors text-left truncate max-w-sm"
              title={hasWowPath ? settings.wow_path : 'Click to configure WoW path'}
            >
              {hasWowPath ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="truncate">{settings.wow_path}</span>
                </>
              ) : (
                <span className="text-amber-400 flex items-center gap-1 font-medium animate-pulse">
                  <AlertTriangle size={12} />
                  WoW path not set! Click here to set it
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Check Updates */}
          <button
            onClick={onCheckUpdates}
            disabled={checkingUpdates}
            className="bg-[#1a1e29] hover:bg-[#222736] text-slate-200 border border-[#2e354a] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
            title="Check all installed addons for updates"
          >
            <RefreshCw size={14} className={checkingUpdates ? 'animate-spin text-amber-400' : ''} />
            {checkingUpdates ? 'Checking...' : 'Check Updates'}
          </button>

          {/* Update All (only if updates available) */}
          {updateCount > 0 && (
            <button
              onClick={onUpdateAll}
              disabled={updatingAll}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 animate-pulse"
            >
              <ArrowUpCircle size={15} />
              {updatingAll ? 'Updating...' : `Update All (${updateCount})`}
            </button>
          )}

          {/* Add Addon */}
          <button
            onClick={onOpenAddModal}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-amber-500/20"
          >
            <Plus size={15} />
            Add Addon
          </button>

          {/* Open AddOns Folder */}
          <button
            onClick={onOpenFolder}
            className="bg-[#1a1e29] hover:bg-[#222736] text-slate-300 hover:text-white border border-[#2e354a] p-2 rounded-xl text-xs transition-colors"
            title="Open Interface/AddOns folder in Explorer"
          >
            <FolderOpen size={16} />
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="bg-[#1a1e29] hover:bg-[#222736] text-slate-300 hover:text-white border border-[#2e354a] p-2 rounded-xl text-xs transition-colors"
            title="Settings"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
