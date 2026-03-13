import { Server, Folder, Code, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export type Activity = 'hosts' | 'sftp' | 'snippets';

interface ActivityBarProps {
  activeActivity: Activity;
  onActivityChange: (activity: Activity) => void;
  onSettingsClick: () => void;
}

export function ActivityBar({ activeActivity, onActivityChange, onSettingsClick }: ActivityBarProps) {
  const { t } = useTranslation();
  
  const items = [
    { id: 'hosts' as const, icon: Server, label: t('common.hosts', 'Hosts') },
    { id: 'sftp' as const, icon: Folder, label: t('common.sftp', 'SFTP') },
    { id: 'snippets' as const, icon: Code, label: t('common.snippets', 'Snippets') },
  ];

  return (
    <div className="w-12 h-full flex flex-col items-center py-2 bg-term-bg border-r border-term-selection flex-shrink-0 z-[100] relative">
        {items.map((item) => (
            <button
                key={item.id}
                onClick={() => onActivityChange(item.id)}
                className={cn(
                    "w-10 h-10 flex items-center justify-center rounded-lg mb-2 transition-all relative group",
                    activeActivity === item.id 
                        ? "text-term-blue" 
                        : "text-term-fg/40 hover:text-term-fg hover:bg-term-selection/20"
                )}
                title={item.label}
            >
                <item.icon size={22} strokeWidth={1.5} />
                {activeActivity === item.id && (
                    <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-term-blue rounded-r-full" />
                )}
            </button>
        ))}
        
        <div className="flex-1" />
        
        <button
            onClick={onSettingsClick}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-term-fg/40 hover:text-term-fg hover:bg-term-selection/20 transition-colors mb-2"
            title={t('common.settings', 'Settings')}
        >
            <Settings size={22} strokeWidth={1.5} />
        </button>
    </div>
  );
}
