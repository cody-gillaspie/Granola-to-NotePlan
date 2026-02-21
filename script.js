// Granola Sync for NotePlan v2.0.0
// Syncs Granola AI meeting notes into NotePlan

// =============================================================================
// SETTINGS HELPERS
// =============================================================================

var DEFAULTS = {
  granolaAccessToken: '',
  syncFolder: 'Granola',
  filenameTemplate: '{created_date}_{title}',
  dateFormat: 'YYYY-MM-DD',
  documentSyncLimit: '100',
  skipExistingNotes: true,
  includeMyNotes: true,
  includeEnhancedNotes: true,
  includeTranscript: false,
  includeAttendeeTags: false,
  excludeMyName: '',
  attendeeTagTemplate: 'person/{name}',
  includeGranolaUrl: false,
  enableGranolaFolders: false,
  enableDailyNoteIntegration: true,
  dailyNoteSectionName: '## Granola Meetings',
};

var BOOL_KEYS = [
  'skipExistingNotes', 'includeMyNotes', 'includeEnhancedNotes',
  'includeTranscript', 'includeAttendeeTags', 'enableGranolaFolders',
  'enableDailyNoteIntegration', 'includeGranolaUrl',
];

function getSettings() {
  var raw = DataStore.settings || {};
  var s = {};
  for (var k = 0; k < Object.keys(DEFAULTS).length; k++) {
    var key = Object.keys(DEFAULTS)[k];
    var val = raw[key] !== undefined && raw[key] !== null ? raw[key] : DEFAULTS[key];
    if (BOOL_KEYS.indexOf(key) !== -1) {
      val = val === true || val === 'true';
    }
    s[key] = val;
  }
  return s;
}

// =============================================================================
// API LAYER
// =============================================================================

function loadToken() {
  var s = getSettings();
  var token = (s.granolaAccessToken || '').trim();
  if (!token) {
    console.log('Granola Sync: No access token configured. Add it in plugin settings.');
    return null;
  }
  return token;
}

async function fetchApi(url, token, body) {
  var headers = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'User-Agent': 'Granola/5.354.0',
    'X-Client-Version': '5.354.0',
  };

  var text;
  try {
    text = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.log('Granola Sync: Fetch failed for ' + url + ': ' + e);
    return null;
  }

  if (!text || typeof text !== 'string') {
    console.log('Granola Sync: Empty response from ' + url);
    return null;
  }

  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.log('Granola Sync: Failed to parse API response from ' + url);
    return null;
  }

  if (data.message) {
    console.log('Granola Sync: API error from ' + url + ': ' + data.message);
    return null;
  }

  return data;
}

async function fetchDocuments(token, limit) {
  var allDocs = [];
  var offset = 0;
  var batchSize = 100;
  var hasMore = true;
  var maxDocs = limit || Number.MAX_SAFE_INTEGER;

  while (hasMore && allDocs.length < maxDocs) {
    var data = await fetchApi('https://api.granola.ai/v2/get-documents', token, {
      limit: batchSize,
      offset: offset,
      include_last_viewed_panel: true,
      include_panels: true,
    });

    if (!data || !data.docs) {
      return allDocs.length > 0 ? allDocs : null;
    }

    allDocs.push(...data.docs);

    if (data.docs.length < batchSize) {
      hasMore = false;
    } else {
      offset += batchSize;
    }
  }

  if (allDocs.length > maxDocs) {
    allDocs.length = maxDocs;
  }

  return allDocs;
}

async function fetchFolders(token) {
  var data = await fetchApi('https://api.granola.ai/v1/get-document-lists-metadata', token, {
    include_document_ids: true,
    include_only_joined_lists: false,
  });

  if (!data || !data.lists) return null;
  return Object.values(data.lists);
}

async function fetchTranscript(token, docId) {
  var data = await fetchApi('https://api.granola.ai/v1/get-document-transcript', token, {
    document_id: docId,
  });
  if (!data) return null;
  // API returns { segments: [...] } — extract the array
  return data.segments || data;
}

// =============================================================================
// CONTENT CONVERSION
// =============================================================================

