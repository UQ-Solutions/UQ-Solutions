// api/claude.js - Vercel serverless function with proper configuration
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }
    
    // Your Claude API key (stored as environment variable)
    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    
    if (!CLAUDE_API_KEY) {
      console.error('CLAUDE_API_KEY environment variable not set');
      res.status(500).json({ error: 'API key not configured' });
      return;
    }
    
    console.log('Calling Claude API...');
    console.log('Prompt length:', prompt.length, 'characters');
    
    // Call Claude API with proper configuration
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',  // ✅ Updated to Sonnet 4!
        max_tokens: 4096,  // Increased from 1000 to 4096 for longer responses
        temperature: 1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    
    // Log response status for debugging
    console.log('Claude API response status:', claudeResponse.status);
    
    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', claudeResponse.status, errorText);
      
      // Provide more specific error messages
      if (claudeResponse.status === 429) {
        res.status(429).json({ 
          error: 'Claude API rate limit exceeded',
          details: 'Too many requests. Please wait a moment and try again.',
          retryAfter: claudeResponse.headers.get('retry-after')
        });
      } else if (claudeResponse.status === 529) {
        res.status(529).json({ 
          error: 'Claude API service overloaded',
          details: 'The Claude API is temporarily overloaded. Please try again in a few moments.'
        });
      } else {
        res.status(claudeResponse.status).json({ 
          error: `Claude API error: ${claudeResponse.status}`,
          details: errorText.substring(0, 500)  // Limit error message length
        });
      }
      return;
    }
    
    const result = await claudeResponse.json();
    console.log('Claude API success');
    console.log('Response tokens:', result.usage?.output_tokens || 'unknown');
    
    // Check if response was truncated
    if (result.stop_reason === 'max_tokens') {
      console.warn('⚠️ Response was truncated due to max_tokens limit');
    }
    
    // ✅ NEW: Validate table presence in response
    const content = result.content[0].text;
    
    // Check if the required score table is present
    if (!content.includes('| CATEGORY | SCORE |')) {
      console.warn('⚠️ Warning: Response missing required score table header');
    } else {
      console.log('✅ Score table header found');
      
      // Extract and validate table structure
      const tableMatch = content.match(/\| CATEGORY \| SCORE \|([\s\S]*?)(?:\n\n|\n$|$)/);
      if (tableMatch) {
        const tableContent = tableMatch[1];
        const tableRows = tableContent.trim().split('\n').filter(row => row.trim().includes('|'));
        
        console.log(`📊 Table validation: Found ${tableRows.length} rows`);
        
        // Should have: separator row + 6 data rows (5 categories + 1 total)
        if (tableRows.length < 7) {
          console.warn(`⚠️ Warning: Table has ${tableRows.length} rows, expected at least 7 (separator + 6 data rows)`);
        } else {
          console.log('✅ Table structure appears complete');
        }
        
        // Check for required categories
        const requiredCategories = [
          'Market Growth Score',
          'Schools Like Us Score',
          'Opportunity Size Score',
          'Workforce Demand Score',
          'Earning Outcomes Score',
          'Total Score'
        ];
        
        const missingCategories = requiredCategories.filter(cat => 
          !content.includes(cat)
        );
        
        if (missingCategories.length > 0) {
          console.warn('⚠️ Warning: Missing categories:', missingCategories.join(', '));
        } else {
          console.log('✅ All required categories present');
        }
      } else {
        console.warn('⚠️ Warning: Could not parse table structure');
      }
    }
    
    // Return the response
    res.status(200).json({
      success: true,
      content: content,
      usage: result.usage,
      stop_reason: result.stop_reason
    });
    
  } catch (error) {
    console.error('Proxy error:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
