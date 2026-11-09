const crypto=require('node:crypto');
const CONN=process.env.DATABASE_URL||'';
const ADMINS=(process.env.STREAMIX_ADMIN_EMAIL||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
const AUTH=(process.env.NEON_AUTH_BASE_URL||'').replace(/\/+$/,'');
const DEST='https://vod.talis.top/';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG={invalid:'Ce code n\u2019est pas reconnu. V\u00e9rifie les caract\u00e8res et r\u00e9essaie.',
expired:'Ce code a expir\u00e9. Contacte l\u2019administrateur pour en obtenir un nouveau.',
device_limit:'Ce code a atteint sa limite d\u2019appareils. Demande une r\u00e9activation.',
rate_limited:'Trop de tentatives. Patiente quelques minutes avant de r\u00e9essayer.'};
async function sql(q,p){
 if(!CONN)throw new Error('DATABASE_URL absent');
 const host=new URL(CONN).host;
 const r=await fetch('https://'+host+'/sql',{method:'POST',headers:{'Content-Type':'application/json','Neon-Connection-String':CONN},body:JSON.stringify({query:q,params:p||[]}),signal:AbortSignal.timeout(9000)});
 const t=await r.text();
 if(!r.ok)throw new Error('db '+r.status+': '+t.slice(0,120));
 if(!t)return [];
 const j=JSON.parse(t);
 return Array.isArray(j)?j:(j.rows||j.data||[]);
}
let KEY=null;
async function key(){
 if(KEY)return KEY;
 const rows=await sql("SELECT encode(value,'hex') AS k FROM streamix.settings WHERE key='code_hmac_key'");
 const hex=rows[0]&&rows[0].k;
 if(!hex||hex.length!==64)throw new Error('cle HMAC absente');
 KEY=Buffer.from(hex,'hex');
 return KEY;
}
function norm(v){
 if(typeof v!=='string')return null;
 const c=v.trim().replace(/[\s-]/g,'').toLowerCase();
 return /^[a-f0-9]{32}$/.test(c)?c:null;
}
function hmac(purpose,value,secret){
 return crypto.createHmac('sha256',secret).update(purpose+'\u0000'+value,'utf8').digest('hex');
}
async function codeDigest(code){return hmac('code',code,await key());}
async function deviceDigest(id){
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(id))return null;
 return hmac('device',id,await key());
}
function ipDigest(ip){return crypto.createHash('sha256').update('ip\u0000'+(ip||'inconnu'),'utf8').digest('hex');}
function decodeBody(req){
 if(req.body&&typeof req.body==='object')return req.body;
 if(typeof req.body==='string'){try{return JSON.parse(req.body);}catch{return {};}}
 return {};
}
async function isAdmin(req,res){
 if(!AUTH||!ADMINS.length){res.status(503).json({error:'auth_not_configured'});return false;}
 const cookie=req.headers.cookie||'';
 if(!cookie){res.status(401).json({error:'unauthenticated'});return false;}
 for(const suffix of ['/get-session','/auth/get-session']){
  let r;
  try{r=await fetch(AUTH+suffix,{headers:{cookie,accept:'application/json'},signal:AbortSignal.timeout(8000)});}catch{continue;}
  if(!r.ok)continue;
  const p=await r.json().catch(()=>null);
  const user=(p&&(p.user||(p.data&&p.data.user)||(p.session&&p.session.user)))||null;
  if(!user||!user.email)continue;
  const found=Buffer.from(String(user.email).trim().toLowerCase());
  let ok=false;
  for(const candidate of ADMINS){
   const exp=Buffer.from(candidate);
   if(found.length===exp.length&&crypto.timingSafeEqual(found,exp))ok=true;
  }
  if(!ok){res.status(403).json({error:'not_administrator'});return false;}
  return true;
 }
 res.status(401).json({error:'unauthenticated'});
 return false;
}
function shape(r){
 const expired=r.expires_at?new Date(r.expires_at)<=new Date():false;
 return {id:r.id,label:r.label,createdAt:r.created_at,expiresAt:r.expires_at,
 maxDevices:r.max_devices===null?null:Number(r.max_devices),revoked:Boolean(r.revoked_at),
 expired,devices:Number(r.devices),status:r.revoked_at?'revoked':expired?'expired':'active'};
}
async function redeem(req,res){
 if(req.method!=='POST'){res.status(405).json({ok:false,reason:'method_not_allowed'});return;}
 const b=decodeBody(req);
 const code=norm(b.code);
 let device=null;
 try{device=await deviceDigest(b.deviceId);}catch(e){res.status(503).json({ok:false,reason:'unavailable',message:'Service momentan\u00e9ment indisponible.'});return;}
 const fwd=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
 const ip=ipDigest(fwd||(req.socket&&req.socket.remoteAddress)||'inconnu');
 if(!code||!device){res.status(400).json({ok:false,reason:'invalid',message:MSG.invalid});return;}
 try{
  const a=await sql("SELECT streamix.record_attempt(decode($1,'hex'),$2) AS status",[ip,false]);
  if(a[0]&&a[0].status==='rate_limited'){res.status(429).json({ok:false,reason:'rate_limited',message:MSG.rate_limited});return;}
  const rows=await sql("SELECT result,valid_until FROM streamix.claim_device(decode($1,'hex'),decode($2,'hex'))",[await codeDigest(code),device]);
  const out=(rows[0]&&rows[0].result)||'invalid';
  if(out==='ok'){res.status(200).json({ok:true,destination:DEST,validUntil:rows[0].valid_until});return;}
  const st=out==='expired'?410:out==='device_limit'?403:404;
  res.status(st).json({ok:false,reason:out,message:MSG[out]||MSG.invalid});
 }catch(e){
  console.error('redeem_failed',e.message);
  res.status(503).json({ok:false,reason:'unavailable',message:'Service momentan\u00e9ment indisponible. R\u00e9essaie dans un instant.'});
 }
}
async function listCodes(req,res,url){
 const search=String(url.searchParams.get('search')||'').trim().slice(0,80);
 const st=['all','active','expired','revoked','limit'].includes(url.searchParams.get('status'))?url.searchParams.get('status'):'all';
 const limit=Math.min(Number(url.searchParams.get('limit'))||100,200);
 const rows=await sql("SELECT c.id,c.label,c.created_at,c.expires_at,c.max_devices,c.revoked_at,(SELECT count(*)::int FROM streamix.code_devices d WHERE d.code_id=c.id AND d.revoked_at IS NULL) AS devices FROM streamix.access_codes c WHERE ($1='' OR c.label ILIKE '%'||$1||'%' OR c.id::text=$1) ORDER BY c.created_at DESC LIMIT $2",[search,limit]);
 let codes=rows.map(shape);
 if(st==='limit')codes=codes.filter(c=>c.maxDevices!==null&&c.devices>=c.maxDevices&&!c.revoked);
 else if(st!=='all')codes=codes.filter(c=>c.status===st);
 res.status(200).json({codes,total:codes.length});
}
async function createCode(req,res){
 const b=decodeBody(req);
 const label=String(b.label||'').trim().slice(0,80);
 const days=Number(b.expiresInDays);
 const rawMax=b.maxDevices;
 const maxDevices=rawMax===null||rawMax===''||rawMax===undefined?null:Number(rawMax);
 if(maxDevices!==null&&(!Number.isInteger(maxDevices)||maxDevices<1||maxDevices>10000)){res.status(400).json({error:'invalid_max_devices'});return;}
 const expiresAt=Number.isFinite(days)&&days>0?new Date(Date.now()+Math.min(days,3650)*86400000).toISOString():null;
 const hex=crypto.randomBytes(16).toString('hex');
 const id=crypto.randomUUID();
 await sql("INSERT INTO streamix.access_codes (id,code_digest,label,expires_at,max_devices) VALUES ($1::uuid,decode($2,'hex'),$3::text,$4::timestamptz,$5::int)",[id,await codeDigest(hex),label,expiresAt,maxDevices]);
 res.status(201).json({id,code:hex.toUpperCase().match(/.{4}/g).join('-'),label,expiresAt,maxDevices});
}
async function codeItem(req,res,id,url){
 if(!UUID.test(id)){res.status(400).json({error:'invalid_id'});return;}
 if(req.method==='GET'){
  const rows=await sql("SELECT encode(device_digest,'hex') AS key,first_seen,last_seen,revoked_at FROM streamix.code_devices WHERE code_id=$1::uuid ORDER BY last_seen DESC",[id]);
  res.status(200).json({devices:rows.map((r,i)=>({slot:i+1,key:String(r.key).slice(0,12),firstSeen:r.first_seen,lastSeen:r.last_seen,revoked:Boolean(r.revoked_at)}))});
  return;
 }
 if(req.method==='PATCH'){
  const revoke=decodeBody(req).revoked!==false;
  const rows=await sql('UPDATE streamix.access_codes SET revoked_at=$2::timestamptz WHERE id=$1::uuid RETURNING id,revoked_at',[id,revoke?new Date().toISOString():null]);
  if(!rows.length){res.status(404).json({error:'not_found'});return;}
  res.status(200).json({id:rows[0].id,revokedAt:rows[0].revoked_at});
  return;
 }
 if(req.method==='DELETE'){
  const k=String(url.searchParams.get('device')||'').toLowerCase();
  if(!/^[0-9a-f]{8,64}$/.test(k)){res.status(400).json({error:'invalid_device'});return;}
  const rows=await sql("UPDATE streamix.code_devices SET revoked_at=now() WHERE code_id=$1::uuid AND encode(device_digest,'hex') LIKE $2||'%' AND revoked_at IS NULL RETURNING device_digest",[id,k]);
  res.status(200).json({freed:rows.length});
  return;
 }
 res.status(405).json({error:'method_not_allowed'});
}
async function latestRelease(req,res){
 if(req.method!=='GET'){res.status(405).json({error:'method_not_allowed'});return;}
 const rows=await sql('SELECT version_code,version_name,download_url,notes,published_at FROM streamix.releases ORDER BY version_code DESC LIMIT 1');
 if(!rows.length){res.status(200).json({release:null});return;}
 const r=rows[0];
 res.status(200).json({release:{versionCode:Number(r.version_code),versionName:r.version_name,downloadUrl:r.download_url,notes:r.notes,publishedAt:r.published_at}});
}
async function publishRelease(req,res){
 if(req.method!=='POST'){res.status(405).json({error:'method_not_allowed'});return;}
 const b=decodeBody(req);
 const versionCode=Number(b.versionCode);
 const versionName=String(b.versionName||'').trim().slice(0,24);
 const downloadUrl=String(b.downloadUrl||'').trim();
 const notes=String(b.notes||'').slice(0,500);
 if(!Number.isInteger(versionCode)||versionCode<1){res.status(400).json({error:'invalid_version'});return;}
 if(!versionName){res.status(400).json({error:'invalid_name'});return;}
 if(!/^https:\/\/[^\s]+$/.test(downloadUrl)){res.status(400).json({error:'invalid_url'});return;}
 await sql('INSERT INTO streamix.releases (version_code,version_name,download_url,notes) VALUES ($1::int,$2::text,$3::text,$4::text) ON CONFLICT (version_code) DO UPDATE SET version_name=excluded.version_name,download_url=excluded.download_url,notes=excluded.notes,published_at=now()',[versionCode,versionName,downloadUrl,notes]);
 res.status(201).json({published:versionCode});
}
function relay(cookie){
 const parts=cookie.split(';');
 const pair=parts.shift();
 let maxAge='';
 for(const p of parts){const t=p.trim();if(/^max-age=/i.test(t))maxAge='; '+t;}
 return pair+'; Path=/'+maxAge+'; HttpOnly; Secure; SameSite=Lax';
}
async function authProxy(req,res,rest){
 if(!AUTH){res.status(503).json({error:'auth_not_configured'});return;}
 let origin='';
 try{origin=new URL(AUTH).origin;}catch{origin='';}
 const headers={'content-type':req.headers['content-type']||'application/json',accept:'application/json'};
 if(req.headers.cookie)headers.cookie=req.headers.cookie;
 if(origin){headers.origin=origin;headers.referer=origin+'/';}
 const init={method:req.method,headers,signal:AbortSignal.timeout(10000)};
 if(req.method!=='GET'&&req.method!=='HEAD'){
  init.body=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
 }
 try{
  const up=await fetch(AUTH+'/'+rest,init);
  const text=await up.text();
  const cookies=up.headers.getSetCookie?up.headers.getSetCookie():[];
  if(cookies.length)res.setHeader('Set-Cookie',cookies.map(relay));
  res.status(up.status);
  res.setHeader('Content-Type',up.headers.get('content-type')||'application/json');
  res.send(text);
 }catch(e){
  console.error('auth_proxy_failed',e.message);
  res.status(503).json({error:'auth_unreachable'});
 }
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 const url=new URL(req.url,'https://streamix.invalid');
 const path=url.pathname.replace(/^\/api/,'')||'/';
 try{
  if(path==='/health'){
   const t=await sql("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='streamix'");
   const k=await sql("SELECT length(value)::int AS n FROM streamix.settings WHERE key='code_hmac_key'");
   res.status(200).json({ok:true,database:'reachable',streamixTables:t[0]?t[0].n:0,hmacKeyBytes:k[0]?k[0].n:0});
   return;
  }
  if(path==='/redeem'){await redeem(req,res);return;}
  if(path==='/release'){await latestRelease(req,res);return;}
  if(path==='/session'){await authProxy(req,res,'get-session');return;}
  if(path==='/signin'){await authProxy(req,res,'sign-in/email');return;}
  if(path==='/signup'){await authProxy(req,res,'sign-up/email');return;}
  if(path==='/signout'){await authProxy(req,res,'sign-out');return;}
  if(path==='/codes'){
   if(!(await isAdmin(req,res)))return;
   const id=url.searchParams.get('id');
   if(id){await codeItem(req,res,id,url);return;}
   if(req.method==='GET'){await listCodes(req,res,url);return;}
   if(req.method==='POST'){await createCode(req,res);return;}
   res.status(405).json({error:'method_not_allowed'});
   return;
  }
  if(path==='/publish'){
   if(!(await isAdmin(req,res)))return;
   await publishRelease(req,res);
   return;
  }
  res.status(404).json({error:'not_found'});
 }catch(e){
  console.error('api_failed',path,e.message);
  res.status(503).json({error:'unavailable'});
 }
};
