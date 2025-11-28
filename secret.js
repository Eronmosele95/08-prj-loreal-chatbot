/* secrets.js
 * IMPORTANT: Do NOT commit a real API key to source control.
 * This file is intended to be created locally with your private key only.
 * The project `.gitignore` already excludes `secrets.js` to help protect it.
 *
 * Replace the placeholder value below with your actual API key when running locally.
 * For production, store API keys on the server (Cloudflare Worker, backend) and
 * never expose them to client-side JavaScript.
 */

// Client-side API keys are insecure. The OpenAI API key was removed
// from this file to avoid accidental exposure. Store the key in your
// Cloudflare Worker environment (e.g. via the Workers dashboard or
// `wrangler secret put OPENAI_API_KEY`) and keep the client-side code
// free of secrets.

// URL of your deployed Cloudflare Worker that will proxy requests to OpenAI.
// Set this to your worker's URL so the client can POST conversation payloads
// to the worker which will forward them securely to OpenAI using a server-side key.
// NOTE: include trailing slash as requested.
window.CF_WORKER_URL = "https://project-8-loreal.ealli12.workers.dev/";

// NOTE: For production, remove `window.OPENAI_API_KEY` from client-side code
// and keep only `window.CF_WORKER_URL` here. The worker should hold the
// OpenAI API key securely (environment variable) and the client should never
// directly include secret API keys.
