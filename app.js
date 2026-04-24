function dbg(msg) {
var panel = document.getElementById(‘dbgPanel’);
var log   = document.getElementById(‘dbgLog’);
if (!panel || !log) return;
panel.style.display = ‘block’;
var ts = new Date().toLocaleTimeString();
var line = document.createElement(‘div’);
line.textContent = ‘[’ + ts + ‘] ’ + msg;
log.appendChild(line);
panel.scrollTop = panel.scrollHeight;
console.log(’[DBG] ’ + msg);
}

// ═══════════════════════════════════════════════
//  FIREBASE INIT — runs after DOM is ready
// ═══════════════════════════════════════════════
var auth, db;
var prods = [], txns = [], cart = [], customers = [], debtTxns = [];
var editBar = null, selPM = ‘cash’, curCat = ‘All’, barcodeSearch = ‘’;
var selCust = null, selCustId = null, payCustId = null, dfilt = ‘all’, editCustId = null;
var CU = ‘د.ع’;
var _seedAttempted = false;

window.addEventListener(‘load’, function() {
if (typeof firebase === ‘undefined’) {
showErr(‘Firebase scripts failed to load. Please check your internet and refresh.’);
dbg(‘INIT ERROR: firebase SDK did not load — check network/CSP’);
return;
}
try {
var app = firebase.initializeApp({
apiKey: “AIzaSyB0v9jTBV-lz-kuDYI0yj33PlV4g2U1jrE”,
authDomain: “sasanesmat.firebaseapp.com”,
projectId: “sasanesmat”,
storageBucket: “sasanesmat.firebasestorage.app”,
messagingSenderId: “840246875125”,
appId: “1:840246875125:web:0ebb534fea2e2ad11986bc”
});
auth = firebase.auth();
db   = firebase.firestore();
db.settings({ experimentalAutoDetectLongPolling: true, merge: true });
} catch(e) {
showErr(’Firebase failed to initialize: ’ + e.message);
dbg(’INIT ERROR: ’ + e.message);
return;
}

dbg(‘Firebase initialized OK’);

auth.onAuthStateChanged(function(user) {
if (user) {
dbg(’Logged in as: ’ + user.email);
document.getElementById(‘loginScreen’).classList.add(‘hidden’);
document.getElementById(‘loadingOverlay’).classList.remove(‘hidden’);
var userEl = document.getElementById(‘userEmail’);
if (userEl) userEl.textContent = user.email;
startApp();
} else {
dbg(‘Not logged in’);
document.getElementById(‘loadingOverlay’).classList.add(‘hidden’);
document.getElementById(‘loginScreen’).classList.remove(‘hidden’);
document.getElementById(‘app’).classList.remove(‘visible’);
}
});

document.getElementById(‘loginPass’).addEventListener(‘keydown’, function(e) {
if (e.key === ‘Enter’) doLogin();
});
document.getElementById(‘loginEmail’).addEventListener(‘keydown’, function(e) {
if (e.key === ‘Enter’) document.getElementById(‘loginPass’).focus();
});
});

// ═══════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════
function doLogin() {
var email = document.getElementById(‘loginEmail’).value.trim();
var pass  = document.getElementById(‘loginPass’).value;
var btn   = document.getElementById(‘loginBtn’);
document.getElementById(‘loginErr’).style.display = ‘none’;
if (!email || !pass) { showErr(‘Please enter email and password.’); return; }
if (!auth) { showErr(‘Still initializing, please wait a second.’); return; }
btn.disabled = true;
btn.innerHTML = ‘<div class="login-spinner"></div> Signing in…’;
auth.signInWithEmailAndPassword(email, pass)
.then(function() {
btn.innerHTML = ‘<i class="fas fa-check"></i> Success!’;
})
.catch(function(e) {
btn.disabled = false;
btn.innerHTML = ‘<i class="fas fa-sign-in-alt"></i> Sign In’;
var msg = (e.code === ‘auth/invalid-credential’ || e.code === ‘auth/wrong-password’ || e.code === ‘auth/user-not-found’)
? ‘Wrong email or password.’ : ’Login failed: ’ + e.message;
showErr(msg);
});
}
function doLogout() { auth.signOut(); }
function showErr(msg) {
var el = document.getElementById(‘loginErr’);
el.textContent = msg;
el.style.display = ‘block’;
}

