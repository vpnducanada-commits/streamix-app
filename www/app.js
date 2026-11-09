// STREAMIX - les codes sont validés par le serveur, plus rien en local
const API_BASE = 'https://streamix-app.vercel.app';
const APP_VERSION_CODE = 8;
const DEFAULT_URL = 'https://vod.talis.top/';
let defaultUrl = DEFAULT_URL;
let securityAnswer = '';
let currentMainCode = '';
let codes = [];
let currentSession = null;
let barVisible = false;
let unlocking = false;

// Identifiant d'appareil stable, au format attendu par le serveur (32 à 128 caractères).
function getOrCreateDeviceId(){
  let id = null;
  try { id = localStorage.getItem('streamix_deviceId'); } catch(e) {}
  if(id && /^[A-Za-z0-9_-]{32,128}$/.test(id)) return id;
  const bytes = new Uint8Array(32);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  id = btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  try { localStorage.setItem('streamix_deviceId', id); } catch(e) {}
  return id;
}
const deviceId = getOrCreateDeviceId();

function parseValidUntil(v){
  if(!v) return null;
  const t = Date.parse(String(v).replace(' ','T').replace(/\+00$/,'Z'));
  return isNaN(t) ? null : t;
}
try{
  const raw=JSON.parse(localStorage.getItem('streamix_codes')||'null');
  if(Array.isArray(raw)){ codes=raw.map(c=>migrateCode(c)); }
}catch(e){ codes=[]; }
function migrateCode(c){
  const now=Date.now();
  if(c.devices===undefined) c.devices=[];
  if(c.deviceLimit===undefined) c.deviceLimit=c.devicesLimit || 2;
  if(c.duration===undefined) c.duration='7';
  if(c.createdAt===undefined) c.createdAt=now - 86400000;
  if(c.expiresAt===undefined){
    if(c.duration==='illimite' || c.duration==='Illimité' || c.duration==='∞') c.expiresAt=null;
    else { const days=parseInt(c.duration)||7; c.expiresAt=c.createdAt + days*86400000; }
  }
  if(c.status===undefined) c.status='active';
  return c;
}
function saveCodes(){ localStorage.setItem('streamix_codes', JSON.stringify(codes)); }

// UI init
const els={
  defaultUrlInput:document.getElementById('defaultUrlInput'),
  currentCodeDisplay:document.getElementById('currentCodeDisplay'),
  securityAnswerInput:document.getElementById('securityAnswerInput'),
  securityPreview:document.getElementById('securityPreview'),
  sessionBadge:document.getElementById('sessionBadge')
};
if(els.defaultUrlInput) els.defaultUrlInput.value=defaultUrl;
if(els.currentCodeDisplay) els.currentCodeDisplay.textContent=currentMainCode;
if(els.securityAnswerInput) els.securityAnswerInput.value=securityAnswer;
if(els.securityPreview) els.securityPreview.textContent=securityAnswer;
updateUsersList(); updateStats();

// Restaurer session après retour de navigation externe (APK)
try {
  if (new URLSearchParams(window.location.search).has('lock')) sessionStorage.removeItem('streamix_session');
  const savedSession = sessionStorage.getItem('streamix_session');
  if(savedSession){
    const sess = JSON.parse(savedSession);
    if(sess && !isExpired(sess) && getStatus(sess)==='active'){
      currentSession = sess;
      const lk = document.getElementById('lockScreen');
      if(lk) lk.style.display='none';
      const bv = document.getElementById('browserView');
      if(bv) bv.classList.remove('hidden');
      const bar = document.getElementById('topBar');
      if(bar) bar.classList.add('hidden-bar');
      barVisible = false;
      updateSessionUI();
    } else {
      sessionStorage.removeItem('streamix_session');
      currentSession = null;
    }
  }
} catch(e) {}

