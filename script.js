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
    if (settings.accessToken && settings.accessToken.trim() !== '') {
      console.log('Using access token from settings');
      const trimmedToken = settings.accessToken.trim();
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

// Fetch documents from Granola API
function fetchGranolaDocuments(token) {
  console.log('Making API request to Granola...');
  console.log('Token exists: ' + (!!token));
  console.log('Token length: ' + (token ? token.length : 0));
  console.log('Token starts with: ' + (token ? token.substring(0, 20) : 'none'));
  
  const requestBody = {
    limit: 100,
    offset: 0,
    include_last_viewed_panel: true
  };
  
  const authHeader = 'Bearer ' + token;
  console.log('Authorization header length: ' + authHeader.length);
  console.log('Authorization header preview: ' + authHeader.substring(0, 30) + '...');
  
  console.log('Calling fetch...');
  
  // Granola API requires specific headers for client identification
  // "Unsupported client" means Authorization works but client headers are missing/wrong
  // Include all required headers from the start
  const headers = {
    'Authorization': authHeader,
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'User-Agent': 'Granola/5.354.0',
    'X-Client-Version': '5.354.0'
  };
  
  console.log('Making request with all required headers (Authorization, User-Agent, X-Client-Version)...');
  console.log('Header keys: ' + Object.keys(headers).join(', '));
  
  // Use NotePlan's recommended promise-based approach
  // According to NotePlan docs: "Don't use const re = await fetch(), because you can't catch errors this way"
  // NotePlan fetch only supports: timeout, method, headers, body
  console.log('Calling fetch with promise chain...');
  
  return fetch('https://api.granola.ai/v2/get-documents', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  })
  .then(response => {
    console.log('Fetch .then() callback called');
    console.log('Response type: ' + typeof response);
    
    // Check response for errors
    if (typeof response === 'string') {
      try {
        const parsedResponse = JSON.parse(response);
        if (parsedResponse.message) {
          const errorMsg = parsedResponse.message;
          console.log('ERROR: API returned error message: ' + errorMsg);
          
          if (errorMsg === 'Unsupported client') {
            console.log('ERROR: This means Authorization header IS being sent, but User-Agent/X-Client-Version headers are not.');
            console.log('ERROR: NotePlan fetch limitation: Custom headers beyond Authorization/Content-Type may not be sent.');
            throw new Error('API error: Unsupported client - NotePlan fetch may not support User-Agent/X-Client-Version headers.');
          } else if (errorMsg === 'Unauthorized') {
            console.log('ERROR: This means the Authorization header may not be sent correctly, or the token is invalid/expired.');
            console.log('ERROR: Please verify:');
            console.log('ERROR: 1. The token in settings matches the one in supabase.json');
            console.log('ERROR: 2. The token has not expired');
            console.log('ERROR: 3. You are logged into Granola desktop app');
            throw new Error('API error: Unauthorized - Authorization header may not be sent correctly by NotePlan fetch, or token is invalid.');
          } else {
            throw new Error('API error: ' + errorMsg);
          }
        }
        
        // No error message, process the response
        return processFetchResponse(response);
      } catch (parseError) {
        // If it's our thrown error, re-throw it
        if (parseError.message && parseError.message.startsWith('API error:')) {
          throw parseError;
        }
        // Not JSON or different structure, continue to process
        console.log('Response is not JSON error, continuing...');
        return processFetchResponse(response);
      }
    } else {
      return processFetchResponse(response);
    }
  })
  .catch(error => {
    console.log('Fetch error caught: ' + (error.message || error));
    // Return null on error so calling code can handle it gracefully
    return null;
  });
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
function generateNoteTitle(doc) {
  if (!doc.title) {
    return 'Untitled Granola Note';
  }
  
  // Sanitize title for filename
  let title = doc.title
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .trim();
  
  if (doc.created_at) {
    const dateStr = formatDate(doc.created_at);
    title = `${dateStr}_${title}`;
  }
  
  return title;
}

// Create or update a note in NotePlan
function createOrUpdateNote(doc, markdownContent) {
  const settings = DataStore.settings || {};
  const syncDirectory = settings.syncDirectory || 'Granola';
  const createSeparateNotes = settings.createSeparateNotes !== false; // Default to true
  
  if (!createSeparateNotes) {
    return null; // Skip creating separate notes
  }
  
  const title = generateNoteTitle(doc);
  const noteTitle = syncDirectory ? `${syncDirectory}/${title}` : title;
  
  // Check if note already exists
  const existingNote = DataStore.projectNoteByTitle(noteTitle);
  
  // Build frontmatter
  const frontmatter = {
    granola_id: doc.id,
    title: doc.title || 'Untitled Granola Note',
    created_at: doc.created_at || '',
    updated_at: doc.updated_at || doc.created_at || ''
  };
  
  if (doc.url) {
    frontmatter.granola_url = doc.url;
  }
  
  // Format frontmatter as YAML
  const frontmatterStr = '---\n' + 
    Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n') + 
    '\n---\n\n';
  
  const fullContent = frontmatterStr + markdownContent;
  
  if (existingNote) {
    // Update existing note
    existingNote.content = fullContent;
    console.log(`Updated note: ${noteTitle}`);
    return noteTitle;
  } else {
    // Create new note
    DataStore.newNoteWithContent(fullContent, noteTitle);
    console.log(`Created note: ${noteTitle}`);
    return noteTitle;
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
    
    let syncedCount = 0;
    const todaysNotes = [];
    const today = new Date().toDateString();
    
    // Process each document
    for (const doc of documents) {
      try {
        // Convert content to markdown
        const markdownContent = doc.content 
          ? convertProseMirrorToMarkdown(doc.content)
          : '*No content available*';
        
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
  console.log('Granola Sync settings updated');
  // Settings are automatically saved by NotePlan
  // We can add any validation or processing here if needed
}

