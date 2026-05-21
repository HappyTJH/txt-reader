import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {BookOpen, ChevronLeft, ChevronRight, Minus, Plus, Upload} from 'lucide-react';

interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
}

interface BookMeta {
  id: string;
  name: string;
  size: number;
  lastModified: number;
}

interface SavedBook extends BookMeta {
  content: string;
  pageIndex?: number;
  progress: number;
  detectedEncoding?: DisplayEncoding;
  updatedAt: number;
}

interface SavedProgress {
  pageIndex: number;
  progress: number;
  updatedAt: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

type EncodingMode = 'auto' | 'utf-8' | 'gb18030' | 'gbk' | 'utf-16le' | 'utf-16be';
type DisplayEncoding = 'UTF-8' | 'GB18030' | 'GBK' | 'UTF-16LE' | 'UTF-16BE';

const DB_NAME = 'txt-reader-library';
const DB_VERSION = 1;
const BOOK_STORE = 'books';
const LAST_BOOK_KEY = 'txt-reader-last-book-id';
const SETTINGS_KEY = 'txt-reader-settings-v3';
const PROGRESS_PREFIX = 'txt-reader-progress-v1';

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 19,
  lineHeight: 1.85,
};

const ENCODING_LABELS: Record<Exclude<EncodingMode, 'auto'>, DisplayEncoding> = {
  'utf-8': 'UTF-8',
  gb18030: 'GB18030',
  gbk: 'GBK',
  'utf-16le': 'UTF-16LE',
  'utf-16be': 'UTF-16BE',
};

const getBookId = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

