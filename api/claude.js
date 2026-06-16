// api/claude.js - Vercel serverless function for Claude API

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

  // Optional health check
  if (req.method === 'GET') {
    res.status(200).json({
      success: true,
      message: 'Claude API route is available',
      model: 'claude-sonnet-4-6'
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
    return;
  }

  try {
    const { prompt } = req.body;

    if (!prompt) {
      res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
      return;
    }

    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

    if (!CLAUDE_API_KEY) {
      console.error('CLAUDE_API_KEY environment variable not set');
      res.status(500).json({
        success: false,
        error: 'API key not configured'
      });
      return;
    }

    console.log('Calling Claude API...');
    console.log('Prompt length:', prompt.length, 'characters');

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    console.log('Claude API response status:', claudeResponse.status);

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', claudeResponse.status, errorText);

      let parsedError = null;
      try {
        parsedError = JSON.parse(errorText);
      } catch (_) {
        parsedError = null;
      }

      const anthropicMessage =
        parsedError?.error?.message ||
        parsedError?.message ||
        errorText.substring(0, 500);

      if (claudeResponse.status === 401) {
        res.status(401).json({
          success: false,
          error: 'Claude API authentication failed',
          details: 'Check that CLAUDE_API_KEY is set correctly in Vercel.'
        });
      } else if (claudeResponse.status === 404) {
        res.status(404).json({
          success: false,
          error: 'Claude API resource not found',
          details: anthropicMessage
        });
      } else if (claudeResponse.status === 429) {
        res.status(429).json({
          success: false,
          error: 'Claude API rate limit exceeded',
          details: 'Too many requests. Please wait a moment and try again.',
          retryAfter: claudeResponse.headers.get('retry-after')
        });
      } else if (claudeResponse.status === 529) {
        res.status(529).json({
          success: false,
          error: 'Claude API service overloaded',
          details: 'The Claude API is temporarily overloaded. Please try again in a few moments.'
        });
      } else {
        res.status(claudeResponse.status).json({
          success: false,
          error: `Claude API error: ${claudeResponse.status}`,
          details: anthropicMessage
        });
      }

      return;
    }

    const result = await claudeResponse.json();

    console.log('Claude API success');
    console.log('Response tokens:', result.usage?.output_tokens || 'unknown');

    const content = result.content
      ?.filter(block => block.type === 'text')
      ?.map(block => block.text)
      ?.join('\n') || '';

    if (!content) {
      res.status(500).json({
        success: false,
        error: 'Claude returned an empty response'
      });
      return;
    }

    if (result.stop_reason === 'max_tokens') {
      console.warn('Response was truncated due to max_tokens limit');
    }

    if (!content.includes('| CATEGORY | SCORE |')) {
      console.warn('Warning: Response missing required score table header');
    } else {
      console.log('Score table header found');
    }

    res.status(200).json({
      success: true,
      content,
      usage: result.usage,
      stop_reason: result.stop_reason,
      model: 'claude-sonnet-4-6'
    });

  } catch (error) {
    console.error('Proxy error:', error);
    console.error('Error stack:', error.stack);

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
