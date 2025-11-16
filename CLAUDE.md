# Claude Instructions for Granola Sync NotePlan Plugin

This document outlines the development process and key information for working on the Granola Sync plugin for NotePlan.

## Project Overview

This is a NotePlan plugin that syncs meeting notes from Granola AI into NotePlan. It's based on the [Granola-to-Obsidian plugin](https://github.com/dannymcc/Granola-to-Obsidian) and adapts the same API approach for NotePlan.

## File Structure

- `plugin.json` - Plugin manifest/configuration file
- `script.js` - Main plugin code
- `README.md` - User-facing documentation
- `CLAUDE.md` - This file (development instructions)

## NotePlan Plugin Directory

The plugin files need to be copied to NotePlan's plugin directory for testing:

**macOS (SetApp):**
```
~/Library/Containers/co.noteplan.NotePlan-setapp/Data/Library/Application Support/co.noteplan.NotePlan-setapp/Plugins/granola-sync/
```

**macOS (Direct):**
```
~/Library/Application Support/NotePlan/Plugins/granola-sync/
```

## Development Workflow

### 1. Making Changes

1. Edit files in this repository (`/Users/danny/Projects/noteplan-granola/`)
2. Test changes by copying files to the NotePlan plugin directory
3. Reload NotePlan or restart the app to see changes

### 2. Copying Files to Plugin Directory

Use these commands to copy files:

```bash
# Create plugin directory if it doesn't exist
mkdir -p ~/Library/Containers/co.noteplan.NotePlan-setapp/Data/Library/Application\ Support/co.noteplan.NotePlan-setapp/Plugins/granola-sync

# Copy plugin files
cp plugin.json script.js ~/Library/Containers/co.noteplan.NotePlan-setapp/Data/Library/Application\ Support/co.noteplan.NotePlan-setapp/Plugins/granola-sync/
```

Or use the helper script (if created):
```bash
./copy-to-noteplan.sh
```

### 3. Testing

1. Open NotePlan
2. Go to Settings → Plugins
3. Enable "Granola Sync" if not already enabled
4. Run the sync command: `Command Palette` → "Sync Granola Notes"
5. Check the console for logs (NotePlan → Help → Show Console)

## Key Implementation Details

### API Integration

The plugin uses the same Granola API endpoints as the Obsidian plugin:

- **Endpoint**: `https://api.granola.ai/v2/get-documents`
- **Method**: POST
- **Required Headers**:
  - `Authorization: Bearer {token}`
  - `Content-Type: application/json`
  - `User-Agent: Granola/5.354.0`
  - `X-Client-Version: 5.354.0`
- **Request Body**: `{ limit: 50, offset: 0, include_last_viewed_panel: true }`

### Content Extraction

The plugin extracts content from `doc.last_viewed_panel.content` which is in ProseMirror format:

```javascript
if (doc.last_viewed_panel && doc.last_viewed_panel.content && 
    typeof doc.last_viewed_panel.content === 'object' && 
    doc.last_viewed_panel.content.type === 'doc') {
  // Convert ProseMirror to Markdown
  const markdownContent = convertProseMirrorToMarkdown(doc.last_viewed_panel.content);
}
```

This matches the Obsidian plugin's approach exactly.

### Note Creation

Notes are created in the `Granola` folder using NotePlan's API:

```javascript
const noteTitle = `Granola/${filename}.md`;
const createdNote = DataStore.newNoteWithContent(noteTitle, markdownContent);
```

### Authentication

The plugin supports two methods for authentication:

1. **Direct Token** (Recommended): User pastes access token in plugin settings
2. **File Reading**: Attempts to read from `~/Library/Application Support/Granola/supabase.json`

Note: File reading may not work in NotePlan due to sandbox restrictions, so direct token is preferred.

## Differences from Obsidian Plugin

1. **No Frontmatter**: NotePlan creates folders from frontmatter, so we avoid it
2. **Simpler Folder Structure**: Notes go directly into `Granola/` folder
3. **NotePlan API**: Uses `DataStore.newNoteWithContent()` instead of Obsidian's vault API
4. **Settings**: Uses NotePlan's `DataStore.settings` instead of Obsidian's settings API

## Common Issues & Solutions

### Notes Not Appearing in Granola Folder

- Check that the note title includes the folder path: `Granola/filename.md`
- Verify `DataStore.newNoteWithContent()` is working correctly
- Check console logs for errors

### Content Not Appearing (Only Filename)

- Ensure `include_last_viewed_panel: true` is in the API request
- Verify `doc.last_viewed_panel.content.type === 'doc'` exists
- Check that `convertProseMirrorToMarkdown()` is working correctly
- Verify content is being passed to `createOrUpdateNote()`

### Authentication Issues

- NotePlan's `fetch()` may not send Authorization headers correctly for POST requests
- Use direct token method instead of file reading
- Test with `testAuthHeader()` command first

## Reference Implementation

The Obsidian plugin implementation is the reference:
- Repository: https://github.com/dannymcc/Granola-to-Obsidian
- Key file: `main.js`
- API usage: Same endpoints and request format

## Testing Checklist

When making changes, test:

- [ ] Notes are created in `Granola/` folder
- [ ] Notes contain full markdown content (not just filename)
- [ ] Content is properly converted from ProseMirror format
- [ ] Authentication works (token or file reading)
- [ ] Daily note integration works (if enabled)
- [ ] Existing notes are updated correctly
- [ ] No duplicate notes are created

## Notes for Claude

When working on this project:

1. **Always test in NotePlan** - The plugin must work in NotePlan's environment
2. **Match Obsidian plugin API usage** - Use the same Granola API endpoints and request format
3. **Check console logs** - NotePlan provides console output for debugging
4. **Copy files after changes** - Remember to copy updated files to the plugin directory
5. **NotePlan limitations** - NotePlan's `fetch()` may have limitations compared to standard fetch
6. **No frontmatter** - Avoid frontmatter as NotePlan creates folders from it
7. **Folder paths** - Use `Granola/filename.md` format for note paths

## Useful Commands

```bash
# Copy files to plugin directory
cp plugin.json script.js ~/Library/Containers/co.noteplan.NotePlan-setapp/Data/Library/Application\ Support/co.noteplan.NotePlan-setapp/Plugins/granola-sync/

# View plugin directory
ls -la ~/Library/Containers/co.noteplan.NotePlan-setapp/Data/Library/Application\ Support/co.noteplan.NotePlan-setapp/Plugins/granola-sync/

# Check NotePlan console (in NotePlan app: Help → Show Console)
```

## Version History

- **1.0.0** - Initial release
  - Basic sync functionality
  - ProseMirror to Markdown conversion
  - Granola folder placement
  - Daily note integration