const openLibrary = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOK_STORE)) {
        db.createObjectStore(BOOK_STORE, {keyPath: 'id'});
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readFromStore = async <T,>(id: string) => {
  const db = await openLibrary();

  return new Promise<T | null>((resolve, reject) => {
    const transaction = db.transaction(BOOK_STORE, 'readonly');
    const request = transaction.objectStore(BOOK_STORE).get(id);

    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
};

const writeToStore = async (book: SavedBook) => {
  const db = await openLibrary();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(BOOK_STORE, 'readwrite');
    transaction.objectStore(BOOK_STORE).put(book);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

const decodeBuffer = (buffer: ArrayBuffer, encoding: Exclude<EncodingMode, 'auto'>) =>
  new TextDecoder(encoding, {fatal: encoding === 'utf-8'}).decode(buffer);

const scoreDecodedText = (text: string) => {
  const replacementCount = (text.match(/\uFFFD/g) ?? []).length;
  const controlCount = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  const cjkCount = (text.match(/[\u4E00-\u9FFF]/g) ?? []).length;
  const latinCount = (text.match(/[A-Za-z0-9]/g) ?? []).length;

  return replacementCount * 1000 + controlCount * 80 - cjkCount * 2 - latinCount * 0.1;
};

const detectTextEncoding = (buffer: ArrayBuffer): Exclude<EncodingMode, 'auto'> => {
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';

  let evenNulls = 0;
  let oddNulls = 0;
  const sampleLength = Math.min(bytes.length, 4096);
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] === 0) {
      if (index % 2 === 0) evenNulls += 1;
      else oddNulls += 1;
    }
  }

  if (oddNulls > sampleLength * 0.15) return 'utf-16le';
  if (evenNulls > sampleLength * 0.15) return 'utf-16be';

  const candidates: Array<Exclude<EncodingMode, 'auto'>> = ['utf-8', 'gb18030', 'gbk'];
  const decoded = candidates.map((encoding) => {
    try {
      const text = decodeBuffer(buffer, encoding);
      return {encoding, score: scoreDecodedText(text.slice(0, 12000))};
    } catch {
      return {encoding, score: Number.POSITIVE_INFINITY};
    }
  });

  decoded.sort((left, right) => left.score - right.score);
  return decoded[0]?.encoding ?? 'utf-8';
};

const readTextFile = async (file: File, mode: EncodingMode) => {
  const buffer = await file.arrayBuffer();
  const encoding = mode === 'auto' ? detectTextEncoding(buffer) : mode;
  return {
    text: decodeBuffer(buffer, encoding),
    detectedEncoding: ENCODING_LABELS[encoding],
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getProgressKey = (bookId: string) => `${PROGRESS_PREFIX}:${bookId}`;

const readSavedProgress = (bookId: string) => {
  const rawProgress = localStorage.getItem(getProgressKey(bookId));
  if (!rawProgress) return null;

  try {
    return JSON.parse(rawProgress) as SavedProgress;
  } catch {
    localStorage.removeItem(getProgressKey(bookId));
    return null;
  }
};

const saveSavedProgress = (bookId: string, pageIndex: number, pageCount: number) => {
  const progress = pageCount <= 1 ? 100 : (pageIndex / (pageCount - 1)) * 100;
  const savedProgress: SavedProgress = {
    pageIndex,
    progress,
    updatedAt: Date.now(),
  };

  localStorage.setItem(getProgressKey(bookId), JSON.stringify(savedProgress));
};

const paginateText = (text: string, viewport: ViewportSize, settings: ReaderSettings) => {
  if (!text) return [];
  if (viewport.width <= 0 || viewport.height <= 0) return [text.slice(0, 5000)];

  const lineHeightPx = settings.fontSize * settings.lineHeight;
  const lineCount = Math.max(6, Math.floor(viewport.height / lineHeightPx));
  const charsPerLine = Math.max(12, Math.floor(viewport.width / (settings.fontSize * 1.02)));
  const linesPerPage = Math.max(4, lineCount - 1);
  const pages: string[] = [];
  let lines: string[] = [];

  const pushPage = () => {
    pages.push(lines.join('\n'));
    lines = [];
  };

  const pushLine = (line: string) => {
    lines.push(line);
    if (lines.length >= linesPerPage) {
      pushPage();
    }
  };

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!rawLine) {
      pushLine('');
      continue;
    }

    for (let start = 0; start < rawLine.length; start += charsPerLine) {
      pushLine(rawLine.slice(start, start + charsPerLine));
    }
  }

  if (lines.length > 0 || pages.length === 0) {
    pushPage();
  }

  return pages;
};

export default function App() {
  const [content, setContent] = useState('');
  const [bookMeta, setBookMeta] = useState<BookMeta | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [encodingMode, setEncodingMode] = useState<EncodingMode>('auto');
  const [detectedEncoding, setDetectedEncoding] = useState<DisplayEncoding | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({width: 0, height: 0});
  const [status, setStatus] = useState('选择一个 TXT 文件开始阅读');

  const pageViewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentFileRef = useRef<File | null>(null);
  const currentBookRef = useRef<SavedBook | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const pages = useMemo(() => paginateText(content, viewportSize, settings), [content, settings, viewportSize]);
  const pageCount = Math.max(1, pages.length);
  const currentPage = pages[clamp(pageIndex, 0, pageCount - 1)] ?? '';

  const progress = useMemo(() => {
    if (!content) return 0;
    if (pageCount <= 1) return 100;
    return (pageIndex / (pageCount - 1)) * 100;
  }, [content, pageCount, pageIndex]);

  const visiblePageIndex = clamp(pageIndex, 0, pageCount - 1);
  const pageLabel = content ? `${visiblePageIndex + 1} / ${pageCount}` : '0 / 0';

  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (!savedSettings) return;

    try {
      setSettings({...DEFAULT_SETTINGS, ...JSON.parse(savedSettings)});
    } catch {
      localStorage.removeItem(SETTINGS_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    const restoreLastBook = async () => {
      const lastBookId = localStorage.getItem(LAST_BOOK_KEY);
      if (!lastBookId) return;

      try {
        const savedBook = await readFromStore<SavedBook>(lastBookId);
        if (!savedBook || cancelled) return;

        currentBookRef.current = savedBook;
        setBookMeta({
          id: savedBook.id,
          name: savedBook.name,
          size: savedBook.size,
          lastModified: savedBook.lastModified,
        });
        const savedProgress = readSavedProgress(savedBook.id);
        setContent(savedBook.content);
        setDetectedEncoding(savedBook.detectedEncoding ?? null);
        setPageIndex(savedProgress?.pageIndex ?? savedBook.pageIndex ?? 0);
        setStatus(`已恢复：${savedBook.name}`);
      } catch {
        if (!cancelled) {
          setStatus('未能恢复上次阅读，可以重新上传 TXT');
        }
      }
    };

    restoreLastBook();

    return () => {
      cancelled = true;
    };
  }, []);

  const measureViewport = useCallback(() => {
    const viewport = pageViewportRef.current;
    if (!viewport) return;

    setViewportSize({
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(measureViewport);
    return () => window.cancelAnimationFrame(frame);
  }, [measureViewport]);

  useEffect(() => {
    const viewport = pageViewportRef.current;
    if (!viewport) return undefined;

    const observer = new ResizeObserver(() => measureViewport());
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [measureViewport]);

  useEffect(() => {
    setPageIndex((current) => clamp(current, 0, pageCount - 1));
  }, [pageCount]);

  const saveProgress = useCallback((nextPageIndex: number, nextPageCount: number) => {
    const currentBook = currentBookRef.current;
    if (!currentBook) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      try {
        saveSavedProgress(currentBook.id, nextPageIndex, nextPageCount);
      } catch {
        setStatus('进度保存失败，请稍后重试');
      }
    }, 250);
  }, []);

  useEffect(() => {
    if (!content || viewportSize.width <= 0 || viewportSize.height <= 0) return;

    saveProgress(pageIndex, pageCount);
  }, [content, pageCount, pageIndex, saveProgress, viewportSize]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const formattedSize = useMemo(() => {
    if (!bookMeta) return '';
    if (bookMeta.size < 1024 * 1024) return `${Math.max(1, Math.round(bookMeta.size / 1024))} KB`;
    return `${(bookMeta.size / 1024 / 1024).toFixed(1)} MB`;
  }, [bookMeta]);

  const loadFile = async (file: File, mode: EncodingMode, keepPage = true) => {
    setStatus('正在读取 TXT...');

    try {
      const {text, detectedEncoding: nextDetectedEncoding} = await readTextFile(file, mode);
      const meta = {
        id: getBookId(file),
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      };

      const previousBook = await readFromStore<SavedBook>(meta.id);
      const previousProgress = readSavedProgress(meta.id);
      const nextPageIndex = keepPage ? previousProgress?.pageIndex ?? previousBook?.pageIndex ?? 0 : 0;
      const savedBook: SavedBook = {
        ...meta,
        content: text,
        pageIndex: nextPageIndex,
        progress: previousProgress?.progress ?? previousBook?.progress ?? 0,
        detectedEncoding: nextDetectedEncoding,
        updatedAt: Date.now(),
      };

      await writeToStore(savedBook);
      localStorage.setItem(LAST_BOOK_KEY, meta.id);
      currentBookRef.current = savedBook;
      currentFileRef.current = file;

      setBookMeta(meta);
      setContent(text);
      setDetectedEncoding(nextDetectedEncoding);
      setPageIndex(nextPageIndex);
      setStatus(`已载入，编码：${nextDetectedEncoding}`);
    } catch {
      setStatus('读取失败，请尝试切换编码后重新上传');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await loadFile(file, encodingMode);
    event.target.value = '';
  };

  const handleEncodingChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextMode = event.target.value as EncodingMode;
    setEncodingMode(nextMode);

    if (currentFileRef.current) {
      await loadFile(currentFileRef.current, nextMode, false);
    } else if (content) {
      setStatus('已保存的书籍无法重新解码，请重新上传原 TXT 文件');
    }
  };

  const adjustFontSize = (delta: number) => {
    setSettings((current) => ({
      ...current,
      fontSize: clamp(current.fontSize + delta, 15, 30),
    }));
  };

  const goToPage = useCallback((nextPageIndex: number) => {
    setPageIndex(clamp(nextPageIndex, 0, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!content) return;
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goToPage(pageIndex - 1);
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        goToPage(pageIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, goToPage, pageIndex]);

  return (
    <div className="flex min-h-screen flex-col bg-[#fbfaf7] text-[#191816]">
      <header className="shrink-0 border-b border-black/10 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <BookOpen className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-medium">
              {bookMeta?.name ?? '极简 TXT 阅读器'}
            </h1>
            <p className="truncate text-xs text-black/50">
              {bookMeta
                ? `${formattedSize} · ${pageLabel} · ${progress.toFixed(1)}%${detectedEncoding ? ` · ${detectedEncoding}` : ''}`
                : status}
            </p>
          </div>

          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept=".txt,text/plain"
            onChange={handleFileUpload}
          />

          <select
            aria-label="文本编码"
            value={encodingMode}
            onChange={handleEncodingChange}
            className="h-9 rounded-md border border-black/10 bg-transparent px-2 text-xs outline-none transition focus:border-black/30"
          >
            <option value="auto">自动</option>
            <option value="utf-8">UTF-8</option>
            <option value="gb18030">GB18030</option>
            <option value="gbk">GBK</option>
            <option value="utf-16le">UTF-16LE</option>
            <option value="utf-16be">UTF-16BE</option>
          </select>

          <div className="hidden items-center rounded-md border border-black/10 sm:flex">
            <button
              type="button"
              aria-label="减小字号"
              onClick={() => adjustFontSize(-1)}
              className="grid h-9 w-9 place-items-center hover:bg-black/5"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="w-10 text-center text-xs text-black/60">{settings.fontSize}</span>
            <button
              type="button"
              aria-label="增大字号"
              onClick={() => adjustFontSize(1)}
              className="grid h-9 w-9 place-items-center hover:bg-black/5"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#191816] px-3 text-sm text-white transition hover:bg-black"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span>上传</span>
          </button>
        </div>
        {content && (
          <div className="h-px bg-black/10">
            <div className="h-px bg-[#191816]" style={{width: `${progress}%`}} />
          </div>
        )}
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6">
        {content ? (
          <section className="flex min-h-0 flex-1 flex-col">
            <div
              ref={pageViewportRef}
              className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-black/10 bg-white px-5 py-8 shadow-sm sm:px-10 md:px-14"
            >
              <article
                className="h-full whitespace-pre-wrap break-words text-justify"
                style={{
                  fontFamily: '"Noto Serif SC", "Songti SC", SimSun, Georgia, serif',
                  fontSize: `${settings.fontSize}px`,
                  lineHeight: settings.lineHeight,
                }}
              >
                {currentPage}
              </article>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => goToPage(pageIndex - 1)}
                disabled={pageIndex === 0}
                className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                上一页
              </button>

              <div className="min-w-0 flex-1 text-center">
                <div className="text-sm font-medium">{pageLabel}</div>
                <div className="mt-1 text-xs text-black/45">{status}</div>
              </div>

              <button
                type="button"
                onClick={() => goToPage(pageIndex + 1)}
                disabled={pageIndex >= pageCount - 1}
                className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : (
          <section className="flex min-h-[70vh] items-center justify-center">
            <div className="w-full max-w-sm text-center">
              <p className="mb-6 text-sm leading-7 text-black/60">
                上传一本 TXT。内容只保存在当前浏览器本地，下次打开会自动回到上次阅读的页码。
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[#191816] px-4 text-sm text-white transition hover:bg-black"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                选择 TXT
              </button>
              <p className="mt-4 text-xs text-black/40">{status}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
