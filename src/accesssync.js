// Keeps the Cloudflare Access sign-in list in step with the app: only the owner, team members and
// crew with an email address can request a sign-in code.
//
// Needs (wrangler.toml vars): CF_ACCOUNT_ID, ACCESS_APP_ID, ACCESS_POLICY_ID
// and a worker secret CF_ACCESS_TOKEN: a Cloudflare API token with only
// "Account > Access: Apps and Policies > Edit".
import {allowedEmails} from './roles.js';

export const syncConfigured = (env) => !!(env.CF_ACCESS_TOKEN && env.CF_ACCOUNT_ID && env.ACCESS_APP_ID && env.ACCESS_POLICY_ID);

export function policyBody(emails) {
  return {
    name: 'Invited people only (managed by HD Events HQ)',
    decision: 'allow',
    include: emails.map((email) => ({email: {email}})),
  };
}

// Returns 'unchanged', 'ok', 'not-configured' or 'failed'. Records what was sent in meta.
export async function syncAccess(env, state, doFetch = fetch) {
  const emails = allowedEmails(env, state);
  const want = JSON.stringify(emails);
  const last = await env.DB.prepare("SELECT value FROM meta WHERE key='access_synced'").first();
  if (last?.value === want) return 'unchanged';
  await env.DB.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES ('access_wanted',?)").bind(want).run();
  if (!syncConfigured(env)) return 'not-configured';
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps/${env.ACCESS_APP_ID}/policies/${env.ACCESS_POLICY_ID}`;
  try {
    const r = await doFetch(url, {method: 'PUT', headers: {authorization: 'Bearer ' + env.CF_ACCESS_TOKEN, 'content-type': 'application/json'}, body: JSON.stringify(policyBody(emails))});
    if (!r.ok) return 'failed';
  } catch { return 'failed'; }
  await env.DB.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES ('access_synced',?)").bind(want).run();
  return 'ok';
}

// For the People & access page: who can sign in now, and whether the list is up to date.
export async function accessStatus(env, state) {
  const emails = allowedEmails(env, state);
  const last = await env.DB.prepare("SELECT value FROM meta WHERE key='access_synced'").first();
  return {emails, inSync: last?.value === JSON.stringify(emails), automatic: syncConfigured(env)};
}
