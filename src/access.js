// Trust only keys fetched from the configured Cloudflare Access team's certificate endpoint.
const keyCache = new Map();
const decode = value => Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0));
const jsonPart = value => JSON.parse(new TextDecoder().decode(decode(value)));
export async function staffEmail(request,env,loadKeys=fetch){
  if(!/^[a-z0-9-]+$/.test(env.ACCESS_TEAM||'')||!env.ACCESS_AUD||!env.OWNER_EMAIL)throw Error('Access is not configured');
  const issuer='https://'+env.ACCESS_TEAM+'.cloudflareaccess.com';
  const token=request.headers.get('Cf-Access-Jwt-Assertion')||'';
  const parts=token.split('.');
  if(parts.length!==3||token.length>16384)throw Error('Invalid assertion');
  const header=jsonPart(parts[0]);
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('Invalid signing key');
  const now=Math.floor(Date.now()/1000);
  let cached=keyCache.get(issuer);
  if(!cached||cached.until<=now){
    // 'manual' (not 'error', which Workers may reject): any redirect is simply not OK and is refused.
    const result=await loadKeys(issuer+'/cdn-cgi/access/certs',{redirect:'manual'});
    if(!result.ok)throw Error('Certificate service unavailable ('+result.status+')');
    cached={keys:(await result.json()).keys,until:now+300};
    keyCache.set(issuer,cached);
  }
  const jwk=cached.keys.find(key=>key.kid===header.kid&&key.kty==='RSA');
  if(!jwk)throw Error('Unknown signing key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  if(!valid)throw Error('Invalid signature');
  const p=jsonPart(parts[1]),aud=Array.isArray(p.aud)?p.aud:[p.aud];
  if(p.iss!==issuer||!aud.includes(env.ACCESS_AUD)||!Number.isFinite(p.exp)||p.exp<=now||(p.nbf!==undefined&&(!Number.isFinite(p.nbf)||p.nbf>now))||typeof p.sub!=='string'||!p.sub||typeof p.email!=='string'||!p.email.trim())throw Error('Invalid claims');
  return p.email.trim().toLowerCase();
}
