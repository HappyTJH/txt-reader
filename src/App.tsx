import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Minus, Plus, Upload } from 'lucide-react';

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
  scrollTop: number;
  progress: number;
  updatedAt: number;
}

type Encoding = 'UTF-8' | 'GBK';

const DB_NAME = 'txt-reader-library';
const DB_VERSION = 1;
const BOOK_STORE = 'books';
const LAST_BOOK_KEY = 'txt-reader-last-book-id';
const SETTINGS_KEY = 'txt-reader-settings-v2';

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 19,
  lineHeight: 1.85,
};

const getBookId = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

const openLibrary = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOK_STORE)) {
        db.createObjectStore(BOOK_STORE, { keyPath: 'id' });
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

const readTextFile = (file: File, encoding: Encoding) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, encoding);
  });

export default function App() {
  const [content, setContent] = useState('');
  const [bookMeta, setBookMeta] = useState<BookMeta | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [encoding, setEncoding] = useState<Encoding>('UTF-8');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('选择一个 TXT 文件开始阅读');

  const readerRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentBookRef = useRef<SavedBook | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (!savedSettings) return;

    try {
      setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
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
        pendingScrollTopRef.current = savedBook.scrollTop;
        setBookMeta({
          id: savedBook.id,
          name: savedBook.name,
          size: savedBook.size,
          lastModified: savedBook.lastModified,
        });
        setContent(savedBook.content);
        setProgress(savedBook.progress);
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

  useEffect(() => {
    if (!content || pendingScrollTopRef.current === null) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: pendingScrollTopRef.current ?? 0 });
        pendingScrollTopRef.current = null;
      });
    });
  }, [content, settings.fontSize, settings.lineHeight]);

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

  const saveProgress = useCallback((scrollTop: number, nextProgress: number) => {
    const currentBook = currentBookRef.current;
    if (!currentBook) return;

    const nextBook = {
      ...currentBook,
      scrollTop,
      progress: nextProgress,
      updatedAt: Date.now(),
    };

    currentBookRef.current = nextBook;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      writeToStore(nextBook).catch(() => {
        setStatus('进度保存失败，请稍后重试');
      });
    }, 250);
  }, []);

  const calculateProgress = useCallback(() => {
    if (pendingScrollTopRef.current !== null) return;

    const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
    const nextProgress = documentHeight <= 0 ? 100 : Math.min(100, Math.max(0, (window.scrollY / documentHeight) * 100));

    setProgress(nextProgress);
    saveProgress(window.scrollY, nextProgress);
  }, [saveProgress]);

  useEffect(() => {
    if (!content) return undefined;

    calculateProgress();
    window.addEventListener('scroll', calculateProgress, { passive: true });
    window.addEventListener('resize', calculateProgress);

    return () => {
      window.removeEventListener('scroll', calculateProgress);
      window.removeEventListener('resize', calculateProgress);
    };
  }, [calculateProgress, content]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus('正在读取 TXT...');

    try {
      const text = await readTextFile(file, encoding);
      const meta = {
        id: getBookId(file),
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      };

      const previousBook = await readFromStore<SavedBook>(meta.id);
      const savedBook: SavedBook = {
        ...meta,
        content: text,
        scrollTop: previousBook?.scrollTop ?? 0,
        progress: previousBook?.progress ?? 0,
        updatedAt: Date.now(),
      };

      await writeToStore(savedBook);
      localStorage.setItem(LAST_BOOK_KEY, meta.id);
      currentBookRef.current = savedBook;
      pendingScrollTopRef.current = savedBook.scrollTop;

      setBookMeta(meta);
      setContent(text);
      setProgress(savedBook.progress);
      setStatus(previousBook ? `已载入，并恢复到 ${savedBook.progress.toFixed(1)}%` : '已载入，从开头开始');
    } catch {
      setStatus('读取失败，请确认这是可读取的 TXT 文件');
    } finally {
      event.target.value = '';
    }
  };

  const adjustFontSize = (delta: number) => {
    setSettings((current) => ({
      ...current,
      fontSize: Math.min(28, Math.max(15, current.fontSize + delta)),
    }));
  };

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#191816]">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-[#fbfaf7]/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <BookOpen className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-medium">
              {bookMeta?.name ?? '极简 TXT 阅读器'}
            </h1>
            <p className="truncate text-xs text-black/50">
              {bookMeta ? `${formattedSize} · ${progress.toFixed(1)}%` : status}
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
            value={encoding}
            onChange={(event) => setEncoding(event.target.value as Encoding)}
            className="h-9 rounded-md border border-black/10 bg-transparent px-2 text-xs outline-none transition focus:border-black/30"
          >
            <option value="UTF-8">UTF-8</option>
            <option value="GBK">GBK</option>
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
            <div className="h-px bg-[#191816]" style={{ width: `${progress}%` }} />
          </div>
        )}
      </header>

      <main ref={readerRef} className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        {content ? (
          <article
            className="mx-auto max-w-3xl whitespace-pre-wrap break-words text-justify"
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              fontFamily: '"Noto Serif SC", "Songti SC", SimSun, Georgia, serif',
            }}
          >
            {content}
          </article>
        ) : (
          <section className="flex min-h-[70vh] items-center justify-center">
            <div className="w-full max-w-sm text-center">
              <p className="mb-6 text-sm leading-7 text-black/60">
                上传一本 TXT。内容会保存在此浏览器本地，下次打开自动回到上次阅读的位置。
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
