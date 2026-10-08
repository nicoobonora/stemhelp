<p align="center">
  <img src="assets/logo.svg" alt="stemhelp" width="360" />
</p>

A minimal desktop workspace for studying STEM subjects with your course materials and an AI tutor.

stemhelp brings your syllabus, slides, study roadmap, questions, and practice tests into one place. Your course data stays on your computer; AI requests use your connected ChatGPT account.

## What it does

- **Organize subjects:** keep an official syllabus, personal description, PDFs, and text notes for each course. Paste a syllabus or import it from a public course webpage.
- **Build a study roadmap:** generate an editable topic tree from the syllabus and available materials. Review the proposal before applying it. Add more slides as the course progresses.
- **Track progress yourself:** mark individual learning objectives as studied. The AI never checks them for you.
- **Study alongside your slides:** view PDFs and chat side by side, resize the panels by dragging the divider, and follow source links back to their pages.
- **Ask focused questions:** include selected PDF text, an image of the current page, or a quoted passage from a tutor reply. Switch replies between English (default) and Italian.
- **Practice:** generate multiple-choice questions and written exercises for a topic. Save unfinished attempts; reveal feedback and worked solutions after submission.
- **Back up a subject:** export its materials, roadmap, checks, and tests as a `.study` archive; import it from Settings.

The interface is currently in Italian. The chat response language is independently selectable. The visual design is grayscale, with hidden scrollbars and normal scrolling.

## Install from GitHub

### Requirements

- **Node.js 24 or newer**, including npm. Check with `node --version` and `npm --version`.
- A desktop operating system. **macOS Apple Silicon is the tested platform.** Windows and Linux packaging targets are configured but have not been validated.
- Internet access to install dependencies, connect ChatGPT, and use AI features.
- A ChatGPT account with access to the supported Sign in with ChatGPT integration and available plan usage. Local course organization and PDF viewing work without signing in.

No separately billed API key is required by the current implementation. Access to AI depends on the account's available models, permissions, and usage limits.

### 1. Download the source

On the GitHub repository page, choose **Code → Download ZIP**, extract it, and open a terminal in the extracted folder containing `package.json`.

Alternatively, clone the repository using its actual GitHub URL, then open the cloned folder in your terminal.

### 2. Install and launch

```sh
npm ci
npm start
```

`npm ci` installs the exact dependencies in the lockfile, including Electron. `npm start` compiles the app and opens the desktop window. The first installation may take a few minutes.

### 3. Connect your account

Open **Impostazioni → Continue with ChatGPT**, complete the browser sign-in, and select an available model. Your operating system may ask for keychain access to protect the saved credentials.

### 4. Start a subject

1. Choose **Nuova materia** and enter the subject name and official syllabus.
2. Open **Materiali** and import PDF, TXT, or Markdown files.
3. In **Percorso**, choose **Genera con AI**, review the proposed roadmap, and apply it.
4. Open a topic, mark your own progress, and choose **Studia** or **Test**.

## Build a desktop app

From the source folder:

```sh
npm run package
```

The runnable application is created under `release/` for your current platform and architecture. On macOS Apple Silicon, open `release/mac-arm64/stemhelp.app`. This package can run without the development server or a terminal.

For configured distribution targets:

```sh
npm run dist
```

The current macOS target is an app directory, Windows is NSIS, and Linux is AppImage. Build on the intended operating system; cross-platform builds and distribution signing are not set up as a verified release pipeline. macOS builds are not notarized public releases. There is no published installer assumed by these instructions.

If macOS blocks your own local build, use its **Privacy & Security** settings to review the block. Do not disable system-wide security checks.

## Chat controls

- **Enter:** send a question.
- **Shift + Enter:** insert a newline.
- **EN / IT:** choose the response language; your preference is saved.
- **Quote in next question:** select text in a tutor reply, then use the quote button. Review or remove the quote above the input before sending.
- **Auto-scroll:** follows new output until you scroll up. Return to the bottom to resume following it.
- **Nuova chat:** clear the current conversation while retaining the course context.

## Storage and privacy

Course data, copied materials, study checks, and tests are stored locally in SQLite and a `materials` folder. Chat history is temporary and is cleared when the app closes.

- **Source launch (`npm start`):** data is stored in `.local-data/` inside the project folder.
- **Packaged app:** data normally uses Electron's per-user application data directory under the legacy name `study-quadernone` (for example, `~/Library/Application Support/study-quadernone` on macOS).
- **Existing local setup:** a packaged app placed next to the `.study-project` marker uses the adjacent `.local-data/` folder instead.
- **Custom location:** set `STUDY_DATA_DIR` to an absolute directory before launching.

The legacy storage identity and `.study` archive format are retained so the rename from Study does not discard existing data. Moving the packaged app to another location can select a different archive; export/import subjects if you need to transfer them. Back up the data directory with the app closed, or export individual subjects from the app.

AI processing is remote. Relevant syllabus text, retrieved passages, your question, chat context, and an optional page image are sent to OpenAI. Credentials are encrypted through Electron safeStorage and the OS credential store; they are excluded from subject exports. Linux requires a supported secure credential backend for sign-in.

`.local-data/`, generated applications, build output, and local environment files are ignored by Git. Do not commit personal course archives, credentials, or copyrighted course materials when publishing a repository.

## Current limitations

- PDFs can be up to 100 MB each. Password-protected files must be unlocked before import.
- Scanned PDFs can be discussed using the current page image, but automatic course-wide OCR is not implemented. The roadmap relies on extractable text and the supplied syllabus.
- Webpage import does not bypass sign-in, CAPTCHA, or JavaScript-only content. Paste the syllabus when import cannot read it.
- Generated explanations, exercises, and grading can be wrong. Source references are checked for valid documents and page ranges, not mathematical correctness.
- The app supplies the course outline and selected relevant passages, rather than every page of every PDF in every chat request.
- The ChatGPT account integration is a preview feature; availability and limits may change.

## Development and checks

```sh
npm run build       # Type-check and compile the frontend and desktop process
npm test            # Persistence, OAuth, streaming, tree validation, PDF import
npm run test:e2e    # End-to-end checks in a real Electron window
```

End-to-end checks require a graphical desktop session and use isolated temporary data with simulated AI responses. They do not consume account usage. `scripts/live-check.mjs` is a separate opt-in integration check that uses the connected account and consumes plan usage; close the other app instance before running it with `node scripts/live-check.mjs`.

The stack is Electron, React, TypeScript, SQLite, PDF.js, and KaTeX. Main directories:

| Directory | Purpose |
| --- | --- |
| `src/` | Desktop interface, PDF viewer, chat, and tests UI |
| `desktop/` | Storage, document processing, authentication, and AI orchestration |
| `assets/` | Vector logo, mark, and application icons |
| `scripts/` | Launch, asset preparation, and live integration check |
| `tests/` | Unit/integration tests and Electron end-to-end checks |

The logo is editable SVG. `assets/mark.svg` is the compact mark, `assets/logo.svg` is the wordmark, and `assets/icon.svg` is the app icon source. On macOS, `node scripts/icon.mjs` regenerates the PNG and ICNS files after editing the icon source.
