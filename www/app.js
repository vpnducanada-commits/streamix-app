// STREAMIX - Gestion durée + appareils + secret master
const SECRET_CODE = 'Gedeonokana_Streamix';
const ADMIN_USER = 'Godson06';
const ADMIN_PASS = 'Gedeonokana06';
const DEFAULT_URL = 'https://vod.talis.top/';
let defaultUrl = DEFAULT_URL;
let securityAnswer = localStorage.getItem('streamix_security') || '26/06/2002';
if(securityAnswer==='14/05/1948'){ securityAnswer='26/06/2002'; localStorage.setItem('streamix_security', securityAnswer); }
let currentMainCode = localStorage.getItem('streamix_code') || 'STREAMIX';
let codes = [];
let deviceId = localStorage.getItem('streamix_deviceId');
let currentSession = null;
let barVisible=false;
if(!deviceId){ deviceId='dev_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36); localStorage.setItem('streamix_deviceId', deviceId); }
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
  const valRaw=document.getElementById('codeInput').value.trim();
  if(!valRaw){ showError('Entre ton code'); return; }
  const err=document.getElementById('codeError');
  if(valRaw===SECRET_CODE){
    err.textContent='';
    enterBrowser({code:SECRET_CODE, name:'Master', type:'secret', duration:'Illimité', deviceLimit:'Illimité', expiresAt:null});
    return;
  }
  let found=codes.find(c=>c.code.toUpperCase()===valRaw.toUpperCase());
  if(!found && valRaw.toUpperCase()===currentMainCode.toUpperCase()){
    const temp={id:'main', code:currentMainCode, name:'Principal', duration:'7', deviceLimit:2, devices:[], createdAt:Date.now(), expiresAt:Date.now()+7*86400000, status:'active'};
    found=temp;
  }
  if(!found){ showError('⛔ Code non reconnu'); shakeInput(); return; }
  if(isExpired(found)){
    showError('⛔ Code expiré le '+formatExpiry(found));
    found.status='expired'; saveCodes(); updateUsersList(); return;
  }
  const limit = found.deviceLimit;
  const devices = found.devices || [];
  const alreadyRegistered = devices.includes(deviceId);
  if(limit!=='illimite' && devices.length >= parseInt(limit) && !alreadyRegistered){
    showError(`⛔ Limite d'appareils atteinte (${devices.length}/${limit})`);
    return;
  }
  if(!alreadyRegistered){
    found.devices = [...devices, deviceId];
    if(found.id==='main'){ found.id=Date.now(); codes.push(found); saveCodes(); }
    else { const idx=codes.findIndex(c=>c.id===found.id); if(idx>=0){ codes[idx].devices=found.devices; saveCodes(); } }
  }
  err.textContent='';
  enterBrowser(found);
}
function showError(msg){ document.getElementById('codeError').textContent=msg; }
function shakeInput(){ const i=document.getElementById('codeInput'); i.style.borderColor='#ff3b30'; setTimeout(()=>i.style.borderColor='#2a2a2a',1200); }

