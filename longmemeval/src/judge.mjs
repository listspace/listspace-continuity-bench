// The official LongMemEval judge. Prompts are copied verbatim from src/evaluation/evaluate_qa.py
// (xiaowu0162/LongMemEval, MIT). The call is the official one: chat completions, n 1, temperature 0,
// max_tokens 10, and a reply that contains "yes" (any case) is a correct answer.
import { ProviderError } from '../../src/providers.mjs';

export const OFFICIAL_JUDGE_MODEL = 'gpt-4o-2024-08-06';
const URL_CHAT = 'https://api.openai.com/v1/chat/completions';

export function judgePrompt(task, question, answer, response, abstention = false) {
  if (abstention) {
    return `I will give you an unanswerable question, an explanation, and a response from a model. Please answer yes if the model correctly identifies the question as unanswerable. The model could say that the information is incomplete, or some other information is given but the asked information is not.\n\nQuestion: ${question}\n\nExplanation: ${answer}\n\nModel Response: ${response}\n\nDoes the model correctly identify the question as unanswerable? Answer yes or no only.`;
  }
  if (['single-session-user', 'single-session-assistant', 'multi-session'].includes(task)) {
    return `I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. \n\nQuestion: ${question}\n\nCorrect Answer: ${answer}\n\nModel Response: ${response}\n\nIs the model response correct? Answer yes or no only.`;
  }
  if (task === 'temporal-reasoning') {
    return `I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. In addition, do not penalize off-by-one errors for the number of days. If the question asks for the number of days/weeks/months, etc., and the model makes off-by-one errors (e.g., predicting 19 days when the answer is 18), the model's response is still correct. \n\nQuestion: ${question}\n\nCorrect Answer: ${answer}\n\nModel Response: ${response}\n\nIs the model response correct? Answer yes or no only.`;
  }
  if (task === 'knowledge-update') {
    return `I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response contains some previous information along with an updated answer, the response should be considered as correct as long as the updated answer is the required answer.\n\nQuestion: ${question}\n\nCorrect Answer: ${answer}\n\nModel Response: ${response}\n\nIs the model response correct? Answer yes or no only.`;
  }
  if (task === 'single-session-preference') {
    return `I will give you a question, a rubric for desired personalized response, and a response from a model. Please answer yes if the response satisfies the desired response. Otherwise, answer no. The model does not need to reflect all the points in the rubric. The response is correct as long as it recalls and utilizes the user's personal information correctly.\n\nQuestion: ${question}\n\nRubric: ${answer}\n\nModel Response: ${response}\n\nIs the model response correct? Answer yes or no only.`;
  }
  throw new Error(`no judge prompt for question type ${task}`);
}

export const isAbstention = (questionId) => questionId.includes('_abs');

/** Returns { label, text, usage: { input, cacheRead, cacheWrite, output } }. Key read from the environment at call time. */
export async function judgeCall({ model, prompt, env = process.env, fetchImpl = fetch }) {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new ProviderError('openai', null, 'OPENAI_API_KEY is not set in the environment (needed for the judge)');
  let res;
  try {
    res = await fetchImpl(URL_CHAT, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], n: 1, temperature: 0, max_tokens: 10 }) });
  } catch (e) { throw new ProviderError('openai', null, `network error: ${e instanceof Error ? e.message : 'unknown'}`); }
  const raw = await res.text();
  let j = null;
  try { j = JSON.parse(raw); } catch { /* below */ }
  if (!res.ok) throw new ProviderError('openai', res.status, String(j?.error?.message ?? raw.slice(0, 300)).replace(/sk-[A-Za-z0-9_*.-]+/g, '[redacted]').slice(0, 500));
  const text = j?.choices?.[0]?.message?.content;
  const u = j?.usage;
  if (typeof text !== 'string' || !Number.isInteger(u?.prompt_tokens) || !Number.isInteger(u?.completion_tokens)) throw new ProviderError('openai', res.status, 'judge reply had no text or usage, so it cannot be scored or metered');
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  return { label: text.trim().toLowerCase().includes('yes'), text: text.trim(), usage: { input: u.prompt_tokens - cached, cacheRead: cached, cacheWrite: 0, output: u.completion_tokens } };
}
