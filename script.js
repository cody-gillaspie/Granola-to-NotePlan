// Granola Sync for NotePlan
// Syncs Granola AI meeting notes into NotePlan

// Get default auth path based on platform
function getDefaultAuthPath() {
  // NotePlan runs on macOS/iOS, so default to macOS path
  return 'Library/Application Support/Granola/supabase.json';
}

// Load credentials from settings or supabase.json file
async function loadCredentials() {
  try {
    console.log('Loading credentials...');
    
    // Access settings - NotePlan provides settings through DataStore
    const settings = DataStore.settings || {};
    console.log('Settings accessed:', Object.keys(settings));
    
    // First, check if access token is provided directly in settings
    // Support both 'accessToken' and 'granolaAccessToken' (NotePlan support example uses granolaAccessToken)
    const token = settings.granolaAccessToken || settings.accessToken;
    if (token && token.trim() !== '') {
      console.log('Using access token from settings');
      const trimmedToken = token.trim();
      console.log('Token length after trim: ' + trimmedToken.length);
      // Remove any potential extra whitespace or newlines
      const cleanToken = trimmedToken.replace(/\s+/g, '');
      console.log('Token length after cleaning: ' + cleanToken.length);
      return cleanToken;
    }
    
    console.log('No access token in settings, attempting to read from file...');
    
    // Try to load Node.js modules - NotePlan may not support require()
    let os, path, fs;
    try {
      os = require('os');
      path = require('path');
      fs = require('fs');
      console.log('Node.js modules loaded successfully');
    } catch (requireError) {
      console.log('require() not available in NotePlan');
      console.log('Error:', requireError.message || requireError);
      console.log('Please add your Granola access token directly in plugin settings.');
      console.log('To get your token:');
      console.log('1. Open ~/Library/Application Support/Granola/supabase.json');
      console.log('2. Find "workos_tokens" or "cognito_tokens"');
      console.log('3. Extract the "access_token" value');
      console.log('4. Paste it in the "Granola Access Token" setting');
      return null;
    }
    
    const homedir = os.homedir();
    console.log('Home directory:', homedir);
    
    const authKeyPath = settings.authKeyPath || getDefaultAuthPath();
    console.log('Auth key path:', authKeyPath);
    
    // Try multiple possible paths
    const authPaths = [
      // Configured path
      path.resolve(homedir, authKeyPath),
      // macOS default
      path.resolve(homedir, 'Library/Application Support/Granola/supabase.json'),
      // Windows fallback
      path.resolve(homedir, 'AppData/Roaming/Granola/supabase.json'),
      // Linux fallback
      path.resolve(homedir, '.config/Granola/supabase.json')
    ];

    for (const authPath of authPaths) {
      try {
        if (!fs.existsSync(authPath)) {
          continue;
        }

        const credentialsFile = fs.readFileSync(authPath, 'utf8');
        const data = JSON.parse(credentialsFile);
        
        let accessToken = null;
        
        // Try new token structure (workos_tokens)
        if (data.workos_tokens) {
          try {
            const workosTokens = typeof data.workos_tokens === 'string' 
              ? JSON.parse(data.workos_tokens) 
              : data.workos_tokens;
            accessToken = workosTokens.access_token;
          } catch (e) {
            console.log('Error parsing workos_tokens:', e);
          }
        }
        
        // Fallback to old token structure (cognito_tokens)
        if (!accessToken && data.cognito_tokens) {
          try {
            const cognitoTokens = typeof data.cognito_tokens === 'string'
              ? JSON.parse(data.cognito_tokens)
              : data.cognito_tokens;
            accessToken = cognitoTokens.access_token;
          } catch (e) {
            console.log('Error parsing cognito_tokens:', e);
          }
        }
        
        if (accessToken) {
          console.log('Successfully loaded credentials from:', authPath);
          return accessToken;
        }
      } catch (error) {
        console.log('Error reading credentials from', authPath, ':', error);
        continue;
      }
    }

    console.log('No valid credentials found in any of the expected locations');
    return null;
  } catch (error) {
    console.log('Error in loadCredentials:', error);
    console.log('Error stack:', error.stack);
    return null;
  }
}

