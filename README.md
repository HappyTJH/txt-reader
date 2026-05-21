# TXT Reader

TXT Reader is a lightweight, local-first browser reader for plain text books.
It is designed for Chinese and English `.txt` files, including common legacy
Chinese encodings such as GBK and GB18030.

The app runs entirely in the browser. Uploaded books are not sent to a server;
content and reading progress are stored locally in the current browser.

## Features

- Local `.txt` upload with no server-side processing
- Automatic encoding detection with manual UTF-8, GB18030, GBK, UTF-16LE, and
  UTF-16BE options
- Paged and scrolling reading modes
- Adjustable reading font size
- Local bookshelf backed by IndexedDB
- Automatic restoration of the last opened book and reading progress
- Static deployment through GitHub Pages

## Demo

When GitHub Pages is enabled for this repository, the app is available at:

<https://happytjh.github.io/txt-reader/>

## Requirements

- Node.js LTS
- npm

```bash
npm install
npm run dev
```

The dev server defaults to port `3000`.

## Quality Checks

```bash
npm run lint
npm run build
npm test
```

`npm test` currently runs the same checks expected by CI: TypeScript validation
and a production build.

## Privacy

TXT Reader is local-first:

- File contents are read by the browser with the File API.
- Books are stored in IndexedDB in the same browser profile.
- Reading settings and progress are stored in `localStorage`.
- No file content is uploaded by the app.

Clearing site data in the browser will remove saved books and progress.

## Deployment

The repository includes GitHub Actions workflows for CI and GitHub Pages
deployment. The deployment workflow builds the Vite app and publishes `dist/`
when changes are pushed to `main`.

The Vite `base` path is configured as `/txt-reader/` for GitHub Pages. If you
fork this project under another repository name, update `base` in
`vite.config.ts`.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
before opening a larger change.

Project changes are tracked in [CHANGELOG.md](CHANGELOG.md). Community behavior
expectations are described in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

MIT. See [LICENSE](LICENSE).
