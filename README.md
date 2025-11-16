# Granola Sync for NotePlan

A NotePlan plugin that automatically syncs your [Granola AI](https://granola.ai) meeting notes to your NotePlan notes with configurable organization options.

## ⚠️ **IMPORTANT: CURRENTLY NON-FUNCTIONAL**

**This plugin does not currently work due to a limitation in NotePlan's `fetch` implementation.**

### The Issue

NotePlan's `fetch` API does not reliably send custom HTTP headers (specifically `Authorization`, `User-Agent`, and `X-Client-Version`) when making POST requests. The Granola API requires these headers for authentication and client identification.

**What we've verified:**
- ✅ The plugin code is complete and correct
- ✅ The access token is valid (verified with curl - returns 200 OK)
- ✅ Headers are set correctly according to NotePlan's documentation
- ✅ Tried `credentials: 'include'` option (per fetch API spec) - still doesn't work
- ✅ Tried `await fetch()` approach (like NotePlan templates use) - still doesn't work
- ✅ Note: Authorization headers DO work in NotePlan templates with GET requests (see Todoist template examples)
- ❌ NotePlan's `fetch` does not send the Authorization header for POST requests (returns "Unauthorized")
- ❌ Granola API requires POST requests, so we cannot use GET as a workaround

**Status:** The plugin is ready to work once NotePlan fixes their `fetch` implementation to properly support custom headers in POST requests.

**Workaround:** None currently available. This requires a fix from NotePlan.

**Reported to:** This issue should be reported to NotePlan support.

---

## 🚀 Features

- **🔄 Manual Sync**: Sync notes from Granola AI on demand via Command Bar
- **📝 Separate Notes**: Create individual notes for each meeting in a configurable folder
- **🗓️ Daily Note Integration**: Automatically add today's meetings to your Daily Note with times and links
- **📁 Custom Directory**: Choose where in your notes to sync meeting notes
- **🔧 Custom Auth Path**: Override the default Granola credentials location
- **✨ Rich Metadata**: Includes frontmatter with creation/update dates, Granola IDs, and URLs
- **📋 Content Conversion**: Converts ProseMirror content to clean Markdown
- **🔄 Update Handling**: Intelligently updates existing notes instead of creating duplicates

## 📦 Installation

### Manual Installation

1. Download or clone this repository
2. Copy the plugin folder to your NotePlan Plugins directory:
   - Open NotePlan → Preferences → Plugins
   - Click "Open Plugin Folder"
   - Copy the `granola-sync` folder (or create it and copy the files)
3. The plugin should appear in your Plugins list
4. Enable the plugin and configure your settings

### Files Required
- `plugin.json` - Plugin metadata and configuration
- `script.js` - Main plugin code

## ⚙️ Configuration

Access plugin settings via **NotePlan → Preferences → Plugins → Granola Sync**

### Auth Key Path
Path to your Granola authentication file (relative to your home directory). Default locations:
- **macOS**: `Library/Application Support/Granola/supabase.json`
- **Windows**: `AppData/Roaming/Granola/supabase.json`
- **Linux**: `.config/Granola/supabase.json`

The plugin automatically tries multiple paths if the configured path doesn't exist.

### Sync Directory
Folder name where separate notes will be created (default: `Granola`). Leave empty to create notes in the root of your notes.

### Create Separate Notes
Enable or disable creating individual notes for each meeting. When enabled, notes are created in the configured sync directory.

### Enable Daily Note Integration
When enabled, today's meetings are automatically added to your daily note with times and links.

### Daily Note Section Heading
The section heading used in daily notes for the meetings list (default: `## Granola Meetings`).

## 📖 Usage

### Syncing Notes

1. Open NotePlan's Command Bar (⌘J on macOS)
2. Type `/syncGranolaNotes` and press Enter
3. The plugin will:
   - Load your Granola credentials
   - Fetch all your meeting notes
   - Create or update notes in NotePlan
   - Add today's meetings to your daily note (if enabled)

### Note Format

Synced notes include rich frontmatter with metadata:

```yaml
---
granola_id: abc123def456
title: "Team Standup Meeting"
granola_url: "https://notes.granola.ai/d/abc123def456"
created_at: 2025-06-06T14:30:00.000Z
updated_at: 2025-06-06T15:45:00.000Z
---

# Team Standup Meeting

Your converted meeting content appears here in clean Markdown format.

- Action items are preserved
- Headings maintain their structure
- All formatting is converted appropriately
```

### Daily Note Integration

When enabled, today's Granola meetings automatically appear in your Daily Note:

```markdown
## Granola Meetings
- 09:30 [[Granola/2025-06-09_Team_Standup|Team Standup]]
- 14:00 [[Granola/2025-06-09_Client_Review|Client Review Meeting]]
```

## 🔧 Requirements

- NotePlan v3.0.21+
- Active Granola AI account
- Granola desktop app installed and authenticated (available for macOS and Windows)

## 🐛 Troubleshooting

### Plugin Won't Enable

- Check that all plugin files are in the correct directory
- Ensure you have the latest version of NotePlan
- Check the Plugin Console for error messages

### No Notes Syncing

- Verify your Granola auth key path is correct in settings
- Check that you have meeting notes in your Granola account
- Ensure the sync directory exists or can be created
- Look for error messages in the Plugin Console

### Authentication Issues

- Make sure Granola desktop app is logged in
- Check that the auth key file exists at the expected location:
  - **macOS**: `~/Library/Application Support/Granola/supabase.json`
  - **Windows**: `C:\Users\[USERNAME]\AppData\Roaming\Granola\supabase.json`
- If the file is in a different location, update the "Auth Key Path" in plugin settings
- Try logging out and back in to Granola

### Daily Note Integration Not Working

- Ensure "Enable Daily Note Integration" is enabled in settings
- Check that you have a daily note for today
- Verify the section heading matches what's in your daily note
- Check the Plugin Console for error messages

### Notes Not Updating

- The plugin updates existing notes based on the note title
- If you've renamed a note, it may create a new one instead of updating
- Check that the sync directory setting matches where your notes are located

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- With thanks to Joseph Thacker for first discovering that it's possible to query the Granola API using locally stored auth keys!
- Granola AI for creating an amazing meeting assistant
- The NotePlan community for plugin development resources
- Contributors and testers who help improve this plugin

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/dannymcc/Granola-to-NotePlan/issues)
- **Documentation**: This README and plugin settings descriptions

---

**Made with ❤️ by Danny McClelland**

_Not officially affiliated with Granola AI or NotePlan._