// Test function to verify Authorization headers work in NotePlan
// Run this first to confirm NotePlan is sending headers correctly
async function testAuthHeader() {
  try {
    console.log('Testing Authorization header with httpbin.org (GET)...');
    const res = await fetch("https://httpbin.org/anything", {
      method: "GET",
      headers: {
        Authorization: "Bearer TEST_TOKEN",
        "Content-Type": "application/json",
      },
    });

    const text = typeof res === 'string' ? res : await res.text();
    console.log("httpbin GET response:", text.substring(0, 500));
    
    try {
      const data = JSON.parse(text);
      if (data.headers && data.headers.Authorization) {
        console.log('SUCCESS: Authorization header was sent correctly (GET)!');
        console.log('Received header:', data.headers.Authorization);
      } else {
        console.log('WARNING: Authorization header not found in response');
        console.log('Available headers:', Object.keys(data.headers || {}));
      }
    } catch (e) {
      console.log('Could not parse httpbin response as JSON');
    }
    
    // Also test POST to see if it behaves differently
    console.log('\nTesting Authorization header with httpbin.org (POST)...');
    const resPost = await fetch("https://httpbin.org/anything", {
      method: "POST",
      headers: {
        Authorization: "Bearer TEST_TOKEN",
        "Content-Type": "application/json",
        "User-Agent": "Granola/5.354.0",
        "X-Client-Version": "5.354.0",
      },
      body: JSON.stringify({ test: "data" }),
    });

    const textPost = typeof resPost === 'string' ? resPost : await resPost.text();
    console.log("httpbin POST response:", textPost.substring(0, 500));
    
    try {
      const dataPost = JSON.parse(textPost);
      if (dataPost.headers && dataPost.headers.Authorization) {
        console.log('SUCCESS: Authorization header was sent correctly (POST)!');
        console.log('Received header:', dataPost.headers.Authorization);
        console.log('All headers sent:', Object.keys(dataPost.headers || {}));
      } else {
        console.log('WARNING: Authorization header not found in POST response');
        console.log('Available headers:', Object.keys(dataPost.headers || {}));
      }
    } catch (e) {
      console.log('Could not parse httpbin POST response as JSON');
    }
  } catch (error) {
    console.log("Test error:\n" + JSON.stringify(error));
  }
}

// Fetch documents from Granola API with pagination
// Updated to match NotePlan support's exact example
async function fetchGranolaDocuments(token) {
  console.log('Making API request to Granola...');
  console.log('Token exists: ' + (!!token));
  console.log('Token length: ' + (token ? token.length : 0));
  console.log('Token starts with: ' + (token ? token.substring(0, 20) : 'none'));
  
  const allDocuments = [];
  const limit = 50; // API batch size
  let offset = 0;
  let hasMore = true;
  
  // Build headers object exactly as NotePlan support's example
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "Granola/5.354.0",
    "X-Client-Version": "5.354.0",
  };
  
  try {
    // Fetch documents with pagination
    while (hasMore) {
      const requestBody = {
        limit: limit,
        offset: offset,
        include_last_viewed_panel: true,
      };
      
      console.log(`Fetching documents (offset: ${offset}, limit: ${limit})...`);
      
      // Match NotePlan support's exact example structure
      const res = await fetch("https://api.granola.ai/v2/get-documents", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      // NotePlan often returns the raw body string
      const text = typeof res === 'string' ? res : await res.text();
      
      // If it's JSON:
      let data;
      try {
        data = JSON.parse(text);
        
        // Check for error messages
        if (data.message) {
          const errorMsg = data.message;
          console.log('ERROR: API returned error message: ' + errorMsg);
          
          if (errorMsg === 'Unsupported client') {
            console.log('ERROR: Granola rejected the client headers (User-Agent/X-Client-Version)');
            console.log('This means Authorization header WAS sent, but Granola wants different client headers.');
            return null;
          } else if (errorMsg === 'Unauthorized') {
            console.log('ERROR: Unauthorized - This could mean:');
            console.log('1. The token is expired (Granola tokens are short-lived)');
            console.log('2. The token is invalid');
            console.log('3. The Authorization header format is incorrect');
            console.log('SUGGESTION: Try running testAuthHeader() first to verify headers work');
            return null;
          } else {
            console.log('ERROR: API error: ' + errorMsg);
            return null;
          }
        }
        
        // Check if we have docs
        if (!data || !data.docs) {
          console.log('ERROR: API response format is unexpected');
          console.log('Response keys: ' + Object.keys(data || {}).join(', '));
          return null;
        }
        
        const docs = data.docs;
        console.log(`Fetched ${docs.length} documents in this batch`);
        
        if (docs.length > 0) {
          // Log date range for this batch
          const dates = docs.map(d => d.created_at).filter(Boolean).sort();
          if (dates.length > 0) {
            console.log(`Date range in this batch: ${dates[0]} to ${dates[dates.length - 1]}`);
          }
          
          allDocuments.push(...docs);
          offset += docs.length;

          if (docs.length < limit) {
            hasMore = false;
            console.log('Reached end of documents (got fewer than limit)');
          }
        } else {
          hasMore = false;
          console.log('No more documents to fetch');
        }
      } catch (e) {
        console.log("Failed to parse JSON:", text.substring(0, 200));
        return null;
      }
    }
    
    console.log(`Total documents fetched: ${allDocuments.length}`);
    
    // Log overall date range
    if (allDocuments.length > 0) {
      const allDates = allDocuments.map(d => d.created_at).filter(Boolean).sort();
      if (allDates.length > 0) {
        console.log(`Overall date range: ${allDates[0]} (oldest) to ${allDates[allDates.length - 1]} (newest)`);
      }
      
    }
    
    return allDocuments;
  } catch (error) {
    console.log("Granola sync error:\n" + JSON.stringify(error));
    return null;
  }
}

