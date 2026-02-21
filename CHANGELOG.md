# Changelog

## [2.1.0] - 2026-02-21

### Added
- **Weekly note integration**: Synced meetings are added to your weekly note, grouped by day
- **Monthly note integration**: Synced meetings are added to your monthly note, grouped by day
- **Calendar event matching**: Links synced notes to matching NotePlan calendar events
- Shared calendar note helpers (replaceSectionInNote, formatMeetingLine, buildGroupedByDayContent)

### Changed
- "Daily Note Integration" settings section renamed to "Calendar Note Integration"
- Daily note update refactored to use shared helpers
- Meeting time now prefers calendar event start time over document created_at
- Calendar note entries include all synced documents (not just newly created ones)
- Plugin icon changed from bowl to sync arrows

## [2.0.0] - 2026-02-21

### Added
- Complete rewrite based on the [Granola Sync Plus for Obsidian](https://github.com/dannymcc/Granola-to-Obsidian) plugin
- Panel-based content extraction (my_notes, enhanced_notes panels)
- ProseMirror-to-Markdown converter with full formatting support
- Configurable filename templates with date/time/title tokens
- Attendee tagging with configurable tag template
- Granola URL deep links (optional)
- Granola folder mirroring into NotePlan subfolders
- Duplicate detection command
- Daily note integration with meeting times and wiki-links
- HTML comment metadata tracking (granola_id, created_at, updated_at)
- Smart update handling (skip or update based on timestamps)
- Paginated document fetching for large accounts
- Transcript support via separate API endpoint
- Async thread execution to prevent UI freezes

### Fixed
- Note creation uses `newNoteWithContent()` instead of `newNote()` for proper content
- Transcript data extraction (pass .segments, not full response object)
- fetch() handling simplified (always returns string in NotePlan sandbox)
- Boolean settings coercion (NotePlan may store bools as strings)
- All const/let replaced with var for sandbox compatibility

### Changed
- Minimum NotePlan version bumped to 3.5.2
- Command names updated to be human-readable in Command Bar

## [1.0.0] - 2026-02-20

### Added
- Initial release
- Basic Granola document syncing
- Simple note creation in configurable folder