function convertProseMirrorToMarkdown(content) {
  if (!content || typeof content !== 'object' || !Array.isArray(content.content)) {
    return '';
  }

  function processNode(node, indentLevel) {
    if (!node || typeof node !== 'object') return '';

    var type = node.type || '';
    var children = node.content || [];
    var text = node.text || '';

    switch (type) {
      case 'heading': {
        var level = (node.attrs && node.attrs.level) || 1;
        var inner = children.map(function(c) { return processNode(c, indentLevel); }).join('');
        return '#'.repeat(level) + ' ' + inner + '\n\n';
      }
      case 'paragraph': {
        var inner = children.map(function(c) { return processNode(c, indentLevel); }).join('');
        return inner + '\n\n';
      }
      case 'bulletList': {
        var items = [];
        for (var i = 0; i < children.length; i++) {
          if (children[i].type === 'listItem') {
            var item = processListItem(children[i], indentLevel, false, 0);
            if (item) items.push(item);
          }
        }
        return items.join('\n') + '\n\n';
      }
      case 'orderedList': {
        var items = [];
        var num = 1;
        for (var i = 0; i < children.length; i++) {
          if (children[i].type === 'listItem') {
            var item = processListItem(children[i], indentLevel, true, num);
            if (item) {
              items.push(item);
              num++;
            }
          }
        }
        return items.join('\n') + '\n\n';
      }
      case 'blockquote': {
        var inner = children.map(function(c) { return processNode(c, indentLevel); }).join('').trim();
        var quoted = inner.split('\n').map(function(line) {
          return line.trim() ? '> ' + line : '>';
        }).join('\n');
        return quoted + '\n\n';
      }
      case 'codeBlock': {
        var lang = (node.attrs && node.attrs.language) || '';
        var code = children.map(function(c) { return c.type === 'text' ? (c.text || '') : ''; }).join('');
        return '```' + lang + '\n' + code + '\n```\n\n';
      }
      case 'hardBreak':
        return '\n';
      case 'text': {
        var result = text;
        if (node.marks && node.marks.length > 0) {
          for (var m = node.marks.length - 1; m >= 0; m--) {
            var mark = node.marks[m];
            if (mark.type === 'bold') {
              result = '**' + result + '**';
            } else if (mark.type === 'italic') {
              result = '*' + result + '*';
            } else if (mark.type === 'code') {
              result = '`' + result + '`';
            } else if (mark.type === 'link' && mark.attrs && mark.attrs.href) {
              result = '[' + result + '](' + mark.attrs.href + ')';
            }
          }
        }
        return result;
      }
      default:
        return children.map(function(c) { return processNode(c, indentLevel); }).join('');
    }
  }

  function processListItem(item, indentLevel, ordered, num) {
    if (!item || !item.content) return '';

    var indent = '  '.repeat(indentLevel);
    var mainText = '';
    var nested = '';

    for (var i = 0; i < item.content.length; i++) {
      var child = item.content[i];
      if (child.type === 'paragraph') {
        var para = (child.content || []).map(function(c) { return processNode(c, indentLevel); }).join('').trim();
        if (para) mainText += para;
      } else if (child.type === 'bulletList') {
        var nestedItems = [];
        for (var j = 0; j < (child.content || []).length; j++) {
          var ni = child.content[j];
          if (ni.type === 'listItem') {
            var processed = processListItem(ni, indentLevel + 1, false, 0);
            if (processed) nestedItems.push(processed);
          }
        }
        if (nestedItems.length > 0) nested += '\n' + nestedItems.join('\n');
      } else if (child.type === 'orderedList') {
        var nestedItems = [];
        var nestedNum = 1;
        for (var j = 0; j < (child.content || []).length; j++) {
          var ni = child.content[j];
          if (ni.type === 'listItem') {
            var processed = processListItem(ni, indentLevel + 1, true, nestedNum);
            if (processed) {
              nestedItems.push(processed);
              nestedNum++;
            }
          }
        }
        if (nestedItems.length > 0) nested += '\n' + nestedItems.join('\n');
      } else {
        var other = processNode(child, indentLevel);
        if (other.trim()) mainText += (mainText ? '\n' : '') + other.trim();
      }
    }

    if (!mainText.trim()) return '';

    var bullet = ordered ? indent + num + '. ' + mainText : indent + '- ' + mainText;
    return bullet + nested;
  }

  return processNode(content, 0).trim();
}

function formatDate(dateStr, format) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';

  var year = d.getFullYear();
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  var hours = String(d.getHours()).padStart(2, '0');
  var minutes = String(d.getMinutes()).padStart(2, '0');
  var seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace(/YYYY/g, year)
    .replace(/YY/g, String(year).slice(-2))
    .replace(/MM/g, month)
    .replace(/DD/g, day)
    .replace(/HH/g, hours)
    .replace(/mm/g, minutes)
    .replace(/ss/g, seconds);
}

