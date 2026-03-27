// Granola Sync for NotePlan v2.1.0
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
  includeDateInTitle: true,
  includeMyNotes: true,
  includeEnhancedNotes: true,
  includeTranscript: false,
  includeAttendeeTags: false,
  excludeMyName: '',
  excludeMyEmail: '',
  attendeeTagTemplate: 'person/{name}',
  attendeeFormat: 'hashtags',
  attendeePageFolder: 'People',
  includeGranolaUrl: false,
  enableGranolaFolders: false,
  enableDailyNoteIntegration: true,
  dailyNoteSectionName: '## Granola Meetings',
  enableWeeklyNoteIntegration: false,
  weeklyNoteSectionName: '## Granola Meetings',
  enableMonthlyNoteIntegration: false,
  monthlyNoteSectionName: '## Granola Meetings',
};

var BOOL_KEYS = [
  'skipExistingNotes', 'includeDateInTitle', 'includeMyNotes', 'includeEnhancedNotes',
  'includeTranscript', 'includeAttendeeTags', 'enableGranolaFolders',
  'enableDailyNoteIntegration', 'includeGranolaUrl',
  'enableWeeklyNoteIntegration', 'enableMonthlyNoteIntegration',
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

function buildNoteContent(doc, settings, transcript, calendarMatch, meetingTime) {
  var sections = [];
  var title = (doc.title || 'Untitled Granola Note').replace(/[<>:"/\\|?*]/g, '').trim();

  if (settings.includeDateInTitle && meetingTime) {
    title = formatDate(meetingTime, settings.dateFormat) + ' - ' + title;
  }

  sections.push('# ' + title);

  // Calendar event link
  if (calendarMatch && calendarMatch.calendarItemLink) {
    sections.push('\n[Calendar Event](' + calendarMatch.calendarItemLink + ')');
  }

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

  // Attendee tags / links
  if (settings.includeAttendeeTags) {
    var names = getAttendeeNames(doc, settings);
    var attendeeStr = null;
    if (settings.attendeeFormat === 'wiki-links') {
      attendeeStr = formatAttendeeLinks(names);
    } else {
      attendeeStr = formatAttendeeTags(names, settings);
    }
    if (attendeeStr) {
      sections.push('\n---\n' + attendeeStr);
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

function getAttendeeNames(doc, settings) {
  var attendees = [];    // array of {name, email, domain}
  var seenEmail = {};    // key: lowercased email → true (primary dedup)
  var seenCompact = {};  // key: lowercased name with spaces stripped → true (fallback dedup for no-email attendees)

  // Collect all email→name mappings from every source first, so we can
  // prefer the richest display name for each unique email address
  var emailToName = {};  // lowercased email → best display name
  var emailToPerson = {};

  function collectSource(name, email) {
    if (!email) return;
    var key = email.toLowerCase().trim();
    // Prefer names with spaces (real display names) over username-style
    if (!emailToName[key] || (name && name.indexOf(' ') !== -1 && emailToName[key].indexOf(' ') === -1)) {
      emailToName[key] = name || email.split('@')[0].replace(/[._]/g, ' ');
    }
  }

  if (doc.people && Array.isArray(doc.people)) {
    for (var i = 0; i < doc.people.length; i++) {
      var p = doc.people[i];
      var pName = p.name || p.display_name || '';
      if (!pName && p.details && p.details.person && p.details.person.name) {
        var pn = p.details.person.name;
        pName = pn.fullName || (pn.givenName && pn.familyName ? pn.givenName + ' ' + pn.familyName : pn.givenName) || '';
      }
      collectSource(pName, p.email);
    }
  }
  if (doc.google_calendar_event && doc.google_calendar_event.attendees) {
    var calAttendees = doc.google_calendar_event.attendees;
    for (var i = 0; i < calAttendees.length; i++) {
      var ca = calAttendees[i];
      collectSource(ca.displayName, ca.email);
    }
  }

  function formatDomain(rawDomain) {
    if (!rawDomain) return '';
    var dotIdx = rawDomain.lastIndexOf('.');
    if (dotIdx <= 0) return rawDomain;
    var domainName = rawDomain.substring(0, dotIdx);
    var tld = rawDomain.substring(dotIdx);
    return domainName.replace(/(?:^|[-_])(\w)/g, function(m, c) {
      return m.slice(0, -1) + c.toUpperCase();
    }).replace(/^\w/, function(c) { return c.toUpperCase(); }) + tld;
  }

  function addAttendee(name, email) {
    var trimmedName = (name || '').trim();
    var trimmedEmail = (email || '').toLowerCase().trim();

    // If we have an email, use it as the canonical dedup key
    if (trimmedEmail) {
      if (seenEmail[trimmedEmail]) return;
      seenEmail[trimmedEmail] = true;

      // Use the best display name we found across all sources
      var bestName = emailToName[trimmedEmail] || trimmedName || trimmedEmail.split('@')[0].replace(/[._]/g, ' ');

      // Exclude user's own email/name
      if (settings.excludeMyName) {
        var myKey = settings.excludeMyName.toLowerCase().trim();
        if (trimmedEmail === myKey || bestName.toLowerCase() === myKey ||
            bestName.toLowerCase().replace(/\s+/g, '') === myKey.replace(/\s+/g, '')) return;
      }
      if (settings.excludeMyEmail && trimmedEmail === settings.excludeMyEmail.toLowerCase().trim()) return;

      var domain = trimmedEmail.split('@')[1] || '';
      attendees.push({ name: bestName, email: trimmedEmail, domain: formatDomain(domain) });
      return;
    }

    // No email — fall back to compact name dedup
    if (!trimmedName) return;
    var compact = trimmedName.toLowerCase().replace(/\s+/g, '');
    if (seenCompact[compact]) return;

    if (settings.excludeMyName) {
      var myKey = settings.excludeMyName.toLowerCase().trim();
      if (trimmedName.toLowerCase() === myKey || compact === myKey.replace(/\s+/g, '')) return;
    }

    seenCompact[compact] = true;
    attendees.push({ name: trimmedName, email: '', domain: '' });
  }

  // Process people array first (richer names)
  if (doc.people && Array.isArray(doc.people)) {
    for (var i = 0; i < doc.people.length; i++) {
      var person = doc.people[i];
      var personName = person.name || person.display_name || '';
      if (!personName && person.details && person.details.person && person.details.person.name) {
        var pn = person.details.person.name;
        personName = pn.fullName || (pn.givenName && pn.familyName ? pn.givenName + ' ' + pn.familyName : pn.givenName) || '';
      }
      addAttendee(personName, person.email);
    }
  }

  // Calendar attendees second — same emails already seen will be skipped
  if (doc.google_calendar_event && doc.google_calendar_event.attendees) {
    var calAtt = doc.google_calendar_event.attendees;
    for (var i = 0; i < calAtt.length; i++) {
      var a = calAtt[i];
      addAttendee(a.displayName, a.email);
    }
  }

  return attendees;
}

function formatAttendeeTags(attendees, settings) {
  if (attendees.length === 0) return null;
  var template = settings.attendeeTagTemplate || 'person/{name}';
  var tags = attendees.map(function(att) {
    var name = typeof att === 'string' ? att : att.name;
    var clean = name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    return '#' + template.replace(/\{name\}/g, clean);
  });
  return tags.join(' ');
}

// Group attendees by domain and format as wiki-links
function formatAttendeeLinks(attendees) {
  if (attendees.length === 0) return null;

  // Group by domain
  var groups = {};   // domain → [names]
  var noDomain = []; // attendees without a domain
  for (var i = 0; i < attendees.length; i++) {
    var att = attendees[i];
    var name = typeof att === 'string' ? att : att.name;
    var domain = (typeof att === 'string' ? '' : att.domain) || '';
    if (domain) {
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(name);
    } else {
      noDomain.push(name);
    }
  }

  var lines = [];
  // Sort domains alphabetically
  var domains = Object.keys(groups).sort();
  for (var d = 0; d < domains.length; d++) {
    var dom = domains[d];
    var names = groups[dom];
    lines.push('**' + dom + '**');
    for (var n = 0; n < names.length; n++) {
      lines.push('[[' + names[n] + ']]');
    }
    lines.push(''); // blank line between groups
  }

  if (noDomain.length > 0) {
    if (lines.length > 0) lines.push('**Other**');
    for (var n = 0; n < noDomain.length; n++) {
      lines.push('[[' + noDomain[n] + ']]');
    }
  }

  return lines.join('\n');
}

// =============================================================================
// PERSON PAGE MANAGEMENT
// =============================================================================

// In-memory cache of person pages created during this sync run,
// keyed by lowercase email. Stores the note reference so we can
// update it even before DataStore.projectNotes refreshes.
var _personPageCache = {};

function resetPersonPageCache() {
  _personPageCache = {};
}

// Find a person page by scanning for person_email in YAML frontmatter.
// NotePlan hides frontmatter behind the collapsed PROPERTIES section.
function findPersonPage(email, baseFolder) {
  if (!email) return null;
  var key = email.toLowerCase().trim();

  // Check in-memory cache first
  if (_personPageCache[key]) {
    return _personPageCache[key];
  }

  // Match "person_email: x" inside frontmatter
  var allNotes = DataStore.projectNotes || [];
  for (var i = 0; i < allNotes.length; i++) {
    var note = allNotes[i];
    var fn = note.filename || '';
    if (fn.indexOf(baseFolder + '/') === 0) {
      var content = note.content || '';
      // Check frontmatter block
      if (content.indexOf('---') === 0) {
        var endFm = content.indexOf('\n---', 3);
        if (endFm !== -1) {
          var frontmatter = content.substring(0, endFm);
          if (frontmatter.indexOf('person_email: ' + key) !== -1) {
            _personPageCache[key] = note;
            return note;
          }
        }
      }
      // Also match old HTML comment style for migration
      if (content.indexOf('<!-- person_email: ' + key + ' -->') !== -1) {
        _personPageCache[key] = note;
        return note;
      }
    }
  }
  return null;
}

// Fallback: find by filename for pages created before email tracking
function findPersonPageByName(name, baseFolder) {
  if (!name) return null;
  var key = name.toLowerCase().trim();
  var keyCompact = key.replace(/\s+/g, '');

  var allNotes = DataStore.projectNotes || [];
  for (var i = 0; i < allNotes.length; i++) {
    var note = allNotes[i];
    var fn = note.filename || '';
    if (fn.indexOf(baseFolder + '/') === 0) {
      var lastSlash = fn.lastIndexOf('/');
      var basename = fn.substring(lastSlash + 1).replace(/\.(md|txt)$/i, '');
      var baseKey = basename.toLowerCase().trim();
      var baseCompact = baseKey.replace(/\s+/g, '');
      if (baseKey === key || baseCompact === keyCompact) {
        return note;
      }
    }
  }
  return null;
}

function appendMeetingToPersonPage(note, meetingEntry, meetingLine) {
  var content = note.content || '';
  // Check by title (used in wiki-link) or filename (legacy links)
  if (content.indexOf('[[' + meetingEntry.title + ']]') !== -1) return;
  if (content.indexOf(meetingEntry.filename) !== -1) return; // legacy check

  var meetingsIdx = content.indexOf('## Meetings');
  if (meetingsIdx !== -1) {
    note.content = content.trimEnd() + '\n' + meetingLine;
  } else {
    note.content = content.trimEnd() + '\n\n## Meetings\n\n' + meetingLine;
  }
}

// Migrate old HTML comment markers to frontmatter
function migratePersonEmailMarker(note, email) {
  var content = note.content || '';
  var key = email.toLowerCase().trim();
  var oldMarker = '<!-- person_email: ' + key + ' -->';
  var hasFrontmatter = content.indexOf('---') === 0 && content.indexOf('\n---', 3) !== -1;
  var hasOldMarker = content.indexOf(oldMarker) !== -1;

  // Already has frontmatter with person_email — nothing to do
  if (hasFrontmatter) {
    var endFm = content.indexOf('\n---', 3);
    var fm = content.substring(0, endFm);
    if (fm.indexOf('person_email:') !== -1) {
      // Just strip the old HTML comment if present
      if (hasOldMarker) {
        note.content = content.replace(oldMarker, '').replace(/\n{3,}/g, '\n\n').trimEnd();
      }
      return;
    }
  }

  // Add frontmatter
  if (hasFrontmatter) {
    // Append to existing frontmatter
    var endFm = content.indexOf('\n---', 3);
    note.content = content.substring(0, endFm) + '\nperson_email: ' + key + content.substring(endFm);
  } else {
    // Create new frontmatter block
    note.content = '---\nperson_email: ' + key + '\n---\n' + content;
  }

  // Strip old HTML comment marker
  if (hasOldMarker) {
    note.content = note.content.replace(oldMarker, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  }
}

function createOrUpdatePersonPage(attendee, meetingEntry, settings) {
  var name = typeof attendee === 'string' ? attendee : attendee.name;
  var email = typeof attendee === 'string' ? '' : (attendee.email || '');
  var domain = typeof attendee === 'string' ? '' : (attendee.domain || '');

  var baseFolder = settings.attendeePageFolder || 'People';
  var folder = domain ? baseFolder + '/' + domain : baseFolder;

  var meetingDate = formatDate(meetingEntry.date, settings.dateFormat);
  // NotePlan resolves wiki-links by note title (# heading), not filename/path
  var meetingLine = '- ' + meetingDate + ' ' + meetingEntry.time + ' [[' + meetingEntry.title + ']]';

  // Primary lookup: find by email in frontmatter (or old HTML comment)
  var existing = email ? findPersonPage(email, baseFolder) : null;

  // Fallback: find by filename (handles pages created before email tracking)
  if (!existing) {
    existing = findPersonPageByName(name, baseFolder);
    // If found by name, add/migrate email frontmatter
    if (existing && email) {
      migratePersonEmailMarker(existing, email);
      _personPageCache[email.toLowerCase().trim()] = existing;
    }
  }

  if (existing && !existing._placeholder) {
    // Migrate old HTML markers to frontmatter on existing pages
    if (email) migratePersonEmailMarker(existing, email);
    appendMeetingToPersonPage(existing, meetingEntry, meetingLine);
    return;
  }

  // Placeholder from earlier in this sync — try fresh DataStore scan
  if (existing && existing._placeholder) {
    var key = email.toLowerCase().trim();
    var allNotes = DataStore.projectNotes || [];
    for (var i = 0; i < allNotes.length; i++) {
      var note = allNotes[i];
      var content = note.content || '';
      if (content.indexOf('person_email: ' + key) !== -1) {
        _personPageCache[key] = note;
        appendMeetingToPersonPage(note, meetingEntry, meetingLine);
        return;
      }
    }
    console.log('Granola Sync: Person page for "' + name + '" (' + email + ') was created but cannot be found for update, skipping');
    return;
  }

  // Create new person page with email in frontmatter
  var frontmatter = email ? '---\nperson_email: ' + email.toLowerCase().trim() + '\n---\n' : '';
  var pageContent = frontmatter + '# ' + name + '\n\n## Notes\n\n\n\n## Meetings\n\n' + meetingLine;
  DataStore.newNoteWithContent(pageContent, folder, name);

  // Cache
  if (email) {
    var cacheKey = email.toLowerCase().trim();
    var created = findPersonPage(email, baseFolder);
    if (!created) {
      _personPageCache[cacheKey] = { _placeholder: true, name: name, email: email };
    }
  }
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

var MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function createOrUpdateNote(doc, content, settings, folderMap) {
  var folder = settings.syncFolder;

  // Organise into Year/Month subfolders based on meeting date
  var meetingDate = doc.created_at ? new Date(doc.created_at) : null;
  if (meetingDate && !isNaN(meetingDate.getTime())) {
    var year = String(meetingDate.getFullYear());
    var month = MONTH_NAMES[meetingDate.getMonth()];
    folder = folder + '/' + year + '/' + month;
  }

  // Append Granola folder structure if enabled (nested inside Year/Month)
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
      return { action: 'skipped_current', filename: filename, folder: folder };
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
// CALENDAR EVENT MATCHING
// =============================================================================

function matchCalendarEvent(doc, calendarEvents) {
  if (!calendarEvents || !Array.isArray(calendarEvents) || calendarEvents.length === 0) return null;
  if (!doc.google_calendar_event) return null;

  var gcalEvent = doc.google_calendar_event;
  var gcalTitle = (gcalEvent.summary || '').toLowerCase().trim();
  var gcalStart = gcalEvent.start && gcalEvent.start.dateTime ? new Date(gcalEvent.start.dateTime) : null;

  if (!gcalTitle && !gcalStart) return null;

  var TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

  for (var i = 0; i < calendarEvents.length; i++) {
    var event = calendarEvents[i];
    var eventTitle = (event.title || '').toLowerCase().trim();
    var eventDate = event.date ? new Date(event.date) : null;

    // Match by title
    var titleMatch = gcalTitle && eventTitle && (gcalTitle === eventTitle || eventTitle.indexOf(gcalTitle) !== -1 || gcalTitle.indexOf(eventTitle) !== -1);

    // Match by start time (within tolerance)
    var timeMatch = false;
    if (gcalStart && eventDate) {
      timeMatch = Math.abs(gcalStart.getTime() - eventDate.getTime()) <= TOLERANCE_MS;
    }

    // Require title match + time match for confidence, or exact title match alone
    if (titleMatch && timeMatch) {
      return event;
    }
    if (titleMatch && gcalTitle === eventTitle) {
      return event;
    }
  }

  return null;
}

// =============================================================================
// CALENDAR NOTE HELPERS
// =============================================================================

function replaceSectionInNote(note, sectionName, sectionContent) {
  var content = note.content || '';

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

  note.content = content;
}

function formatMeetingLine(note) {
  // NotePlan resolves wiki-links by note title (# heading), not filename/path
  var link = '[[' + note.title + ']]';
  return '- ' + note.time + ' ' + link;
}

var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDayHeading(date) {
  return '### ' + DAY_NAMES[date.getDay()] + ' ' + date.getDate() + ' ' + MONTH_NAMES[date.getMonth()];
}

function buildGroupedByDayContent(notes, sectionName) {
  // Sort by date then time
  notes.sort(function(a, b) {
    var dateComp = a.date.getTime() - b.date.getTime();
    if (dateComp !== 0) return dateComp;
    return a.time.localeCompare(b.time);
  });

  // Group by day
  var days = [];
  var currentDay = null;
  var currentLines = [];

  for (var i = 0; i < notes.length; i++) {
    var dayStr = notes[i].date.toDateString();
    if (dayStr !== currentDay) {
      if (currentDay !== null) {
        days.push({ date: currentDate, lines: currentLines });
      }
      currentDay = dayStr;
      var currentDate = notes[i].date;
      currentLines = [];
    }
    currentLines.push(formatMeetingLine(notes[i]));
  }
  if (currentDay !== null) {
    days.push({ date: currentDate, lines: currentLines });
  }

  var parts = [sectionName];
  for (var d = 0; d < days.length; d++) {
    parts.push(formatDayHeading(days[d].date));
    parts.push(days[d].lines.join('\n'));
  }

  return parts.join('\n');
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

  var meetingLines = todaysNotes.map(function(note) {
    return formatMeetingLine(note);
  }).join('\n');

  replaceSectionInNote(dailyNote, sectionName, sectionName + '\n' + meetingLines);
  console.log('Granola Sync: Updated daily note with ' + todaysNotes.length + ' meeting(s)');
}

// =============================================================================
// WEEKLY NOTE
// =============================================================================

function updateWeeklyNote(thisWeeksNotes, settings) {
  if (!settings.enableWeeklyNoteIntegration || thisWeeksNotes.length === 0) return;

  var weeklyNote;
  try {
    weeklyNote = DataStore.calendarNoteByDate(new Date(), 'week');
  } catch (e) {
    console.log('Granola Sync: Could not access weekly note: ' + e.message);
    return;
  }

  if (!weeklyNote) {
    console.log('Granola Sync: No weekly note found');
    return;
  }

  var sectionName = settings.weeklyNoteSectionName || '## Granola Meetings';
  var sectionContent = buildGroupedByDayContent(thisWeeksNotes, sectionName);

  replaceSectionInNote(weeklyNote, sectionName, sectionContent);
  console.log('Granola Sync: Updated weekly note with ' + thisWeeksNotes.length + ' meeting(s)');
}

// =============================================================================
// MONTHLY NOTE
// =============================================================================

function updateMonthlyNote(thisMonthsNotes, settings) {
  if (!settings.enableMonthlyNoteIntegration || thisMonthsNotes.length === 0) return;

  var monthlyNote;
  try {
    monthlyNote = DataStore.calendarNoteByDate(new Date(), 'month');
  } catch (e) {
    console.log('Granola Sync: Could not access monthly note: ' + e.message);
    return;
  }

  if (!monthlyNote) {
    console.log('Granola Sync: No monthly note found');
    return;
  }

  var sectionName = settings.monthlyNoteSectionName || '## Granola Meetings';
  var sectionContent = buildGroupedByDayContent(thisMonthsNotes, sectionName);

  replaceSectionInNote(monthlyNote, sectionName, sectionContent);
  console.log('Granola Sync: Updated monthly note with ' + thisMonthsNotes.length + ' meeting(s)');
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

    resetPersonPageCache();
    var limit = syncAll ? null : parseInt(settings.documentSyncLimit) || 100;
    console.log('Granola Sync: Starting sync' + (syncAll ? ' (all historical)' : ' (limit: ' + limit + ')') + '...');

    // Move heavy work to async thread so UI stays responsive
    await CommandBar.onAsyncThread();

    // Fetch documents
    CommandBar.showLoading(true, 'Fetching documents from Granola...');
    var documents = await fetchDocuments(token, limit);
    if (!documents) {
      CommandBar.showLoading(false);
      await CommandBar.onMainThread();
      await CommandBar.prompt('Granola Sync Error', 'Failed to fetch documents from Granola. Check your access token.');
      return;
    }
    if (documents.length === 0) {
      CommandBar.showLoading(false);
      await CommandBar.onMainThread();
      await CommandBar.prompt('Granola Sync', 'No documents found in Granola.');
      return;
    }

    console.log('Granola Sync: Fetched ' + documents.length + ' documents');

    // Fetch folders if needed
    var folderMap = null;
    if (settings.enableGranolaFolders) {
      CommandBar.showLoading(true, 'Fetching Granola folders...');
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
    var skippedEmpty = 0;   // no content (no notes, no enhanced, no transcript)
    var skippedCurrent = 0; // already up-to-date
    var failed = 0;
    var todaysNotes = [];
    var thisWeeksNotes = [];
    var thisMonthsNotes = [];
    var now = new Date();
    var today = now.toDateString();
    var thisYear = now.getFullYear();
    var thisMonth = now.getMonth();

    // Week bounds: find start (Monday) and end (Sunday) of current week
    var dayOfWeek = now.getDay();
    var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    var weekStart = new Date(thisYear, now.getMonth(), now.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Fetch calendar events for matching (on main thread)
    var calendarEvents = null;
    try {
      await CommandBar.onMainThread();
      calendarEvents = await Calendar.eventsBetween(weekStart, weekEnd);
      await CommandBar.onAsyncThread();
    } catch (e) {
      console.log('Granola Sync: Could not fetch calendar events: ' + (e.message || e));
      try { await CommandBar.onAsyncThread(); } catch (ignore) {}
    }

    for (var i = 0; i < documents.length; i++) {
      var doc = documents[i];
      var progress = (i + 1) / documents.length;
      CommandBar.showLoading(true, 'Processing ' + (i + 1) + '/' + documents.length + ': ' + (doc.title || 'Untitled'), progress);

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
          skippedEmpty++;
          console.log('Granola Sync: Skipped (no content): ' + (doc.title || doc.id));
          continue;
        }

        // Determine meeting time: prefer calendar event start over doc.created_at
        var meetingTime;
        if (doc.google_calendar_event && doc.google_calendar_event.start && doc.google_calendar_event.start.dateTime) {
          meetingTime = new Date(doc.google_calendar_event.start.dateTime);
        } else {
          meetingTime = new Date(doc.created_at);
        }

        // Match to a NotePlan calendar event
        var calendarMatch = matchCalendarEvent(doc, calendarEvents);

        var content = buildNoteContent(doc, settings, transcript, calendarMatch, meetingTime);

        // Return to main thread for DataStore operations
        await CommandBar.onMainThread();
        var result = createOrUpdateNote(doc, content, settings, folderMap);
        await CommandBar.onAsyncThread();

        if (!result) {
          failed++;
          continue;
        }

        if (result.action === 'created') created++;
        else if (result.action === 'updated') updated++;
        else if (result.action === 'skipped_current') {
          skippedCurrent++;
          console.log('Granola Sync: Skipped (unchanged): ' + (doc.title || doc.id));
        }

        // Collect notes for calendar note updates (include ALL synced docs, even skipped)
        var displayTitle = doc.title || 'Untitled Granola Note';
        if (settings.includeDateInTitle && meetingTime) {
          displayTitle = formatDate(meetingTime, settings.dateFormat) + ' - ' + displayTitle;
        }
        var noteEntry = {
          title: displayTitle,
          time: String(meetingTime.getHours()).padStart(2, '0') + ':' + String(meetingTime.getMinutes()).padStart(2, '0'),
          filename: result.filename,
          folder: result.folder,
          date: meetingTime,
        };

        // Create/update person pages for attendees (wiki-links mode only)
        if (settings.includeAttendeeTags && settings.attendeeFormat === 'wiki-links') {
          var docAttendees = getAttendeeNames(doc, settings);
          if (docAttendees.length > 0) {
            await CommandBar.onMainThread();
            for (var j = 0; j < docAttendees.length; j++) {
              try {
                createOrUpdatePersonPage(docAttendees[j], noteEntry, settings);
              } catch (personErr) {
                var errName = docAttendees[j].name || docAttendees[j];
                console.log('Granola Sync: Error creating person page for "' + errName + '": ' + (personErr.message || personErr));
              }
            }
            await CommandBar.onAsyncThread();
          }
        }

        // Daily: matches today
        if (meetingTime.toDateString() === today) {
          todaysNotes.push(noteEntry);
        }

        // Weekly: within current week bounds
        if (meetingTime >= weekStart && meetingTime <= weekEnd) {
          thisWeeksNotes.push(noteEntry);
        }

        // Monthly: same year and month
        if (meetingTime.getFullYear() === thisYear && meetingTime.getMonth() === thisMonth) {
          thisMonthsNotes.push(noteEntry);
        }
      } catch (err) {
        console.log('Granola Sync: Error processing "' + (doc.title || doc.id) + '": ' + (err.message || err));
        failed++;
      }
    }

    CommandBar.showLoading(false);

    // Return to main thread for UI and DataStore operations
    await CommandBar.onMainThread();

    // Update calendar notes
    updateDailyNote(todaysNotes, settings);
    updateWeeklyNote(thisWeeksNotes, settings);
    updateMonthlyNote(thisMonthsNotes, settings);

    // Summary
    var parts = [];
    if (created > 0) parts.push(created + ' created');
    if (updated > 0) parts.push(updated + ' updated');
    if (skippedCurrent > 0) parts.push(skippedCurrent + ' unchanged');
    if (skippedEmpty > 0) parts.push(skippedEmpty + ' empty (no notes/transcript)');
    if (failed > 0) parts.push(failed + ' failed');
    var summary = parts.length > 0 ? parts.join(', ') : 'no changes';

    console.log('Granola Sync: Complete — ' + summary);
    await CommandBar.prompt('Granola Sync Complete', summary);

  } catch (error) {
    CommandBar.showLoading(false);
    try { await CommandBar.onMainThread(); } catch (e) { /* already on main */ }
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
