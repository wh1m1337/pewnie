// Єдина точка виклику Claude API для скриптів (генерація тижнів, переклади, нові теми).
//
//   complete({ system, messages, maxTokens, effort }) -> { text }
//
// PEWNIE_MODEL       — модель (за замовч. claude-opus-5)
// PEWNIE_FAKE_LLM    — шлях до модуля { respond({system, messages}) } — підміна для тестів конвеєра без API
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const MODEL = process.env.PEWNIE_MODEL || 'claude-opus-5';
const PRICE = { in: 5, out: 25 }; // $ за 1M токенів (claude-opus-5); для інших моделей — орієнтовно

export const hasCredentials = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.PEWNIE_FAKE_LLM);

let client;
const totals = { calls: 0, input: 0, output: 0 };

export async function complete({ system, messages, maxTokens = 32000, effort = 'high' }) {
  totals.calls++;
  if (process.env.PEWNIE_FAKE_LLM) {
    const mod = await import(pathToFileURL(resolve(process.env.PEWNIE_FAKE_LLM)).href);
    return { text: await mod.respond({ system, messages }) };
  }
  client ??= new (await import('@anthropic-ai/sdk')).default();
  const stream = client.messages.stream({
    model: MODEL, max_tokens: maxTokens, thinking: { type: 'adaptive' }, output_config: { effort }, system, messages,
  });
  const msg = await stream.finalMessage();
  totals.input += msg.usage.input_tokens ?? 0;
  totals.output += msg.usage.output_tokens ?? 0;
  if (msg.stop_reason === 'refusal') throw new Error(`Модель відмовилась (${msg.stop_details?.category ?? 'без категорії'})`);
  if (msg.stop_reason === 'max_tokens') throw new Error('Відповідь обірвана по max_tokens');
  return { text: msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() };
}

// JSON із відповіді (з можливою markdown-огорожею)
export const parseJSON = (text) => JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));

export function costLine() {
  if (!totals.calls) return '';
  const usd = (totals.input * PRICE.in + totals.output * PRICE.out) / 1e6;
  return `Claude API: ${totals.calls} викликів, ${totals.input.toLocaleString('en')} токенів на вхід, ${totals.output.toLocaleString('en')} на вихід ≈ $${usd.toFixed(2)}`;
}