document.getElementById('toggleCodeView').addEventListener('click',()=>{
  const i=document.getElementById('codeInput');
  i.type=i.type==='password'?'text':'password';
  document.getElementById('toggleCodeView').textContent=i.type==='password'?'👁':'🙈';
});
document.querySelectorAll('[data-toggle="adminPass"]').forEach(b=>{
  b.addEventListener('click',()=>{
    const i=document.getElementById('adminPass');
    i.type=i.type==='password'?'text':'password';
    b.textContent=i.type==='password'?'👁':'🙈';
  });
});

document.getElementById('unlockBtn').addEventListener('click', tryUnlock);
document.getElementById('codeInput').addEventListener('keydown', e=>{ if(e.key==='Enter') tryUnlock(); });

function isExpired(c){ if(c.expiresAt===null) return false; return Date.now() > c.expiresAt; }
function getStatus(c){
  if(isExpired(c)) return 'expired';
  if(c.deviceLimit!=='illimite' && c.devices && c.devices.length >= parseInt(c.deviceLimit) && !c.devices.includes(deviceId)) return 'limit';
  return 'active';
}
function formatExpiry(c){
  if(c.expiresAt===null) return 'Illimité';
  const d=new Date(c.expiresAt);
  return d.toLocaleDateString('fr-FR');
}
function daysLeft(c){
  if(c.expiresAt===null) return '∞';
  const diff=c.expiresAt - Date.now();
  if(diff<=0) return 'Expiré';
  const days=Math.ceil(diff/86400000);
  return days+'j';
}

function tryUnlock(){
  const raw = document.getElementById('codeInput').value.trim();
  const err = document.getElementById('codeError');
  if(!raw){ showError('Entre ton code'); return; }
  if(unlocking) return;
  unlocking = true;
  err.style.color = '#9a9aa6';
  err.textContent = 'Vérification…';
  fetch(API_BASE + '/api/redeem', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({code: raw, deviceId: deviceId})
  }).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(b){ return {s:r.status, b:b}; });
  }).then(function(res){
    unlocking = false;
    err.style.color = '#ff8a8f';
    if(res.s === 200 && res.b && res.b.ok){
      err.style.color = '#00d084';
      err.textContent = '✓ Accès autorisé';
      const expire = parseValidUntil(res.b.validUntil);
      const session = {code: raw.toUpperCase(), name:'Accès', destination: res.b.destination,
                    validUntil: res.b.validUntil, expiresAt: expire, deviceLimit:'∞', type:'server'};
      sparkleBurst();
      window.setTimeout(function(){ enterBrowser(session); }, 700);
      return;
    }
    const reason = res.b && res.b.reason;
    let msg = res.b && res.b.message;
    if(!msg){
      if(reason === 'device_limit') msg = "Limite d'appareils atteinte pour ce code.";
      else if(reason === 'expired') msg = 'Ce code a expiré.';
      else if(reason === 'rate_limited') msg = 'Trop de tentatives, patiente quelques minutes.';
      else msg = "Code non reconnu. Vérifie les caractères.";
    }
    showError('⛔ ' + msg);
    shakeInput();
  }).catch(function(){
    unlocking = false;
    err.style.color = '#ff8a8f';
    showError('⛔ Serveur injoignable. Vérifie ta connexion internet.');
  });
}
function showError(msg){ document.getElementById('codeError').textContent=msg; }
function shakeInput(){
  const i=document.getElementById('codeInput');
  const w=document.querySelector('.code-input-wrapper');
  i.style.borderColor='#ff3b30';
  if(w){ w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); }
  setTimeout(()=>{ i.style.borderColor='#2a2a2a'; if(w) w.classList.remove('shake'); },1200);
}