// ═══════════════════════════════════════════════
//  DIAGNOSTIC
// ═══════════════════════════════════════════════
async function runDiag() {
var out = document.getElementById(‘diagOut’);
var btn = document.getElementById(‘diagBtn’);
out.style.display = ‘block’;
out.textContent = ‘Running diagnostic…\n’;
btn.disabled = true;
var apiKey = ‘AIzaSyB0v9jTBV-lz-kuDYI0yj33PlV4g2U1jrE’;
var log = function(s) { out.textContent += s + ‘\n’; out.scrollTop = out.scrollHeight; };
log(‘Page: ’ + location.href);
log(‘Online: ’ + navigator.onLine);
log(‘Firebase auth ready: ’ + (auth ? ‘YES’ : ‘NO’));
log(’’);
log(’— Test 1: Network to Google —’);
try {
var r1 = await fetch(‘https://identitytoolkit.googleapis.com/v1/projects?key=’ + apiKey);
log(‘Status: ’ + r1.status + ’ ’ + r1.statusText);
var t1 = await r1.text();
log(‘Body: ’ + t1.slice(0,200));
} catch(e) { log(‘FAILED: ’ + e.message); }
log(’’);
log(’— Test 2: Firebase SDK sign-in test —’);
if (!auth) { log(‘SKIPPED: auth not ready’); }
else {
try {
await auth.signInWithEmailAndPassword(‘test@example.com’, ‘x’);
log(‘Unexpected success’);
} catch(e) {
log(‘Code: ’ + (e.code||‘none’));
log(‘Message: ’ + (e.message||‘none’));
}
}
log(’=== Done ===’);
btn.disabled = false;
}

// ═══════════════════════════════════════════════
//  APP STARTUP
// ═══════════════════════════════════════════════
function startApp() {
// Products
db.collection(‘products’).onSnapshot(function(qs) {
prods = [];
qs.forEach(function(d) { prods.push(d.data()); });
if (prods.length === 0 && !_seedAttempted) seedDefaultProducts();
renderCats(); renderProds(); renderInv();
});
// Transactions
db.collection(‘transactions’).orderBy(‘date’,‘desc’).onSnapshot(function(qs) {
txns = [];
qs.forEach(function(d) { txns.push(d.data()); });
upBadge(); renderTxns();
document.getElementById(‘loadingOverlay’).classList.add(‘hidden’);
document.getElementById(‘app’).classList.add(‘visible’);
});
// Customers
db.collection(‘customers’).orderBy(‘name’).onSnapshot(function(qs) {
customers = [];
qs.forEach(function(d) { var c = d.data(); c._id = d.id; customers.push(c); });
upDebtBadge(); renderCustList();
if (selCustId) showCustDetail(selCustId);
});
// Debt transactions
db.collection(‘debtTxns’).orderBy(‘date’,‘desc’).onSnapshot(function(qs) {
debtTxns = [];
qs.forEach(function(d) { var t = d.data(); t._id = d.id; debtTxns.push(t); });
upDebtBadge(); renderCustList();
if (selCustId) renderDtl();
renderDStats();
});
upClk(); setInterval(upClk, 1000);
initTabs();
setTimeout(function() { var s = document.getElementById(‘scanIn’); if(s) s.focus(); }, 400);
}

// ═══════════════════════════════════════════════
//  FIRESTORE HELPERS
// ═══════════════════════════════════════════════
function _checkAuth() {
if (!auth || !auth.currentUser) {
toast(‘Not logged in — please refresh and sign in again’, ‘e’);
dbg(‘SAVE BLOCKED: not authenticated’);
return false;
}
return true;
}
function saveProduct(p)    {
dbg(’saveProduct: ’ + p.b);
if(!_checkAuth()) return Promise.reject(‘No auth’);
return db.collection(‘products’).doc(p.b).set(p)
.then(function(){ dbg(’saveProduct OK: ’ + p.b); })
.catch(function(e){ dbg(’saveProduct FAILED: ’ + e.message); return Promise.reject(e); });
}
function deleteProduct(b)  { if(!_checkAuth()) return Promise.reject(‘No auth’); return db.collection(‘products’).doc(b).delete(); }
function saveTxn(t)        {
dbg(’saveTxn: ’ + t.id);
if(!_checkAuth()) return Promise.reject(‘No auth’);
return db.collection(‘transactions’).doc(t.id).set(t)
.then(function(){ dbg(’saveTxn OK: ’ + t.id); })
.catch(function(e){ dbg(’saveTxn FAILED: ’ + e.message); return Promise.reject(e); });
}
function deleteTxn(id)     { if(!_checkAuth()) return Promise.reject(‘No auth’); return db.collection(‘transactions’).doc(id).delete(); }
function saveCustomer(c,id){
dbg(’saveCustomer: ’ + (id||c._id));
if(!_checkAuth()) return Promise.reject(‘No auth’);
return db.collection(‘customers’).doc(id||c._id).set(c)
.then(function(){ dbg(‘saveCustomer OK’); })
.catch(function(e){ dbg(’saveCustomer FAILED: ’ + e.message); return Promise.reject(e); });
}
function deleteCustomer(id){ if(!_checkAuth()) return Promise.reject(‘No auth’); return db.collection(‘customers’).doc(id).delete(); }
function saveDebtTxn(t)    {
dbg(’saveDebtTxn: ’ + t._id);
if(!_checkAuth()) return Promise.reject(‘No auth’);
return db.collection(‘debtTxns’).doc(t._id).set(t)
.then(function(){ dbg(‘saveDebtTxn OK’); })
.catch(function(e){ dbg(’saveDebtTxn FAILED: ’ + e.message); return Promise.reject(e); });
}

// ═══════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════
function toNum(v) { return parseFloat(String(v).replace(/[^0-9.-]/g,’’)) || 0; }
function fm(n) {
var num = Math.round(Number(n));
if (num === 0) return ‘0 ’ + CU;
var neg = num < 0;
var s = Math.abs(num).toString();
var r = ‘’, c = 0;
for (var i = s.length - 1; i >= 0; i–) { if (c > 0 && c % 3 === 0) r = ‘,’ + r; r = s[i] + r; c++; }
return (neg ? ‘-’ : ‘’) + r + ’ ’ + CU;
}
function esc(s) { return String(s||’’).replace(/&/g,’&’).replace(/</g,’<’).replace(/>/g,’>’).replace(/”/g,’"’); }
function upClk() { var d=new Date(); var el=document.getElementById(‘clock’); if(el) el.textContent=d.toLocaleDateString(‘en-US’,{weekday:‘short’,month:‘short’,day:‘numeric’})+’ ’+d.toLocaleTimeString(‘en-US’,{hour:‘2-digit’,minute:‘2-digit’}); }
function toast(msg, type) {
type = type||‘s’;
var c = document.getElementById(‘toastC’);
var t = document.createElement(‘div’);
var cls = type===‘s’?‘tst-s’:type===‘e’?‘tst-e’:‘tst-w’;
var ico = type===‘s’?‘fa-circle-check’:type===‘e’?‘fa-circle-xmark’:‘fa-triangle-exclamation’;
t.className = ’tst ’ + cls;
t.innerHTML = ’<i class="fas ' + ico + '"></i> ’ + msg;
c.appendChild(t);
setTimeout(function() { if(t.parentNode) t.remove(); }, 3000);
}
function openM(id)  { document.getElementById(id).classList.add(‘sh’); }
function closeM(id) { document.getElementById(id).classList.remove(‘sh’); }
function isExpired(d)     { if(!d) return false; return new Date(d) < new Date(new Date().toDateString()); }
function isExpiringSoon(d){ if(!d) return false; var diff=(new Date(d)-new Date(new Date().toDateString()))/(86400000); return diff>=0&&diff<=7; }
function getDisc(p)       { if(!p.disc||!p.discStart||p.discDays<=0) return 0; var elapsed=Math.floor((new Date()-new Date(p.discStart))/86400000); return elapsed>=p.discDays?0:p.disc; }

// ═══════════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════════
function initTabs() {
var tabs = document.querySelectorAll(’.tb’);
for (var i = 0; i < tabs.length; i++) {
tabs[i].addEventListener(‘click’, function() {
document.querySelectorAll(’.tb’).forEach(function(b) { b.classList.remove(‘on’); });
document.querySelectorAll(’.tp’).forEach(function(p) { p.classList.remove(‘on’); });
this.classList.add(‘on’);
var tp = document.getElementById(‘tp-’ + this.getAttribute(‘data-t’));
if (tp) tp.classList.add(‘on’);
var t = this.getAttribute(‘data-t’);
if (t === ‘txns’)  renderTxns();
if (t === ‘inv’)   renderInv();
if (t === ‘debts’) { renderCustList(); renderDStats(); }
});
}
}

// ═══════════════════════════════════════════════
//  PRODUCTS / POS
// ═══════════════════════════════════════════════
function onScan() { barcodeSearch = document.getElementById(‘scanIn’).value.trim(); renderProds(); }
function filCat(c) { curCat = c; renderCats(); renderProds(); }
function getCats() { var m={}; prods.forEach(function(p){m[p.c]=1;}); var a=[‘All’]; for(var k in m) a.push(k); return a.sort(function(x,y){return x===‘All’?-1:y===‘All’?1:x<y?-1:1;}); }
function renderCats() {
var cats = getCats();
document.getElementById(‘cats’).innerHTML = cats.map(function(c) {
return ‘<div class="cc'+(c===curCat?' on':'')+'" onclick="filCat(\''+c+'\')">’+c+’</div>’;
}).join(’’);
}
function renderProds() {
var q = barcodeSearch.toLowerCase();
var fl = prods.filter(function(p) {
var catOk = curCat===‘All’ || p.c===curCat;
var srOk  = !q || p.b.includes(q) || p.n.toLowerCase().includes(q);
return catOk && srOk;
});
var pg = document.getElementById(‘pgrid’);
if (!fl.length) { pg.innerHTML = ‘<div class="no-res" style="text-align:center;padding:30px 10px;color:var(--fd);"><i class="fas fa-search" style="font-size:32px;margin-bottom:8px;opacity:0.3;display:block;"></i><p style="font-size:12px;">No products found</p></div>’; return; }
pg.innerHTML = fl.map(function(p) {
var disc = getDisc(p);
var price = p.p * (1 - disc/100);
var oos = p.s <= 0;
var exp = isExpired(p.exp);
return ‘<div class="pc'+(oos?' oos':'')+(exp?' exp':'')+'" onclick="addCart(\''+p.b+'\')">’+
‘<div class="pi" style="background:'+(p.cl||'#333')+'22;color:'+(p.cl||'var(--ac)')+'"><i class="fas '+(p.i||'fa-box')+'"></i></div>’+
‘<div class="pn">’+esc(p.n)+’</div>’+
‘<div class="pp">’+fm(price)+(disc>0?’<span style="font-size:8px;color:var(--wn);"> -’+disc+’%</span>’:’’)+’</div>’+
‘<div class="ps">Stock: ‘+p.s+’</div>’+
(exp?’<div style="font-size:8px;color:var(--dn);font-weight:700;margin-top:2px;">EXPIRED</div>’:’’)+
‘</div>’;
}).join(’’);
}
function addCart(bar) {
var pr = prods.find(function(p){return p.b===bar;});
if (!pr || pr.s <= 0) return;
if (isExpired(pr.exp)) { toast(pr.n + ’ has EXPIRED!’, ‘e’); return; }
var disc = getDisc(pr);
var price = pr.p * (1 - disc/100);
var ex = cart.find(function(x){return x.b===bar;});
if (ex) {
if (ex.q >= pr.s) { toast(‘Only ’ + pr.s + ’ available’, ‘w’); return; }
ex.q++;
} else {
cart.push({b:pr.b, n:pr.n, p:price, q:1, mx:pr.s, discount:disc});
}
renderCart();
}
function updQ(bar, d) {
var it = cart.find(function(x){return x.b===bar;});
if (!it) return;
it.q += d;
if (it.q <= 0) cart = cart.filter(function(x){return x.b!==bar;});
else if (it.q > it.mx) { it.q = it.mx; toast(‘Only ’ + it.mx + ’ available’,‘w’); }
renderCart();
}
function rmCart(bar)  { cart = cart.filter(function(x){return x.b!==bar;}); renderCart(); }
function clearCart()  { cart = []; document.getElementById(‘discIn’).value=0; document.querySelectorAll(’.dch’).forEach(function(d){d.classList.remove(‘on’);}); renderCart(); }
function setDisc(v)   { document.getElementById(‘discIn’).value=v; document.querySelectorAll(’.dch’).forEach(function(d){d.classList.toggle(‘on’,d.textContent===v+’%’);}); applyDisc(); }
function applyDisc()  { var v=parseInt(document.getElementById(‘discIn’).value)||0; document.querySelectorAll(’.dch’).forEach(function(d){d.classList.toggle(‘on’,d.textContent===v+’%’);}); updTotals(); }
function renderCart() {
var div = document.getElementById(‘cartDiv’);
var ft  = document.getElementById(‘cartFoot’);
var cb  = document.getElementById(‘clrBtn’);
if (!cart.length) {
div.innerHTML = ‘<div class="ce"><i class="fas fa-basket-shopping"></i><p>Scan a product or click to start a sale</p></div>’;
ft.style.display = ‘none’; cb.style.display = ‘none’; return;
}
cb.style.display = ‘inline-flex’; ft.style.display = ‘block’;
div.innerHTML = cart.map(function(it) {
return ‘<div class="cit">’+
‘<div class="ci-i"><div class="ci-n">’+esc(it.n)+(it.discount>0?’ (-’+it.discount+’%)’:’’)+’</div><div class="ci-b">’+it.b+’</div></div>’+
‘<div class="ci-q"><button class="qb" onclick="updQ(\''+it.b+'\',-1)"><i class="fas fa-minus"></i></button><span class="qv">’+it.q+’</span><button class="qb" onclick="updQ(\''+it.b+'\',1)"><i class="fas fa-plus"></i></button></div>’+
‘<div class="ci-p">’+fm(it.p*it.q)+’</div>’+
‘<button class="ci-r" onclick="rmCart(\''+it.b+'\')"><i class="fas fa-xmark"></i></button>’+
‘</div>’;
}).join(’’);
updTotals();
}
function updTotals() {
var sub = cart.reduce(function(s,it){return s+it.p*it.q;},0);
var dp  = parseInt(document.getElementById(‘discIn’).value)||0;
var da  = sub*(dp/100);
document.getElementById(‘subT’).textContent = fm(sub);
document.getElementById(‘discT’).textContent = da>0?’-’+fm(da):’-0 ‘+CU;
document.getElementById(‘totT’).textContent  = fm(sub-da);
}
function getTotals() {
var sub = cart.reduce(function(s,it){return s+it.p*it.q;},0);
var dp  = parseInt(document.getElementById(‘discIn’).value)||0;
var da  = sub*(dp/100);
return {sub:sub,dp:dp,da:da,tx:0,tot:sub-da};
}
function openPay() {
if (!cart.length) return;
var t = getTotals();
document.getElementById(‘payDue’).textContent = fm(t.tot);
document.getElementById(‘cashRcv’).value = ‘’;
document.getElementById(‘chgDiv’).style.display = ‘none’;
document.getElementById(‘cashDiv’).style.display = ‘block’;
document.getElementById(‘debtDiv’).style.display = ‘none’;
document.getElementById(‘debtCustS’).value = ‘’;
document.getElementById(‘debtCustL’).style.display = ‘none’;
document.getElementById(‘debtSelW’).style.display = ‘none’;
selPM = ‘cash’; selCust = null;
document.querySelectorAll(’.pme’).forEach(function(e){e.classList.toggle(‘on’,e.getAttribute(‘data-m’)===‘cash’);});
openM(‘payM’);
setTimeout(function(){document.getElementById(‘cashRcv’).focus();},300);
}
function selPay(m) {
selPM = m;
document.querySelectorAll(’.pme’).forEach(function(e){e.classList.toggle(‘on’,e.getAttribute(‘data-m’)===m);});
document.getElementById(‘cashDiv’).style.display  = m===‘cash’?‘block’:‘none’;
document.getElementById(‘debtDiv’).style.display  = m===‘debt’?‘block’:‘none’;
if (m===‘cash’) setTimeout(function(){document.getElementById(‘cashRcv’).focus();},100);
if (m===‘debt’) setTimeout(function(){document.getElementById(‘debtCustS’).focus();},100);
}
function qCash(a) { var t=getTotals(); if(a===‘exact’) a=Math.ceil(t.tot); document.getElementById(‘cashRcv’).value=a; calcChg(); }
function calcChg() {
var t=getTotals(); var rcv=toNum(document.getElementById(‘cashRcv’).value);
var dd=document.getElementById(‘chgDiv’); var vl=document.getElementById(‘chgVal’);
if(rcv>0){dd.style.display=‘block’;var chg=rcv-t.tot;vl.textContent=fm(Math.max(0,chg));vl.style.color=chg>=0?‘var(–ac)’:‘var(–dn)’;}
else dd.style.display=‘none’;
}
function confirmPay() {
var t = getTotals();
dbg(‘confirmPay called, method: ’ + selPM + ‘, total: ’ + t.tot);
if (selPM===‘debt’ && !selCust) { toast(‘Please select a customer for debt’,‘e’); return; }
if (selPM===‘cash’) {
var rcv=toNum(document.getElementById(‘cashRcv’).value);
if(!rcv || rcv<=0) { toast(‘Please enter the amount received’,‘e’); document.getElementById(‘cashRcv’).focus(); return; }
if(rcv<t.tot){ toast(‘Amount received is less than total!’,‘e’); return; }
}
// Reduce stock
cart.forEach(function(ci) {
var pr = prods.find(function(p){return p.b===ci.b;});
if (pr) { pr.s -= ci.q; pr.so = (pr.so||0)+ci.q; saveProduct(pr); }
});
var rcv  = selPM===‘cash’?toNum(document.getElementById(‘cashRcv’).value):t.tot;
var chg  = selPM===‘cash’?rcv-t.tot:0;
var now  = new Date();
var rid  = ‘RCP-’+now.getFullYear().toString().slice(2)+String(now.getMonth()+1).padStart(2,‘0’)+String(now.getDate()).padStart(2,‘0’)+’-’+String(Date.now()).slice(-4);
var items= cart.map(function(ci){return{b:ci.b,n:ci.n,p:ci.p,q:ci.q};});
var txn  = {id:rid,date:now.toISOString(),items:items,sub:t.sub,dp:t.dp,da:t.da,tx:0,tot:t.tot,pay:selPM,rcv:rcv,chg:chg};
if (selPM===‘debt’&&selCust) { txn.debtCustId=selCust._id; txn.debtCustName=selCust.name; }
saveTxn(txn).then(function() {
toast(‘Sale saved!’, ‘s’);
dbg(‘Sale saved OK: ’ + rid);
if (selPM===‘debt’&&selCust) {
var dt = {_id:‘DT-’+Date.now()+’-’+Math.random().toString(36).slice(2,6),custId:selCust._id,type:‘debt’,desc:items.map(function(i){return i.n+’ x’+i.q;}).join(’, ‘),amount:t.tot,date:now.toISOString(),notes:‘POS Sale #’+rid,saleRef:rid};
saveDebtTxn(dt).then(function(){toast(‘Added to debt’,‘s’);}).catch(function(e){toast(‘Debt save failed: ‘+e.message,‘e’);});
}
showRcpt(txn);
cart = []; document.getElementById(‘discIn’).value=0;
document.querySelectorAll(’.dch’).forEach(function(d){d.classList.remove(‘on’);});
renderCart(); renderProds(); closeM(‘payM’);
}).catch(function(e) {
toast(‘SAVE FAILED: ’ + e.message, ‘e’);
dbg(‘saveTxn FAILED: ’ + e.message);
});
}
function showRcpt(txn) {
var d=new Date(txn.date);
var ih=txn.items.map(function(it){return ‘<div class="rc-it"><span class="rl">’+esc(it.n)+’ <span style="color:#666">x’+it.q+’</span></span><span>’+fm(it.p*it.q)+’</span></div>’;}).join(’’);
var h=’<div class="rc"><div class="rc-c"><h2>SasanEsmat</h2></div><div class="rc-d"></div>’+
‘<div style="display:flex;justify-content:space-between;font-size:9px;"><span>’+txn.id+’</span><span>’+d.toLocaleDateString()+’ ‘+d.toLocaleTimeString()+’</span></div>’+
‘<div class="rc-d"></div><div>’+ih+’</div><div class="rc-d"></div>’+
‘<div class="rc-tr"><span>Subtotal</span><span>’+fm(txn.sub)+’</span></div>’+
(txn.dp>0?’<div class="rc-tr"><span>Discount (’+txn.dp+’%)</span><span>-’+fm(txn.da)+’</span></div>’:’’)+
‘<div class="rc-tr g"><span>TOTAL</span><span>’+fm(txn.tot)+’</span></div><div class="rc-d"></div>’+
‘<div class="rc-tr"><span>Payment</span><span style="text-transform:uppercase;">’+txn.pay+’</span></div>’+
(txn.pay===‘cash’?’<div class="rc-tr"><span>Received</span><span>’+fm(txn.rcv)+’</span></div><div class="rc-tr"><span>Change</span><span>’+fm(txn.chg)+’</span></div>’:’’)+
‘<div class="rc-d"></div><div class="rc-f">Thank you! Please come again</div></div>’;
document.getElementById(‘rcptC’).innerHTML = h;
openM(‘rcptM’);
}
function printRcpt() {
var c=document.getElementById(‘rcptC’).innerHTML;
var w=window.open(’’,’_blank’,‘width=350,height=600’);
w.document.write(’<html><head><title>Receipt</title><style>body{margin:0;font-family:monospace;font-size:10px;}.rc{padding:20px;}.rc-tr{display:flex;justify-content:space-between;}.rc-it{display:flex;justify-content:space-between;}.rc-d{border-top:1px dashed #999;margin:5px 0;}.rc-c{text-align:center;}.rc-f{text-align:center;}.rc-tr.g{font-weight:700;font-size:13px;border-top:2px solid #000;padding-top:4px;}</style></head><body>’+c+’</body></html>’);
w.document.close();setTimeout(function(){w.print();w.close();},300);
}

// ═══════════════════════════════════════════════
//  BADGES & STATS
// ═══════════════════════════════════════════════
function upBadge() { var bg=document.getElementById(‘tbg’); if(!bg) return; if(txns.length>0){bg.style.display=‘inline’;bg.textContent=txns.length;}else bg.style.display=‘none’; }
function upDebtBadge() { var bg=document.getElementById(‘dbg’); if(!bg) return; var owe=customers.filter(function(c){return(c.balance||0)>0;}).length; if(owe>0){bg.style.display=‘inline’;bg.textContent=owe;}else bg.style.display=‘none’; }

// ═══════════════════════════════════════════════
//  TRANSACTIONS
// ═══════════════════════════════════════════════
function renderTxns() {
var td=new Date().toDateString(); var tRev=0,tCnt=0,aRev=0,iCnt=0;
txns.forEach(function(t){aRev+=t.tot;if(new Date(t.date).toDateString()===td){tRev+=t.tot;tCnt++;}t.items.forEach(function(i){iCnt+=i.q;});});
var avg=txns.length?aRev/txns.length:0;
var st=document.getElementById(‘stats’);
if(st) st.innerHTML=’<div class="sc"><div class="sl"><i class="fas fa-calendar-day" style="color:var(--ac);"></i> Today</div><div class="sv">’+fm(tRev)+’</div><div class="sch">’+tCnt+’ sales</div></div><div class="sc"><div class="sl"><i class="fas fa-coins" style="color:var(--wn);"></i> Revenue</div><div class="sv">’+fm(aRev)+’</div><div class="sch">’+txns.length+’ txns</div></div><div class="sc"><div class="sl"><i class="fas fa-box" style="color:#4da6ff;"></i> Sold</div><div class="sv">’+iCnt+’</div></div><div class="sc"><div class="sl"><i class="fas fa-chart-line" style="color:#a855f7;"></i> Avg</div><div class="sv">’+fm(avg)+’</div></div>’;
var sr=(document.getElementById(‘txnS’)||{value:’’}).value.toLowerCase();
var fl=txns.filter(function(t){return !sr||t.id.toLowerCase().includes(sr)||t.items.some(function(i){return i.n.toLowerCase().includes(sr);});});
var tb=document.getElementById(‘txnTB’);
if(!fl.length){tb.innerHTML=’<tr><td colspan="6" style="text-align:center;color:var(--fd);padding:40px;">No transactions</td></tr>’;return;}
tb.innerHTML=fl.map(function(t){
var d=new Date(t.date); var ic=t.items.reduce(function(s,i){return s+i.q;},0);
return ‘<tr><td><span class="ti">’+t.id+’</span></td><td style="font-size:11px;color:var(--fm);">’+d.toLocaleDateString()+’<br>’+d.toLocaleTimeString()+’</td><td><span class="tic">’+ic+’ item’+(ic>1?‘s’:’’)+’</span></td><td><span class="ta">’+fm(t.tot)+’</span></td><td><span class="tm '+t.pay+'">’+t.pay+’</span></td><td><div class="ia"><button class="bt bt-s" onclick="viewDet(\''+t.id+'\')"><i class="fas fa-eye"></i></button><button class="bt bt-s bt-d" onclick="delTxn(\''+t.id+'\')"><i class="fas fa-trash"></i></button></div></td></tr>’;
}).join(’’);
}
function viewDet(id) {
var txn=txns.find(function(t){return t.id===id;}); if(!txn) return;
var d=new Date(txn.date);
var ih=txn.items.map(function(it){return ‘<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--bd);font-size:12px;"><div><div style="font-weight:600;">’+esc(it.n)+’</div><div style="font-size:10px;color:var(--fd);font-family:var(--fmo);">’+it.b+’</div></div><div style="text-align:right;"><div style="font-family:var(--fmo);font-weight:700;">’+fm(it.p*it.q)+’</div><div style="font-size:10px;color:var(--fm);">’+it.q+’ x ‘+fm(it.p)+’</div></div></div>’;}).join(’’);
document.getElementById(‘detB’).innerHTML=’<div style="margin-bottom:12px;"><div style="font-size:11px;color:var(--fm);">Receipt ID</div><div style="font-family:var(--fmo);color:var(--ac);font-weight:700;">’+txn.id+’</div></div><div style="margin-bottom:12px;font-size:12px;color:var(--fm);">’+d.toLocaleString()+’</div>’+ih+’<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--bd);"><div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;"><span>Total</span><span style="color:var(--ac);font-family:var(--fmo);">’+fm(txn.tot)+’</span></div></div>’;
openM(‘detM’);
}
function delTxn(id) { if(!confirm(‘Delete this transaction?’)) return; deleteTxn(id).then(function(){toast(‘Deleted’,‘w’);}).catch(function(){toast(‘Delete failed’,‘e’);}); }
function clearTxns() { if(!txns.length||!confirm(‘Clear ALL transactions?’)) return; Promise.all(txns.map(function(t){return deleteTxn(t.id);})).then(function(){toast(‘Cleared’,‘w’);}); }

// ═══════════════════════════════════════════════
//  INVENTORY
// ═══════════════════════════════════════════════
function renderInv() {
var sr=(document.getElementById(‘invS’)||{value:’’}).value.toLowerCase();
var fl=prods.filter(function(p){return !sr||p.n.toLowerCase().includes(sr)||p.b.includes(sr)||p.c.toLowerCase().includes(sr);});
var tb=document.getElementById(‘invTB’);
if(!fl.length){tb.innerHTML=’<tr><td colspan="8" style="text-align:center;color:var(--fd);padding:40px;">No products</td></tr>’;return;}
tb.innerHTML=fl.map(function(p){
var exp=isExpired(p.exp); var expSoon=isExpiringSoon(p.exp); var disc=getDisc(p);
var expCell=exp?’<span style="color:var(--dn);font-weight:700;">EXPIRED</span>’:expSoon?’<span style="color:var(--wn);font-weight:700;">’+p.exp+’</span>’:p.exp?’<span style="font-family:var(--fmo);font-size:10px;">’+p.exp+’</span>’:’-’;
return ‘<tr><td style="font-family:var(--fmo);font-size:10px;color:var(--fm);">’+p.b+’</td><td style="font-weight:600;">’+esc(p.n)+’</td><td><span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--bg2);color:var(--fm);">’+p.c+’</span></td><td style="font-family:var(--fmo);font-weight:700;">’+fm(p.p)+’</td><td class="'+(p.s<=5?'il':'io')+'">’+p.s+’</td><td>’+expCell+’</td><td style="color:var(--wn);font-weight:600;">’+(disc>0?disc+’%’:’—’)+’</td><td><div class="ia"><button class="bt bt-s" onclick="openEditP(\''+p.b+'\')"><i class="fas fa-pen"></i></button><button class="bt bt-s bt-d" onclick="delProd(\''+p.b+'\')"><i class="fas fa-trash"></i></button></div></td></tr>’;
}).join(’’);
}
function openAddP() {
editBar=null;
document.getElementById(‘prodMT’).innerHTML=’<i class="fas fa-box" style="color:var(--ac);margin-right:5px;"></i> Add Product’;
[‘fBar’,‘fNam’,‘fPrc’,‘fCst’,‘fStk’,‘fExp’,‘fDiscPercent’,‘fDiscDays’].forEach(function(id){document.getElementById(id).value=’’;});
document.getElementById(‘fBar’).disabled = false;
document.getElementById(‘fCat’).value = ‘Beverages’;
openM(‘prodM’);
setTimeout(function(){document.getElementById(‘fBar’).focus();},300);
}
function openEditP(bar) {
var p=prods.find(function(x){return x.b===bar;}); if(!p) return;
editBar=bar;
document.getElementById(‘prodMT’).innerHTML=’<i class="fas fa-pen" style="color:var(--ac);margin-right:5px;"></i> Edit Product’;
document.getElementById(‘fBar’).value=p.b; document.getElementById(‘fBar’).disabled=true;
document.getElementById(‘fNam’).value=p.n; document.getElementById(‘fCat’).value=p.c;
document.getElementById(‘fPrc’).value=p.p; document.getElementById(‘fCst’).value=p.co||’’;
document.getElementById(‘fStk’).value=p.s; document.getElementById(‘fExp’).value=p.exp||’’;
document.getElementById(‘fDiscPercent’).value=p.disc||0; document.getElementById(‘fDiscDays’).value=p.discDays||0;
openM(‘prodM’);
}
function saveProd() {
var bar=document.getElementById(‘fBar’).value.trim();
var nam=document.getElementById(‘fNam’).value.trim();
var prc=toNum(document.getElementById(‘fPrc’).value);
var stk=toNum(document.getElementById(‘fStk’).value);
if(!bar||!nam||!prc||stk<0){toast(‘Barcode, name, price and stock are required’,‘e’);return;}
var disc=toNum(document.getElementById(‘fDiscPercent’).value);
var discDays=toNum(document.getElementById(‘fDiscDays’).value);
var existing=editBar?prods.find(function(x){return x.b===editBar;}):null;
var p={
b:bar,n:nam,c:document.getElementById(‘fCat’).value,
p:prc,co:toNum(document.getElementById(‘fCst’).value),
s:stk,so:existing?existing.so||0:0,
i:‘fa-box’,cl:’#00d4aa’,
exp:document.getElementById(‘fExp’).value||null,
disc:disc,discDays:discDays,
discStart:disc>0&&discDays>0?(existing&&existing.discStart||new Date().toISOString()):null
};
saveProduct(p).then(function(){toast(editBar?‘Product updated!’:‘Product added!’,‘s’);closeM(‘prodM’);}).catch(function(e){toast(‘Error: ‘+e.message,‘e’);});
}
function delProd(bar) {
var p=prods.find(function(x){return x.b===bar;}); if(!p) return;
if(!confirm(‘Delete “’+p.n+’”?’)) return;
deleteProduct(bar).then(function(){toast(’Deleted: ’+p.n,‘w’);}).catch(function(e){toast(’Error: ’+e.message,‘e’);});
}

// ═══════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════
function exportTxn() {
if(!txns.length){toast(‘No transactions’,‘w’);return;}
var rows=txns.map(function(t){var d=new Date(t.date);return{‘Receipt’:t.id,‘Date’:d.toLocaleDateString(),‘Time’:d.toLocaleTimeString(),‘Items’:t.items.map(function(i){return i.n+’ x’+i.q;}).join(’; ‘),‘Total’:t.tot,‘Payment’:t.pay};});
var wb=XLSX.utils.book_new(); var ws=XLSX.utils.json_to_sheet(rows);
XLSX.utils.book_append_sheet(wb,ws,‘Transactions’); XLSX.writeFile(wb,‘SasanEsmat_Sales_’+new Date().toISOString().slice(0,10)+’.xlsx’);
toast(‘Exported!’,‘s’);
}
function exportInv() {
if(!prods.length){toast(‘No products’,‘w’);return;}
var rows=prods.map(function(p){return{‘Barcode’:p.b,‘Name’:p.n,‘Category’:p.c,‘Price’:p.p,‘Cost’:p.co||0,‘Stock’:p.s,‘Sold’:p.so||0};});
var wb=XLSX.utils.book_new(); var ws=XLSX.utils.json_to_sheet(rows);
XLSX.utils.book_append_sheet(wb,ws,‘Inventory’); XLSX.writeFile(wb,‘SasanEsmat_Inventory_’+new Date().toISOString().slice(0,10)+’.xlsx’);
toast(‘Exported!’,‘s’);
}
function exportAll() {
var wb=XLSX.utils.book_new();
exportInv && XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(prods.map(function(p){return{‘Barcode’:p.b,‘Name’:p.n,‘Category’:p.c,‘Price’:p.p,‘Stock’:p.s,‘Sold’:p.so||0};})),‘Inventory’);
XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(txns.map(function(t){var d=new Date(t.date);return{‘ID’:t.id,‘Date’:d.toLocaleDateString(),‘Total’:t.tot,‘Payment’:t.pay};})),‘Transactions’);
XLSX.writeFile(wb,‘SasanEsmat_Report_’+new Date().toISOString().slice(0,10)+’.xlsx’);
toast(‘Report exported!’,‘s’);
}
function exportDebts() {
var rows=customers.slice().sort(function(a,b){return(b.balance||0)-(a.balance||0);}).map(function(c){return{‘Customer’:c.name||’’,‘Phone’:c.phone||’’,‘Balance (IQD)’:c.balance||0,‘Notes’:c.notes||’’};});
var wb=XLSX.utils.book_new(); var ws=XLSX.utils.json_to_sheet(rows);
XLSX.utils.book_append_sheet(wb,ws,‘Customers’); XLSX.writeFile(wb,‘SasanEsmat_Debts_’+new Date().toISOString().slice(0,10)+’.xlsx’);
toast(‘Exported!’,‘s’);
}

// ═══════════════════════════════════════════════
//  DEBTS
// ═══════════════════════════════════════════════
function renderDStats() {
var totDebt=0,totPaid=0,todayDebt=0,td=new Date().toDateString();
debtTxns.forEach(function(t){if(t.type===‘debt’){totDebt+=t.amount;if(new Date(t.date).toDateString()===td)todayDebt+=t.amount;}if(t.type===‘payment’)totPaid+=t.amount;});
var out=totDebt-totPaid;
var el=document.getElementById(‘dstats’);
if(el) el.innerHTML=’<div class="dsc"><div class="dsl"><i class="fas fa-hand-holding-dollar" style="color:var(--dn);"></i> Outstanding</div><div class="dsv debt">’+fm(out)+’</div><div class="dss">’+customers.filter(function(c){return(c.balance||0)>0;}).length+’ customers owe</div></div><div class="dsc"><div class="dsl"><i class="fas fa-cart-plus" style="color:var(--dn);"></i> Today New Debt</div><div class="dsv debt">’+fm(todayDebt)+’</div></div><div class="dsc"><div class="dsl"><i class="fas fa-money-bill-wave" style="color:var(--ac);"></i> Total Collected</div><div class="dsv pay">’+fm(totPaid)+’</div></div>’;
}
function renderCustList() {
var q=(document.getElementById(‘custS’)||{value:’’}).value.toLowerCase();
var list=document.getElementById(‘dcl’);
var f=customers.filter(function(c){return !q||(c.name||’’).toLowerCase().includes(q)||(c.phone||’’).includes(q);});
f.sort(function(a,b){return(b.balance||0)-(a.balance||0);});
if(!f.length){list.innerHTML=’<div class="des"><i class="fas fa-users"></i><p>No customers yet</p></div>’;return;}
list.innerHTML=f.map(function(c){
var bal=c.balance||0; var isOwe=bal>0;
return ‘<div class="dcc'+(isOwe?' owe':'')+'" onclick="showCustDetail(\''+c._id+'\')">’+
‘<div class="dch-row"><div class="dc-ico"><i class="fas fa-user"></i></div>’+
‘<div class="dc-info"><div class="dc-n">’+esc(c.name)+’</div><div class="dc-ph">’+(c.phone||‘No phone’)+’</div></div>’+
‘<div class="dc-bal '+(isOwe?'owe':'paid')+'">’+fm(bal)+’</div></div>’+
‘<div class="dc-meta"><span><i class="fas fa-clock-rotate-left"></i> ‘+debtTxns.filter(function(t){return t.custId===c._id;}).length+’ txns</span></div>’+
‘<div class="dc-actions">’+
‘<button class="bt bt-s" style="color:var(--ac)" onclick="event.stopPropagation();openPayDebtMFor(\''+c._id+'\')"><i class="fas fa-money-bill-wave"></i> Pay</button>’+
‘<button class="bt bt-s" onclick="event.stopPropagation();openEditCustMFor(\''+c._id+'\')"><i class="fas fa-pen"></i> Edit</button>’+
‘<button class="bt bt-s bt-d" onclick="event.stopPropagation();delCust(\''+c._id+'\')"><i class="fas fa-trash"></i></button>’+
‘</div></div>’;
}).join(’’);
}
function showCustDetail(id) {
selCustId=id;
var c=customers.find(function(x){return x._id===id;}); if(!c) return;
document.getElementById(‘dcListView’).style.display=‘none’;
document.getElementById(‘ddv’).classList.add(‘on’);
document.getElementById(‘ddvName’).textContent=c.name;
document.getElementById(‘ddvPhone’).textContent=(c.phone||‘No phone’)+(c.notes?’ | ‘+c.notes:’’);
var bal=c.balance||0;
var bel=document.getElementById(‘ddvBal’); bel.textContent=fm(bal); bel.className=‘ddv-balance’+(bal>0?’ owe’:bal<0?’ paid’:’’);
renderDtl();
}
function showCustList() { selCustId=null; document.getElementById(‘dcListView’).style.display=‘block’; document.getElementById(‘ddv’).classList.remove(‘on’); }
function setDFilt(f) { dfilt=f; document.querySelectorAll(’.dftb’).forEach(function(b){b.classList.toggle(‘on’,b.getAttribute(‘data-f’)===f);}); renderDtl(); }
function renderDtl() {
if(!selCustId) return;
var txs=debtTxns.filter(function(t){return t.custId===selCustId;});
if(dfilt===‘7d’){var d7=new Date();d7.setDate(d7.getDate()-7);txs=txs.filter(function(t){return new Date(t.date)>=d7;});}
else if(dfilt===‘1m’){var d1=new Date();d1.setMonth(d1.getMonth()-1);txs=txs.filter(function(t){return new Date(t.date)>=d1;});}
else if(dfilt===‘3m’){var d3=new Date();d3.setMonth(d3.getMonth()-3);txs=txs.filter(function(t){return new Date(t.date)>=d3;});}
var el=document.getElementById(‘dtl’); document.getElementById(‘dtCnt’).textContent=txs.length+’ transactions’;
if(!txs.length){el.innerHTML=’<div class="des"><i class="fas fa-clock-rotate-left"></i><p>No transactions yet</p></div>’;return;}
el.innerHTML=txs.map(function(t){var isDebt=t.type===‘debt’;return ‘<div class="dti"><div class="dt-ico '+(isDebt?'debt':'pay')+'"><i class="fas '+(isDebt?'fa-cart-plus':'fa-money-bill-wave')+'"></i></div><div class="dt-info"><div class="dt-desc">’+esc(t.desc||’’)+’</div><div class="dt-date">’+new Date(t.date).toLocaleDateString()+’ ‘+(t.notes?’| ‘+esc(t.notes):’’)+’</div></div><div class="dt-amt '+(isDebt?'debt':'pay')+'">’+(isDebt?’+’:’-’)+fm(t.amount)+’</div></div>’;}).join(’’);
}
// Customer CRUD
function openCustM() { editCustId=null; document.getElementById(‘custMT’).innerHTML=’<i class="fas fa-user" style="color:var(--ac);margin-right:5px;"></i> Add Customer’; [‘cName’,‘cPhone’,‘cNotes’].forEach(function(id){document.getElementById(id).value=’’;}); openM(‘custM’); setTimeout(function(){document.getElementById(‘cName’).focus();},100); }
function openEditCustM() { if(selCustId) openEditCustMFor(selCustId); }
function openEditCustMFor(id) {
editCustId=id;
var c=customers.find(function(x){return x._id===id;}); if(!c) return;
document.getElementById(‘custMT’).innerHTML=’<i class="fas fa-user" style="color:var(--ac);margin-right:5px;"></i> Edit Customer’;
document.getElementById(‘cName’).value=c.name||’’; document.getElementById(‘cPhone’).value=c.phone||’’; document.getElementById(‘cNotes’).value=c.notes||’’;
openM(‘custM’);
}
function saveCust() {
var name=document.getElementById(‘cName’).value.trim(); if(!name){toast(‘Name required’,‘e’);return;}
var phone=document.getElementById(‘cPhone’).value.trim(); var notes=document.getElementById(‘cNotes’).value.trim();
if(editCustId){
var c=customers.find(function(x){return x._id===editCustId;}); if(!c) return;
c.name=name;c.phone=phone;c.notes=notes;
saveCustomer(c).then(function(){toast(‘Updated!’,‘s’);closeM(‘custM’);}).catch(function(e){toast(‘Error: ‘+e.message,‘e’);});
} else {
var nc={_id:‘CUST-’+Date.now()+’-’+Math.random().toString(36).slice(2,6),name:name,phone:phone,notes:notes,balance:0,createdAt:new Date().toISOString()};
saveCustomer(nc).then(function(){toast(‘Customer added!’,‘s’);closeM(‘custM’);}).catch(function(e){toast(‘Error: ‘+e.message,‘e’);});
}
}
function delCust(id) {
var c=customers.find(function(x){return x._id===id;}); if(!c) return;
if((c.balance||0)>0){toast(‘Cannot delete: customer still owes ‘+fm(c.balance),‘e’);return;}
if(!confirm(‘Delete customer “’+c.name+’”?’)) return;
deleteCustomer(id).then(function(){toast(‘Deleted’,‘s’);if(selCustId===id)showCustList();}).catch(function(e){toast(‘Error: ‘+e.message,‘e’);});
}
function openAddDebtM() {
if(!selCustId) return;
document.getElementById(‘adDesc’).value=’’; document.getElementById(‘adAmt’).value=’’;
document.getElementById(‘adDate’).value=new Date().toISOString().slice(0,10);
document.getElementById(‘adNotes’).value=’’;
openM(‘addDebtM’); setTimeout(function(){document.getElementById(‘adDesc’).focus();},100);
}
function saveAddDebt() {
if(!selCustId) return;
var desc=document.getElementById(‘adDesc’).value.trim(); var amt=toNum(document.getElementById(‘adAmt’).value);
if(!desc){toast(‘Description required’,‘e’);return;} if(amt<=0){toast(‘Amount must be > 0’,‘e’);return;}
var dt={_id:‘DT-’+Date.now()+’-’+Math.random().toString(36).slice(2,6),custId:selCustId,type:‘debt’,desc:desc,amount:amt,date:new Date(document.getElementById(‘adDate’).value||new Date()).toISOString(),notes:document.getElementById(‘adNotes’).value.trim()};
saveDebtTxn(dt).then(function(){toast(‘Debt added!’,‘s’);closeM(‘addDebtM’);}).catch(function(e){toast(‘Error: ‘+e.message,‘e’);});
}
function openPayDebtM() { if(selCustId) openPayDebtMFor(selCustId); }
function openPayDebtMFor(id) {
payCustId=id;
var c=customers.find(function(x){return x._id===id;}); if(!c) return;
var bal=c.balance||0;
document.getElementById(‘pdBal’).textContent=fm(bal); document.getElementById(‘pdBal’).style.color=bal>0?‘var(–dn)’:‘var(–ac)’;
document.getElementById(‘pdAmt’).value=’’; document.getElementById(‘pdNotes’).value=’’;
document.getElementById(‘pdDate’).value=new Date().toISOString().slice(0,10);
document.getElementById(‘payHint’).style.display=‘none’;
openM(‘payDebtM’); setTimeout(function(){document.getElementById(‘pdAmt’).focus();},100);
}
function qPay(a) { if(a===‘full’){var c=customers.find(function(x){return x._id===payCustId;});if(c)a=c.balance||0;else a=0;} document.getElementById(‘pdAmt’).value=a; updPayHint(); }
function updPayHint() { var amt=toNum(document.getElementById(‘pdAmt’).value); var c=customers.find(function(x){return x._id===payCustId;}); if(!c) return; var h=document.getElementById(‘payHint’); if(amt>0){h.style.display=‘block’;h.textContent=‘Remaining balance after payment: ‘+fm(Math.max(0,(c.balance||0)-amt));}else h.style.display=‘none’; }
function savePayDebt() {
if(!payCustId) return;
var amt=toNum(document.getElementById(‘pdAmt’).value); if(amt<=0){toast(‘Amount must be > 0’,‘e’);return;}
var dt={_id:‘DT-’+Date.now()+’-’+Math.random().toString(36).slice(2,6),custId:payCustId,type:‘payment’,desc:‘Payment received’,amount:amt,date:new Date(document.getElementById(‘pdDate’).value||new Date()).toISOString(),notes:document.getElementById(‘pdNotes’).value.trim()||‘Payment’};
saveDebtTxn(dt).then(function(){toast(‘Payment recorded!’,‘s’);closeM(‘payDebtM’);}).catch(function(e){toast(‘Error: ‘+e.message,‘e’);});
}
function srcDebtCust() {
var q=document.getElementById(‘debtCustS’).value.trim().toLowerCase();
var list=document.getElementById(‘debtCustL’);
if(!q){list.style.display=‘none’;return;}
var matches=customers.filter(function(c){return(c.name||’’).toLowerCase().includes(q)||(c.phone||’’).includes(q);});
if(!matches.length){list.style.display=‘none’;return;}
list.innerHTML=matches.map(function(c){return ‘<div class="cusi" onclick="selDebtCust(\''+c._id+'\')"><div class="cusi-ico"><i class="fas fa-user"></i></div><div><div class="cusi-n">’+esc(c.name)+’</div><div class="cusi-b">’+(c.phone||‘No phone’)+’ · Balance: ‘+fm(c.balance||0)+’</div></div></div>’;}).join(’’);
list.style.display=‘block’;
}
function selDebtCust(id) {
selCust=customers.find(function(x){return x._id===id;});
document.getElementById(‘debtCustL’).style.display=‘none’;
document.getElementById(‘debtSelW’).style.display=‘block’;
document.getElementById(‘debtSelN’).textContent=selCust.name;
document.getElementById(‘debtSelB’).textContent=’Balance: ’+fm(selCust.balance||0);
}

// ═══════════════════════════════════════════════
//  SEED DEFAULT PRODUCTS
// ═══════════════════════════════════════════════
function seedDefaultProducts() {
_seedAttempted=true;
var DEF=[
{b:‘8901234560001’,n:‘Coca-Cola 330ml’,c:‘Beverages’,p:1500,co:850,s:120,so:0,i:‘fa-bottle-water’,cl:’#dc2626’,exp:‘2026-12-31’,disc:0,discDays:0,discStart:null},
{b:‘8901234560002’,n:‘Pepsi Can 330ml’,c:‘Beverages’,p:1500,co:800,s:95,so:0,i:‘fa-bottle-water’,cl:’#2563eb’,exp:‘2026-11-30’,disc:0,discDays:0,discStart:null},
{b:‘8901234560003’,n:‘Sprite Can 330ml’,c:‘Beverages’,p:1500,co:800,s:88,so:0,i:‘fa-bottle-water’,cl:’#16a34a’,exp:‘2026-10-15’,disc:0,discDays:0,discStart:null},
{b:‘8901234560006’,n:‘Lays Classic Chips’,c:‘Snacks’,p:2000,co:1200,s:75,so:0,i:‘fa-cookie’,cl:’#eab308’,exp:‘2026-09-30’,disc:0,discDays:0,discStart:null},
{b:‘8901234560011’,n:‘Whole Milk 1L’,c:‘Dairy’,p:2500,co:1600,s:50,so:0,i:‘fa-cow’,cl:’#f5f5f5’,exp:‘2026-08-15’,disc:0,discDays:0,discStart:null},
{b:‘8901234560021’,n:‘Dish Soap 500ml’,c:‘Household’,p:2500,co:1500,s:60,so:0,i:‘fa-pump-soap’,cl:’#0891b2’,exp:‘2027-06-30’,disc:0,discDays:0,discStart:null},
{b:‘8901234560024’,n:‘Toothpaste 100ml’,c:‘Personal Care’,p:2500,co:1400,s:65,so:0,i:‘fa-tooth’,cl:’#3b82f6’,exp:‘2026-09-15’,disc:0,discDays:0,discStart:null},
{b:‘8901234560030’,n:‘AA Batteries x4’,c:‘Other’,p:4500,co:2800,s:55,so:0,i:‘fa-battery-full’,cl:’#22c55e’,exp:‘2029-12-31’,disc:0,discDays:0,discStart:null}
];
var batch=db.batch();
DEF.forEach(function(p){batch.set(db.collection(‘products’).doc(p.b),p);});
batch.commit().then(function(){toast(‘Loaded starter products’,‘s’);}).catch(function(e){toast(’Seed failed: ’+e.message,‘e’);});
}
