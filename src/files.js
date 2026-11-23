// Photos and logos live in R2 file storage, not inside the records.
// Files are named by a hash of their contents and never overwritten, so a backup that
// points at a file still finds it after a restore.
const IMAGES={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg','image/gif':'gif'};
const DOCUMENTS={'application/pdf':'pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/msword':'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/vnd.ms-excel':'xls','text/plain':'txt','text/csv':'csv'};
// What each kind of file may be, and how big.
const KINDS={
  branding:{types:IMAGES,max:5*1024*1024},
  equipment:{types:IMAGES,max:5*1024*1024},
  creative:{types:IMAGES,max:10*1024*1024},           // moodboard images, AI visuals, posters
  plan:{types:{...IMAGES,...DOCUMENTS},max:25*1024*1024}, // checklist attachments: licences, certificates, risk assessments
};
export const MAX_FILE=25*1024*1024;
const EXTS=[...new Set(Object.values({...IMAGES,...DOCUMENTS}))].join('|');
export const FILE_PATH=new RegExp('^/files/('+Object.keys(KINDS).join('|')+')/[0-9a-f]{64}\\.('+EXTS+')$');
// Served files can never run script, even an SVG opened directly.
const fileHeaders={'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox",'cache-control':'private, max-age=31536000, immutable'};

async function hex(buf){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buf))].map(b=>b.toString(16).padStart(2,'0')).join('');}

export async function storeFile(env,kind,type,bytes){
  if(!env.FILES)throw Object.assign(Error('File storage is not connected yet.'),{status:503});
  const rule=Object.hasOwn(KINDS,kind)?KINDS[kind]:null;
  if(!rule)throw Object.assign(Error('Unknown file kind'),{status:400});
  const ext=rule.types[type];
  if(!ext)throw Object.assign(Error(rule.types===IMAGES?'Use a PNG, JPEG, WebP, GIF or SVG image.':'Use a PDF, Word, Excel, text, CSV or image file.'),{status:415});
  if(!bytes.byteLength||bytes.byteLength>rule.max)throw Object.assign(Error('Files of this kind must be under '+rule.max/1048576+' MB.'),{status:413});
  const key=kind+'/'+await hex(bytes)+'.'+ext;
  if(!await env.FILES.head(key))await env.FILES.put(key,bytes,{httpMetadata:{contentType:type}});
  return '/files/'+key;
}

export async function serveFile(env,path){
  if(!env.FILES||!FILE_PATH.test(path))return new Response('Not found',{status:404});
  const obj=await env.FILES.get(path.slice(7));
  if(!obj)return new Response('Not found',{status:404});
  const type=obj.httpMetadata?.contentType||'application/octet-stream';
  // Images show in the page; documents always download rather than open in the app's own address.
  const disposition=Object.hasOwn(IMAGES,type)?{}:{'content-disposition':'attachment'};
  return new Response(obj.body,{headers:{...fileHeaders,'content-type':type,...disposition}});
}

// Turn a data: URL (how the logo used to be stored) into a stored file. Returns the new path.
export async function dataUrlToFile(env,kind,url){
  const m=/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(url);
  if(!m)throw Error('Unsupported embedded image');
  const bin=atob(m[2].replace(/\s/g,''));
  const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
  return storeFile(env,kind,m[1].toLowerCase(),bytes.buffer);
}
