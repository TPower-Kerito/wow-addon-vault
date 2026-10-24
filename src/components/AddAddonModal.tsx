import React, { useState } from 'react';
import type { Addon, WagoSearchResult } from '../types';
import { invoke } from '@tauri-apps/api/core';
import {
  X,
  Search,
  Flame,
  Download,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { GithubIcon } from './GithubIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddonAdded: (addon: Addon) => void;
}

const PRESETS = [
  {
    name: 'WeakAuras 2',
    source: 'github',
    target: 'WeakAuras/WeakAuras2',
    desc: 'The essential framework for displays, timers, and alerts.',
    author: 'WeakAuras Team',
  },
  {
    name: 'Details! Damage Meter',
    source: 'wago',
    target: 'details',
    desc: 'Deep real-time combat analysis, DPS, healing, and death logs.',
    author: 'Terciob',
  },
  {
    name: 'Plater Nameplates',
    source: 'wago',
    target: 'plater-nameplates',
    desc: 'Highly customizable nameplate addon with script and aura support.',
    author: 'Terciob',
  },
  {
    name: 'BigWigs Bossmods',
    source: 'github',
    target: 'BigWigsMods/BigWigs',
    desc: 'Clean, lightweight, and modular boss encounter alerts.',
    author: 'BigWigsMods',
  },
  {
    name: 'LittleWigs',
    source: 'github',
    target: 'BigWigsMods/LittleWigs',
    desc: 'Dungeon warnings and mechanics support for Mythic+ and dungeons.',
    author: 'BigWigsMods',
  },
  {
    name: 'ElvUI',
    source: 'github',
    target: 'Tukui-org/ElvUI',
    desc: 'Complete user interface replacement for World of Warcraft.',
    author: 'Tukui-org',
  },
  {
    name: 'Deadly Boss Mods (DBM)',
    source: 'github',
    target: 'DeadlyBossMods/DBM-Retail',
    desc: 'Classic raid boss alerts and fight warnings.',
    author: 'DeadlyBossMods',
  },
];

