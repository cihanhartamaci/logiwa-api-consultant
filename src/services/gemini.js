import { GoogleGenerativeAI } from '@google/generative-ai';
import { LOGIWA_API_CONTEXT } from '../constants/logiwaContext';

export async function generateConsultantResponse(keys, chatHistory) {
  const { geminiKey, deepseekKey } = keys;
  try {
    if (!geminiKey) throw new Error("Gemini API key is required as primary.");
    
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      systemInstruction: LOGIWA_API_CONTEXT 
    });
    
    let promptText = "--- Conversation History ---\n";
    for (const msg of chatHistory) {
      const roleName = msg.role === 'user' ? 'User' : 'Consultant';
      promptText += `${roleName}: ${msg.content}\n`;
    }
    promptText += "Consultant: ";

    const result = await model.generateContent(promptText);
    const response = await result.response;
    return response.text();
  } catch (error) {
    const errorMsg = error.message || "";
    // Check if it's a 429 Quota Exceeded error
    if (errorMsg.includes("429") || errorMsg.includes("Quota exceeded") || errorMsg.includes("QuotaFailure")) {
      console.warn("Gemini Quota Exceeded. Falling back to DeepSeek...");
      if (!deepseekKey) {
        throw new Error("Gemini quota exceeded (429). Please provide a DeepSeek API key in the top right to use the fallback.");
      }
      return await generateDeepSeekResponse(deepseekKey, chatHistory);
    }
    console.error("Gemini API Error:", error);
    throw new Error(errorMsg || "Failed to communicate with the AI consultant.");
  }
}

async function generateDeepSeekResponse(apiKey, chatHistory) {
  const messages = [
    { role: "system", content: LOGIWA_API_CONTEXT }
  ];
  
  for (const msg of chatHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: messages,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`DeepSeek API Error: ${response.status} - ${errData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
