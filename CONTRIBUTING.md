# Contributing

Thanks for helping improve TXT Reader.

## Local Setup

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm test
```

## Development Notes

- Keep the reader local-first. Do not add network upload or analytics behavior
  without a clear privacy discussion.
- Preserve support for Chinese legacy encodings when touching file loading.
- Prefer small, focused pull requests.
- Keep UI text concise and accessible.

## Pull Requests

Please include:

- A short description of the user-facing change
- Screenshots or screen recordings for visible UI changes
- Notes about manual testing, especially with UTF-8 and GBK/GB18030 files