export const AddAddonModal: React.FC<Props> = ({ isOpen, onClose, onAddonAdded }) => {
  const [activeTab, setActiveTab] = useState<'github' | 'wago' | 'presets'>('github');

  // GitHub tab state
  const [githubInput, setGithubInput] = useState('');
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  // Wago tab state
  const [wagoQuery, setWagoQuery] = useState('');
  const [wagoLoading, setWagoLoading] = useState(false);
  const [wagoResults, setWagoResults] = useState<WagoSearchResult[]>([]);
  const [wagoError, setWagoError] = useState<string | null>(null);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  // Presets state
  const [presetLoadingTarget, setPresetLoadingTarget] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddGithub = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!githubInput.trim()) return;

    setGithubLoading(true);
    setGithubError(null);

    try {
      const added = await invoke<Addon>('add_addon_from_github', { repo: githubInput.trim() });
      onAddonAdded(added);
      setGithubInput('');
      onClose();
    } catch (err: any) {
      setGithubError(typeof err === 'string' ? err : 'Failed to add GitHub addon.');
    } finally {
      setGithubLoading(false);
    }
  };

  const handleSearchWago = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!wagoQuery.trim()) return;

    setWagoLoading(true);
    setWagoError(null);

    try {
      const results = await invoke<WagoSearchResult[]>('search_wago_addons', {
        query: wagoQuery.trim(),
      });
      setWagoResults(results);
      if (results.length === 0) {
        setWagoError('No addons found matching this search on Wago.io.');
      }
    } catch (err: any) {
      setWagoError(typeof err === 'string' ? err : 'Failed to search Wago.io.');
    } finally {
      setWagoLoading(false);
    }
  };

  const handleInstallWago = async (slug: string) => {
    setInstallingSlug(slug);
    setWagoError(null);
    try {
      const added = await invoke<Addon>('add_addon_from_wago', { slug });
      onAddonAdded(added);
      onClose();
    } catch (err: any) {
      setWagoError(typeof err === 'string' ? err : 'Failed to install Wago addon.');
    } finally {
      setInstallingSlug(null);
    }
  };

  const handleInstallPreset = async (preset: typeof PRESETS[0]) => {
    setPresetLoadingTarget(preset.target);
    try {
      let added: Addon;
      if (preset.source === 'github') {
        added = await invoke<Addon>('add_addon_from_github', { repo: preset.target });
      } else {
        added = await invoke<Addon>('add_addon_from_wago', { slug: preset.target });
      }
      onAddonAdded(added);
      onClose();
    } catch (err: any) {
      alert(`Failed to add preset: ${err}`);
    } finally {
      setPresetLoadingTarget(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#161922] border border-[#262c3d] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262c3d]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              ⚡
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Add Addon to Vault</h2>
              <p className="text-xs text-slate-400">Zero CurseForge • Direct GitHub & Wago.io</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#202534] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-[#262c3d] bg-[#12141c] px-6">
          <button
            onClick={() => setActiveTab('github')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'github'
                ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <GithubIcon size={15} />
            GitHub (Your Addon)
          </button>
          <button
            onClick={() => setActiveTab('wago')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'wago'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search size={15} />
            Search Wago.io
          </button>
          <button
            onClick={() => setActiveTab('presets')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'presets'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame size={15} />
            Popular Presets
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: GITHUB */}
          {activeTab === 'github' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 leading-relaxed">
                <strong>💡 Perfect for your own addon:</strong>
                <p className="mt-1">
                  Whenever you push code and create a <strong>Release</strong> (with a compiled{' '}
                  <code>.zip</code> asset) on GitHub, this tool will detect the new version and let you
                  update with 1-click!
                </p>
              </div>

              <form onSubmit={handleAddGithub} className="space-y-3">
                <label className="text-xs font-semibold text-slate-300">
                  GitHub Repository (e.g. <code>username/my-wow-addon</code> or full URL)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={githubInput}
                    onChange={(e) => setGithubInput(e.target.value)}
                    placeholder="e.g. WeakAuras/WeakAuras2 or https://github.com/..."
                    className="flex-1 bg-[#0d0f15] border border-[#262c3d] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={githubLoading || !githubInput.trim()}
                    className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shrink-0 shadow-lg shadow-purple-600/20"
                  >
                    {githubLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    Fetch & Add
                  </button>
                </div>
              </form>

              {githubError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
                  <AlertCircle size={15} />
                  {githubError}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: WAGO SEARCH */}
          {activeTab === 'wago' && (
            <div className="space-y-4">
              <form onSubmit={handleSearchWago} className="flex gap-2">
                <input
                  type="text"
                  value={wagoQuery}
                  onChange={(e) => setWagoQuery(e.target.value)}
                  placeholder="Search thousands of WoW addons on Wago.io..."
                  className="flex-1 bg-[#0d0f15] border border-[#262c3d] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={wagoLoading || !wagoQuery.trim()}
                  className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shrink-0 shadow-lg shadow-cyan-600/20"
                >
                  {wagoLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  Search
                </button>
              </form>

              {wagoError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
                  <AlertCircle size={15} />
                  {wagoError}
                </div>
              )}

              {/* Search Results */}
              <div className="space-y-2.5">
                {wagoResults.map((item) => (
                  <div
                    key={item.slug}
                    className="p-4 rounded-xl bg-[#1a1e29] border border-[#262c3d] hover:border-cyan-500/40 transition-all flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white truncate">{item.name}</h4>
                        <span className="text-[10px] text-slate-400 bg-[#0d0f15] px-2 py-0.5 rounded-full border border-[#262c3d]">
                          by {item.author}
                        </span>
                        {item.downloads && (
                          <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">
                            📥 {item.downloads}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-1">{item.summary || 'No summary available.'}</p>
                    </div>

                    <button
                      onClick={() => handleInstallWago(item.slug)}
                      disabled={installingSlug === item.slug}
                      className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold px-3.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 shrink-0 shadow-md shadow-cyan-500/10"
                    >
                      {installingSlug === item.slug ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Download size={13} />
                      )}
                      Install
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: POPULAR PRESETS */}
          {activeTab === 'presets' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PRESETS.map((p) => (
                <div
                  key={p.target}
                  className="p-4 rounded-xl bg-[#1a1e29] border border-[#262c3d] hover:border-amber-500/30 transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white">{p.name}</h4>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          p.source === 'github'
                            ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                            : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                        }`}
                      >
                        {p.source.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">{p.desc}</p>
                    <p className="text-[11px] text-slate-500">by {p.author}</p>
                  </div>

                  <button
                    onClick={() => handleInstallPreset(p)}
                    disabled={presetLoadingTarget === p.target}
                    className="w-full bg-[#202534] hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-semibold py-2 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 border border-[#2e354a] hover:border-amber-400"
                  >
                    {presetLoadingTarget === p.target ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Download size={13} />
                    )}
                    Add & Track
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
