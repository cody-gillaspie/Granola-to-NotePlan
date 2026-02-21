# Claude Instructions for Granola Sync NotePlan Plugin

## Project Overview

NotePlan plugin that syncs meeting notes from Granola AI into NotePlan. Rebuilt from scratch in v2.0.0 using the [Granola-to-Obsidian plugin](https://github.com/dannymcc/Granola-to-Obsidian) (v1.6.3) as reference, adapted for NotePlan's sandboxed plugin environment.

## File Structure

- `plugin.json` — Plugin manifest with commands and settings declarations
- `script.js` — All plugin logic (~400 lines)
- `README.md` — User-facing documentation
- `CLAUDE.md` — This file (development instructions)

## NotePlan Plugin Constraints

These are hard constraints of the NotePlan plugin sandbox:

1. **No build step**: Raw JS in `script.js`, manifest in `plugin.json`
2. **No `require()`**: Node.js modules are unavailable. Auth must use direct token from settings.
3. **`fetch()` non-standard**: May return string body directly instead of Response object. Always handle both: `typeof res === 'string' ? res : await res.text()`
4. **Note creation**: `DataStore.newNote(title, folder, content)` — folder param is the reliable method
5. **Note lookup**: `DataStore.projectNotes` array iteration
6. **Settings**: Declared in `plugin.json`, accessed via `DataStore.settings`
7. **Daily notes**: `DataStore.calendarNoteByDate(new Date(), 'day')`
8. **No frontmatter for folder placement**: NotePlan interprets `folder:` in frontmatter literally, creating unwanted folders. Use `DataStore.newNote()` folder parameter instead.

## Architecture

### Granola ID Tracking

Instead of YAML frontmatter (which NotePlan misinterprets), we use HTML comments at the end of each note:

```markdown
<!-- granola_id: abc-123-def -->
<!-- granola_updated_at: 2026-02-21T10:00:00Z -->
```

Existing notes are found by scanning `DataStore.projectNotes` for content containing the granola_id marker.

### Note Creation

Single reliable method — no fallback chains:

```javascript
DataStore.newNote(filename, folderName, content);
```

For Granola folder mirroring: `DataStore.newNote(filename, 'Granola/FolderName', content)`

### Content Extraction

Panel-based extraction matching the Obsidian plugin:
- `my_notes` panel → user's own meeting notes
- `enhanced_notes` panel → AI-generated summary
- `last_viewed_panel` → fallback for enhanced notes
- `doc.content` → fallback for my notes

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

**macOS (Direct):**
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
- **Handle fetch responses defensively** — always check `typeof res === 'string'`
- **No YAML frontmatter** for metadata — use HTML comments
- **Minimal logging** — only log meaningful events, not debug noise
- **No auto-sync** — NotePlan has no persistent plugin lifecycle; sync is manual only

## Reference Implementation

The Obsidian plugin is the feature reference:
- Repository: https://github.com/dannymcc/Granola-to-Obsidian
- Key file: `main.js` (~2,877 lines)
- Same API endpoints and request format