// ---------- Étincelles du fond ----------
function initSparkles(){
  const host=document.getElementById('sparkles');
  if(!host || host.dataset.ready) return;
  host.dataset.ready='1';
  const total = window.innerWidth < 420 ? 16 : 24;
  for(let k=0;k<total;k++){
    const s=document.createElement('span');
    const big = (k % 6 === 0);
    s.className = 'spark' + (big ? ' big' : '');
    const size = big ? 10 + Math.random()*5 : 4 + Math.random()*4;
    s.style.setProperty('--s', size.toFixed(1)+'px');
    s.style.left = (2 + Math.random()*94).toFixed(2)+'%';
    s.style.top  = (6 + Math.random()*88).toFixed(2)+'%';
    s.style.setProperty('--d', (2.4 + Math.random()*3.2).toFixed(2)+'s');
    s.style.animationDelay = (-Math.random()*4.5).toFixed(2)+'s';
    host.appendChild(s);
  }
}
initSparkles();

// ---------- Explosion d'étincelles à la validation ----------
function sparkleBurst(){
  const card=document.querySelector('.code-card');
  const anchor=card || document.getElementById('lockScreen');
  if(!anchor || !document.body) return;
  if(card){ card.classList.remove('card-ok'); void card.offsetWidth; card.classList.add('card-ok'); }
  const r=anchor.getBoundingClientRect();
  const layer=document.createElement('div');
  layer.className='fx-layer';
  layer.style.left=(r.left + r.width/2)+'px';
  layer.style.top =(r.top + r.height/2)+'px';
  const ring1=document.createElement('div'); ring1.className='ring';
  const ring2=document.createElement('div'); ring2.className='ring delay';
  layer.appendChild(ring1); layer.appendChild(ring2);
  const n = window.innerWidth < 420 ? 18 : 26;
  for(let k=0;k<n;k++){
    const dot=document.createElement('i');
    const ang=Math.random()*Math.PI*2;
    const dist=60 + Math.random()*130;
    dot.style.setProperty('--x', (Math.cos(ang)*dist).toFixed(1)+'px');
    dot.style.setProperty('--y', (Math.sin(ang)*dist).toFixed(1)+'px');
    dot.style.animationDelay=(Math.random()*0.12).toFixed(2)+'s';
    layer.appendChild(dot);
  }
  document.body.appendChild(layer);
  window.setTimeout(function(){ layer.remove(); }, 1500);
  if(navigator.vibrate) navigator.vibrate(25);
}