function enterBrowser(codeObj){
  document.getElementById('lockScreen').style.display='none';
  document.getElementById('browserView').classList.remove('hidden');
  currentSession=codeObj;
  try{ sessionStorage.setItem('streamix_session', JSON.stringify(codeObj)); }catch(e){}
  updateSessionUI();
  loadUrl(DEFAULT_URL);
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

// Geste 3 doigts (sans indication visuelle)
let lastTouchTime=0;
function toggleBar(){
  barVisible=!barVisible;
  const bar=document.getElementById('topBar');
  if(barVisible) bar.classList.remove('hidden-bar');
  else bar.classList.add('hidden-bar');
  if(navigator.vibrate) navigator.vibrate(30);
}
document.addEventListener('touchstart', e=>{
  if(e.touches.length===3){ e.preventDefault(); const now=Date.now(); if(now-lastTouchTime>400){ lastTouchTime=now; toggleBar(); } }
},{passive:false});

// Modales
document.getElementById('forgotBtn').addEventListener('click', ()=> openModal('forgotModal'));
document.getElementById('forgotSubmit').addEventListener('click', checkSecurity);
document.getElementById('forgotAnswer').addEventListener('keydown', e=>{ if(e.key==='Enter') checkSecurity(); });
function normalizeAnswer(s){ return s.toLowerCase().trim().replace(/-/g,'/').replace(/\s+/g,' '); }
function checkSecurity(){
  const val=document.getElementById('forgotAnswer').value.trim();
  const err=document.getElementById('forgotError');
  const suc=document.getElementById('forgotSuccess');
  err.textContent=''; suc.classList.remove('show');
  if(!val){ err.textContent='Entre une réponse'; return; }
  const normVal=normalizeAnswer(val);
  const normExpected=normalizeAnswer(securityAnswer);
  const cleanVal=normVal.replace(/\//g,'').replace(/\s/g,'');
  const cleanExp=normExpected.replace(/\//g,'').replace(/\s/g,'');
  const isCorrect = normVal===normExpected || cleanVal===cleanExp || normVal.includes('26/06/2002') || normVal.includes('26/6/2002') || normVal.includes('26062002');
  if(isCorrect){
    suc.textContent='Code : '+currentMainCode+' | Master : '+SECRET_CODE;
    suc.classList.add('show');
    navigator.clipboard.writeText(currentMainCode).catch(()=>{});
  } else {
    err.textContent='⛔ Réponse incorrecte';
  }
}
document.getElementById('adminAccessLink').addEventListener('click', ()=> openModal('adminLoginModal'));
document.getElementById('adminLoginBtn').addEventListener('click', tryAdminLogin);
document.getElementById('adminPass').addEventListener('keydown', e=>{ if(e.key==='Enter') tryAdminLogin(); });
document.getElementById('adminUser').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('adminPass').focus(); });
function tryAdminLogin(){
  const u=document.getElementById('adminUser').value.trim();
  const p=document.getElementById('adminPass').value;
  const err=document.getElementById('adminLoginError');
  if(u===ADMIN_USER && p===ADMIN_PASS){
    err.textContent='';
    document.getElementById('adminLoginModal').classList.add('hidden');
    document.getElementById('adminUser').value=''; document.getElementById('adminPass').value='';
    openAdminPanel();
  } else {
    err.textContent='⛔ Identifiants incorrects';
  }
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
  const v=document.getElementById('newCodeInput').value.trim();
  if(!v || v.length<3) return showToast('Trop court');
  currentMainCode=v; localStorage.setItem('streamix_code', v);
  document.getElementById('currentCodeDisplay').textContent=v;
  document.getElementById('newCodeInput').value='';
  showToast('Code mis à jour');
}
function copyCode(){ navigator.clipboard.writeText(currentMainCode).then(()=>showToast('Copié')); }
function copySecret(){ navigator.clipboard.writeText(SECRET_CODE).then(()=>showToast('Secret copié')); }
function saveSecurityAnswer(){
  const v=document.getElementById('securityAnswerInput').value.trim();
  if(!v) return showToast('Entre une réponse');
  securityAnswer=v; localStorage.setItem('streamix_security', v); document.getElementById('securityPreview').textContent=v;
  showToast('Enregistré');
}

// GÉNÉRATEUR AUTOMATIQUE - 1 clic = 1 code
function generateCode(){
  const dur=document.getElementById('codeDuration').value;
  const devLimit=document.getElementById('codeDevices').value;
  // génération auto sans rien remplir
  let code=Math.random().toString(36).substring(2,6).toUpperCase()+Math.floor(1000+Math.random()*9000);
  // éviter doublons
  let tries=0;
  while(codes.some(c=>c.code===code) || code===SECRET_CODE || code===currentMainCode){
    code=Math.random().toString(36).substring(2,6).toUpperCase()+Math.floor(1000+Math.random()*9000);
    if(tries++>10) break;
  }
  const now=Date.now();
  let expiresAt=null;
  if(dur!=='illimite'){ expiresAt=now + parseInt(dur)*86400000; }
  const count=codes.length+1;
  const name='Code '+String(count).padStart(3,'0');
  const newCode={
    id:Date.now(),
    code:code,
    name:name,
    duration:dur,
    deviceLimit:devLimit,
    devices:[],
    createdAt:now,
    expiresAt:expiresAt,
    status:'active'
  };
  codes.push(newCode);
  saveCodes();
  updateUsersList(); updateStats();
  showToast('Code généré : '+code);
}
function deleteCode(id){ codes=codes.filter(c=>c.id!==id); saveCodes(); updateUsersList(); updateStats(); showToast('Supprimé'); }
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
    if(currentSession.type==='secret') return;
    const fresh=codes.find(c=>c.code===currentSession.code);
    const target=fresh || currentSession;
    if(isExpired(target)){
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
