import { GoogleGenerativeAI } from '@google/generative-ai';
import { LOGIWA_API_BASE_INSTRUCTIONS } from '../constants/logiwaContext';
import { getRelevantArticles, getRelevantSwagger } from '../constants/contextFilter';
import { getAllKnowledge } from './knowledgeBase';

async function sendMessageWithRetry(chat, payload, maxRetries = 5, onStatus = null) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const result = await chat.sendMessage(payload);
      await result.response; // Await response to catch errors here
      return result;
    } catch (error) {
      if (error.message && (error.message.includes('503') || error.message.includes('429'))) {
        retries++;
        console.warn(`Gemini API overloaded (503/429). Retrying (${retries}/${maxRetries})...`);
        if (retries >= maxRetries) throw error;
        
        let waitTime = 5000 * Math.pow(2, retries - 1); // 5s, 10s, 20s...
        const match = error.message.match(/retry in (\d+(\.\d+)?)s/);
        if (match) {
          waitTime = Math.max(waitTime, parseFloat(match[1]) * 1000 + 1000); // Wait required time + 1s buffer
        }
        
        if (onStatus) {
          onStatus('rateLimitWait', { seconds: Math.ceil(waitTime / 1000) });
        }
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw error;
      }
    }
  }
}

const tools = [
  {
    functionDeclarations: [
      {
        name: "searchHelpCenter",
        description: "Search the Logiwa Help Center articles for a specific keyword or query.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Search query" }
          },
          required: ["query"]
        },
        response: {
          type: "OBJECT",
          properties: {
            results: { type: "ARRAY", items: { type: "STRING" } }
          },
          required: ["results"]
        }
      },
      {
        name: "searchSwagger",
        description: "Search the Logiwa Swagger API documentation for specific endpoints or schemas.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Search query or endpoint name" }
          },
          required: ["query"]
        },
        response: {
          type: "OBJECT",
          properties: {
            results: { type: "ARRAY", items: { type: "STRING" } }
          },
          required: ["results"]
        }
      },
      {
        name: "proposeLearnedKnowledge",
        description: "Propose new knowledge or correction provided by the user to be saved to the Knowledge Base. This returns immediately to wait for user approval.",
        parameters: {
          type: "OBJECT",
          properties: {
            topic: { type: "STRING", description: "Short topic or title of the knowledge." },
            content: { type: "STRING", description: "Detailed description of the rule, correction, or knowledge." }
          },
          required: ["topic", "content"]
        },
        response: {
          type: "OBJECT",
          properties: {
            status: { type: "STRING" }
          },
          required: ["status"]
        }
      }
    ]
  }
];


export async function generateConsultantResponse(apiKey, chatHistory, onToolCall, onKnowledgeProposed) {
  try {
    if (!apiKey) throw new Error("Gemini API key is required.");
    
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Inject Learned Knowledge into System Instructions
    const learnedKnowledge = getAllKnowledge();
    let systemInstruction = LOGIWA_API_BASE_INSTRUCTIONS;
    if (learnedKnowledge.length > 0) {
      systemInstruction += "\n\n--- USER TAUGHT KNOWLEDGE (ALWAYS PRIORITIZE) ---\n";
      learnedKnowledge.forEach(k => {
        systemInstruction += `[Topic: ${k.topic}] -> ${k.content}\n`;
      });
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      systemInstruction: systemInstruction,
      tools: tools
    });
    
    // Convert generic chat history to Gemini format
    const contents = [];
    for (const msg of chatHistory) {
       if (msg.role === 'user') {
          contents.push({ role: "user", parts: [{ text: msg.content }] });
       } else if (msg.role === 'model') {
          // If the message has proposed knowledge, skip rendering it as raw text or just put it as text
          // The previous messages shouldn't break the loop
          contents.push({ role: "model", parts: [{ text: msg.content || "Understood." }] });
       }
    }
    
    // Create a chat session with history (excluding the last user message to send it)
    const history = contents.slice(0, -1);
    const lastUserMessage = contents[contents.length - 1].parts[0].text;
    
    const chat = model.startChat({ history });

    let result = await sendMessageWithRetry(chat, lastUserMessage, 5, onToolCall);
    let response = await result.response;
    
    // Agentic Loop
    let loopCount = 0;
    while (response.functionCalls() && loopCount < 3) {
      const call = response.functionCalls()[0];
      const name = call.name;
      const args = call.args;
      
      if (onToolCall) onToolCall(name, args);

      let functionResponseData = {};

      if (name === "searchHelpCenter") {
        const articles = getRelevantArticles(args.query, 5);
        functionResponseData = { results: articles.map(a => JSON.stringify(a)) };
      } else if (name === "searchSwagger") {
        const swaggerData = getRelevantSwagger(args.query, 10);
        // Replace $ref with _ref to prevent Gemini SDK from parsing it as a schema reference
        const safeString = JSON.stringify(swaggerData).replace(/"\$ref"/g, '"_ref"');
        functionResponseData = { results: [safeString] };
      } else if (name === "proposeLearnedKnowledge") {
        // Trigger UI callback
        if (onKnowledgeProposed) onKnowledgeProposed(args.topic, args.content);
        functionResponseData = { status: "Proposed to user. Waiting for approval in UI." };
      }

      // Send the function response back to the model
      result = await sendMessageWithRetry(chat, [{
        functionResponse: {
          name: name,
          response: functionResponseData
        }
      }], 5, onToolCall);
      response = await result.response;
      loopCount++;
    }

    // After the agentic loop, ensure we have some response text
    const finalText = response.text();
    if (finalText && finalText.trim().length > 0) {
      return finalText;
    }
    // Fallback placeholder if the model gave no text
    return "I’m sorry, I couldn’t generate a response at this time. Please try rephrasing your query or let me know if you need further assistance.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to communicate with the AI consultant.");
  }
}