function enterBrowser(codeObj){
  document.getElementById('lockScreen').style.display='none';
  document.getElementById('browserView').classList.remove('hidden');
  currentSession=codeObj;
  try{ sessionStorage.setItem('streamix_session', JSON.stringify(codeObj)); }catch(e){}
  updateSessionUI();
  loadUrl(codeObj.destination || DEFAULT_URL);
  // Barre toujours masquée à l'entrée
  const bar=document.getElementById('topBar');
  if(bar) bar.classList.add('hidden-bar');
  barVisible=false;
  // Afficher popup bienvenue
  const pop=document.getElementById('welcomePopup');
  if(pop) pop.classList.remove('hidden');
  startExpiryWatcher();
}
function closeWelcomePopup(){
  const pop=document.getElementById('welcomePopup');
  if(pop) pop.classList.add('hidden');
}
function updateSessionUI(){
  if(!currentSession) return;
  const badge=document.getElementById('sessionBadge');
  if(!badge) return;
  const isSecret = currentSession.type==='secret';
  badge.textContent=isSecret? 'MASTER' : `${daysLeft(currentSession)} • ${currentSession.deviceLimit==='illimite'?'∞':currentSession.deviceLimit} app`;
  badge.style.background=isSecret?'rgba(229,9,20,0.2)':'rgba(0,208,132,0.15)';
  badge.style.color=isSecret?'#E50914':'#00d084';
  badge.style.borderColor=isSecret?'rgba(229,9,20,0.3)':'rgba(0,208,132,0.2)';
}
function loadUrl(url){
  if(!url.startsWith('http')) url='https://'+url;
  // WebView natif Android (protocol file://) — naviguer directement dans le WebView interne
  // window.location.href dans le WebView natif charge la page dans le WebView (pas externalisation vers Chrome)
  // X-Frame-Options ne s'applique pas à une page principale WebView — Google charge normalement
  if(window.location.protocol === 'file:' || (window.Capacitor && Capacitor.isNativePlatform())){
    const inp=document.getElementById('urlInput');
    if(inp) inp.value=url;
    window.location.href = url;
    return;
  }
  // Web fallback : iframe (fonctionne pour les sites sans X-Frame-Options)
  document.getElementById('webFrame').src=url;
  const inp=document.getElementById('urlInput');
  if(inp) inp.value=url;
}
document.getElementById('goBtn').addEventListener('click', ()=> { const v=document.getElementById('urlInput').value.trim(); if(v) loadUrl(v); });
document.getElementById('urlInput').addEventListener('keydown', e=>{ if(e.key==='Enter') { const v=e.target.value.trim(); if(v) loadUrl(v); }});
document.getElementById('lockBtn').addEventListener('click', closeBrowser);
document.getElementById('fullscreenBtn').addEventListener('click', ()=>{
  if(!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
  else document.exitFullscreen().catch(()=>{});
});
function closeBrowser(){
  const pop=document.getElementById('welcomePopup'); if(pop) pop.classList.remove('hidden');
  document.getElementById('browserView').classList.add('hidden');
  document.getElementById('lockScreen').style.display='flex';
  document.getElementById('codeInput').value='';
  const e=document.getElementById('codeError'); if(e) e.textContent='';
  currentSession=null;
  try{ sessionStorage.removeItem('streamix_session'); }catch(e){}
  stopExpiryWatcher();
  if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
}

// Barre de recherche : visible uniquement par double appui simultané à deux doigts
let lastTwoFingerTap = 0, twoFingerDown = false, twoFingerStart = 0;
function toggleBar(){
  barVisible=!barVisible;
  const bar=document.getElementById('topBar');
  if(barVisible) bar.classList.remove('hidden-bar');
  else bar.classList.add('hidden-bar');
  if(navigator.vibrate) navigator.vibrate(30);
}
function browserIsOpen(){
  const bv=document.getElementById('browserView');
  return !!bv && !bv.classList.contains('hidden');
}
document.addEventListener('touchstart', function(e){
  if(e.touches.length === 2 && !twoFingerDown){ twoFingerDown = true; twoFingerStart = Date.now(); }
}, {passive:true});
document.addEventListener('touchend', function(e){
  if(!twoFingerDown || e.touches.length !== 0) return;
  twoFingerDown = false;
  if(!browserIsOpen()) return;
  const held = Date.now() - twoFingerStart;
  if(held > 450) return;                 // appui long : ce n'est pas un appui
  const now = Date.now();
  if(lastTwoFingerTap && now - lastTwoFingerTap <= 650){
    lastTwoFingerTap = 0;
    toggleBar();
  } else {
    lastTwoFingerTap = now;
  }
}, {passive:true});
document.addEventListener('touchcancel', function(){ twoFingerDown = false; }, {passive:true});

// Modales
document.getElementById('forgotBtn').addEventListener('click', ()=> openModal('forgotModal'));
document.getElementById('forgotSubmit').addEventListener('click', checkSecurity);
document.getElementById('forgotAnswer').addEventListener('keydown', e=>{ if(e.key==='Enter') checkSecurity(); });
function normalizeAnswer(s){ return s.toLowerCase().trim().replace(/-/g,'/').replace(/\s+/g,' '); }
function checkSecurity(){
  document.getElementById('forgotError').textContent='Utilise le tableau de bord en ligne.';
}
document.getElementById('adminAccessLink').addEventListener('click', ()=>{ window.location.href = API_BASE + '/admin.html'; });
document.getElementById('adminLoginBtn').addEventListener('click', tryAdminLogin);
document.getElementById('adminPass').addEventListener('keydown', e=>{ if(e.key==='Enter') tryAdminLogin(); });
document.getElementById('adminUser').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('adminPass').focus(); });
function tryAdminLogin(){
  document.getElementById('adminLoginModal').classList.add('hidden');
  showToast('Admin : streamix-app.vercel.app/admin.html');
}
function openModal(id){ document.getElementById(id).classList.remove('hidden'); }
function closeModal(type){
  if(type==='forgot'){ document.getElementById('forgotModal').classList.add('hidden'); document.getElementById('forgotAnswer').value=''; document.getElementById('forgotError').textContent=''; document.getElementById('forgotSuccess').classList.remove('show'); }
  if(type==='adminLogin'){ document.getElementById('adminLoginModal').classList.add('hidden'); document.getElementById('adminLoginError').textContent=''; }
}
document.querySelectorAll('[data-close]').forEach(b=> b.addEventListener('click', ()=> closeModal(b.dataset.close)) );
document.querySelectorAll('.modal-backdrop').forEach(b=> b.addEventListener('click', ()=> closeModal(b.dataset.close)) );
function openAdminPanel(){ document.getElementById('adminPanel').classList.remove('hidden'); }
function closeAdminPanel(){ document.getElementById('adminPanel').classList.add('hidden'); }
document.getElementById('closeAdmin').addEventListener('click', closeAdminPanel);
document.getElementById('adminBackdrop').addEventListener('click', closeAdminPanel);
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
  });
});
function saveDefaultUrl(){ showToast('Le site d’accueil est défini pour tous les codes.'); }
function updateMainCode(){
  showToast('Gere depuis le tableau de bord en ligne');
}
function copyCode(){
  showToast('Gere depuis le tableau de bord en ligne');
}
function copySecret(){
  showToast('Plus de code maitre local');
}
function saveSecurityAnswer(){
  showToast('Gere depuis le tableau de bord en ligne');
}

