import React, { useState, useEffect } from 'react';
import type { Addon } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { X, Link2, Globe, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { GithubIcon } from './GithubIcon';

interface Props {
  isOpen: boolean;
  addon: Addon | null;
  onClose: () => void;
  onUpdateAddon: (updated: Addon) => void;
  showToast: (msg: string) => void;
}

export const LinkSourceModal: React.FC<Props> = ({
  isOpen,
  addon,
  onClose,
  onUpdateAddon,
  showToast,
}) => {
  const [source, setSource] = useState<'github' | 'wago' | 'tukui'>('github');
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (addon) {
      setError(null);
      if (addon.source === 'github') {
        setSource('github');
        setTarget(addon.repo || '');
      } else if (addon.source === 'tukui') {
        setSource('tukui');
        setTarget(addon.id.replace('tukui:', ''));
      } else if (addon.source === 'wago') {
        setSource('wago');
        setTarget(addon.wago_slug || '');
      } else {
        // Default suggestion based on folder name or clean name
        const cleanName = addon.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        setSource('github');
        setTarget(cleanName);
      }
    }
  }, [addon, isOpen]);

  if (!isOpen || !addon) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) {
      setError('Please enter a valid repository, slug, or URL.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const updated = await invoke<Addon>('link_addon_source', {
        addonId: addon.id,
        source,
        target: target.trim(),
      });

      onUpdateAddon(updated);
      showToast(`Linked "${addon.name}" to ${source.toUpperCase()} successfully! 🔗`);
      onClose();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Failed to link addon source.');
    } finally {
      setLoading(false);
    }
  };

  const getPlaceholder = () => {
    switch (source) {
      case 'github':
        return 'e.g. WeakAuras/WeakAuras2 or https://github.com/...';
      case 'wago':
        return 'e.g. details or https://addons.wago.io/addons/details';
      case 'tukui':
        return 'e.g. elvui or elvui-extra';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-[#161922] border border-[#2b3347] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#242b3d]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Link2 size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Link Remote Source</h3>
              <p className="text-[11px] text-slate-400 truncate max-w-xs">{addon.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#202534] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Attach an online source to this addon so WoW Addon Vault can check for updates, show version history, and update files automatically.
          </p>

          {/* Source Selection Tabs */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2">
              Select Provider
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSource('github');
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  source === 'github'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/60 shadow-sm shadow-purple-500/20'
                    : 'bg-[#0d0f15] text-slate-400 border-[#262c3d] hover:text-white hover:border-slate-600'
                }`}
              >
                <GithubIcon size={14} />
                GitHub
              </button>

              <button
                type="button"
                onClick={() => {
                  setSource('wago');
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  source === 'wago'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-sm shadow-cyan-500/20'
                    : 'bg-[#0d0f15] text-slate-400 border-[#262c3d] hover:text-white hover:border-slate-600'
                }`}
              >
                <Globe size={14} />
                Wago.io
              </button>

              <button
                type="button"
                onClick={() => {
                  setSource('tukui');
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  source === 'tukui'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-sm shadow-amber-500/20'
                    : 'bg-[#0d0f15] text-slate-400 border-[#262c3d] hover:text-white hover:border-slate-600'
                }`}
              >
                <CheckCircle2 size={14} />
                Tukui / ElvUI
              </button>
            </div>
          </div>

          {/* Target Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {source === 'github'
                ? 'GitHub Repository (owner/repo or URL)'
                : source === 'wago'
                ? 'Wago Addon Slug or URL'
                : 'Tukui Slug (e.g. elvui)'}
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                if (error) setError(null);
              }}
              placeholder={getPlaceholder()}
              className="w-full bg-[#0d0f15] border border-[#262c3d] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 animate-in fade-in duration-100">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#242b3d]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-[#1a1e29] hover:bg-[#202534] rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !target.trim()}
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-cyan-400/20 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  <Link2 size={14} />
                  Save & Link Source
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
