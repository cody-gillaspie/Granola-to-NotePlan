# Claude Instructions for Granola Sync NotePlan Plugin

## Project Overview

NotePlan plugin that syncs meeting notes from Granola AI into NotePlan. Rebuilt from scratch in v2.0.0 using the [Granola-to-Obsidian plugin](https://github.com/dannymcc/Granola-to-Obsidian) as reference, adapted for NotePlan's sandboxed plugin environment.

## File Structure

- `plugin.json` — Plugin manifest with commands and settings declarations
- `script.js` — All plugin logic (~850 lines)
- `README.md` — User-facing documentation
- `CLAUDE.md` — This file (development instructions)

## NotePlan Plugin Constraints

These are hard constraints of the NotePlan plugin sandbox (verified against [Flow type definitions](https://github.com/NotePlan/plugins/blob/main/flow-typed/Noteplan.js)):

1. **No build step**: Raw JS in `script.js`, manifest in `plugin.json`. Top-level `function` declarations are globally accessible (no `globalThis` assignment needed without a bundler).
2. **No `require()`**: Node.js modules are unavailable. Auth must use direct token from settings.
3. **`fetch()` returns `Promise<string>`**: Always returns a string, never a Response object. No `.text()`, `.json()`, or `.status` properties. Errors are thrown as strings — use try/catch or `.then()/.catch()`.
4. **Note creation**: Two methods available:
   - `DataStore.newNote(title, folder)` → creates note with `# title` as content, returns `?string` filename
   - `DataStore.newNoteWithContent(content, folder, filename?)` → creates note with full content, returns `string` filename (v3.5.2+)
5. **Note lookup**: `DataStore.projectNotes` array iteration
6. **Settings**: Declared in `plugin.json`, accessed via `DataStore.settings`. Boolean settings may arrive as strings — always coerce with `val === true || val === 'true'`.
7. **Daily notes**: `DataStore.calendarNoteByDate(new Date(), 'day')` — also supports `'week'`, `'month'`, `'quarter'`, `'year'`.
8. **No frontmatter for folder placement**: NotePlan interprets `folder:` in frontmatter literally, creating unwanted folders. Use `DataStore.newNoteWithContent()` folder parameter instead.
9. **CommandBar API**:
   - `CommandBar.prompt(title, message, buttons?)` → shows native alert, returns `Promise<number>` (button index). Always `await` it.
   - `CommandBar.showInput(placeholder, submitText)` → text input, returns `Promise<string>`
   - `CommandBar.showOptions(options, placeholder)` → fuzzy-search list, returns `Promise<{value, index}>`
   - `CommandBar.showLoading(visible, text?, progress?)` → loading indicator

## Architecture

### Granola ID Tracking

Instead of YAML frontmatter (which NotePlan misinterprets), we use HTML comments at the end of each note:

```markdown
<!-- granola_id: abc-123-def -->
<!-- granola_created_at: 2026-02-21T09:00:00Z -->
<!-- granola_updated_at: 2026-02-21T10:00:00Z -->
```

Existing notes are found by scanning `DataStore.projectNotes` for content containing the granola_id marker.

### Note Creation

Single reliable method — no fallback chains:

```javascript
DataStore.newNoteWithContent(content, folder, filename);
```

For Granola folder mirroring: `DataStore.newNoteWithContent(content, 'Granola/FolderName', filename)`

### Content Extraction

Panel-based extraction matching the Obsidian plugin:
- `my_notes` panel → user's own meeting notes
- `enhanced_notes` panel → AI-generated summary
- `last_viewed_panel` → fallback for enhanced notes
- `doc.content` → fallback for my notes

### Transcript API

The `get-document-transcript` endpoint returns `{ segments: [...] }`. The segments array is extracted before passing to `transcriptToMarkdown()`.

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `https://api.granola.ai/v2/get-documents` | POST | Fetch documents (paginated) |
| `https://api.granola.ai/v1/get-document-lists-metadata` | POST | Fetch folder structure |
| `https://api.granola.ai/v1/get-document-transcript` | POST | Fetch meeting transcript |

Required headers: `Authorization: Bearer {token}`, `Content-Type: application/json`, `User-Agent: Granola/5.354.0`, `X-Client-Version: 5.354.0`

## NotePlan Plugin Directory

Copy files here for testing:

**macOS (SetApp):**
```
~/Library/Containers/co.noteplan.NotePlan-setapp/Data/Library/Application Support/co.noteplan.NotePlan-setapp/Plugins/granola.sync/
```

**macOS (Direct/App Store):**
```
~/Library/Application Support/NotePlan/Plugins/granola.sync/
```

## Development Workflow

1. Edit files in this repository
2. Copy to NotePlan plugin directory: `cp plugin.json script.js ~/Library/Containers/co.noteplan.NotePlan-setapp/Data/Library/Application\ Support/co.noteplan.NotePlan-setapp/Plugins/granola.sync/`
3. Restart NotePlan or reload plugins
4. Run sync: Command Palette → "Sync recent notes from Granola AI"
5. Check console: NotePlan → Help → Show Console

## Key Rules

- **No `require()` calls** — everything in a single file
- **`fetch()` always returns a string** — just parse with `JSON.parse(result)`, no `.text()` needed
- **No YAML frontmatter** for metadata — use HTML comments
- **Minimal logging** — only log meaningful events, not debug noise
- **No auto-sync** — NotePlan has no persistent plugin lifecycle; sync is manual only
- **Always `await` CommandBar.prompt()** — it returns a Promise
- **Coerce boolean settings** — NotePlan may store bools as strings

## Reference Implementation

The Obsidian plugin is the feature reference:
- Repository: https://github.com/dannymcc/Granola-to-Obsidian
- Key file: `main.js` (~2,877 lines)
- Same API endpoints and request format
