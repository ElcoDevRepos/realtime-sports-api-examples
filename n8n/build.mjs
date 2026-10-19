// Builds the two importable n8n workflows from the tested code in code/.
//   node build.mjs   ->  workflows/poll-score-alerts.json, workflows/webhook-score-alerts.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const src = (f) => readFileSync(new URL(`./code/${f}`, import.meta.url), 'utf8');
const API = 'https://www.realtimesportsapi.com/api/v1';
// Stable UUID-shaped node ids, so rebuilding doesn't churn the JSON.
const uuid = (s) => createHash('sha1').update(s).digest('hex').slice(0, 32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
const node = (name, type, typeVersion, position, parameters) => ({ id: uuid(name), name, type, typeVersion, position, parameters });
const link = (...names) => Object.fromEntries(names.slice(0, -1).map((n, i) => [n, { main: [[{ node: names[i + 1], type: 'main', index: 0 }]] }]));
const telegram = (position) =>
  node('Send to Telegram', 'n8n-nodes-base.telegram', 1.2, position, {
    chatId: 'YOUR_CHAT_ID',
    text: '={{ $json.text }}',
    additionalFields: { appendAttribution: false }
  });

const gate = `// Runs every minute but only lets the workflow call the API when it's worth it
// (every 2 min while a game is live, shortly before the next start, otherwise every 3 hours).
// Static data persists only for active (production) executions, not manual test runs.
const state = $getWorkflowStaticData('global');
if (Date.now() < (state.nextCheck || 0)) return [];
return [{ json: {} }];`;

const diff = `// Edit these two lines. TEAM is an abbreviation (e.g. BOS) or a team id; '' = every game in the league.
const TEAM = 'BOS';

${src('score-step.js')}
const state = $getWorkflowStaticData('global');
const games = $input.first().json.data || [];
const { messages, state: next } = scoreStep(state, games, TEAM, Date.now());
state.scores = next.scores;
state.initialised = next.initialised;
state.nextCheck = next.nextCheck;
return messages.map((text) => ({ json: { text } }));`;

const poll = {
  name: 'Realtime Sports API: score alerts (polling)',
  nodes: [
    node('Every minute', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 0], { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } }),
    node('Worth calling?', 'n8n-nodes-base.code', 2, [220, 0], { jsCode: gate }),
    node('Get scoreboard', 'n8n-nodes-base.httpRequest', 4.2, [440, 0], {
      url: `${API}/sports/basketball/leagues/nba/events`,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: {}
    }),
    node('Score changes', 'n8n-nodes-base.code', 2, [660, 0], { jsCode: diff }),
    telegram([880, 0])
  ],
  connections: link('Every minute', 'Worth calling?', 'Get scoreboard', 'Score changes', 'Send to Telegram'),
  settings: { executionOrder: 'v1' },
  pinData: {}
};

const format = `${src('format-alert.js')}
// The Webhook node puts the delivery's JSON body under $json.body.
const text = formatAlert($input.first().json.body);
return text ? [{ json: { text } }] : [];`;

const hook = {
  name: 'Realtime Sports API: score alerts (webhooks)',
  nodes: [
    node('Realtime Sports API webhook', 'n8n-nodes-base.webhook', 2, [0, 0], {
      httpMethod: 'POST',
      path: 'rsa-scores-CHANGE-ME-to-something-random',
      responseMode: 'onReceived',
      options: {}
    }),
    node('Format alert', 'n8n-nodes-base.code', 2, [220, 0], { jsCode: format }),
    telegram([440, 0])
  ],
  connections: link('Realtime Sports API webhook', 'Format alert', 'Send to Telegram'),
  settings: { executionOrder: 'v1' },
  pinData: {}
};
// Webhook nodes need a stable webhookId so the production URL survives re-imports.
hook.nodes[0].webhookId = 'b4c1f0e2-5d3a-4c8e-9f61-2a7d0e9b3c55';

mkdirSync(new URL('./workflows/', import.meta.url), { recursive: true });
writeFileSync(new URL('./workflows/poll-score-alerts.json', import.meta.url), JSON.stringify(poll, null, 2) + '\n');
writeFileSync(new URL('./workflows/webhook-score-alerts.json', import.meta.url), JSON.stringify(hook, null, 2) + '\n');
console.log('wrote workflows/poll-score-alerts.json and workflows/webhook-score-alerts.json');
