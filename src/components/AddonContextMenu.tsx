import React, { useState, useEffect, useRef } from 'react';
import type { Addon } from '../types';
import {
  Download,
  Eye,
  Settings,
  Info,
  ExternalLink,
  Copy,
  FolderOpen,
  FileText,
  RotateCcw,
  Trash2,
  ChevronRight,
  Check,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface Props {
  x: number;
  y: number;
  addon: Addon;
  onClose: () => void;
  onSelectAddon: (slug: string) => void;
  onReinstall: (addonId: string) => void;
  onDelete: (addonId: string) => void;
  onUpdateAddon: (updated: Addon) => void;
  showToast: (msg: string) => void;
}

export const AddonContextMenu: React.FC<Props> = ({
  x,
  y,
  addon,
  onClose,
  onSelectAddon,
  onReinstall,
  onDelete,
  onUpdateAddon,
  showToast,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'installSettings' | 'releaseType' | 'links' | null>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust coordinates so menu doesn't overflow screen
  const menuWidth = 240;
  const menuHeight = 360;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);

  const targetSlug = addon.wago_slug || addon.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const addonUrl =
    addon.source === 'github'
      ? `https://github.com/${addon.repo || ''}`
      : `https://addons.wago.io/addons/${addon.wago_slug || targetSlug}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(addonUrl);
      showToast('Copied addon link to clipboard! 📋');
    } catch {
      showToast(addonUrl);
    }
    onClose();
  };

  const handleBrowseFolder = async () => {
    try {
      await invoke('open_addon_folder', { addonId: addon.id });
    } catch (err: any) {
      alert(`Could not open folder: ${err}`);
    }
    onClose();
  };

  const handleDeleteSavedVariables = async () => {
    const confirmed = window.confirm(
      `⚠️ Reset Settings (SavedVariables) for "${addon.name}"?\n\nThis will remove all saved configurations in your WTF folder for this addon and reset it to default in-game. Your addon files will remain installed.`
    );
    if (!confirmed) return;

    try {
      const count = await invoke<number>('delete_addon_saved_variables', { addonId: addon.id });
      showToast(`Removed ${count} SavedVariable file(s) for ${addon.name}! 🧹`);
    } catch (err: any) {
      alert(`Error cleaning saved variables: ${err}`);
    }
    onClose();
  };

  const handleToggleIgnore = async (ignored: boolean) => {
    try {
      const updated = await invoke<Addon>('toggle_addon_ignore', {
        addonId: addon.id,
        ignore: ignored,
      });
      onUpdateAddon(updated);
      showToast(ignored ? `Ignored updates for ${addon.name}` : `Enabled updates for ${addon.name}`);
    } catch (err: any) {
      alert(`Error updating setting: ${err}`);
    }
    onClose();
  };

  const handleSetReleaseChannel = async (channel: string) => {
    try {
      const updated = await invoke<Addon>('set_addon_release_channel', {
        addonId: addon.id,
        channel,
      });
      onUpdateAddon(updated);
      showToast(`Set release channel to ${channel.toUpperCase()} for ${addon.name}`);
    } catch (err: any) {
      alert(`Error setting release channel: ${err}`);
    }
    onClose();
  };

  const currentChannel = addon.release_channel || 'release';
  const isIgnored = Boolean(addon.ignored);

  return (
    <div
      ref={menuRef}
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      className="fixed z-50 w-60 bg-[#161922] border border-[#2b3347] rounded-xl shadow-2xl py-1.5 text-xs text-slate-200 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      {/* Header Info */}
      <div className="px-3 py-1.5 border-b border-[#242b3d] mb-1">
        <p className="font-bold text-white truncate text-[11px]">{addon.name}</p>
        <p className="text-[10px] text-slate-400 font-mono">v{addon.installed_version || 'Unknown'}</p>
      </div>

      {/* Reinstall */}
      <button
        onClick={() => {
          onReinstall(addon.id);
          onClose();
        }}
        className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-amber-500/15 hover:text-amber-300 text-left transition-colors"
      >
        <Download size={14} className="text-amber-400" />
        <span>Reinstall</span>
      </button>

      {/* View Addon */}
      <button
        onClick={() => {
          onSelectAddon(targetSlug);
          onClose();
        }}
        className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-amber-500/15 hover:text-amber-300 text-left transition-colors"
      >
        <Eye size={14} className="text-slate-400" />
        <span>View Addon</span>
      </button>

      <div className="my-1 border-t border-[#242b3d]" />

      {/* Install Settings (with Submenu) */}
      <div
        className="relative"
        onMouseEnter={() => setActiveSubmenu('installSettings')}
        onMouseLeave={() => setActiveSubmenu(null)}
      >
        <button className="w-full px-3 py-2 flex items-center justify-between hover:bg-amber-500/15 hover:text-amber-300 text-left transition-colors">
          <div className="flex items-center gap-2.5">
            <Settings size={14} className="text-slate-400" />
            <span>Install Settings</span>
          </div>
          <ChevronRight size={13} className="text-slate-500" />
        </button>

        {activeSubmenu === 'installSettings' && (
          <div
            className={`absolute top-0 w-52 bg-[#161922] border border-[#2b3347] rounded-xl shadow-2xl py-1.5 z-50 ${
              adjustedX + menuWidth + 210 > window.innerWidth ? 'right-full mr-1' : 'left-full ml-1'
            }`}
          >
            <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Update Mode
            </div>
            <button
              onClick={() => handleToggleIgnore(false)}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-amber-500/15 text-left text-xs"
            >
              <span>Default (Manual)</span>
              {!isIgnored && <Check size={13} className="text-amber-400" />}
            </button>
            <button
              onClick={() => handleToggleIgnore(false)}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-amber-500/15 text-left text-xs text-slate-400"
            >
              <span>Automatic</span>
            </button>
            <div className="my-1 border-t border-[#242b3d]" />
            <button
              onClick={() => handleToggleIgnore(!isIgnored)}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-amber-500/15 text-left text-xs"
            >
              <span className={isIgnored ? 'text-amber-300 font-semibold' : ''}>Ignored</span>
              {isIgnored && <Check size={13} className="text-amber-400" />}
            </button>
          </div>
        )}
      </div>

      {/* Release Type (with Submenu) */}
      <div
        className="relative"
        onMouseEnter={() => setActiveSubmenu('releaseType')}
        onMouseLeave={() => setActiveSubmenu(null)}
      >
        <button className="w-full px-3 py-2 flex items-center justify-between hover:bg-amber-500/15 hover:text-amber-300 text-left transition-colors">
          <div className="flex items-center gap-2.5">
            <Info size={14} className="text-slate-400" />
            <span>Release Type</span>
          </div>
          <ChevronRight size={13} className="text-slate-500" />
        </button>

        {activeSubmenu === 'releaseType' && (
          <div
            className={`absolute top-0 w-44 bg-[#161922] border border-[#2b3347] rounded-xl shadow-2xl py-1.5 z-50 ${
              adjustedX + menuWidth + 180 > window.innerWidth ? 'right-full mr-1' : 'left-full ml-1'
            }`}
          >
            <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Channel
            </div>
            {(['release', 'beta', 'alpha'] as const).map((channel) => (
              <button
                key={channel}
                onClick={() => handleSetReleaseChannel(channel)}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-amber-500/15 text-left text-xs capitalize"
              >
                <span className={currentChannel === channel ? 'text-amber-400 font-semibold' : ''}>
                  {channel}
                </span>
                {currentChannel === channel && <Check size={13} className="text-amber-400" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="my-1 border-t border-[#242b3d]" />

      {/* Copy Addon Link */}
      <button
        onClick={handleCopyLink}
        className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-amber-500/15 hover:text-amber-300 text-left transition-colors"
      >
        <Copy size={14} className="text-slate-400" />
        <span>Copy Addon Link</span>
      </button>

      {/* Browse Folder */}
      <button
        onClick={handleBrowseFolder}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-amber-500/15 hover:text-amber-300 text-left transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <FolderOpen size={14} className="text-slate-400" />
          <span>Browse Folder</span>
        </div>
        <ExternalLink size={12} className="text-slate-500" />
      </button>

      {/* View Changelogs */}
      <button
        onClick={() => {
          onSelectAddon(targetSlug);
          onClose();
        }}
        className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-amber-500/15 hover:text-amber-300 text-left transition-colors"
      >
        <FileText size={14} className="text-slate-400" />
        <span>View Changelogs</span>
      </button>

      <div className="my-1 border-t border-[#242b3d]" />

      {/* Delete Settings (Saved Variables) */}
      <button
        onClick={handleDeleteSavedVariables}
        className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-amber-500/15 hover:text-amber-300 text-left transition-colors text-amber-200/90"
      >
        <RotateCcw size={14} className="text-amber-400" />
        <span>Delete Settings (SavedVariables)</span>
      </button>

      {/* Delete Addon */}
      <button
        onClick={() => {
          onDelete(addon.id);
          onClose();
        }}
        className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-left transition-colors"
      >
        <Trash2 size={14} />
        <span>Delete Addon</span>
      </button>
    </div>
  );
};
