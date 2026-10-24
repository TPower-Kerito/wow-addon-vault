import React, { useState } from 'react';
import type { Settings } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { X, Folder, Sparkles, Key, Check, AlertCircle, Layout, Gamepad2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (newSettings: Settings) => void;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave }) => {
  const [wowPath, setWowPath] = useState(settings.wow_path || '');
  const [githubToken, setGithubToken] = useState(settings.github_token || '');
  const [detailsViewMode, setDetailsViewMode] = useState<'full' | 'drawer'>(
    (settings.details_view_mode as 'full' | 'drawer') || 'full'
  );
  const [gameFlavor, setGameFlavor] = useState<'retail' | 'forever' | 'all'>(
    (settings.game_flavor as 'retail' | 'forever' | 'all') || 'retail'
  );
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [detecting, setDetecting] = useState(false);

  if (!isOpen) return null;

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select World of Warcraft Directory (_retail_ or _classic_)',
      });

      if (selected && typeof selected === 'string') {
        setWowPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAutoDetect = async () => {
    setDetecting(true);
    setStatusMsg(null);
    try {
      const detected = await invoke<string | null>('auto_detect_wow_path');
      if (detected) {
        setWowPath(detected);
        setStatusMsg({ text: `Detected WoW at: ${detected}`, type: 'success' });
      } else {
        setStatusMsg({ text: 'Could not auto-detect WoW directory. Please browse manually.', type: 'error' });
      }
    } catch (e) {
      setStatusMsg({ text: 'Auto-detect failed. Please browse manually.', type: 'error' });
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: Settings = {
      wow_path: wowPath.trim(),
      github_token: githubToken.trim() ? githubToken.trim() : null,
      details_view_mode: detailsViewMode,
      game_flavor: gameFlavor,
    };
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-[#161922] border border-[#262c3d] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262c3d]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              ⚙️
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Application Settings</h2>
              <p className="text-xs text-slate-400">Customize WoW directories and display modes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#202534] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* WoW Path Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Folder size={14} className="text-amber-400" />
                World of Warcraft Directory
              </label>
              <button
                type="button"
                onClick={handleAutoDetect}
                disabled={detecting}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-md transition-colors"
              >
                <Sparkles size={11} />
                {detecting ? 'Scanning...' : 'Auto-Detect'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Point to your <code className="text-amber-300 bg-[#0d0f15] px-1 py-0.5 rounded">_retail_</code> or{' '}
              <code className="text-amber-300 bg-[#0d0f15] px-1 py-0.5 rounded">_classic_</code> folder.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={wowPath}
                onChange={(e) => setWowPath(e.target.value)}
                placeholder="e.g. C:\Program Files (x86)\World of Warcraft\_retail_"
                className="flex-1 bg-[#0d0f15] border border-[#262c3d] rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="bg-[#202534] hover:bg-[#2b3245] text-white px-3.5 py-2 rounded-xl text-xs font-semibold border border-[#2e354a] flex items-center gap-1.5 shrink-0"
              >
                <Folder size={14} />
                Browse
              </button>
            </div>
          </div>

          {/* Details View Mode Selection */}
          <div className="space-y-2 pt-3 border-t border-[#262c3d]/60">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Layout size={14} className="text-cyan-400" />
              Addon Details Presentation
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setDetailsViewMode('full')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  detailsViewMode === 'full'
                    ? 'bg-amber-500/10 border-amber-500/50 text-white'
                    : 'bg-[#0d0f15] border-[#262c3d] text-slate-400 hover:text-white'
                }`}
              >
                <div className="text-xs font-bold">Full Page (Default)</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Opens addon profile as a dedicated full screen with breadcrumbs.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDetailsViewMode('drawer')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  detailsViewMode === 'drawer'
                    ? 'bg-amber-500/10 border-amber-500/50 text-white'
                    : 'bg-[#0d0f15] border-[#262c3d] text-slate-400 hover:text-white'
                }`}
              >
                <div className="text-xs font-bold">Side Drawer (CurseForge style)</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Slides in from the right edge while keeping your current list visible.
                </div>
              </button>
            </div>
          </div>

          {/* Target Game Branch */}
          <div className="space-y-2 pt-3 border-t border-[#262c3d]/60">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Gamepad2 size={14} className="text-emerald-400" />
              Game Version Preference
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGameFlavor('retail')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                  gameFlavor === 'retail'
                    ? 'bg-purple-500/15 text-purple-400 border-purple-500/40'
                    : 'bg-[#0d0f15] text-slate-400 border-[#262c3d]'
                }`}
              >
                Retail (11.x)
              </button>
              <button
                type="button"
                onClick={() => setGameFlavor('forever')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                  gameFlavor === 'forever'
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                    : 'bg-[#0d0f15] text-slate-400 border-[#262c3d]'
                }`}
              >
                WoW Forever (12.x)
              </button>
              <button
                type="button"
                onClick={() => setGameFlavor('all')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                  gameFlavor === 'all'
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40'
                    : 'bg-[#0d0f15] text-slate-400 border-[#262c3d]'
                }`}
              >
                All Branches
              </button>
            </div>
          </div>

          {/* GitHub Token Section */}
          <div className="space-y-2 pt-3 border-t border-[#262c3d]/60">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Key size={14} className="text-purple-400" />
              GitHub Personal Access Token (Optional)
            </label>
            <p className="text-[11px] text-slate-400">
              Only required if your custom addon repo is <strong>Private</strong>.
            </p>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-[#0d0f15] border border-[#262c3d] rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {statusMsg && (
            <div
              className={`flex items-center gap-2 p-3 rounded-xl text-xs ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              {statusMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
              {statusMsg.text}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#262c3d]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-[#202534] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-lg shadow-amber-500/20 flex items-center gap-1.5"
            >
              <Check size={15} />
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
