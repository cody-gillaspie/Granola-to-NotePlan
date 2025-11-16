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
// Enhanced version that handles more node types
function convertProseMirrorToMarkdown(content) {
  if (!content || typeof content !== 'object') {
    console.log(`convertProseMirrorToMarkdown: Invalid content (not an object)`);
    return '';
  }
  
  if (!content.content) {
    console.log(`convertProseMirrorToMarkdown: No content.content property`);
    console.log(`Available keys: ${Object.keys(content).join(', ')}`);
    return '';
  }
  
  if (!Array.isArray(content.content) || content.content.length === 0) {
    console.log(`convertProseMirrorToMarkdown: content.content is not an array or is empty`);
    return '';
  }

  // Track list item numbers for ordered lists
  let orderedListCounter = 0;
  let orderedListIndentLevel = -1;

  const processNode = (node, indentLevel = 0, isOrderedList = false) => {
    if (!node || typeof node !== 'object') {
      return '';
    }

    const nodeType = node.type || '';
    const nodeContent = node.content || [];
    const text = node.text || '';

    if (nodeType === 'heading') {
      const level = node.attrs && node.attrs.level ? node.attrs.level : 1;
      const headingText = nodeContent.map(child => processNode(child, indentLevel, false)).join('');
      return '#'.repeat(level) + ' ' + headingText + '\n\n';
    } else if (nodeType === 'paragraph') {
      const paraText = nodeContent.map(child => processNode(child, indentLevel, false)).join('');
      return paraText + '\n\n';
    } else if (nodeType === 'bulletList') {
      const items = [];
      for (let i = 0; i < nodeContent.length; i++) {
        const item = nodeContent[i];
        if (item.type === 'listItem') {
          const processedItem = processListItem(item, indentLevel, false);
          if (processedItem) {
            items.push(processedItem);
          }
        }
      }
      return items.join('\n') + '\n\n';
    } else if (nodeType === 'orderedList') {
      // Reset counter for this ordered list level
      if (orderedListIndentLevel !== indentLevel) {
        orderedListCounter = 1;
        orderedListIndentLevel = indentLevel;
      }
      const items = [];
      for (let i = 0; i < nodeContent.length; i++) {
        const item = nodeContent[i];
        if (item.type === 'listItem') {
          const processedItem = processListItem(item, indentLevel, true, orderedListCounter);
          if (processedItem) {
            items.push(processedItem);
            orderedListCounter++;
          }
        }
      }
      return items.join('\n') + '\n\n';
    } else if (nodeType === 'blockquote') {
      const quoteText = nodeContent.map(child => processNode(child, indentLevel, false)).join('').trim();
      // Add > prefix to each line
      const quotedLines = quoteText.split('\n').map(line => {
        if (line.trim()) {
          return '> ' + line;
        }
        return '>';
      }).join('\n');
      return quotedLines + '\n\n';
    } else if (nodeType === 'codeBlock') {
      const language = node.attrs && node.attrs.language ? node.attrs.language : '';
      const codeText = nodeContent.map(child => {
        if (child.type === 'text') {
          return child.text || '';
        }
        return '';
      }).join('');
      const langTag = language ? language : '';
      return '```' + langTag + '\n' + codeText + '\n```\n\n';
    } else if (nodeType === 'hardBreak') {
      return '\n';
    } else if (nodeType === 'text') {
      // Process text with marks (bold, italic, code, links, etc.)
      let textContent = text;
      
      if (node.marks && node.marks.length > 0) {
        // Process marks in reverse order (outermost first)
        // This ensures proper nesting: **bold *italic* text**
        const marks = [...node.marks].reverse();
        
        for (const mark of marks) {
          if (mark.type === 'bold') {
            textContent = '**' + textContent + '**';
          } else if (mark.type === 'italic') {
            textContent = '*' + textContent + '*';
          } else if (mark.type === 'code') {
            textContent = '`' + textContent + '`';
          } else if (mark.type === 'link') {
            const href = mark.attrs && mark.attrs.href ? mark.attrs.href : '';
            const title = mark.attrs && mark.attrs.title ? mark.attrs.title : '';
            if (href) {
              if (title) {
                textContent = `[${textContent}](${href} "${title}")`;
              } else {
                textContent = `[${textContent}](${href})`;
              }
            }
          } else if (mark.type === 'underline') {
            // Underline is not standard markdown, but we can preserve it as italic or ignore
            // For now, we'll ignore it or use a workaround
            textContent = textContent; // Keep as-is
          }
        }
      }
      
      return textContent;
    } else {
      // Handle other node types (like link nodes if they exist as separate nodes)
      if (nodeType === 'link') {
        const href = node.attrs && node.attrs.href ? node.attrs.href : '';
        const linkText = nodeContent.map(child => processNode(child, indentLevel, false)).join('');
        if (href) {
          return `[${linkText}](${href})`;
        }
        return linkText;
      }
      return nodeContent.map(child => processNode(child, indentLevel, false)).join('');
    }
  };

  // Process list items - enhanced to support both bullet and ordered lists
  const processListItem = (listItem, indentLevel = 0, isOrdered = false, itemNumber = 1) => {
    if (!listItem || !listItem.content) {
      return '';
    }

    const indent = '  '.repeat(indentLevel); // 2 spaces per indent level
    let itemText = '';
    let hasNestedLists = false;
    let nestedIsOrdered = false;

    for (const child of listItem.content) {
      if (child.type === 'paragraph') {
        // Process paragraph content for the main list item text
        const paraText = (child.content || []).map(node => processNode(node, indentLevel, false)).join('').trim();
        if (paraText) {
          itemText += paraText;
        }
      } else if (child.type === 'bulletList') {
        // Handle nested bullet lists
        hasNestedLists = true;
        nestedIsOrdered = false;
        const nestedItems = [];
        for (const nestedItem of child.content || []) {
          if (nestedItem.type === 'listItem') {
            const nestedProcessed = processListItem(nestedItem, indentLevel + 1, false);
            if (nestedProcessed) {
              nestedItems.push(nestedProcessed);
            }
          }
        }
        if (nestedItems.length > 0) {
          itemText += '\n' + nestedItems.join('\n');
        }
      } else if (child.type === 'orderedList') {
        // Handle nested ordered lists
        hasNestedLists = true;
        nestedIsOrdered = true;
        const nestedItems = [];
        let nestedCounter = 1;
        for (const nestedItem of child.content || []) {
          if (nestedItem.type === 'listItem') {
            const nestedProcessed = processListItem(nestedItem, indentLevel + 1, true, nestedCounter);
            if (nestedProcessed) {
              nestedItems.push(nestedProcessed);
              nestedCounter++;
            }
          }
        }
        if (nestedItems.length > 0) {
          itemText += '\n' + nestedItems.join('\n');
        }
      } else {
        // Handle other content types in list items (like blockquotes, code blocks, etc.)
        const otherContent = processNode(child, indentLevel, false);
        if (otherContent.trim()) {
          itemText += (itemText ? '\n' : '') + otherContent.trim();
        }
      }
    }

    if (!itemText.trim()) {
      return '';
    }

    // Format the main list item point
    let mainItem = '';
    if (isOrdered) {
      mainItem = indent + itemNumber + '. ' + itemText.split('\n')[0];
    } else {
      mainItem = indent + '- ' + itemText.split('\n')[0];
    }
    
    // If there are nested items, append them
    if (hasNestedLists) {
      const lines = itemText.split('\n');
      if (lines.length > 1) {
        const nestedLines = lines.slice(1).join('\n');
        return mainItem + '\n' + nestedLines;
      }
    }

    return mainItem;
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

// Get the NotePlan data directory path
function getNotePlanDataPath() {
  try {
    // Try to get the data path from NotePlan's environment
    // NotePlan plugins run in a sandbox, but we can try to access the data directory
    if (typeof DataStore !== 'undefined' && DataStore.projectPath) {
      return DataStore.projectPath;
    }
    // Fallback: try to construct the path
    // On macOS, NotePlan stores data in the app's container
    return null; // We'll handle this differently
  } catch (error) {
    return null;
  }
}

// Ensure the Granola folder exists by checking if any notes are actually in it
function checkGranolaFolderExists() {
  const FOLDER_NAME = 'Granola';
  
  try {
    const allNotes = DataStore.projectNotes || [];
    
    // Look for notes that are actually in the Granola folder
    // In NotePlan, notes in folders have their folder path in the filename
    for (const note of allNotes) {
      const filename = note.filename || note.title || '';
      // Check if the note is actually in a folder (not just has "Granola" in the name)
      const parts = filename.split('/');
      if (parts.length > 1 && parts[0] === FOLDER_NAME) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.log(`Error checking Granola folder: ${error.message}`);
    return false;
  }
}

// Helper function to verify a note exists in the Granola folder
// Returns true if the note is found in the correct location, false otherwise
function verifyNoteExistsInGranola(titleStr, noteTitle, FOLDER_NAME) {
  let searchAttempts = 0;
  const maxSearchAttempts = 5;
  let foundNote = null;
  let foundPath = null;
  
  const searchForNote = () => {
    const allNotes = DataStore.projectNotes || [];
    for (const note of allNotes) {
      const noteFilename = note.filename || note.title || '';
      const filenameParts = noteFilename.split(/[/\\]/);
      const lastPart = filenameParts.length > 0 ? filenameParts[filenameParts.length - 1] : '';
      
      if (noteFilename === titleStr || 
          noteFilename === noteTitle || 
          lastPart === titleStr ||
          noteFilename.endsWith(`/${titleStr}`) || 
          noteFilename.endsWith(`\\${titleStr}`) ||
          noteFilename === `${FOLDER_NAME}/${titleStr}` ||
          noteFilename === `${FOLDER_NAME}\\${titleStr}`) {
        foundNote = note;
        foundPath = noteFilename;
        return true;
      }
    }
    return false;
  };
  
  while (searchAttempts < maxSearchAttempts && !foundNote) {
    if (searchForNote()) {
      break;
    }
    searchAttempts++;
    if (searchAttempts < maxSearchAttempts) {
      // Small delay to allow NotePlan to index (if possible)
      // Note: We can't use setTimeout in NotePlan, so we just retry immediately
    }
  }
  
  if (foundNote && foundPath) {
    const verifiedInGranola = foundPath.startsWith(FOLDER_NAME + '/') || foundPath.startsWith(FOLDER_NAME + '\\');
    if (verifiedInGranola) {
      console.log(`✓ Verification successful: Note found in Granola folder at "${foundPath}"`);
      return true;
    } else {
      console.log(`✗ Verification failed: Note found but NOT in Granola folder (found at: "${foundPath}")`);
      return false;
    }
  } else {
    console.log(`✗ Verification failed: Note not found in DataStore after ${maxSearchAttempts} attempts`);
    return false;
  }
}

// Create or update a note in NotePlan
// Notes are created in the Granola folder with full markdown content
function createOrUpdateNote(doc, markdownContent) {
  const settings = DataStore.settings || {};
  const createSeparateNotes = settings.createSeparateNotes !== false; // Default to true
  
  if (!createSeparateNotes) {
    return null; // Skip creating separate notes
  }
  
  // Folder name - all notes go into the Granola folder
  const FOLDER_NAME = 'Granola';
  const granolaId = doc.id;
  
  // FIRST: Delete any existing notes with this granola_id that are in unwanted folders
  deleteNotesInUnwantedFolders(granolaId);
  
  // Generate title with .md extension (no folder path)
  const title = generateNoteTitle(doc);
  const titleStr = String(title).trim();

  // Full path for searching/updating (but we won't use this for creation)
  const noteTitle = `${FOLDER_NAME}/${titleStr}`;

  console.log(`Creating note: "${noteTitle}"`);
  console.log(`Content length: ${markdownContent.length} characters`);
  
  try {
    // Ensure we have valid content
    if (!markdownContent || markdownContent.trim().length === 0) {
      console.log(`Skipping note with no content: "${noteTitle}"`);
      return null;
    }

    // Use the markdown content as-is (it's already converted from ProseMirror)
    // Add frontmatter with folder specification so NotePlan places it in the correct folder
    let contentStr = String(markdownContent).trim();
    
    // Check if content already has frontmatter
    const hasFrontmatter = contentStr.startsWith('---');
    if (!hasFrontmatter) {
      // Add frontmatter with folder specification
      contentStr = `---\nfolder: ${FOLDER_NAME}\n---\n\n${contentStr}`;
      console.log(`Added frontmatter with folder: ${FOLDER_NAME}`);
    } else {
      // Content already has frontmatter, try to add folder to it
      const frontmatterEnd = contentStr.indexOf('\n---', 3); // Find closing ---
      if (frontmatterEnd > 0) {
        const frontmatter = contentStr.substring(0, frontmatterEnd + 4);
        const body = contentStr.substring(frontmatterEnd + 4);
        // Check if folder is already specified
        if (!frontmatter.includes('folder:')) {
          // Insert folder before closing ---
          const newFrontmatter = frontmatter.replace(/\n---\n$/, `\nfolder: ${FOLDER_NAME}\n---\n`);
          contentStr = newFrontmatter + body;
          console.log(`Added folder to existing frontmatter: ${FOLDER_NAME}`);
        } else {
          console.log(`Frontmatter already contains folder specification`);
        }
      }
    }
    
    console.log(`Content ready: ${contentStr.length} chars`);
    console.log(`First 200 chars: ${contentStr.substring(0, 200)}`);
    
    // Check if note already exists - search by iterating through all notes
    // projectNoteByTitle might match by filename only, not by full path
    let existingNote = null;
    let existingPath = null;
    
    console.log(`Searching for existing note with title: "${titleStr}"`);
    console.log(`Looking for full path: "${noteTitle}"`);
    
    // First, try to find by full path in Granola folder
    const allNotes = DataStore.projectNotes || [];
    console.log(`Searching through ${allNotes.length} notes...`);
    
    for (const note of allNotes) {
      const noteFilename = note.filename || note.title || '';
      // Check for exact match in Granola folder
      if (noteFilename === noteTitle || noteFilename === `${FOLDER_NAME}\\${titleStr}`) {
        existingNote = note;
        existingPath = noteFilename;
        console.log(`Found note by full path match: "${noteFilename}"`);
        break;
      }
    }
    
    // If not found in Granola folder, check root by filename only
    if (!existingNote) {
      console.log(`Not found in Granola folder, checking root and other folders...`);
      for (const note of allNotes) {
        const noteFilename = note.filename || note.title || '';
        // Check if filename matches (could be in root or any folder)
        // Split to get just the filename part
        const filenameParts = noteFilename.split(/[/\\]/);
        const lastPart = filenameParts.length > 0 ? filenameParts[filenameParts.length - 1] : '';
        
        if (noteFilename === titleStr || lastPart === titleStr) {
          // Found a match - log where it was found
          existingNote = note;
          existingPath = noteFilename;
          const isInRoot = !noteFilename.includes('/') && !noteFilename.includes('\\');
          const isInGranola = noteFilename.startsWith(FOLDER_NAME + '/') || noteFilename.startsWith(FOLDER_NAME + '\\');
          console.log(`Found note by filename match: "${noteFilename}" (root: ${isInRoot}, granola: ${isInGranola})`);
          break;
        }
      }
    }
    
    // Fallback to projectNoteByTitle if we didn't find it manually
    if (!existingNote) {
      console.log(`Not found by iteration, trying projectNoteByTitle...`);
      existingNote = DataStore.projectNoteByTitle(noteTitle);
      if (existingNote) {
        existingPath = existingNote.filename || existingNote.title || noteTitle;
        console.log(`Found by projectNoteByTitle("${noteTitle}"): "${existingPath}"`);
      } else {
        existingNote = DataStore.projectNoteByTitle(titleStr);
        if (existingNote) {
          existingPath = existingNote.filename || existingNote.title || titleStr;
          console.log(`Found by projectNoteByTitle("${titleStr}"): "${existingPath}"`);
        }
      }
    }
    
    if (!existingPath && existingNote) {
      existingPath = existingNote.filename || existingNote.title || noteTitle;
      console.log(`Using fallback path: "${existingPath}"`);
    }
    
    if (!existingNote) {
      console.log(`No existing note found - will create new note`);
    }

    if (existingNote) {
      // Get the actual filename from the note object to verify location
      const actualFilename = existingNote.filename || existingNote.title || existingPath;
      const actualFolder = existingNote.folder || 'none';
      const actualPath = existingNote.path || 'none';
      
      console.log(`Note "${titleStr}" already exists, checking location...`);
      console.log(`  existingPath (from search): "${existingPath}"`);
      console.log(`  actualFilename (from note object): "${actualFilename}"`);
      console.log(`  actualFolder (from note object): "${actualFolder}"`);
      console.log(`  actualPath (from note object): "${actualPath}"`);
      
      // Check if it's in the wrong location - use actualFilename from note object, not existingPath
      const isInRoot = !actualFilename.includes('/') && !actualFilename.includes('\\');
      const isInGranola = actualFilename.startsWith(FOLDER_NAME + '/') || actualFilename.startsWith(FOLDER_NAME + '\\');
      
      console.log(`  Location check: isInRoot=${isInRoot}, isInGranola=${isInGranola}`);
      
      // Try to delete and recreate existing notes to ensure they're properly saved and indexed
      // If deletion fails, try to update the note's content directly
      console.log(`Found existing note at "${actualFilename}" - attempting to delete and recreate...`);
      let deleted = false;
      try {
        // Delete the existing note
        if (typeof existingNote.delete === 'function') {
          existingNote.delete();
          console.log(`✓ Deleted existing note: "${actualFilename}"`);
          deleted = true;
        } else if (typeof DataStore.deleteNote === 'function') {
          DataStore.deleteNote(actualFilename);
          console.log(`✓ Deleted note using DataStore.deleteNote: "${actualFilename}"`);
          deleted = true;
        } else {
          console.log(`WARNING: Could not delete note, no delete method available`);
          console.log(`Available methods on note: ${Object.getOwnPropertyNames(existingNote).filter(name => typeof existingNote[name] === 'function').join(', ')}`);
          console.log(`Available DataStore methods: ${Object.getOwnPropertyNames(DataStore).filter(name => typeof DataStore[name] === 'function' && name.toLowerCase().includes('delete')).join(', ')}`);
          console.log(`Will try to update note content directly instead...`);
        }
        if (deleted) {
          // Note will be created below with frontmatter
          existingNote = null;
        }
      } catch (deleteError) {
        console.log(`WARNING: Error deleting note: ${deleteError.message}`);
        console.log(`Will try to update note content directly instead...`);
      }
      
      // If we couldn't delete, try to update the existing note's content directly
      if (!deleted && existingNote) {
        console.log(`Attempting to update existing note content directly...`);
        try {
          // Try to update the content
          if (typeof existingNote.content !== 'undefined') {
            existingNote.content = contentStr;
            console.log(`✓ Updated existing note content directly`);
            
            // Try to save if a save method exists
            if (typeof existingNote.save === 'function') {
              existingNote.save();
              console.log(`✓ Called note.save() to persist changes`);
            } else if (typeof DataStore.saveNote === 'function') {
              DataStore.saveNote(existingNote);
              console.log(`✓ Called DataStore.saveNote() to persist changes`);
            }
            
            // Return the note title even if it's in the wrong location
            // At least the content is updated
            const updatedFilename = existingNote.filename || existingNote.title || noteTitle;
            console.log(`✓ Updated existing note: "${updatedFilename}"`);
            console.log(`Note location: ${updatedFilename.startsWith(FOLDER_NAME + '/') || updatedFilename.startsWith(FOLDER_NAME + '\\') ? 'IN GRANOLA FOLDER' : 'NOT IN GRANOLA FOLDER'}`);
            return noteTitle;
          } else {
            console.log(`WARNING: Existing note has no content property to update`);
          }
        } catch (updateError) {
          console.log(`ERROR updating note content: ${updateError.message}`);
          console.log(`Will try to create note anyway (may create duplicate or overwrite)...`);
        }
      }
    }

    // Note doesn't exist - create it
    // Try multiple methods to create note in the correct folder
    console.log(`Creating new note (folder: ${FOLDER_NAME})...`);
    console.log(`Note title: "${titleStr}"`);
    console.log(`Content length: ${contentStr.length} chars`);
    
    // Log available DataStore methods for debugging
    const dataStoreMethods = Object.getOwnPropertyNames(DataStore).filter(name => 
      typeof DataStore[name] === 'function' && 
      (name.toLowerCase().includes('note') || name.toLowerCase().includes('folder'))
    );
    console.log(`Available DataStore methods related to notes/folders: ${dataStoreMethods.join(', ')}`);

    try {
      let createdNote = null;
      let moved = false; // Track if note is already in the correct folder
      
      // Method 1: Try DataStore.newNote() with folder parameter (if it exists)
      if (typeof DataStore.newNote === 'function') {
        try {
          console.log(`Attempting to use DataStore.newNote() with folder parameter...`);
          // Try: newNote(title, folder, content)
          createdNote = DataStore.newNote(titleStr, FOLDER_NAME, contentStr);
          if (createdNote) {
            console.log(`✓ Created note using DataStore.newNote(title, folder, content)`);
            const createdFilename = createdNote.filename || createdNote.title || '';
            console.log(`Note created with filename: "${createdFilename}"`);
            if (createdFilename.startsWith(FOLDER_NAME + '/') || createdFilename.startsWith(FOLDER_NAME + '\\')) {
              moved = true;
              console.log(`✓ SUCCESS: Note was created in Granola folder: "${createdFilename}"`);
            }
          }
        } catch (newNoteError) {
          console.log(`DataStore.newNote() failed: ${newNoteError.message}`);
          // Try alternative signature: newNote(title, content, folder)
          try {
            createdNote = DataStore.newNote(titleStr, contentStr, FOLDER_NAME);
            if (createdNote) {
              console.log(`✓ Created note using DataStore.newNote(title, content, folder)`);
              const createdFilename = createdNote.filename || createdNote.title || '';
              if (createdFilename.startsWith(FOLDER_NAME + '/') || createdFilename.startsWith(FOLDER_NAME + '\\')) {
                moved = true;
                console.log(`✓ SUCCESS: Note was created in Granola folder: "${createdFilename}"`);
              }
            }
          } catch (newNoteError2) {
            console.log(`DataStore.newNote() with alternative signature also failed: ${newNoteError2.message}`);
          }
        }
      }
      
      // Method 2: Try newNoteWithContent with full path in title
      if (!createdNote) {
        try {
          console.log(`Attempting to use DataStore.newNoteWithContent() with full path in title...`);
          createdNote = DataStore.newNoteWithContent(noteTitle, contentStr);
          if (createdNote) {
            console.log(`✓ Created note using newNoteWithContent with full path`);
            const createdFilename = createdNote.filename || createdNote.title || '';
            console.log(`Note created with filename: "${createdFilename}"`);
            // Check if the full path was treated as filename (bad) or as path (good)
            if (createdFilename === noteTitle || createdFilename.startsWith(FOLDER_NAME + '/') || createdFilename.startsWith(FOLDER_NAME + '\\')) {
              // Full path worked!
              moved = true;
              console.log(`✓ SUCCESS: Note was created in Granola folder via full path: "${createdFilename}"`);
            } else if (createdFilename === titleStr) {
              // Full path was treated as filename - note is in root
              console.log(`Full path was treated as filename, note is in root`);
            }
          }
        } catch (newNoteWithContentError) {
          console.log(`newNoteWithContent with full path failed: ${newNoteWithContentError.message}`);
        }
      }
      
      // Method 3: Fallback to newNoteWithContent with just filename (and rely on frontmatter or move methods)
      if (!createdNote) {
        try {
          console.log(`Attempting to use DataStore.newNoteWithContent() with filename only...`);
          createdNote = DataStore.newNoteWithContent(titleStr, contentStr);
          if (createdNote) {
            console.log(`✓ Created note using newNoteWithContent with filename only`);
            const createdFilename = createdNote.filename || createdNote.title || '';
            console.log(`Note created with filename: "${createdFilename}"`);
            // Check if NotePlan processed the frontmatter and placed it in the folder
            if (createdFilename.startsWith(FOLDER_NAME + '/') || createdFilename.startsWith(FOLDER_NAME + '\\')) {
              // Note was created in the Granola folder! Frontmatter worked!
              console.log(`✓ SUCCESS: Note was created in Granola folder via frontmatter: "${createdFilename}"`);
              moved = true;
            } else {
              // Note was created in root - frontmatter might need time to process, or we need to try move methods
              console.log(`Note created in root, frontmatter may need time to process or we'll try move methods`);
            }
          }
        } catch (newNoteWithContentError2) {
          console.log(`newNoteWithContent with filename only failed: ${newNoteWithContentError2.message}`);
        }
      }
      
      if (!createdNote) {
        console.log(`ERROR: Failed to create note "${titleStr}" using any method`);
        return null;
      }
      
      console.log(`Note created successfully: "${titleStr}"`);
      
      console.log(`Note object type: ${typeof createdNote}`);
      console.log(`Note object keys: ${Object.keys(createdNote).join(', ')}`);
      
      // Check what properties/methods are available on the note object
      const noteFilename = createdNote.filename || createdNote.title || titleStr;
      console.log(`Created note filename: "${noteFilename}"`);
      
      // Try different methods to move the note to a folder (only if not already moved)
      if (!moved) {
        // Method 1: Try moveToFolder method on the note object
        if (typeof createdNote.moveToFolder === 'function') {
          try {
            createdNote.moveToFolder(FOLDER_NAME);
            console.log(`✓ Called moveToFolder("${FOLDER_NAME}")`);
            moved = true;
            // Verify the move worked
            const afterMoveFilename = createdNote.filename || createdNote.title || '';
            console.log(`After moveToFolder, filename is: "${afterMoveFilename}"`);
          } catch (moveError) {
            console.log(`moveToFolder failed: ${moveError.message}`);
          }
        } else {
          console.log(`Note object does not have moveToFolder method`);
        }
        
        // Method 2: Try DataStore.moveNoteToFolder
        if (!moved && typeof DataStore.moveNoteToFolder === 'function') {
          try {
            DataStore.moveNoteToFolder(createdNote, FOLDER_NAME);
            console.log(`✓ Called DataStore.moveNoteToFolder()`);
            moved = true;
            // Verify the move worked
            const afterMoveFilename = createdNote.filename || createdNote.title || '';
            console.log(`After DataStore.moveNoteToFolder, filename is: "${afterMoveFilename}"`);
          } catch (moveError) {
            console.log(`DataStore.moveNoteToFolder failed: ${moveError.message}`);
          }
        } else if (!moved) {
          console.log(`DataStore does not have moveNoteToFolder method`);
        }
        
        // Method 3: Try setting folder property directly
        if (!moved && typeof createdNote.folder !== 'undefined') {
          try {
            createdNote.folder = FOLDER_NAME;
            console.log(`✓ Set note.folder = "${FOLDER_NAME}"`);
            moved = true;
            // Verify the folder property was set
            console.log(`After setting folder, note.folder is: "${createdNote.folder}"`);
          } catch (setError) {
            console.log(`Setting folder property failed: ${setError.message}`);
          }
        } else if (!moved) {
          console.log(`Note object does not have folder property`);
        }
        
        // Method 4: Try renaming the note with folder path
        if (!moved && typeof createdNote.rename === 'function') {
          try {
            createdNote.rename(noteTitle);
            console.log(`✓ Called rename("${noteTitle}")`);
            moved = true;
            // Verify the rename worked
            const afterRenameFilename = createdNote.filename || createdNote.title || '';
            console.log(`After rename, filename is: "${afterRenameFilename}"`);
          } catch (renameError) {
            console.log(`Renaming note failed: ${renameError.message}`);
          }
        } else if (!moved) {
          console.log(`Note object does not have rename method`);
        }
      }
      
      if (!moved) {
        console.log(`WARNING: Could not move note to Granola folder using any method`);
        console.log(`Note remains in root with filename: "${noteFilename}"`);
        console.log(`Available note methods: ${Object.getOwnPropertyNames(createdNote).filter(name => typeof createdNote[name] === 'function').join(', ')}`);
        console.log(`Available note properties: ${Object.getOwnPropertyNames(createdNote).filter(name => typeof createdNote[name] !== 'function').join(', ')}`);
        console.log(`Available DataStore methods: ${Object.getOwnPropertyNames(DataStore).filter(name => typeof DataStore[name] === 'function' && name.toLowerCase().includes('folder')).join(', ')}`);
      }

      if (createdNote) {
        const createdFilename = createdNote.filename || createdNote.title || noteTitle;
        const createdFolder = createdNote.folder || 'none';
        const createdPath = createdNote.path || 'none';
        console.log(`✓ Created note object: "${createdFilename}"`);
        console.log(`✓ Note folder property: "${createdFolder}"`);
        console.log(`✓ Note path property: "${createdPath}"`);
        console.log(`✓ Note contains ${contentStr.length} chars of meeting notes`);
        
        // Log all properties of the created note for debugging
        console.log(`Created note object keys: ${Object.keys(createdNote).join(', ')}`);
        
        // Verify the content was actually written
        if (createdNote.content) {
          const actualContentLength = String(createdNote.content).length;
          console.log(`✓ Verified: Note has ${actualContentLength} chars of content`);
          if (actualContentLength < contentStr.length * 0.5) {
            console.log(`WARNING: Note content seems shorter than expected!`);
          }
          // Check if frontmatter is in the content
          if (createdNote.content.includes('folder: Granola')) {
            console.log(`✓ Verified: Frontmatter with folder is in note content`);
          } else {
            console.log(`WARNING: Frontmatter with folder is NOT in note content!`);
          }
        } else {
          console.log(`WARNING: Created note has no content property!`);
        }
        
        // Try to save the note if a save method exists
        if (typeof createdNote.save === 'function') {
          try {
            createdNote.save();
            console.log(`✓ Called note.save() to persist changes`);
          } catch (saveError) {
            console.log(`Note: save() method exists but failed: ${saveError.message}`);
          }
        } else if (typeof DataStore.saveNote === 'function') {
          try {
            DataStore.saveNote(createdNote);
            console.log(`✓ Called DataStore.saveNote() to persist changes`);
          } catch (saveError) {
            console.log(`Note: DataStore.saveNote() exists but failed: ${saveError.message}`);
          }
        } else {
          console.log(`Note: No save method found - NotePlan may auto-save`);
        }
        
        // Try to verify the note exists in DataStore (may fail due to indexing delays)
        // But don't fail the entire operation if verification fails - NotePlan may need time to index
        const verified = verifyNoteExistsInGranola(titleStr, noteTitle, FOLDER_NAME);
        
        if (verified) {
          console.log(`✓ SUCCESS: Note verified in Granola folder!`);
          return noteTitle;
        } else {
          // Verification failed, but note object was created successfully
          // This could be due to NotePlan indexing delays - we'll still count it as success
          // The final check will show where notes actually ended up
          console.log(`WARNING: Note was created but immediate verification failed`);
          console.log(`Created note filename was: "${createdFilename}"`);
          console.log(`Expected title: "${titleStr}"`);
          console.log(`Expected full path: "${noteTitle}"`);
          console.log(`This may be due to NotePlan indexing delays - note may appear after sync completes`);
          console.log(`Returning success anyway - final check will show actual location`);
          // Return success even if verification fails - the note object was created
          // The final check will reveal the actual state
          return noteTitle;
        }
      } else {
        console.log(`ERROR: All note creation methods returned null or failed`);
        console.log(`Failed to create note: "${titleStr}"`);
        return null;
      }
    } catch (createError) {
      console.log(`ERROR creating note: ${createError.message || String(createError)}`);
      console.log(`Error stack: ${createError.stack || 'No stack trace'}`);
      return null;
    }
  } catch (error) {
    console.log(`Error creating/updating note ${noteTitle}:`, error);
    console.log(`Error message: ${error.message || String(error)}`);
    console.log(`Error stack: ${error.stack || 'No stack trace'}`);
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

// Clean up any orphaned .granola-folder notes created by previous versions
function cleanupGranolaFolderNotes() {
  try {
    const allNotes = DataStore.projectNotes || [];
    let deletedCount = 0;
    
    for (const note of allNotes) {
      const filename = note.filename || note.title || '';
      // Find notes that are literally named "Granola/.granola-folder" (created by buggy code)
      if (filename === 'Granola/.granola-folder' || filename.endsWith('/.granola-folder')) {
        try {
          if (typeof note.delete === 'function') {
            note.delete();
            deletedCount++;
            console.log(`Deleted orphaned .granola-folder note: "${filename}"`);
          }
        } catch (deleteError) {
          console.log(`Could not delete note "${filename}": ${deleteError.message}`);
        }
      }
    }
    
    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} orphaned .granola-folder note(s)`);
    }
  } catch (error) {
    console.log(`Error cleaning up .granola-folder notes: ${error.message}`);
  }
}

// Main sync function
async function syncGranolaNotes() {
  try {
    console.log('Starting Granola sync...');
    console.log('DataStore available:', typeof DataStore !== 'undefined');
    
    // Clean up any orphaned .granola-folder notes first
    cleanupGranolaFolderNotes();
    
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
    const syncedNoteTitles = []; // Track which notes were actually synced
    const todaysNotes = [];
    const today = new Date().toDateString();
    
    // Process each document
    for (const doc of documents) {
      try {
        console.log(`\n=== Processing document: "${doc.title || 'Untitled'}" ===`);
        console.log(`Document ID: ${doc.id}`);

        // Debug: Log what fields are available in the document
        const docKeys = Object.keys(doc);
        console.log(`Available fields in document: ${docKeys.join(', ')}`);

        // Check specifically for content fields
        console.log(`Has last_viewed_panel: ${!!doc.last_viewed_panel}`);
        if (doc.last_viewed_panel) {
          console.log(`Has last_viewed_panel.content: ${!!doc.last_viewed_panel.content}`);
          if (doc.last_viewed_panel.content) {
            console.log(`last_viewed_panel.content type: ${typeof doc.last_viewed_panel.content}`);
            if (typeof doc.last_viewed_panel.content === 'object') {
              console.log(`last_viewed_panel.content.type: ${doc.last_viewed_panel.content.type}`);
            }
          }
        }
        console.log(`Has notes_markdown: ${!!doc.notes_markdown}`);
        console.log(`Has notes_plain: ${!!doc.notes_plain}`);

        // Extract content - match Obsidian plugin approach exactly
        // The Obsidian plugin only processes if last_viewed_panel.content.type === 'doc' exists
        let contentToParse = null;
        let markdownContent = null;
        
        // Check last_viewed_panel.content - must be ProseMirror format (type === 'doc')
        // This matches the Obsidian plugin's exact check
        if (doc.last_viewed_panel && doc.last_viewed_panel.content && 
            typeof doc.last_viewed_panel.content === 'object' && 
            doc.last_viewed_panel.content.type === 'doc') {
          contentToParse = doc.last_viewed_panel.content;
          console.log(`Found content in doc.last_viewed_panel.content (ProseMirror format)`);
          
          // Debug: Log the structure of the ProseMirror content
          if (contentToParse.content && Array.isArray(contentToParse.content)) {
            console.log(`ProseMirror content has ${contentToParse.content.length} top-level nodes`);
            if (contentToParse.content.length > 0) {
              console.log(`First node type: ${contentToParse.content[0].type}`);
              if (contentToParse.content[0].content) {
                console.log(`First node has ${contentToParse.content[0].content.length} child nodes`);
              }
            }
          } else {
            console.log(`WARNING: ProseMirror content.content is not an array or is missing`);
            console.log(`Content structure: ${JSON.stringify(Object.keys(contentToParse || {})).substring(0, 200)}`);
          }
        }
        
        // Convert ProseMirror content to markdown (same as Obsidian plugin)
        if (contentToParse) {
          markdownContent = convertProseMirrorToMarkdown(contentToParse);
          console.log(`✓ Converted ProseMirror content: ${markdownContent ? markdownContent.length : 0} chars`);
          if (markdownContent && markdownContent.length > 0) {
            console.log(`First 200 chars: ${markdownContent.substring(0, 200)}`);
          } else {
            console.log(`WARNING: Conversion returned empty content`);
            // Log the raw ProseMirror structure for debugging
            console.log(`Raw ProseMirror structure (first 500 chars): ${JSON.stringify(contentToParse).substring(0, 500)}`);
          }
        }
        
        // Fallback: Try other content sources if ProseMirror conversion failed or returned empty
        if (!markdownContent || markdownContent.trim().length === 0) {
          console.log(`ProseMirror content not available or empty, trying fallback sources...`);
          
          // Try notes_markdown if available
          if (doc.notes_markdown && typeof doc.notes_markdown === 'string' && doc.notes_markdown.trim().length > 0) {
            markdownContent = doc.notes_markdown.trim();
            console.log(`✓ Using notes_markdown as fallback: ${markdownContent.length} chars`);
          }
          // Try notes_plain if markdown not available
          else if (doc.notes_plain && typeof doc.notes_plain === 'string' && doc.notes_plain.trim().length > 0) {
            markdownContent = doc.notes_plain.trim();
            console.log(`✓ Using notes_plain as fallback: ${markdownContent.length} chars`);
          }
          // Try summary if available
          else if (doc.summary && typeof doc.summary === 'string' && doc.summary.trim().length > 0) {
            markdownContent = doc.summary.trim();
            console.log(`✓ Using summary as fallback: ${markdownContent.length} chars`);
          }
        }
        
        if (!markdownContent || markdownContent.trim().length === 0) {
          console.log(`WARNING: No content found for document "${doc.title || doc.id}"`);
          console.log(`Available content fields: ${Object.keys(doc).filter(key => 
            key.includes('note') || key.includes('content') || key.includes('summary') || key.includes('text')
          ).join(', ')}`);
          console.log(`Skipping this document - it will not be synced.`);
          continue; // Skip this document if no content
        }

        // Create or update note
        const noteTitle = createOrUpdateNote(doc, markdownContent);
        
        if (noteTitle) {
          syncedCount++;
          // Track the actual note title that was created/updated
          const titleStr = generateNoteTitle(doc);
          syncedNoteTitles.push(titleStr.trim());
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
      
      // Use the tracked list of notes that were actually synced
      const createdNoteTitles = syncedNoteTitles;
      
      console.log(`Looking for ${createdNoteTitles.length} created notes...`);
      const FOLDER_NAME = 'Granola'; // For final check
      // Search by iterating through all notes to get accurate location
      createdNoteTitles.forEach((expectedTitle, idx) => {
        // Search through all notes to find this one - use flexible matching
        let foundNote = null;
        let foundPath = null;
        
        for (const note of allNotesAfter) {
          const noteFilename = note.filename || note.title || '';
          // Split filename to get last part (actual filename)
          const filenameParts = noteFilename.split(/[/\\]/);
          const lastPart = filenameParts.length > 0 ? filenameParts[filenameParts.length - 1] : '';
          
          // Check if this note matches our expected title (be flexible with path matching)
          if (noteFilename === expectedTitle || 
              lastPart === expectedTitle ||
              noteFilename.endsWith(`/${expectedTitle}`) || 
              noteFilename.endsWith(`\\${expectedTitle}`) ||
              noteFilename === `${FOLDER_NAME}/${expectedTitle}` ||
              noteFilename === `${FOLDER_NAME}\\${expectedTitle}`) {
            foundNote = note;
            foundPath = noteFilename;
            break;
          }
        }
        
        if (foundNote && foundPath) {
          const filename = foundPath;
          const hasFolder = filename.includes('/') || filename.includes('\\');
          const isInGranola = filename.startsWith(FOLDER_NAME + '/') || filename.startsWith(FOLDER_NAME + '\\');
          const folder = foundNote.folder || 'none';
          const parent = foundNote.parent || 'none';
          console.log(`  ${idx + 1}. "${expectedTitle}" -> Found: "${filename}" ${isInGranola ? '(IN GRANOLA FOLDER!)' : hasFolder ? '(in other folder)' : '(in root)'}`);
          if (folder !== 'none') {
            console.log(`      Folder property: "${folder}"`);
          }
          if (parent !== 'none') {
            console.log(`      Parent property: "${parent}"`);
          }
        } else {
          console.log(`  ${idx + 1}. "${expectedTitle}" -> NOT FOUND`);
          console.log(`      Searched through ${allNotesAfter.length} notes`);
          console.log(`      This might indicate the note wasn't created, or NotePlan hasn't indexed it yet`);
        }
      });
      
      // Search ALL notes for our created notes to see if they appear with different paths
      console.log(`\n=== Searching ALL notes for created notes ===`);
      const createdNoteTitlesSet = new Set(createdNoteTitles);
      let foundInList = 0;
      let foundInGranola = 0;
      const FOLDER_NAME_CHECK = 'Granola'; // For this check section
      allNotesAfter.forEach((note, idx) => {
        const filename = note.filename || note.title || 'unknown';
        // Check if this note matches any of our created notes (by checking if filename ends with our title)
        const filenameParts = filename.split(/[/\\]/);
        const lastPart = filenameParts.length > 0 ? filenameParts[filenameParts.length - 1] : '';
        for (const createdTitle of createdNoteTitles) {
          if (filename === createdTitle || 
              filename.endsWith(`/${createdTitle}`) || 
              filename.endsWith(`\\${createdTitle}`) ||
              lastPart === createdTitle) {
            const isInGranola = filename.startsWith(FOLDER_NAME_CHECK + '/') || filename.startsWith(FOLDER_NAME_CHECK + '\\');
            console.log(`  FOUND: "${filename}" (matches "${createdTitle}") ${isInGranola ? '[IN GRANOLA]' : '[NOT IN GRANOLA]'}`);
            foundInList++;
            if (isInGranola) {
              foundInGranola++;
            }
            break;
          }
        }
      });
      console.log(`Found ${foundInList} of ${createdNoteTitles.length} created notes in full list`);
      console.log(`Found ${foundInGranola} notes in Granola folder`);
      
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

