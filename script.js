/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const sendBtn = document.getElementById("sendBtn");
// Element that displays the user's latest question (updated each submit)
let latestQuestionElem = null;
// Helper to append a message to the chat window
function addMessage(text, sender = "ai") {
  const msg = document.createElement("div");
  msg.className = `msg ${sender}`;
  // Use textContent so line breaks and spacing are preserved.
  msg.textContent = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Clear any plain text and set an initial greeting using a message element
chatWindow.innerHTML = "";
addMessage("👋 Hello! How can I help you today?", "ai");

// Conversation history for chat completions API.
// System prompt: enforce that the assistant only answers questions related to
// L'Oréal products, beauty topics, routines, and recommendations. For any
// question outside that scope, the assistant should politely refuse and
// redirect the user back to product- or routine-related help.
let messages = [
  {
    role: "system",
    content:
      "You are a helpful product advisor specializing in L'Oréal products and " +
      "beauty routines. Only answer questions about L'Oréal products, skincare, " +
      "haircare, makeup, routines, and related product recommendations. If a user " +
      "asks about topics that are unrelated to beauty or L'Oréal products (for example: " +
      "politics, general medical diagnoses, illegal activities, personal legal or financial advice, " +
      "or any request outside product/routine/recommendation scope), politely refuse to answer. " +
      "When refusing, be concise and courteous, and offer to help with L'Oréal product recommendations, " +
      "routine suggestions, ingredient information, or other beauty-related questions instead.",
  },
];

// REPLACE with your actual Cloudflare Worker URL in `secrets.js`
const WORKER_URL = "https://project-8-loreal.ealli12.workers.dev/";

// Simple client-side memory/context store to support multi-turn conversations.
// This keeps basic, non-sensitive information like the user's name and a list
// of past user questions. Do NOT store secrets here. This memory is ephemeral
// (in-memory only) and will be reset when the page reloads or the Clear button
// is used.
const context = {
  userName: null,
  pastQuestions: [], // store last N user messages (questions)
};

function buildMessagesForApi() {
  // Start with the base system prompt (messages[0]) then add a short memory
  // summary so the model can act on stored context.
  const base = [messages[0]];

  // Build a concise memory summary; include name if known and the last few
  // past questions to help the model keep continuity.
  const recent = context.pastQuestions.slice(-5);
  let memoryParts = [];
  if (context.userName) memoryParts.push(`user_name: ${context.userName}`);
  if (recent.length)
    memoryParts.push(
      `recent_user_questions: ${recent.map((q) => q).join(" | ")}`
    );

  if (memoryParts.length) {
    base.push({
      role: "system",
      content: `Conversation memory: ${memoryParts.join("; ")}`,
    });
  }

  // Append the rest of the conversation (skip the original system prompt at index 0)
  const rest = messages.slice(1);
  return base.concat(rest);
}

/* Handle form submit */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const text = userInput.value.trim();
  if (!text) return;

  // Show the user's message in the chat window
  addMessage(text, "user");
  // Detect if the user is telling their name (simple heuristics)
  const nameMatch = text.match(/^(?:my name is|i am|i'm|this is)\s+(.+)$/i);
  if (nameMatch) {
    const name = nameMatch[1].trim();
    context.userName = name;

    const ack = `Nice to meet you, ${name}! I'll remember your name for this session.`;
    addMessage(ack, "ai");
    messages.push({ role: "assistant", content: ack });

    // Do not call the API for a name-setting message; stop here.
    userInput.value = "";
    userInput.focus();
    return;
  }

  // Add the user's message to the conversation history
  messages.push({ role: "user", content: text });

  // Track past user questions for context (limit to last 20)
  context.pastQuestions.push(text);
  if (context.pastQuestions.length > 20) context.pastQuestions.shift();

  // Clear the input immediately after submit
  userInput.value = "";
  userInput.focus();

  // Show the user's latest question just above the AI response placeholder
  if (!latestQuestionElem) {
    latestQuestionElem = document.createElement("div");
    latestQuestionElem.className = "latest-question";
  }
  latestQuestionElem.textContent = `You asked: ${text}`;

  // Create placeholder AI response and insert after latest question
  const placeholder = document.createElement("div");
  placeholder.className = "msg ai placeholder";
  placeholder.textContent = "Connecting to the OpenAI API for a response...";
  // Disable the send button while waiting for the response
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.setAttribute("aria-busy", "true");
  }

  chatWindow.appendChild(latestQuestionElem);
  chatWindow.appendChild(placeholder);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  // Send conversation to the Chat Completions API.
  // Behavior:
  // 1) If `window.CF_WORKER_URL` is set, POST to the Cloudflare Worker (recommended).
  // 2) Otherwise, if `window.OPENAI_API_KEY` is set (local dev only), call OpenAI directly.
  // NOTE: Calling OpenAI from the browser is insecure and should only be used for local testing.
  (async () => {
    try {
      const workerUrl = window.CF_WORKER_URL || window.CLOUDWORKER_URL;
      let resp = null;

      if (workerUrl) {
        // Send the request to the deployed Cloudflare Worker.
        resp = await fetch(workerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: buildMessagesForApi() }),
        });
      } else if (window.OPENAI_API_KEY) {
        // Local fallback: call OpenAI directly (INSECURE — local dev only).
        resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${window.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: buildMessagesForApi(),
            max_tokens: 800,
            temperature: 0.7,
          }),
        });
      } else {
        placeholder.textContent =
          "No Cloudflare Worker URL found. Set `window.CF_WORKER_URL` in `secret.js` to your deployed Worker endpoint, or set `window.OPENAI_API_KEY` for local testing.";
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.removeAttribute("aria-busy");
        }
        return;
      }

      if (!resp.ok) {
        const errText = await resp.text();
        const errMsg = `API error: ${resp.status} ${resp.statusText} - ${errText}`;
        const errElem = document.createElement("div");
        errElem.className = "msg ai";
        errElem.textContent = errMsg;
        placeholder.replaceWith(errElem);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.removeAttribute("aria-busy");
        }
        return;
      }

      const data = await resp.json();

      // Extract assistant content from proxied OpenAI response shape
      const assistantMsg =
        data?.choices?.[0]?.message?.content ||
        data?.choices?.[0]?.text ||
        data?.response ||
        data?.text ||
        "(no response)";

      // Create assistant bubble element and replace placeholder with it
      const aiElem = document.createElement("div");
      aiElem.className = "msg ai";
      aiElem.textContent = assistantMsg;

      messages.push({ role: "assistant", content: assistantMsg });
      placeholder.replaceWith(aiElem);
      chatWindow.scrollTop = chatWindow.scrollHeight;

      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.removeAttribute("aria-busy");
      }
    } catch (err) {
      const failElem = document.createElement("div");
      failElem.className = "msg ai";
      failElem.textContent = `Request failed: ${err.message}`;
      try {
        placeholder.replaceWith(failElem);
      } catch (e) {
        // fallback: set placeholder text
        placeholder.textContent = failElem.textContent;
      }
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.removeAttribute("aria-busy");
      }
    }
  })();
});

