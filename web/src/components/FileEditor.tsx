/* eslint-disable react-hooks/exhaustive-deps */
import React, { useRef, useCallback, useEffect } from 'react';
import Editor, { OnMount, Monaco } from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/Toast';
import { ITheme } from 'xterm';
import { X } from 'lucide-react';

interface FileEditorProps {
  tabId: string;
  filePath: string | null;
  theme?: ITheme;
  onClose?: () => void;
}

export function FileEditor({ tabId, filePath, theme, onClose }: FileEditorProps) {
  const { t } = useTranslation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef = useRef<any>(null);
  const [content, setContent] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasChanges, setHasChanges] = React.useState(false);
  const { showToast } = useToast();

  React.useEffect(() => {
    if (filePath) {
      loadFile(filePath);
    }
  }, [filePath]);

  const loadFile = async (path: string) => {
    console.log('[FileEditor] Loading file:', path, 'TabID:', tabId);
    setIsLoading(true);
    setError(null);
    try {
      const fileContent = await invoke<string>('sftp_read_file', { tabId, path });
      console.log('[FileEditor] File loaded, length:', fileContent.length);
      setContent(fileContent);
      setHasChanges(false);
    } catch (err) {
      console.error('[FileEditor] Load failed:', err);
      const msg = t('file.load_failed', { error: `${err}` });
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const saveFile = async () => {
    if (!filePath) return;

    setError(null);
    try {
      await invoke('sftp_write_file', { tabId, path: filePath, content });
      setHasChanges(false);
      showToast(t('file.save_success'), 'success');
    } catch (err) {
      const msg = t('file.save_failed', { error: `${err}` });
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    console.log('[FileEditor] Editor mounted');
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.updateOptions({
      minimap: { enabled: false },
      fontSize: 14,
      wordWrap: 'on',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      padding: { top: 16, bottom: 16 },
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true,
      },
    });

    if (theme) {
      applyMonacoTheme(monaco, theme);
    }

    if (filePath) {
      const ext = filePath.split('.').pop()?.toLowerCase();
      const languageMap: Record<string, string> = {
        js: 'javascript', jsx: 'javascript',
        ts: 'typescript', tsx: 'typescript',
        py: 'python', rb: 'ruby', rs: 'rust',
        go: 'go', java: 'java',
        c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
        cs: 'csharp', php: 'php',
        html: 'html', css: 'css', scss: 'scss',
        json: 'json', xml: 'xml',
        yaml: 'yaml', yml: 'yaml',
        md: 'markdown',
        sh: 'shell', bash: 'shell',
        sql: 'sql',
      };
      const language = languageMap[ext || ''] || 'plaintext';
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, language);
      }
    }
  }, [filePath, theme]);

  const applyMonacoTheme = (monaco: Monaco, theme: ITheme) => {
    monaco.editor.defineTheme('dynamic-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: (theme.foreground || '#ffffff').replace('#', '') },
        { token: 'variable', foreground: (theme.cyan || '#00ffff').replace('#', '') },
        { token: 'keyword', foreground: (theme.magenta || '#ff00ff').replace('#', '') },
        { token: 'string', foreground: (theme.green || '#00ff00').replace('#', '') },
        { token: 'comment', foreground: (theme.brightBlack || '#808080').replace('#', '') },
        { token: 'number', foreground: (theme.yellow || '#ffff00').replace('#', '') },
        { token: 'type', foreground: (theme.blue || '#0000ff').replace('#', '') },
      ],
      colors: {
        'editor.background': theme.background || '#1e1e1e',
        'editor.foreground': theme.foreground || '#d4d4d4',
        'editorCursor.foreground': theme.cursor || '#ffffff',
        'editor.selectionBackground': theme.selectionBackground || theme.cursor || '#264f78',
        'editor.lineHighlightBackground': theme.background || '#1e1e1e', // or slightly lighter
      }
    });
    monaco.editor.setTheme('dynamic-theme');
  };

  useEffect(() => {
    if (monacoRef.current && theme) {
      applyMonacoTheme(monacoRef.current, theme);
    }
  }, [theme]);

  const handleChange = useCallback((value: string | undefined) => {
    setContent(value || '');
    setHasChanges(true);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && filePath) {
          saveFile();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filePath, content, hasChanges, saveFile]);

  if (!filePath) {
    return (
      <div className="flex-1 flex items-center justify-center bg-term-bg h-full">
        <div className="text-center text-term-fg opacity-50">
          <p className="text-lg mb-2">{t('file.no_file_selected')}</p>
          <p className="text-sm">{t('file.select_tip')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-term-bg overflow-hidden h-full w-full relative">
      {filePath && (
        <div className="h-9 flex items-center justify-between px-4 border-b border-term-selection bg-term-bg shrink-0">
          <span className="text-sm text-term-fg truncate opacity-80">{filePath}</span>
          <div className="flex items-center gap-2">
            {hasChanges && <span className="text-xs text-term-yellow">{t('common.saving')}...</span>}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-term-selection rounded transition-colors"
                title={t('common.close')}
              >
                <X className="w-4 h-4 text-term-fg" />
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-hidden relative">
        {isLoading ? (
          <div className="h-full w-full flex items-center justify-center text-term-fg opacity-60 absolute inset-0 z-10 bg-term-bg">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-term-selection border-t-term-fg rounded-full animate-spin mx-auto mb-4" />
              <p>{t('file.loading')}</p>
            </div>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-term-red">
            <div className="text-center">
              <p className="text-lg mb-2">{t('common.error')}</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        ) : (
          <div className="h-full w-full absolute inset-0">
             <Editor
              height="100%"
              width="100%"
              defaultLanguage="plaintext"
              value={content}
              onChange={handleChange}
              onMount={handleEditorMount}
              theme={theme ? "dynamic-theme" : "vs-dark"}
              options={{
                fixedOverflowWidgets: true
              }}
              loading={
                <div className="h-full flex items-center justify-center text-term-fg opacity-60">
                  {t('file.loading_editor')}
                </div>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