function formatTimestamp(timestamp) {
  var d = new Date(timestamp);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(function(v) { return String(v).padStart(2, '0'); })
    .join(':');
}

function getSpeakerLabel(source) {
  return source === 'microphone' ? 'Me' : 'Them';
}

function transcriptToMarkdown(segments) {
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return null;
  }

  var sorted = segments.slice().sort(function(a, b) {
    return new Date(a.start_timestamp || 0) - new Date(b.start_timestamp || 0);
  });

  var lines = [];
  var currentSpeaker = null;
  var currentText = '';
  var currentTimestamp = null;

  function flush() {
    var clean = currentText.trim().replace(/\s+/g, ' ');
    if (clean && currentSpeaker) {
      var time = formatTimestamp(currentTimestamp);
      var label = getSpeakerLabel(currentSpeaker);
      lines.push('**' + label + '** *(' + time + ')*: ' + clean);
    }
    currentText = '';
    currentSpeaker = null;
    currentTimestamp = null;
  }

  for (var i = 0; i < sorted.length; i++) {
    var seg = sorted[i];
    if (currentSpeaker && currentSpeaker !== seg.source) {
      flush();
    }
    if (!currentSpeaker) {
      currentSpeaker = seg.source;
      currentTimestamp = seg.start_timestamp;
    }
    if (seg.text && seg.text.trim()) {
      currentText += currentText ? ' ' + seg.text : seg.text;
    }
  }
  flush();

  return lines.length === 0 ? null : lines.join('\n\n');
}

// =============================================================================
// NOTE BUILDING
// =============================================================================

function extractPanelContent(doc, panelType) {
  // Check panels array first
  if (doc.panels && Array.isArray(doc.panels)) {
    for (var i = 0; i < doc.panels.length; i++) {
      var panel = doc.panels[i];
      if (panel.type === panelType && panel.content && panel.content.type === 'doc') {
        return panel.content;
      }
    }
  }

  // Fallback for enhanced_notes: check last_viewed_panel
  if (panelType === 'enhanced_notes' && doc.last_viewed_panel &&
      doc.last_viewed_panel.content && doc.last_viewed_panel.content.type === 'doc') {
    return doc.last_viewed_panel.content;
  }

  // Fallback for my_notes: check doc.content directly
  if (panelType === 'my_notes' && doc.content && doc.content.type === 'doc') {
    return doc.content;
  }

  return null;
}