// Helper function to process fetch response
function processFetchResponse(response) {
  console.log('Processing fetch response...');
  console.log('Response type: ' + typeof response);
    
    // NotePlan's fetch returns the response body directly as a string
    console.log('Response length: ' + (typeof response === 'string' ? response.length : 'N/A'));
    console.log('Response preview (first 500 chars): ' + (typeof response === 'string' ? response.substring(0, 500) : String(response).substring(0, 500)));
    
    let apiResponse;
    try {
      if (typeof response === 'string') {
        console.log('Response is a string, parsing JSON...');
        apiResponse = JSON.parse(response);
        console.log('JSON parsing successful');
      } else if (typeof response === 'object' && response !== null) {
        console.log('Response is already an object');
        apiResponse = response;
      } else {
        throw new Error('Unexpected response type: ' + typeof response);
      }
    } catch (parseError) {
      console.log('Error parsing response: ' + parseError.message);
      console.log('Error stack: ' + (parseError.stack || 'No stack'));
      console.log('Response preview: ' + (typeof response === 'string' ? response.substring(0, 500) : String(response).substring(0, 500)));
      throw new Error('Could not parse API response: ' + parseError.message);
    }
    
    console.log('API response type: ' + typeof apiResponse);
    const responseKeys = Object.keys(apiResponse || {});
    console.log('API response keys: ' + responseKeys.join(', '));
    
    // Check for error messages in the response
    if (apiResponse.message) {
      console.log('API returned error message: ' + apiResponse.message);
      console.log('This usually means the access token is invalid, expired, or not being sent correctly.');
      console.log('Please check:');
      console.log('1. The token in settings matches the one in supabase.json');
      console.log('2. The token has not expired');
      console.log('3. You are logged into Granola desktop app');
      throw new Error('API error: ' + apiResponse.message);
    }
    
    if (!apiResponse || !apiResponse.docs) {
      console.log('API response format is unexpected');
      const responseStr = JSON.stringify(apiResponse);
      console.log('Response preview: ' + responseStr.substring(0, 500));
      return null;
    }
    
    const docCount = apiResponse.docs.length;
    console.log('Found ' + docCount + ' documents in API response');
    return apiResponse.docs;
}