// GÉNÉRATEUR AUTOMATIQUE - 1 clic = 1 code
function generateCode(){
  showToast('Les codes se creent sur streamix-app.vercel.app/admin.html');
}
function deleteCode(id){
  showToast('Gere depuis le tableau de bord en ligne');
}
function updateUsersList(){
  const list=document.getElementById('usersList');
  if(codes.length===0){
    list.innerHTML=`<div style="text-align:center;padding:18px;color:#555;font-size:12px;border:1px dashed #222;border-radius:12px">Aucun code</div>`;
  } else {
    list.innerHTML=codes.map(c=>{
      const status=getStatus(c);
      const badgeClass=status==='active'?'badge-active':status==='expired'?'badge-expired':'badge-limit';
      const badgeText=status==='active'?'Actif':status==='expired'?'Expiré':'Limite';
      const limitTxt=c.deviceLimit==='illimite'?'∞':c.deviceLimit;
      const usedTxt=(c.devices||[]).length;
      return `
        <div class="user-item">
          <div class="user-top">
            <div class="user-avatar">${c.name.slice(0,2).toUpperCase()}</div>
            <div class="user-info"><strong>${c.code}</strong><span>${c.name}</span></div>
            <span class="user-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="user-meta">
            <span class="meta-pill">Expire <strong>${formatExpiry(c)}</strong></span>
            <span class="meta-pill">Appareils <strong>${usedTxt}/${limitTxt}</strong></span>
          </div>
          <div class="user-actions">
            <button class="btn-trash" onclick="navigator.clipboard.writeText('${c.code}');showToast('Copié')">Copier</button>
            <button class="btn-trash" onclick="deleteCode(${c.id})">Supprimer</button>
          </div>
        </div>
      `;
    }).join('');
  }
  document.getElementById('userCount').textContent=codes.length+' codes';
}
function updateStats(){
  const active=codes.filter(c=>getStatus(c)==='active').length;
  const expired=codes.filter(c=>isExpired(c)).length;
  const t=document.getElementById('statTotal'); if(t) t.textContent=codes.length;
  const a=document.getElementById('statActive'); if(a) a.textContent=active;
  const e=document.getElementById('statExpired'); if(e) e.textContent=expired;
}
let watcher=null;
function startExpiryWatcher(){
  stopExpiryWatcher();
  watcher=setInterval(()=>{
    if(!currentSession) return;
    const until = currentSession.expiresAt;
    if(!until) return;
    if(Date.now() > until){
      stopExpiryWatcher();
      closeBrowser();
      document.getElementById('codeError').textContent='Code expiré';
      showToast('Session terminée');
    }
  }, 10000);
}
function stopExpiryWatcher(){ if(watcher){ clearInterval(watcher); watcher=null; } }
function showToast(msg){
  let t=document.getElementById('toast');
  if(!t){ t=document.createElement('div'); t.id='toast'; t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid #333;z-index:999;box-shadow:0 8px 20px rgba(0,0,0,0.4)'; document.body.appendChild(t); }
  t.textContent=msg; t.style.display='block'; t.style.opacity='1';
  setTimeout(()=>{t.style.opacity='0'; setTimeout(()=>t.style.display='none',300)},2200);
}
window.saveDefaultUrl=saveDefaultUrl;
window.updateMainCode=updateMainCode;
window.copyCode=copyCode;
window.copySecret=copySecret;
window.saveSecurityAnswer=saveSecurityAnswer;
window.generateCode=generateCode;
window.closeWelcomePopup=closeWelcomePopup;
window.deleteCode=deleteCode;

// Les noms apparaissent chacun leur tour, à des positions variables sur l’accueil.
(function animateNames(){
  const label = document.getElementById('nameAppearance');
  if (!label) return;
  const names = ['Gédéon', 'Peter'];
  let index = 0;
  function showNext() {
    label.classList.remove('visible-name');
    label.textContent = names[index++ % names.length];
    label.style.left = (8 + Math.random() * 65) + '%';
    label.style.top = (10 + Math.random() * 75) + '%';
    void label.offsetWidth;
    label.classList.add('visible-name');
    window.setTimeout(showNext, 5500 + Math.random() * 1800);
  }
  showNext();
})();

// ---------- Mises a jour : lecture de GET /api/release ----------
function checkRelease(){
  fetch(API_BASE + '/api/release', {cache:'no-store'}).then(function(r){ return r.json(); }).then(function(d){
    const rel = d && d.release;
    if(!rel || !rel.downloadUrl) return;
    if(Number(rel.versionCode) <= APP_VERSION_CODE) return;
    showUpdateBanner(rel);
  }).catch(function(){});
}
function showUpdateBanner(rel){
  if(document.getElementById('updateBanner')) return;
  const b = document.createElement('div');
  b.id = 'updateBanner';
  b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#141418;border-top:1px solid #2a2a30;color:#f2f2f5;padding:12px 14px;display:flex;gap:10px;align-items:center;font:13px system-ui,sans-serif';
  const t = document.createElement('div');
  t.style.cssText = 'flex:1';
  t.innerHTML = '<strong>Mise a jour ' + rel.versionName + '</strong><div style="color:#9a9aa6;font-size:12px">' + (rel.notes || 'Nouvelle version disponible') + '</div>';
  const a = document.createElement('a');
  a.href = rel.downloadUrl;
  a.textContent = 'Telecharger';
  a.style.cssText = 'background:linear-gradient(135deg,#d81f26,#9c1015);color:#fff;padding:9px 14px;border-radius:9px;text-decoration:none;font-weight:600';
  const x = document.createElement('button');
  x.textContent = '\u00d7';
  x.style.cssText = 'background:transparent;border:0;color:#9a9aa6;font-size:18px';
  x.onclick = function(){ b.remove(); };
  b.appendChild(t); b.appendChild(a); b.appendChild(x);
  document.body.appendChild(b);
}
window.setTimeout(checkRelease, 1200);