function buildNoteContent(doc, settings, transcript) {
  var sections = [];
  var title = (doc.title || 'Untitled Granola Note').replace(/[<>:"/\\|?*]/g, '').trim();

  sections.push('# ' + title);

  // My Notes
  if (settings.includeMyNotes) {
    var myNotesContent = extractPanelContent(doc, 'my_notes');
    if (myNotesContent) {
      var md = convertProseMirrorToMarkdown(myNotesContent);
      if (md && md.trim()) {
        sections.push('\n## My Notes\n\n' + md.trim());
      }
    }
  }

  // Enhanced Notes
  if (settings.includeEnhancedNotes) {
    var enhancedContent = extractPanelContent(doc, 'enhanced_notes');
    if (enhancedContent) {
      var md = convertProseMirrorToMarkdown(enhancedContent);
      if (md && md.trim()) {
        sections.push('\n## Enhanced Notes\n\n' + md.trim());
      }
    }
  }

  // Transcript
  if (settings.includeTranscript && transcript) {
    sections.push('\n## Transcript\n\n' + transcript);
  }

  // Attendee tags
  if (settings.includeAttendeeTags) {
    var tags = extractAttendees(doc, settings);
    if (tags) {
      sections.push('\n---\n' + tags);
    }
  }

  // Granola URL
  if (settings.includeGranolaUrl) {
    sections.push('\n[Open in Granola](https://notes.granola.ai/d/' + doc.id + ')');
  }

  // Granola ID tracking via HTML comment
  var meta = '\n<!-- granola_id: ' + doc.id + ' -->';
  if (doc.created_at) {
    meta += '\n<!-- granola_created_at: ' + doc.created_at + ' -->';
  }
  if (doc.updated_at) {
    meta += '\n<!-- granola_updated_at: ' + doc.updated_at + ' -->';
  }
  sections.push(meta);

  return sections.join('\n');
}

function generateFilename(doc, settings) {
  var title = doc.title || 'Untitled Granola Note';
  var docId = doc.id || 'unknown';

  var createdDate = doc.created_at ? formatDate(doc.created_at, settings.dateFormat) : '';
  var updatedDate = doc.updated_at ? formatDate(doc.updated_at, settings.dateFormat) : '';
  var createdTime = doc.created_at ? formatDate(doc.created_at, 'HH-mm-ss') : '';
  var updatedTime = doc.updated_at ? formatDate(doc.updated_at, 'HH-mm-ss') : '';
  var createdDateTime = doc.created_at ? formatDate(doc.created_at, settings.dateFormat + '_HH-mm-ss') : '';
  var updatedDateTime = doc.updated_at ? formatDate(doc.updated_at, settings.dateFormat + '_HH-mm-ss') : '';

  var filename = settings.filenameTemplate
    .replace(/{title}/g, title)
    .replace(/{id}/g, docId)
    .replace(/{created_date}/g, createdDate)
    .replace(/{updated_date}/g, updatedDate)
    .replace(/{created_time}/g, createdTime)
    .replace(/{updated_time}/g, updatedTime)
    .replace(/{created_datetime}/g, createdDateTime)
    .replace(/{updated_datetime}/g, updatedDateTime);

  // Sanitise for filesystem
  filename = filename.replace(/[<>:"/\\|?*]/g, '');
  filename = filename.replace(/\s+/g, '_');

  return filename;
}

function extractAttendees(doc, settings) {
  var names = [];
  var seen = {};

  function addName(name) {
    if (!name) return;
    var key = name.toLowerCase().trim();
    if (seen[key]) return;
    // Exclude user's own name
    if (settings.excludeMyName && key === settings.excludeMyName.toLowerCase().trim()) return;
    seen[key] = true;
    names.push(name.trim());
  }

  // Extract from people array
  if (doc.people && Array.isArray(doc.people)) {
    for (var i = 0; i < doc.people.length; i++) {
      var person = doc.people[i];
      if (person.name) {
        addName(person.name);
      } else if (person.display_name) {
        addName(person.display_name);
      } else if (person.details && person.details.person && person.details.person.name) {
        var pn = person.details.person.name;
        addName(pn.fullName || (pn.givenName && pn.familyName ? pn.givenName + ' ' + pn.familyName : pn.givenName));
      } else if (person.email) {
        addName(person.email.split('@')[0].replace(/[._]/g, ' '));
      }
    }
  }

  // Extract from calendar event attendees
  if (doc.google_calendar_event && doc.google_calendar_event.attendees) {
    var attendees = doc.google_calendar_event.attendees;
    for (var i = 0; i < attendees.length; i++) {
      var a = attendees[i];
      if (a.displayName) {
        addName(a.displayName);
      } else if (a.email) {
        addName(a.email.split('@')[0].replace(/[._]/g, ' '));
      }
    }
  }

  if (names.length === 0) return null;

  // Format as hashtags using configurable template
  var template = settings.attendeeTagTemplate || 'person/{name}';
  var tags = names.map(function(name) {
    var clean = name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    return '#' + template.replace(/\{name\}/g, clean);
  });

  return tags.join(' ');
}

// =============================================================================
// NOTE MANAGEMENT
// =============================================================================

function findExistingNote(granolaId) {
  var allNotes = DataStore.projectNotes || [];
  var marker = '<!-- granola_id: ' + granolaId + ' -->';

  for (var i = 0; i < allNotes.length; i++) {
    var note = allNotes[i];
    var noteContent = note.content || '';
    if (noteContent.indexOf(marker) !== -1) {
      return note;
    }
  }

  return null;
}

function isNoteOutdated(note, doc) {
  if (!doc.updated_at) return false;

  var content = note.content || '';
  var match = content.match(/<!-- granola_updated_at: (.+?) -->/);
  if (!match) return true; // No timestamp means it's outdated

  var existing = new Date(match[1]);
  var incoming = new Date(doc.updated_at);
  return incoming > existing;
}

function createOrUpdateNote(doc, content, settings, folderMap) {
  var folder = settings.syncFolder;

  // Use Granola folder structure if enabled
  if (settings.enableGranolaFolders && folderMap && folderMap[doc.id]) {
    var granolaFolder = folderMap[doc.id];
    if (granolaFolder.title) {
      var cleanFolder = granolaFolder.title
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '_')
        .trim();
      folder = folder + '/' + cleanFolder;
    }
  }

  var filename = generateFilename(doc, settings);

  // Check for existing note
  var existing = findExistingNote(doc.id);

  if (existing) {
    if (settings.skipExistingNotes && !isNoteOutdated(existing, doc)) {
      return { action: 'skipped', filename: filename, folder: folder };
    }
    // Update existing note
    existing.content = content;
    return { action: 'updated', filename: filename, folder: folder };
  }

  // Create new note using newNoteWithContent(content, folder, filename)
  var result = DataStore.newNoteWithContent(content, folder, filename);
  if (result) {
    return { action: 'created', filename: filename, folder: folder };
  }

  console.log('Granola Sync: Failed to create note: ' + filename);
  return null;
}

// =============================================================================
// DAILY NOTE
// =============================================================================

function updateDailyNote(todaysNotes, settings) {
  if (!settings.enableDailyNoteIntegration || todaysNotes.length === 0) return;

  var dailyNote;
  try {
    dailyNote = DataStore.calendarNoteByDate(new Date(), 'day');
  } catch (e) {
    console.log('Granola Sync: Could not access daily note: ' + e.message);
    return;
  }

  if (!dailyNote) {
    console.log('Granola Sync: No daily note found for today');
    return;
  }

  var sectionName = settings.dailyNoteSectionName || '## Granola Meetings';

  // Sort by time
  todaysNotes.sort(function(a, b) { return a.time.localeCompare(b.time); });

  // Build meeting list (NotePlan resolves wiki-links by filename alone)
  var meetingLines = todaysNotes.map(function(note) {
    var link = '[[' + note.filename + '|' + note.title + ']]';
    return '- ' + note.time + ' ' + link;
  }).join('\n');

  var sectionContent = sectionName + '\n' + meetingLines;

  var content = dailyNote.content || '';

  // Escape section name for regex
  var escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var sectionRegex = new RegExp('^' + escaped, 'm');

  if (sectionRegex.test(content)) {
    // Replace existing section (up to next heading or end of string)
    var replaceRegex = new RegExp(escaped + '[\\s\\S]*?(?=\\n#{1,6}\\s|$)');
    content = content.replace(replaceRegex, sectionContent);
  } else {
    // Append section
    content += '\n\n' + sectionContent;
  }

  dailyNote.content = content;
  console.log('Granola Sync: Updated daily note with ' + todaysNotes.length + ' meeting(s)');
}

// =============================================================================
// SYNC COMMANDS
// =============================================================================

async function syncGranolaNotes() {
  await runSync(false);
}

async function syncGranolaNotesAll() {
  await runSync(true);
}

async function runSync(syncAll) {
  try {
    var settings = getSettings();
    var token = loadToken();
    if (!token) {
      await CommandBar.prompt('Granola Sync Error', 'No access token configured. Add your Granola token in plugin settings.');
      return;
    }

    var limit = syncAll ? null : parseInt(settings.documentSyncLimit) || 100;
    console.log('Granola Sync: Starting sync' + (syncAll ? ' (all historical)' : ' (limit: ' + limit + ')') + '...');

    // Fetch documents
    var documents = await fetchDocuments(token, limit);
    if (!documents) {
      await CommandBar.prompt('Granola Sync Error', 'Failed to fetch documents from Granola. Check your access token.');
      return;
    }
    if (documents.length === 0) {
      await CommandBar.prompt('Granola Sync', 'No documents found in Granola.');
      return;
    }

    console.log('Granola Sync: Fetched ' + documents.length + ' documents');

    // Fetch folders if needed
    var folderMap = null;
    if (settings.enableGranolaFolders) {
      var folders = await fetchFolders(token);
      if (folders) {
        folderMap = {};
        for (var f = 0; f < folders.length; f++) {
          var folder = folders[f];
          if (folder.document_ids) {
            for (var d = 0; d < folder.document_ids.length; d++) {
              folderMap[folder.document_ids[d]] = folder;
            }
          }
        }
      }
    }

    var created = 0;
    var updated = 0;
    var skipped = 0;
    var failed = 0;
    var todaysNotes = [];
    var today = new Date().toDateString();

    for (var i = 0; i < documents.length; i++) {
      var doc = documents[i];
      try {
        // Fetch transcript if enabled
        var transcript = null;
        if (settings.includeTranscript) {
          var transcriptData = await fetchTranscript(token, doc.id);
          transcript = transcriptToMarkdown(transcriptData);
        }

        // Check if there's any content
        var hasMyNotes = settings.includeMyNotes && extractPanelContent(doc, 'my_notes');
        var hasEnhanced = settings.includeEnhancedNotes && extractPanelContent(doc, 'enhanced_notes');
        var hasTranscript = settings.includeTranscript && transcript;

        if (!hasMyNotes && !hasEnhanced && !hasTranscript) {
          skipped++;
          continue;
        }

        var content = buildNoteContent(doc, settings, transcript);
        var result = createOrUpdateNote(doc, content, settings, folderMap);

        if (!result) {
          failed++;
          continue;
        }

        if (result.action === 'created') created++;
        else if (result.action === 'updated') updated++;
        else if (result.action === 'skipped') skipped++;

        // Collect today's notes for daily note
        if (doc.created_at) {
          var noteDate = new Date(doc.created_at).toDateString();
          if (noteDate === today && result.action !== 'skipped') {
            var createdDate = new Date(doc.created_at);
            todaysNotes.push({
              title: doc.title || 'Untitled Granola Note',
              time: String(createdDate.getHours()).padStart(2, '0') + ':' + String(createdDate.getMinutes()).padStart(2, '0'),
              filename: result.filename,
              folder: result.folder,
            });
          }
        }
      } catch (err) {
        console.log('Granola Sync: Error processing "' + (doc.title || doc.id) + '": ' + (err.message || err));
        failed++;
      }
    }

    // Update daily note
    updateDailyNote(todaysNotes, settings);

    // Summary
    var parts = [];
    if (created > 0) parts.push(created + ' created');
    if (updated > 0) parts.push(updated + ' updated');
    if (skipped > 0) parts.push(skipped + ' skipped');
    if (failed > 0) parts.push(failed + ' failed');
    var summary = parts.length > 0 ? parts.join(', ') : 'no changes';

    console.log('Granola Sync: Complete — ' + summary);
    await CommandBar.prompt('Granola Sync Complete', summary);

  } catch (error) {
    console.log('Granola Sync: Sync failed — ' + (error.message || error));
    await CommandBar.prompt('Granola Sync Error', 'Sync failed: ' + (error.message || error));
  }
}

// =============================================================================
// DUPLICATE DETECTION
// =============================================================================

async function findGranolaDuplicates() {
  var allNotes = DataStore.projectNotes || [];
  var idMap = {};
  var duplicateCount = 0;

  for (var i = 0; i < allNotes.length; i++) {
    var note = allNotes[i];
    var content = note.content || '';
    var match = content.match(/<!-- granola_id: (.+?) -->/);
    if (!match) continue;

    var granolaId = match[1];
    if (!idMap[granolaId]) {
      idMap[granolaId] = [];
    }
    idMap[granolaId].push(note.title || note.filename || 'Unknown');
  }

  var reportLines = [];
  var keys = Object.keys(idMap);
  for (var k = 0; k < keys.length; k++) {
    var id = keys[k];
    if (idMap[id].length > 1) {
      duplicateCount++;
      reportLines.push('Granola ID: ' + id);
      for (var n = 0; n < idMap[id].length; n++) {
        reportLines.push('  - ' + idMap[id][n]);
      }
      reportLines.push('');
    }
  }

  if (duplicateCount === 0) {
    await CommandBar.prompt('Granola Sync', 'No duplicate Granola notes found.');
  } else {
    var settings = getSettings();
    var report = '# Granola Duplicate Notes Report\n\n';
    report += 'Found ' + duplicateCount + ' Granola IDs with multiple notes:\n\n';
    report += reportLines.join('\n');
    report += '\n<!-- Generated by Granola Sync -->';
    DataStore.newNoteWithContent(report, settings.syncFolder, 'Granola_Duplicates_Report');
    await CommandBar.prompt('Granola Sync', 'Found ' + duplicateCount + ' duplicate(s). Report created in ' + settings.syncFolder + ' folder.');
  }
}

// =============================================================================
// SETTINGS HANDLER
// =============================================================================

function onSettingsUpdated() {
  console.log('Granola Sync: Settings updated');
}
