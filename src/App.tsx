import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Moon, Sun, Type, BookOpen, Settings2, Coffee, ChevronUp } from 'lucide-react';

interface ReaderSettings {
  fontSize: number;
  theme: 'light' | 'dark' | 'sepia';
  fontFamily: 'sans' | 'serif' | 'mono';
  lineHeight: number;
  encoding: 'UTF-8' | 'GBK';
}

interface FileMeta {
  name: string;
  size: number;
  lastModified: number;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  theme: 'light',
  fontFamily: 'serif',
  lineHeight: 1.8,
  encoding: 'UTF-8',
};

export default function App() {
  const [content, setContent] = useState<string>('');
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<number>(0);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('txt-reader-settings');
    if (savedSettings) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
      } catch (e) {
        console.error('Failed to parse settings', e);
      }
    }
  }, []);

  // Save settings when they change
  useEffect(() => {
    localStorage.setItem('txt-reader-settings', JSON.stringify(settings));
  }, [settings]);

  // Restore scroll position when content loads
  useEffect(() => {
    if (fileMeta && content && scrollContainerRef.current) {
      const savedPosition = localStorage.getItem(`txt-reader-pos-${fileMeta.name}-${fileMeta.size}`);
      if (savedPosition) {
        // Small delay to ensure rendering is complete before scrolling
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = parseFloat(savedPosition);
            updateProgress(scrollContainerRef.current);
          }
        }, 100);
      } else {
        scrollContainerRef.current.scrollTop = 0;
        setProgress(0);
      }
    }
  }, [fileMeta, content]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCurrentFile(file);
    setShowSettings(false);
  };

  // Read file when currentFile or encoding changes
  useEffect(() => {
    if (!currentFile) return;
    
    setIsLoading(true);
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setContent(text);
      setFileMeta({
        name: currentFile.name,
        size: currentFile.size,
        lastModified: currentFile.lastModified,
      });
      setIsLoading(false);
    };

    reader.onerror = () => {
      alert('Failed to read file');
      setIsLoading(false);
    };

    reader.readAsText(currentFile, settings.encoding);
  }, [currentFile, settings.encoding]);

  const updateProgress = (target: HTMLDivElement) => {
    const { scrollTop, scrollHeight, clientHeight } = target;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 0) {
      setProgress(100);
      return;
    }
    const currentProgress = (scrollTop / maxScroll) * 100;
    setProgress(Math.min(100, Math.max(0, currentProgress)));
  };

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!fileMeta) return;
    
    const target = e.target as HTMLDivElement;
    updateProgress(target);
    
    // Save position
    localStorage.setItem(
      `txt-reader-pos-${fileMeta.name}-${fileMeta.size}`,
      target.scrollTop.toString()
    );
  }, [fileMeta]);

  const getThemeClasses = () => {
    switch (settings.theme) {
      case 'dark':
        return 'bg-gray-900 text-gray-300';
      case 'sepia':
        return 'bg-[#f4ecd8] text-[#5b4636]';
      default:
        return 'bg-gray-50 text-gray-900';
    }
  };

  const getFontClasses = () => {
    switch (settings.fontFamily) {
      case 'sans': return 'font-sans';
      case 'mono': return 'font-mono';
      default: return 'font-serif';
    }
  };

  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className={`h-screen w-full flex flex-col transition-colors duration-300 ${getThemeClasses()}`}>
      {/* Header */}
      <header className={`shrink-0 border-b px-4 py-3 flex items-center justify-between z-10 shadow-sm
        ${settings.theme === 'dark' ? 'border-gray-800 bg-gray-900/95' : 
          settings.theme === 'sepia' ? 'border-[#e4dcc8] bg-[#f4ecd8]/95' : 
          'border-gray-200 bg-white/95'} backdrop-blur-sm`}
      >
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6" />
          <h1 className="font-semibold text-lg hidden sm:block truncate max-w-[200px] md:max-w-md">
            {fileMeta ? fileMeta.name : 'TXT Reader'}
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <input
            type="file"
            accept=".txt"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${settings.theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 
                settings.theme === 'sepia' ? 'bg-[#e8dfc8] hover:bg-[#dcd1b4]' : 
                'bg-gray-100 hover:bg-gray-200'}`}
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Open File</span>
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors
              ${settings.theme === 'dark' ? 'hover:bg-gray-800' : 
                settings.theme === 'sepia' ? 'hover:bg-[#e8dfc8]' : 
                'hover:bg-gray-100'}`}
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className={`absolute top-16 right-4 sm:right-8 w-72 rounded-xl shadow-xl border p-4 z-20 transition-all
          ${settings.theme === 'dark' ? 'bg-gray-800 border-gray-700' : 
            settings.theme === 'sepia' ? 'bg-[#fdf6e3] border-[#e4dcc8]' : 
            'bg-white border-gray-200'}`}
        >
          <div className="space-y-6">
            {/* Theme */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Theme</label>
              <div className="flex gap-2">
                <button onClick={() => setSettings({ ...settings, theme: 'light' })} className={`flex-1 py-2 flex justify-center rounded-lg border ${settings.theme === 'light' ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'} bg-white text-gray-900`} title="Light"><Sun className="w-4 h-4" /></button>
                <button onClick={() => setSettings({ ...settings, theme: 'sepia' })} className={`flex-1 py-2 flex justify-center rounded-lg border ${settings.theme === 'sepia' ? 'border-amber-600 ring-1 ring-amber-600' : 'border-[#e4dcc8]'} bg-[#f4ecd8] text-[#5b4636]`} title="Sepia"><Coffee className="w-4 h-4" /></button>
                <button onClick={() => setSettings({ ...settings, theme: 'dark' })} className={`flex-1 py-2 flex justify-center rounded-lg border ${settings.theme === 'dark' ? 'border-blue-400 ring-1 ring-blue-400' : 'border-gray-700'} bg-gray-900 text-gray-100`} title="Dark"><Moon className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Encoding */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Text Encoding</label>
              <div className="flex gap-2">
                <button onClick={() => setSettings({ ...settings, encoding: 'UTF-8' })} className={`flex-1 py-1.5 rounded-lg text-sm ${settings.encoding === 'UTF-8' ? 'bg-blue-500 text-white' : 'bg-transparent border opacity-70 hover:opacity-100'}`}>UTF-8</button>
                <button onClick={() => setSettings({ ...settings, encoding: 'GBK' })} className={`flex-1 py-1.5 rounded-lg text-sm ${settings.encoding === 'GBK' ? 'bg-blue-500 text-white' : 'bg-transparent border opacity-70 hover:opacity-100'}`}>GBK</button>
              </div>
              <p className="text-[10px] opacity-50 leading-tight">Switch to GBK if Chinese characters appear garbled.</p>
            </div>

            {/* Font Family */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Font Style</label>
              <div className="flex gap-2">
                <button onClick={() => setSettings({ ...settings, fontFamily: 'sans' })} className={`flex-1 py-1.5 rounded-lg text-sm font-sans ${settings.fontFamily === 'sans' ? 'bg-blue-500 text-white' : 'bg-transparent border opacity-70 hover:opacity-100'}`}>Sans</button>
                <button onClick={() => setSettings({ ...settings, fontFamily: 'serif' })} className={`flex-1 py-1.5 rounded-lg text-sm font-serif ${settings.fontFamily === 'serif' ? 'bg-blue-500 text-white' : 'bg-transparent border opacity-70 hover:opacity-100'}`}>Serif</button>
                <button onClick={() => setSettings({ ...settings, fontFamily: 'mono' })} className={`flex-1 py-1.5 rounded-lg text-sm font-mono ${settings.fontFamily === 'mono' ? 'bg-blue-500 text-white' : 'bg-transparent border opacity-70 hover:opacity-100'}`}>Mono</button>
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Font Size</label>
                <span className="text-xs opacity-60">{settings.fontSize}px</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setSettings({ ...settings, fontSize: Math.max(12, settings.fontSize - 2) })} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"><Type className="w-4 h-4" /></button>
                <input type="range" min="12" max="36" step="1" value={settings.fontSize} onChange={(e) => setSettings({ ...settings, fontSize: parseInt(e.target.value) })} className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" />
                <button onClick={() => setSettings({ ...settings, fontSize: Math.min(36, settings.fontSize + 2) })} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"><Type className="w-5 h-5" /></button>
              </div>
            </div>
            
            {/* Line Height */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Line Spacing</label>
                <span className="text-xs opacity-60">{settings.lineHeight.toFixed(1)}</span>
              </div>
              <input type="range" min="1.2" max="2.5" step="0.1" value={settings.lineHeight} onChange={(e) => setSettings({ ...settings, lineHeight: parseFloat(e.target.value) })} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto relative scroll-smooth"
      >
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4 opacity-60">
              <BookOpen className="w-12 h-12" />
              <p>Loading book...</p>
            </div>
          </div>
        ) : content ? (
          <div className="max-w-3xl mx-auto px-6 sm:px-12 py-12 md:py-20">
            <pre 
              className={`whitespace-pre-wrap break-words ${getFontClasses()}`}
              style={{ 
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                tabSize: 4
              }}
            >
              {content}
            </pre>
            
            <div className="mt-20 pt-10 border-t border-current opacity-20 text-center pb-20">
              <p>End of Document</p>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center max-w-md opacity-60">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-current opacity-10 mb-6">
                <BookOpen className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No file selected</h2>
              <p className="mb-8">Upload a .txt file to start reading. Your progress will be automatically saved.</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                <Upload className="w-5 h-5" />
                Select TXT File
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer / Progress Bar */}
      {content && (
        <footer className={`shrink-0 border-t px-4 py-2 text-xs flex items-center justify-between z-10
          ${settings.theme === 'dark' ? 'border-gray-800 bg-gray-900' : 
            settings.theme === 'sepia' ? 'border-[#e4dcc8] bg-[#f4ecd8]' : 
            'border-gray-200 bg-white'}`}
        >
          <div className="flex-1 flex items-center gap-4">
            <div className="w-full max-w-md h-1.5 rounded-full overflow-hidden bg-black/10 dark:bg-white/10">
              <div 
                className="h-full bg-blue-500 transition-all duration-150 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-medium opacity-70 w-12 text-right">{progress.toFixed(1)}%</span>
          </div>
          
          <button 
            onClick={scrollToTop}
            className="ml-4 p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 opacity-60 hover:opacity-100 transition-all"
            title="Scroll to top"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </footer>
      )}
    </div>
  );
}
