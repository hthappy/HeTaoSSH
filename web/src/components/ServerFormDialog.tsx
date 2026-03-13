import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServerConfig } from '@/types/config';

interface ServerFormDialogProps {
  server: ServerConfig | null;
  onClose: () => void;
  onSave: (config: ServerConfig) => Promise<void>;
}

export function ServerFormDialog({ server, onClose, onSave }: ServerFormDialogProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ServerConfig>(
    server ?? {
      name: '',
      host: '',
      port: 22,
      username: '',
      password: '',
      private_key_path: '',
      passphrase: '',
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
    } catch (e) {
        console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-term-bg rounded-lg border border-term-selection w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-term-fg mb-4">
          {server ? t('server.edit') : t('server.add')}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-term-fg/60 mb-1">{t('server.name')}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue placeholder-term-fg/20"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm text-term-fg/60 mb-1">{t('server.host')}</label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue placeholder-term-fg/20"
                placeholder="example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-term-fg/60 mb-1">{t('server.port')}</label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue placeholder-term-fg/20"
                min={1}
                max={65535}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-term-fg/60 mb-1">{t('server.username')}</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue placeholder-term-fg/20"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-term-fg/60 mb-1">{t('server.password_optional')}</label>
            <input
              type="password"
              value={formData.password || ''}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue placeholder-term-fg/20"
              placeholder={t('server.password_placeholder')}
            />
          </div>

          <div>
            <label className="block text-sm text-term-fg/60 mb-1">{t('server.private_key_path')}</label>
            <input
              type="text"
              value={formData.private_key_path || ''}
              onChange={(e) => setFormData({ ...formData, private_key_path: e.target.value })}
              className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue placeholder-term-fg/20"
              placeholder="~/.ssh/id_ed25519"
            />
          </div>

          <div>
            <label className="block text-sm text-term-fg/60 mb-1">{t('server.passphrase')}</label>
            <input
              type="password"
              value={formData.passphrase || ''}
              onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })}
              className="w-full bg-term-selection border border-term-selection rounded-md px-3 py-2 text-term-fg focus:outline-none focus:ring-2 focus:ring-term-blue placeholder-term-fg/20"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-term-selection hover:bg-term-selection/80 rounded-md text-term-fg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-term-blue hover:bg-term-blue/80 disabled:bg-term-blue/50 rounded-md text-term-bg font-medium transition-colors"
            >
              {saving ? t('common.saving') : server ? t('common.update') : t('common.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
