// AI image generation for the event planner (moodboard visuals and poster artwork),
// using Cloudflare Workers AI on the same Cloudflare account. No separate API key.
// Images go straight into file storage; only their /files/... address is kept in the plan.
import {storeFile} from './files.js';

const DEFAULT_MODEL='@cf/black-forest-labs/flux-1-schnell';
export const MAX_PROMPT=1500;

export async function generateImage(env,prompt){
  if(!env.AI)throw Object.assign(Error('AI images are not switched on yet. See "AI images" in docs/DEPLOY.md.'),{status:503});
  prompt=String(prompt||'').trim();
  if(prompt.length<3)throw Object.assign(Error('Describe the image you want.'),{status:400});
  if(prompt.length>MAX_PROMPT)throw Object.assign(Error('Please keep the description under '+MAX_PROMPT+' characters.'),{status:400});
  let out;
  try{out=await env.AI.run(env.AI_IMAGE_MODEL||DEFAULT_MODEL,{prompt,steps:8});}
  catch(e){throw Object.assign(Error('The image service could not make that image: '+String(e?.message||e).slice(0,200)),{status:502});}
  const b64=typeof out?.image==='string'?out.image:null;
  if(!b64)throw Object.assign(Error('The image service returned no image. Try a different description.'),{status:502});
  const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const type=bytes[0]===0x89?'image/png':'image/jpeg';
  return storeFile(env,'creative',type,bytes.buffer);
}
