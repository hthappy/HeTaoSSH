/* eslint-disable react-hooks/exhaustive-deps */
import React, { useRef, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '@/components/Toast';

interface FileEditorProps {
  tabId: string;
  filePath: string | null;
}

export function FileEditor({ tabId, filePath }: FileEditorProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
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
    setIsLoading(true);
    setError(null);
    try {
      const fileContent = await invoke<string>('sftp_read_file', { tabId, path });
      setContent(fileContent);
      setHasChanges(false);
    } catch (err) {
      const msg = `Failed to load file: ${err}`;
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
      showToast('File saved successfully', 'success');
    } catch (err) {
      const msg = `Failed to save file: ${err}`;
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

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
  }, [filePath]);

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
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-center text-zinc-500">
          <p className="text-lg mb-2">No file selected</p>
          <p className="text-sm">Select a file from the tree to edit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-950 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-zinc-400">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-zinc-600 border-t-zinc-300 rounded-full animate-spin mx-auto mb-4" />
              <p>Loading file...</p>
            </div>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-red-400">
            <div className="text-center">
              <p className="text-lg mb-2">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        ) : (
          <Editor
            height="100%"
            defaultLanguage="plaintext"
            value={content}
            onChange={handleChange}
            onMount={handleEditorMount}
            theme="vs-dark"
            loading={
              <div className="h-full flex items-center justify-center text-zinc-400">
                Loading editor...
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
