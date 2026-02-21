# Granola Sync for NotePlan

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/d3hkz6gwle)

A NotePlan plugin that syncs your [Granola AI](https://granola.ai) meeting notes into NotePlan with full customization options.

![Granola Sync Plugin](https://img.shields.io/badge/NotePlan-Plugin-blue) ![Version](https://img.shields.io/badge/version-2.1.0-blue) ![License](https://img.shields.io/badge/license-MIT-green)

> **Note:** This plugin was rebuilt from scratch in v2.0.0 based on the [Granola Sync Plus for Obsidian](https://github.com/dannymcc/Granola-to-Obsidian) plugin, adapted for NotePlan's sandboxed plugin environment.

## Features

- **Manual Sync**: Sync notes from Granola AI on demand via Command Bar
- **Separate Notes**: Create individual notes for each meeting in a configurable folder
- **Daily Note Integration**: Automatically add today's meetings to your daily note with times and wiki-links
- **Content Conversion**: Converts ProseMirror content to clean Markdown with full formatting support (bold, italic, code, links, lists, blockquotes, code blocks)
- **Attendee Tagging**: Automatically extract meeting attendees and add them as organised tags (e.g. `#person/john-smith`) with a configurable template
- **Granola URL Links**: Add direct links back to original Granola notes for easy access
- **Granola Folder Mirroring**: Organise notes into subfolders matching your Granola folder structure
- **Duplicate Detection**: Find and review duplicate notes with the "Find duplicate Granola notes" command
- **Smart Update Handling**: Intelligently updates existing notes or skips them based on your preference
- **Flexible Filenames**: Customise note filenames with date, time, and title tokens

## Installation

### Manual Installation

1. Download or clone this repository
2. Copy `plugin.json` and `script.js` to your NotePlan Plugins directory:

**macOS (SetApp):**
```
~/Library/Containers/co.noteplan.NotePlan-setapp/Data/Library/Application Support/co.noteplan.NotePlan-setapp/Plugins/granola.sync/
```

**macOS (Direct/App Store):**
```
~/Library/Application Support/NotePlan/Plugins/granola.sync/
```

3. Restart NotePlan or reload plugins
4. Configure your settings in **NotePlan → Preferences → Plugins → Granola Sync**

### Files Required
- `plugin.json` — Plugin metadata and settings declarations
- `script.js` — All plugin logic

## Configuration

Access plugin settings via **NotePlan → Preferences → Plugins → Granola Sync**

### Authentication

#### Granola Access Token
Your Granola API access token. To find it:
1. Open `~/Library/Application Support/Granola/supabase.json`
2. Find `workos_tokens` (or `cognito_tokens`)
3. Copy the `access_token` value
4. Paste it into the plugin settings

### Sync Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Sync Folder | `Granola` | NotePlan folder where synced notes are created |
| Filename Template | `{created_date}_{title}` | Template for note filenames (see tokens below) |
| Date Format | `YYYY-MM-DD` | Date format used in filenames |
| Document Sync Limit | `100` | Maximum documents per sync run |
| Skip Existing Notes | `true` | Skip notes that already exist (matched by Granola ID) |

#### Filename Template Tokens
- `{title}` — Meeting/note title
- `{id}` — Granola document ID
- `{created_date}` / `{updated_date}` — Date only
- `{created_time}` / `{updated_time}` — Time only
- `{created_datetime}` / `{updated_datetime}` — Full date and time

**Examples:**
- `{created_date}_{title}` → `2026-02-21_Team_Standup`
- `Meeting_{created_datetime}_{title}` → `Meeting_2026-02-21_14-30-00_Team_Standup`

### Note Content

| Setting | Default | Description |
|---------|---------|-------------|
| Include My Notes | `true` | Include your personal notes in a "## My Notes" section |
| Include Enhanced Notes | `true` | Include AI-generated notes in a "## Enhanced Notes" section |
| Include Transcript | `false` | Include the full meeting transcript (extra API call per note) |
| Include Granola URL | `false` | Add a link back to the original Granola document |

### Attendee Tags

| Setting | Default | Description |
|---------|---------|-------------|
| Include Attendee Tags | `false` | Add meeting attendees as hashtags |
| Exclude My Name | *(empty)* | Your name to exclude from tags |
| Attendee Tag Template | `person/{name}` | Tag format (`{name}` is replaced with the cleaned attendee name) |

**Template examples:**
- `person/{name}` → `#person/john-smith`
- `people/{name}` → `#people/john-smith`
- `contacts/work/{name}` → `#contacts/work/john-smith`

### Folder Organisation

| Setting | Default | Description |
|---------|---------|-------------|
| Mirror Granola Folders | `false` | Organise notes into subfolders matching your Granola folder structure |

### Calendar Note Integration

| Setting | Default | Description |
|---------|---------|-------------|
| Enable Daily Note Integration | `true` | Add today's meetings to your daily note |
| Daily Note Section Heading | `## Granola Meetings` | Section heading used in daily notes |
| Enable Weekly Note Integration | `false` | Add this week's meetings to your weekly note, grouped by day |
| Weekly Note Section Heading | `## Granola Meetings` | Section heading used in weekly notes |
| Enable Monthly Note Integration | `false` | Add this month's meetings to your monthly note, grouped by day |
| Monthly Note Section Heading | `## Granola Meetings` | Section heading used in monthly notes |

## Usage

### Sync Recent Notes
1. Open NotePlan's Command Bar (Cmd+J on macOS)
2. Search for "Sync recent notes from Granola AI"
3. The plugin fetches your recent meetings and creates/updates notes

### Sync All Historical Notes
1. Open Command Bar (Cmd+J)
2. Search for "Sync ALL historical notes from Granola AI"
3. Fetches all meetings regardless of the sync limit setting

### Find Duplicate Notes
1. Open Command Bar (Cmd+J)
2. Search for "Find duplicate Granola notes"
3. The plugin scans your vault and creates a report of any duplicated Granola IDs

### Note Format

Synced notes use HTML comments for metadata tracking (NotePlan misinterprets YAML frontmatter fields like `folder:`):

```markdown
# Team Standup Meeting

## My Notes

Your personal meeting notes appear here...

## Enhanced Notes

AI-generated summary appears here...

[Open in Granola](https://notes.granola.ai/d/abc123def456)

<!-- granola_id: abc123def456 -->
<!-- granola_created_at: 2026-02-21T14:30:00.000Z -->
<!-- granola_updated_at: 2026-02-21T15:45:00.000Z -->
```

### Daily Note Integration

When enabled, today's meetings appear in your daily note:

```markdown
## Granola Meetings
- 09:30 [[2026-02-21_Team_Standup|Team Standup]]
- 14:00 [[2026-02-21_Client_Review|Client Review Meeting]]
```

## Requirements

- NotePlan v3.5.2+ (requires `newNoteWithContent` API)
- Active Granola AI account
- Granola desktop app installed and authenticated (macOS)

## Troubleshooting

### Plugin Not Appearing
- Ensure `plugin.json` and `script.js` are in a `granola.sync/` folder inside the Plugins directory
- Restart NotePlan after copying files
- Check NotePlan → Help → Show Console for errors

### No Notes Syncing
- Verify your access token is correct in plugin settings
- Check that you have meeting notes in your Granola account
- Open NotePlan → Help → Show Console and look for "Granola Sync:" messages

### Authentication Issues
- Make sure the Granola desktop app is logged in
- Check that `~/Library/Application Support/Granola/supabase.json` exists
- Try logging out and back in to Granola to refresh the token
- The token expires periodically — re-copy it from the JSON file if sync stops working

### Notes Created Without Content
- Ensure your NotePlan version is v3.5.2 or later (required for `newNoteWithContent` API)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- With thanks to [Joseph Thacker](https://josephthacker.com/) for first discovering that it's possible to query the Granola [API using locally stored auth keys](https://josephthacker.com/hacking/2025/05/08/reverse-engineering-granola-notes.html)
- [Granola AI](https://granola.ai) for creating an amazing meeting assistant
- The NotePlan community for plugin development resources
- Based on the [Granola Sync Plus for Obsidian](https://github.com/dannymcc/Granola-to-Obsidian) plugin

## Support

- **Issues**: [GitHub Issues](https://github.com/dannymcc/Granola-to-NotePlan/issues)
- **Documentation**: This README and plugin settings descriptions

---

**Made with love by [Danny McClelland](https://github.com/dannymcc)**

*Not officially affiliated with Granola AI or NotePlan.*