// Convert ProseMirror format to Markdown
function convertProseMirrorToMarkdown(content) {
  if (!content || typeof content !== 'object' || !content.content) {
    return '';
  }

  const processNode = (node, indentLevel = 0) => {
    if (!node || typeof node !== 'object') {
      return '';
    }

    const nodeType = node.type || '';
    const nodeContent = node.content || [];
    const text = node.text || '';

    if (nodeType === 'heading') {
      const level = node.attrs && node.attrs.level ? node.attrs.level : 1;
      const headingText = nodeContent.map(child => processNode(child, indentLevel)).join('');
      return '#'.repeat(level) + ' ' + headingText + '\n\n';
    } else if (nodeType === 'paragraph') {
      const paraText = nodeContent.map(child => processNode(child, indentLevel)).join('');
      return paraText + '\n\n';
    } else if (nodeType === 'bulletList') {
      const items = [];
      for (let i = 0; i < nodeContent.length; i++) {
        const item = nodeContent[i];
        if (item.type === 'listItem') {
          const processedItem = processListItem(item, indentLevel);
          if (processedItem) {
            items.push(processedItem);
          }
        }
      }
      return items.join('\n') + '\n\n';
    } else if (nodeType === 'text') {
      // Handle text marks (bold, italic, etc.)
      let textContent = text;
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'bold') {
            textContent = '**' + textContent + '**';
          } else if (mark.type === 'italic') {
            textContent = '*' + textContent + '*';
          } else if (mark.type === 'code') {
            textContent = '`' + textContent + '`';
          }
        }
      }
      return textContent;
    } else {
      return nodeContent.map(child => processNode(child, indentLevel)).join('');
    }
  };

  const processListItem = (listItem, indentLevel = 0) => {
    if (!listItem || !listItem.content) {
      return '';
    }

    const indent = '  '.repeat(indentLevel);
    const itemContent = listItem.content.map(child => {
      if (child.type === 'paragraph') {
        return processNode(child, indentLevel);
      } else if (child.type === 'bulletList') {
        return processNode(child, indentLevel + 1);
      }
      return processNode(child, indentLevel);
    }).join('').trim();

    if (!itemContent) {
      return '';
    }

    return indent + '- ' + itemContent;
  };

  return processNode(content).trim();
}

// Format date for filename
function formatDate(dateString, format = 'YYYY-MM-DD') {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day);
}

// Generate note title from document
// Returns filename with .md extension (no folder path)
function generateNoteTitle(doc) {
  if (!doc.title) {
    return 'Untitled_Granola_Note.md';
  }

  // Sanitize title for filename - NotePlan supports alphanumeric, _, and -
  // Replace spaces and invalid characters with underscores
  let title = doc.title
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .trim();

  // Remove .md or .txt extension if it already exists (prevent double extension)
  title = title.replace(/\.(md|txt)$/i, ''); // Remove .md or .txt at the end (case insensitive)

  if (doc.created_at) {
    const dateStr = formatDate(doc.created_at);
    title = `${dateStr}_${title}`;
  }

  // Remove extension again in case date prefix created a pattern
  title = title.replace(/\.(md|txt)$/i, '');

  // Add .md extension - NotePlan uses markdown files
  if (!title.toLowerCase().endsWith('.md')) {
    title = `${title}.md`;
  }

  return title;
}