// Clear conversation button handler
const clearBtn = document.getElementById("clearBtn");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    const ok = window.confirm(
      "Clear conversation? This will remove all messages and reset the chat. Continue?"
    );
    if (!ok) return;

    // Reset conversation history to only include the system prompt
    messages.length = 0;
    messages.push({
      role: "system",
      content:
        "You are a helpful product advisor specializing in L'Oréal products and " +
        "beauty routines. Only answer questions about L'Oréal products, skincare, " +
        "haircare, makeup, routines, and related product recommendations. If a user " +
        "asks about topics that are unrelated to beauty or L'Oréal products (for example: " +
        "politics, general medical diagnoses, illegal activities, personal legal or financial advice, " +
        "or any request outside product/routine/recommendation scope), politely refuse to answer. " +
        "When refusing, be concise and courteous, and offer to help with L'Oréal product recommendations, " +
        "routine suggestions, ingredient information, or other beauty-related questions instead.",
    });

    // Reset context memory as well
    context.userName = null;
    context.pastQuestions.length = 0;

    // Clear the chat window and show the initial greeting
    chatWindow.innerHTML = "";
    addMessage("👋 Hello! How can I help you today?", "ai");

    // Reset latest question UI
    latestQuestionElem = null;

    // Clear the input box
    userInput.value = "";
    userInput.focus();
  });
}