// Find and delete notes in unwanted folders (like granola_id folders)
// This searches all project notes for ones with the given granola_id that are in unwanted folders
function deleteNotesInUnwantedFolders(granolaId) {
  try {
    console.log(`Searching for notes with granola_id "${granolaId}" in unwanted folders...`);
    
    // Get all project notes
    const allNotes = DataStore.projectNotes || [];
    const FOLDER_NAME = 'Granola';
    let deletedCount = 0;
    
    for (const note of allNotes) {
      try {
        // Check if note has content with granola_id in metadata
        // Since we removed all metadata, we'll search by filename pattern instead
        // Look for notes that might have been created with this granola_id
        // We'll match by checking if the note title matches the expected pattern
        const content = note.content || '';
        const noteFilename = note.filename || note.title || '';
        
        // Try to find granola_id in any format (frontmatter, HTML comment, etc.)
        let granolaIdMatch = content.match(/granola_id[:\s]+([^\s\n"']+)/i);
        // Also check old frontmatter format for backwards compatibility
        if (!granolaIdMatch) {
          granolaIdMatch = content.match(/^---\s*\n[\s\S]*?granola_id:\s*["']?([^"'\n]+)["']?/m);
        }
        
        // If we found a match, check if it's the right granola_id
        if (granolaIdMatch && granolaIdMatch[1] === granolaId) {
          // This note has the matching granola_id - check if it's in an unwanted folder
          if (noteFilename && typeof noteFilename === 'string') {
            // Check if filename contains any folder path
            if (noteFilename.includes('/') || noteFilename.includes('\\')) {
              const folderPath = noteFilename.split(/[/\\]/);
              const firstFolder = folderPath[0];
              
              // If it's in a folder that's not "Granola" or root (empty), it's unwanted
              if (firstFolder && firstFolder !== FOLDER_NAME && firstFolder !== '') {
                console.log(`Found note in unwanted folder "${firstFolder}": ${noteFilename}`);
                try {
                  if (typeof note.delete === 'function') {
                    note.delete();
                    deletedCount++;
                    console.log(`Deleted note in unwanted folder: ${noteFilename}`);
                  } else if (typeof DataStore.deleteNote === 'function') {
                    DataStore.deleteNote(noteFilename);
                    deletedCount++;
                    console.log(`Deleted note using DataStore.deleteNote: ${noteFilename}`);
                  }
                } catch (deleteError) {
                  console.log(`Could not delete note ${noteFilename}: ${deleteError.message}`);
                }
              }
            }
          }
        }
      } catch (noteError) {
        // Skip notes that cause errors
        continue;
      }
    }
    
    if (deletedCount > 0) {
      console.log(`Deleted ${deletedCount} note(s) in unwanted folders`);
    }
    
    return deletedCount;
  } catch (error) {
    console.log(`Error searching for notes in unwanted folders: ${error.message}`);
    return 0;
  }
}

// Create or update a note in NotePlan
// Notes are created as .txt files in root OR the Granola folder - never in subfolders
function createOrUpdateNote(doc, markdownContent) {
  const settings = DataStore.settings || {};
  const createSeparateNotes = settings.createSeparateNotes !== false; // Default to true
  
  if (!createSeparateNotes) {
    return null; // Skip creating separate notes
  }
  
  // Folder name - notes can be in root or this folder only
  const FOLDER_NAME = 'Granola';
  const granolaId = doc.id;
  
  // FIRST: Delete any existing notes with this granola_id that are in unwanted folders
  deleteNotesInUnwantedFolders(granolaId);
  
  // Generate title with .txt extension
  const title = generateNoteTitle(doc);
  const titleStr = String(title).trim();
  
  // Use just the filename with .md extension - no folder path, no slashes
  const noteTitle = titleStr;

  console.log(`Creating note: "${noteTitle}"`);
  console.log(`Content length: ${markdownContent.length} characters`);
  
  try {
    // DO NOT use frontmatter OR HTML comments - NotePlan creates folders from BOTH!
    // NotePlan appears to parse ANY structured content and create folders from it
    // NotePlan creates folders from: frontmatter, HTML comments, headings (#), and first lines
    // Solution: Start with plain text (no markdown) to prevent folder creation
    let contentStr = String(markdownContent || '').trim();
    
    // DO NOT add title to content - NotePlan creates folders from first words!
    // The title is already in the filename, so we don't need it in content
    if (contentStr.length === 0) {
      // Skip creating notes with no content to prevent folder creation issues
      console.log(`Skipping note with no content: "${noteTitle}"`);
      return null;
    }

    // Use the Granola content as-is (markdown or HTML)
    console.log(`Content ready: ${contentStr.length} chars`);
    
    // NO metadata - NotePlan creates folders from frontmatter, HTML comments, and any structured data
    // NO markdown at start - NotePlan creates folders from markdown structures
    // Just plain text to prevent any folder creation
    
    // Folder where all notes should live
    const TARGET_FOLDER = 'Granola';

    // Debug: Check available folders
    try {
      const folders = DataStore.folders || [];
      console.log(`Available folders (${folders.length}): ${folders.join(', ')}`);
      if (!folders.includes(TARGET_FOLDER)) {
        console.log(`WARNING: Granola folder not found in DataStore.folders`);
        console.log(`Checking for "Notes/Granola"...`);
        if (folders.includes('Notes/Granola')) {
          console.log(`Found "Notes/Granola" instead`);
        }
      } else {
        console.log(`✓ Found Granola folder in DataStore.folders`);
      }
    } catch (folderError) {
      console.log(`Could not verify Granola folder: ${folderError.message}`);
    }
    
    // Check if note already exists and DELETE it to create fresh
    // This avoids issues with phantom notes from previous failed attempts
    let existingNote = DataStore.projectNoteByTitle(noteTitle);

    if (existingNote) {
      const existingPath = existingNote.filename || noteTitle;
      console.log(`Note "${noteTitle}" already exists at: ${existingPath}, deleting to recreate...`);
      try {
        if (typeof existingNote.delete === 'function') {
          existingNote.delete();
          console.log(`Deleted old note: ${existingPath}`);
        }
        existingNote = null;
      } catch (deleteError) {
        console.log(`Could not delete old note: ${deleteError.message}`);
      }
    }

    // Note doesn't exist - try to create it
    // First try Granola folder, then fall back to root if that fails
    console.log(`Note doesn't exist, attempting to create it...`);

    // APPROACH: Use "Granola" as first line, followed by actual content
    // NotePlan creates folders from first line, so we use that to direct folder creation
    // while including all the actual content from the start
    const fullContent = `Granola\n\n${contentStr}`;
    console.log(`Creating note with Granola header + full content (${fullContent.length} chars total)...`);

    try {
      const createdNote = DataStore.newNoteWithContent(noteTitle, fullContent);

      if (createdNote) {
        const createdFilename = createdNote.filename || createdNote.title || noteTitle;
        console.log(`✓ Created note with full content: "${createdFilename}"`);
        console.log(`Content includes: ${contentStr.length} chars of Granola notes + Granola header`);
        return noteTitle;
      } else {
        console.log(`ERROR: newNoteWithContent returned null`);
        return null;
      }
    } catch (createError) {
      console.log(`ERROR creating note: ${createError.message || String(createError)}`);
      return null;
    }

    console.log(`ERROR: Could not create note with any approach`);
    return null;
  } catch (error) {
    console.log(`Error creating/updating note ${noteTitle}:`, error);
    console.log(`Error message: ${error.message || String(error)}`);
    return null;
  }
}

// Update daily note with meeting links
function updateDailyNote(todaysNotes) {
  const settings = DataStore.settings || {};
  
  if (!settings.enableDailyNoteIntegration) {
    return;
  }
  
  try {
    const dailyNote = DataStore.getDailyNote();
    if (!dailyNote) {
      console.log('Daily note not found, skipping daily note integration');
      return;
    }
    
    const sectionName = settings.dailyNoteSectionName || '## Granola Meetings';
    const sectionRegex = new RegExp(`^${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
    
    let content = dailyNote.content || '';
    
    // Build meeting list
    const meetingLines = todaysNotes.map(note => {
      const time = note.time || '';
      // Note title is just the filename (no folder path)
      const link = note.noteTitle ? `[[${note.noteTitle}|${note.title}]]` : note.title;
      return `- ${time} ${link}`;
    }).join('\n');
    
    const sectionContent = `${sectionName}\n${meetingLines}\n`;
    
    if (sectionRegex.test(content)) {
      // Replace existing section
      content = content.replace(
        new RegExp(`${sectionName}[\\s\\S]*?(?=\\n##|$)`, 'm'),
        sectionContent
      );
    } else {
      // Append new section
      content += '\n\n' + sectionContent;
    }
    
    dailyNote.content = content;
    console.log(`Updated daily note with ${todaysNotes.length} meetings`);
  } catch (error) {
    console.log('Error updating daily note:', error);
  }
}

// Main sync function
async function syncGranolaNotes() {
  try {
    console.log('Starting Granola sync...');
    console.log('DataStore available:', typeof DataStore !== 'undefined');
    
    // Load credentials
    console.log('Calling loadCredentials()...');
    const token = await loadCredentials();
    console.log('loadCredentials returned:', token ? 'Token found' : 'No token');
    
    if (!token) {
      console.log('Failed to load credentials');
      CommandBar.showInput('Granola Sync Error', 'Could not load credentials. Please check your auth key path in settings.', ['OK']);
      return;
    }
    
    console.log('Credentials loaded successfully, fetching documents...');
    
    // Fetch documents
    const documents = await fetchGranolaDocuments(token);
    if (!documents) {
      // Error occurred - fetchGranolaDocuments returns null on error
      CommandBar.showInput(
        'Granola Sync Error',
        'Failed to fetch documents from Granola API. This is a known limitation: NotePlan\'s fetch does not send Authorization headers correctly for POST requests. Please report this issue to NotePlan support.',
        ['OK']
      );
      return;
    }
    if (documents.length === 0) {
      CommandBar.showInput('Granola Sync', 'No documents found to sync.', ['OK']);
      return;
    }
    
    console.log(`Found ${documents.length} documents to sync`);
    
    // Log some sample titles to verify we're getting the right notes
    if (documents.length > 0) {
      console.log('Sample of fetched note titles:');
      documents.slice(0, 5).forEach((doc, idx) => {
        console.log(`  ${idx + 1}. "${doc.title || 'Untitled'}" (${doc.created_at || 'no date'})`);
      });
      if (documents.length > 5) {
        console.log(`  ... and ${documents.length - 5} more`);
      }
    }
    
    // List all existing notes before sync to see current state
    console.log('\n=== Checking existing notes before sync ===');
    try {
      const allNotesBefore = DataStore.projectNotes || [];
      console.log(`Total notes in project: ${allNotesBefore.length}`);
      allNotesBefore.slice(0, 10).forEach((note, idx) => {
        const filename = note.filename || note.title || 'unknown';
        console.log(`  ${idx + 1}. "${filename}"`);
      });
    } catch (e) {
      console.log(`Could not list existing notes: ${e.message}`);
    }
    
    let syncedCount = 0;
    const todaysNotes = [];
    const today = new Date().toDateString();
    
    // Process each document
    for (const doc of documents) {
      try {
        console.log(`Processing document: "${doc.title || 'Untitled'}"`);
        
        // Extract content - try multiple sources
        // 1. First try last_viewed_panel.content (ProseMirror format)
        // 2. Fallback to notes_markdown (already in markdown)
        // 3. Fallback to notes_plain (plain text)
        let contentToParse = null;
        let contentSource = null;
        
        // Check last_viewed_panel.content - can be ProseMirror object or HTML string
        if (doc.last_viewed_panel && doc.last_viewed_panel.content) {
          if (typeof doc.last_viewed_panel.content === 'object' && doc.last_viewed_panel.content.type === 'doc') {
            // ProseMirror format
            contentToParse = doc.last_viewed_panel.content;
            contentSource = 'last_viewed_panel.content (ProseMirror)';
            console.log(`Found content in doc.last_viewed_panel.content (ProseMirror)`);
          } else if (typeof doc.last_viewed_panel.content === 'string' && doc.last_viewed_panel.content.trim().length > 0) {
            // HTML string format
            contentToParse = doc.last_viewed_panel.content;
            contentSource = 'last_viewed_panel.content (HTML)';
            console.log(`Found content in doc.last_viewed_panel.content (HTML string, ${doc.last_viewed_panel.content.length} chars)`);
          }
        }
        
        // Fallback to notes_markdown if last_viewed_panel.content didn't work
        if (!contentToParse && doc.notes_markdown) {
          const notesMarkdownStr = String(doc.notes_markdown);
          if (notesMarkdownStr.trim().length > 0) {
            contentToParse = notesMarkdownStr;
            contentSource = 'notes_markdown';
            console.log(`Found content in doc.notes_markdown (${notesMarkdownStr.length} chars)`);
          } else {
            console.log(`notes_markdown exists but is empty (length: ${notesMarkdownStr.length})`);
          }
        }
        
        // Fallback to notes_plain as last resort
        if (!contentToParse && doc.notes_plain) {
          const notesPlainStr = String(doc.notes_plain);
          if (notesPlainStr.trim().length > 0) {
            contentToParse = notesPlainStr;
            contentSource = 'notes_plain';
            console.log(`Found content in doc.notes_plain (${notesPlainStr.length} chars)`);
          }
        }
        
        if (!contentToParse) {
          console.log(`WARNING: No content found for document "${doc.title || doc.id}"`);
        }
        
        // Convert content to markdown
        let markdownContent = '';
        if (contentToParse) {
          if (contentSource === 'notes_markdown' || contentSource === 'notes_plain') {
            // Already text/markdown, use directly
            markdownContent = String(contentToParse);
            console.log(`Using ${contentSource} directly (${markdownContent.length} chars)`);
          } else if (contentSource === 'last_viewed_panel.content (HTML)') {
            // HTML string - use directly (NotePlan can handle HTML in markdown)
            markdownContent = String(contentToParse);
            console.log(`Using HTML content directly (${markdownContent.length} chars)`);
          } else {
            // ProseMirror format, convert it
            markdownContent = convertProseMirrorToMarkdown(contentToParse);
            console.log(`Converted ProseMirror content (${markdownContent.length} chars)`);
          }
        }
        
        // If no content, use empty string instead of "*No content available*"
        // NotePlan creates folders from the first line of content, so we avoid text that could become a folder name
        if (!markdownContent || markdownContent.trim().length === 0) {
          markdownContent = '';
        }
        
        // Create or update note
        const noteTitle = createOrUpdateNote(doc, markdownContent);
        
        if (noteTitle) {
          syncedCount++;
        }
        
        // Collect today's notes for daily note integration
        if (doc.created_at) {
          const noteDate = new Date(doc.created_at).toDateString();
          if (noteDate === today) {
            const createdDate = new Date(doc.created_at);
            const hours = String(createdDate.getHours()).padStart(2, '0');
            const minutes = String(createdDate.getMinutes()).padStart(2, '0');
            
            todaysNotes.push({
              title: doc.title || 'Untitled Granola Note',
              time: `${hours}:${minutes}`,
              noteTitle: noteTitle
            });
          }
        }
      } catch (error) {
        console.log(`Error processing document ${doc.title || doc.id}:`, error);
      }
    }
    
    // Update daily note if enabled
    if (todaysNotes.length > 0) {
      updateDailyNote(todaysNotes);
    }
    
    // List all notes after sync to see where they ended up
    console.log('\n=== Checking notes after sync ===');
    try {
      const allNotesAfter = DataStore.projectNotes || [];
      console.log(`Total notes in project: ${allNotesAfter.length}`);
      
      // Find the notes we just created
      const createdNoteTitles = documents.slice(0, syncedCount).map(doc => {
        const title = generateNoteTitle(doc);
        return title.trim();
      });
      
      console.log(`Looking for ${createdNoteTitles.length} created notes...`);
      createdNoteTitles.forEach((expectedTitle, idx) => {
        const foundNote = DataStore.projectNoteByTitle(expectedTitle);
        if (foundNote) {
          const filename = foundNote.filename || foundNote.title || expectedTitle;
          const hasFolder = filename.includes('/') || filename.includes('\\');
          const folder = foundNote.folder || 'none';
          const parent = foundNote.parent || 'none';
          console.log(`  ${idx + 1}. "${expectedTitle}" -> Found: "${filename}" ${hasFolder ? '(IN FOLDER!)' : '(in root)'}`);
          if (folder !== 'none') {
            console.log(`      Folder property: "${folder}"`);
          }
          if (parent !== 'none') {
            console.log(`      Parent property: "${parent}"`);
          }
        } else {
          console.log(`  ${idx + 1}. "${expectedTitle}" -> NOT FOUND`);
        }
      });
      
      // Search ALL notes for our created notes to see if they appear with different paths
      console.log(`\n=== Searching ALL notes for created notes ===`);
      const createdNoteTitlesSet = new Set(createdNoteTitles);
      let foundInList = 0;
      allNotesAfter.forEach((note, idx) => {
        const filename = note.filename || note.title || 'unknown';
        // Check if this note matches any of our created notes (by checking if filename contains our title)
        const filenameParts = filename.split('/');
        const lastPart = filenameParts.length > 0 ? filenameParts[filenameParts.length - 1] : '';
        for (const createdTitle of createdNoteTitles) {
          if (filename.includes(createdTitle) || createdTitle.includes(lastPart)) {
            console.log(`  FOUND: "${filename}" (matches "${createdTitle}")`);
            foundInList++;
            break;
          }
        }
      });
      console.log(`Found ${foundInList} of ${createdNoteTitles.length} created notes in full list`);
      
      // Also list ALL notes to see the structure
      console.log(`\n=== All notes in project (first 30, showing structure) ===`);
      allNotesAfter.slice(0, 30).forEach((note, idx) => {
        const filename = note.filename || note.title || 'unknown';
        const filenameParts = filename.split('/');
        const lastPart = filenameParts.length > 0 ? filenameParts[filenameParts.length - 1] : '';
        const isOurNote = createdNoteTitles.some(title => {
          return filename.includes(title) || title.includes(lastPart);
        });
        console.log(`  ${idx + 1}. "${filename}" ${isOurNote ? '<-- OUR NOTE' : ''}`);
      });
    } catch (e) {
      console.log(`Could not list notes after sync: ${e.message}`);
    }
    
    // Show completion message
    CommandBar.showInput(
      'Granola Sync Complete',
      `Successfully synced ${syncedCount} note${syncedCount !== 1 ? 's' : ''} from Granola.`,
      ['OK']
    );
    
    console.log(`Sync complete: ${syncedCount} notes synced`);
  } catch (error) {
    console.log('Granola sync failed:', error);
    CommandBar.showInput(
      'Granola Sync Error',
      `Sync failed: ${error.message}`,
      ['OK']
    );
  }
}

// NotePlan calls this function when settings are updated
function onSettingsUpdated() {
  try {
    console.log('Granola Sync settings updated');
    // Settings are automatically saved by NotePlan
    // We can add any validation or processing here if needed
    if (typeof DataStore !== 'undefined' && DataStore && DataStore.settings) {
      const settings = DataStore.settings;
      if (settings && typeof settings === 'object') {
        try {
          const keys = Object.keys(settings);
          console.log('Current settings keys: ' + keys.join(', '));
        } catch (keysError) {
          console.log('Could not list settings keys');
        }
      }
    }
  } catch (error) {
    console.log('Error in onSettingsUpdated: ' + (error.message || String(error)));
    console.log('Error type: ' + typeof error);
  }
}

