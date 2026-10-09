// QuickLoan's pages. Its own brand (identity colour #2F5BEA, ui.md), not Sammati's tokens; only the QR and the
// "Sammati" labels come from Sammati. Plain server-rendered HTML with a little script where a page is live.
import type { Purpose } from "./sammati";

const BLUE = "#2F5BEA";
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CSS = `
:root{--blue:${BLUE};--ink:#0f1b3d;--mute:#5b6783;--line:#dfe5f5;--soft:#f4f6ff;--ok:#127a4a;--bad:#b3261e}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#fff}
a{color:var(--blue)}h1,h2,h3{line-height:1.2;margin:0 0 .5em}.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
header.nav{border-bottom:1px solid var(--line)}header.nav .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.logo{font-weight:800;font-size:22px;color:var(--blue);text-decoration:none}.logo span{color:var(--ink)}
nav a{margin-left:20px;text-decoration:none;font-weight:600;color:var(--ink)}
.btn{display:inline-block;border:0;border-radius:999px;background:var(--blue);color:#fff;padding:13px 26px;font:700 16px system-ui;cursor:pointer;text-decoration:none;min-height:48px}
.btn.alt{background:#fff;color:var(--blue);border:2px solid var(--blue)}.btn[disabled]{opacity:.4;cursor:not-allowed}
.hero{background:linear-gradient(135deg,var(--blue),#1b3aa8);color:#fff;padding:64px 0}.hero h1{font-size:44px;max-width:640px}.hero p{max-width:560px;font-size:19px;opacity:.95}
.hero .btn{background:#fff;color:var(--blue)}.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.card{border:1px solid var(--line);border-radius:16px;padding:22px;background:#fff}.soft{background:var(--soft)}section.block{padding:52px 0}
label{display:block;font-weight:600;margin:14px 0 6px}input[type=text],input[type=password],input[type=number],select{width:100%;padding:12px 14px;border:2px solid var(--line);border-radius:10px;font:16px system-ui}
input:focus,select:focus{outline:none;border-color:var(--blue)}.check{display:flex;gap:12px;align-items:flex-start;margin:18px 0;font-weight:700}.check input{width:22px;height:22px;margin-top:3px;accent-color:var(--blue)}
.mute{color:var(--mute)}.tag{display:inline-block;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:700;background:var(--soft);color:var(--blue)}.tag.req{background:#fff3d6;color:#7a5200}.tag.share{background:#fde8e6;color:var(--bad)}
.ok{color:var(--ok)}.bad{color:var(--bad)}details{border-bottom:1px solid var(--line);padding:14px 0}summary{font-weight:700;cursor:pointer}
footer{background:var(--ink);color:#c8d1ea;padding:36px 0;margin-top:40px;font-size:14px}footer a{color:#fff}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);font-size:15px}
.qr{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px;border:2px dashed var(--line);border-radius:16px;margin-top:16px}
.hidden{display:none}@media(max-width:640px){.hero h1{font-size:32px}nav a{margin-left:12px}}
`;

export function shell(title: string, body: string, user?: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>
<header class="nav"><div class="wrap"><a class="logo" href="/">Quick<span>Loan</span></a><nav>${
    user ? `<a href="/dashboard">Dashboard</a><a href="/logout">Log out (${esc(user)})</a>` : `<a href="/#calculator">EMI calculator</a><a href="/#faq">FAQs</a><a href="/login">Log in</a><a class="btn" href="/signup" style="color:#fff;margin-left:20px">Apply now</a>`
  }</nav></div></header>${body}
<footer><div class="wrap"><div class="grid"><div><strong style="color:#fff">QuickLoan Finance Pvt. Ltd.</strong><br>12 Residency Road, Bengaluru 560025<br>Loans are subject to credit approval. Representative APR 11.5% to 24%.</div>
<div><strong style="color:#fff">Grievance Officer</strong><br>Ms. Kavya Rao<br><a href="mailto:grievance@quickloan.example">grievance@quickloan.example</a><br>Mon to Fri, 10:00 to 17:00</div>
<div><strong style="color:#fff">Your data</strong><br>QuickLoan never sees your name, PAN, income, phone or email. They stay encrypted in your Sammati wallet and are opened only to decide your loan.</div></div>
<p style="margin-top:22px">© QuickLoan. Consent by <a href="/#privacy">Sammati</a>.</p></div></footer></body></html>`;
}

export function landing(): string {
  const body = `<section class="hero"><div class="wrap"><h1>Personal loans, decided without handing over your documents.</h1>
<p>Apply in minutes. Choose exactly what QuickLoan may use, and take it back whenever you like. Your details never leave your phone unencrypted.</p>
<p><a class="btn" href="/signup">Apply now</a></p></div></section>
<section class="block"><div class="wrap"><h2>How it works</h2><div class="grid">
<div class="card"><h3>1. Sign up</h3><p>Pick a username. That is all QuickLoan asks you for.</p></div>
<div class="card"><h3>2. Share with Sammati</h3><p>Scan a code with your Sammati wallet and tick the purposes you are comfortable with.</p></div>
<div class="card"><h3>3. Get a decision</h3><p>We receive a decision, not your documents. Withdraw consent any time and it stops at once.</p></div></div></div></section>
<section class="block soft" id="calculator"><div class="wrap"><h2>EMI calculator</h2><div class="grid"><div class="card">
<label for="amt">Loan amount: <strong id="amtv"></strong></label><input id="amt" type="range" min="10000" max="1000000" step="5000" value="200000">
<label for="ten">Tenure: <strong id="tenv"></strong></label><input id="ten" type="range" min="6" max="60" step="6" value="24">
<label for="rate">Interest rate (p.a.): <strong id="ratev"></strong></label><input id="rate" type="range" min="10" max="24" step="0.5" value="13"></div>
<div class="card"><p class="mute">Your monthly EMI</p><h2 id="emi" style="font-size:40px;color:var(--blue)"></h2><p class="mute">Total interest <strong id="int"></strong> · Total payable <strong id="tot"></strong></p>
<p class="mute" style="font-size:13px">Illustration only. Your offer depends on your application.</p></div></div></div></section>
<section class="block" id="privacy"><div class="wrap"><h2>Your data stays yours</h2><p style="max-width:680px">QuickLoan uses Sammati, a consent manager. Your details are encrypted on your phone, opened only by a sealed processor to compute a decision, and erased when you withdraw or your consent expires. You can see every use in your wallet.</p></div></section>
<section class="block soft" id="faq"><div class="wrap"><h2>Frequently asked questions</h2>
<details><summary>What do I need to apply?</summary><p>A Sammati wallet on your phone. You do not upload documents.</p></details>
<details><summary>What does QuickLoan see?</summary><p>Your username, your loan request and our decision. Never your name, PAN, income, phone number or email.</p></details>
<details><summary>Can I say no to marketing?</summary><p>Yes. Only what is needed for your loan is required. Offers and bureau sharing are separate choices, off unless you turn them on.</p></details>
<details><summary>How do I withdraw consent?</summary><p>In your Sammati wallet, in two taps. We can no longer process your application the moment you do, and the details we held are erased.</p></details>
<details><summary>How do I complain?</summary><p>Write to our Grievance Officer at the address below.</p></details></div></section>
<script>
const f=(n)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);
const $=(i)=>document.getElementById(i);function calc(){const P=+$("amt").value,n=+$("ten").value,r=+$("rate").value/1200;const e=r?P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1):P/n;
$("amtv").textContent=f(P);$("tenv").textContent=n+" months";$("ratev").textContent=$("rate").value+"%";$("emi").textContent=f(e);$("int").textContent=f(e*n-P);$("tot").textContent=f(e*n)}
for(const i of["amt","ten","rate"])$(i).addEventListener("input",calc);calc();
</script>`;
  return shell("QuickLoan: personal loans", body);
}

export function signup(purposes: Purpose[], ws: string): string {
  const list = purposes
    .map(
      (p) => `<li style="margin:10px 0"><strong>${esc(p.description.en)}</strong> ${p.required ? '<span class="tag req">Needed for your account</span>' : '<span class="tag">Optional</span>'}${p.sharesThirdParty ? ' <span class="tag share">Shared with third parties</span>' : ""}<br><span class="mute" style="font-size:14px">Uses: ${esc(p.dataCategories.join(", ") || "nothing")} · kept ${p.retentionDays} days</span></li>`,
    )
    .join("");
  const body = `<section class="block"><div class="wrap" style="max-width:560px"><h1>Create your QuickLoan account</h1>
<p class="mute">Just a username. We never ask for your name, PAN, income, phone or email.</p>
<form id="f" class="card" autocomplete="off"><label for="u">Username</label><input id="u" name="username" type="text" required minlength="3" maxlength="24" pattern="[a-z0-9_]+" placeholder="lowercase letters, numbers, underscore">
<label for="p">Password (optional)</label><input id="p" name="password" type="password" autocomplete="new-password" minlength="6">
<label class="check"><input id="use" type="checkbox"> <span>Use my Sammati details for loan processing</span></label>
<div id="purposes" class="hidden"><p class="mute">QuickLoan is asking to use your details for:</p><ul style="padding-left:18px">${list}</ul></div>
<p id="err" class="bad" role="alert"></p>
<div id="qr" class="qr hidden"><img id="qrimg" alt="Scan with the Sammati app" width="240" height="240"><strong id="wait">Waiting for you in the Sammati app</strong><span class="mute" id="status"></span><span class="mute" style="font-size:14px">Untick the box to cancel.</span></div></form></div></section>
<script>
const $=(i)=>document.getElementById(i);let token=null,sock=null,poll=null;
function stop(){if(sock)sock.close();clearInterval(poll);sock=poll=null;token=null}
async function check(){if(!token)return;const r=await fetch("/api/signup/"+token);const b=await r.json();
 if(b.status==="ready"){stop();location.href="/dashboard";return}
 if(b.status==="consented"){$("wait").textContent="Consent received";$("status").textContent="Finishing your account…"}
 else $("status").textContent=b.message||""}
$("use").addEventListener("change",async(e)=>{
 $("err").textContent="";
 if(!e.target.checked){stop();$("qr").classList.add("hidden");$("purposes").classList.add("hidden");return}
 $("purposes").classList.remove("hidden");
 const r=await fetch("/api/signup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:$("u").value.trim(),password:$("p").value})});
 const b=await r.json();if(!r.ok){$("err").textContent=b.message;e.target.checked=false;return}
 token=b.token;$("qrimg").src="/qr.svg?d="+encodeURIComponent(b.qrPayload);$("qr").classList.remove("hidden");$("wait").textContent="Waiting for you in the Sammati app";
 try{sock=new WebSocket(${JSON.stringify(ws)});sock.onopen=()=>sock.send(JSON.stringify({sub:["fiduciary:"+b.fiduciary]}));sock.onmessage=()=>check()}catch{}
 poll=setInterval(check,3000)});
</script>`;
  return shell("Sign up · QuickLoan", body);
}

export function login(error = ""): string {
  return shell(
    "Log in · QuickLoan",
    `<section class="block"><div class="wrap" style="max-width:420px"><h1>Log in</h1><form class="card" method="post" action="/login"><label for="u">Username</label><input id="u" name="username" type="text" required>
<label for="p">Password</label><input id="p" name="password" type="password"><p class="bad" role="alert">${esc(error)}</p><button class="btn" type="submit">Log in</button>
<p class="mute" style="font-size:14px">Signed up without a password? Create the account again from the Sammati app flow, or <a href="/signup">sign up</a>.</p></form></div></section>`,
  );
}

export function dashboard(username: string, ws: string, principal: string): string {
  const body = `<section class="block"><div class="wrap"><h1>Hello, ${esc(username)}</h1>
<div class="grid"><div class="card"><h3>Your consent</h3><ul id="consents" style="padding-left:18px"></ul><p class="mute" style="font-size:14px">Change these any time in your Sammati wallet. It updates here at once.</p></div>
<div class="card"><h3>Apply for a loan</h3><form id="a"><label for="amount">Loan amount (₹)</label><input id="amount" type="number" min="10000" max="1000000" step="1000" value="150000" required>
<label for="tenure">Tenure (months)</label><select id="tenure"><option>6</option><option>12</option><option selected>24</option><option>36</option><option>48</option><option>60</option></select>
<label for="lp">What is the loan for?</label><select id="lp"><option>Home improvement</option><option>Education</option><option>Medical expenses</option><option>Travel</option><option>Other</option></select>
<p id="blocked" class="bad hidden" role="alert">Consent withdrawn. We can no longer process your application.</p><p id="needs" class="mute hidden">Send your details from the Sammati app first.</p>
<button id="go" class="btn" type="submit">Apply</button></form><div id="decision"></div></div></div>
<h2 style="margin-top:36px">Your applications</h2><table><thead><tr><th>Date</th><th>Amount</th><th>Tenure</th><th>Decision</th></tr></thead><tbody id="apps"></tbody></table></div></section>
<script>
const $=(i)=>document.getElementById(i);const inr=(n)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);
let canApply=false;
function card(d){return '<div class="card" style="margin-top:16px;border-color:'+(d.decision==="approved"?"var(--ok)":"var(--bad)")+'"><h3 class="'+(d.decision==="approved"?"ok":"bad")+'">'+(d.decision==="approved"?"Approved":"Not approved")+'</h3>'+(d.decision==="approved"?'<p>Limit '+inr(d.limit)+(d.rate?' · Rate '+d.rate+'% p.a.':'')+'</p>':'')+'<p class="mute">Reasons: '+d.reasons.join(", ")+'</p></div>'}
async function load(){const r=await fetch("/api/me");if(!r.ok){location.href="/login";return}const m=await r.json();canApply=m.canApply;
 $("consents").innerHTML=m.consents.map(c=>'<li><strong>'+c.title+'</strong>: '+(c.status==="Active"?'<span class="ok">active until '+new Date(c.expiresAt*1000).toLocaleDateString("en-IN")+'</span>':c.status==="Withdrawn"?'<span class="bad">withdrawn</span>':'<span class="mute">not given</span>')+'</li>').join("");
 $("go").disabled=!canApply||m.pending;$("blocked").classList.toggle("hidden",m.loanStatus!=="Withdrawn"&&m.loanStatus!=="expired");$("needs").classList.toggle("hidden",!(m.loanStatus==="Active"&&!m.hasData));
 $("apps").innerHTML=m.applications.map(a=>'<tr><td>'+new Date(a.createdAt*1000).toLocaleDateString("en-IN")+'</td><td>'+inr(a.amount)+'</td><td>'+a.tenureMonths+' months</td><td>'+a.decision+'</td></tr>').join("")||'<tr><td colspan="4" class="mute">No applications yet.</td></tr>'}
$("a").addEventListener("submit",async(e)=>{e.preventDefault();$("go").disabled=true;$("decision").innerHTML="";
 const r=await fetch("/api/apply",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({amount:+$("amount").value,tenureMonths:+$("tenure").value,loanPurpose:$("lp").value})});
 const b=await r.json();$("decision").innerHTML=r.ok?card(b):'<p class="bad" role="alert">'+b.message+'</p>';load()});
load();try{const s=new WebSocket(${JSON.stringify(ws)});s.onopen=()=>s.send(JSON.stringify({sub:["principal:${principal.toLowerCase()}"]}));s.onmessage=()=>load()}catch{}
setInterval(load,10000);
</script>`;
  return shell("Dashboard · QuickLoan", body, username);
}

export function staffLogin(error = ""): string {
  return shell("Staff · QuickLoan", `<section class="block"><div class="wrap" style="max-width:420px"><h1>Staff sign in</h1><form class="card" method="post" action="/staff/login"><label for="u">User</label><input id="u" name="user" type="text"><label for="p">Password</label><input id="p" name="password" type="password"><p class="bad" role="alert">${esc(error)}</p><button class="btn" type="submit">Sign in</button></form></div></section>`);
}

export interface StaffApplication {
  id: string;
  username: string;
  amount: number;
  tenureMonths: number;
  decision: string;
  status: string;
  createdAt: number;
}

export function staffHome(apps: StaffApplication[]): string {
  const rows = apps
    .map((a) => `<tr><td><a href="/staff/customers/${encodeURIComponent(a.username)}">${esc(a.username)}</a></td><td>₹${a.amount.toLocaleString("en-IN")}</td><td>${a.tenureMonths} months</td><td>${esc(a.decision)}</td><td>${esc(a.status)}</td><td>${new Date(a.createdAt * 1000).toISOString().replace("T", " ").slice(0, 16)}</td></tr>`)
    .join("");
  return shell("Back-office · QuickLoan", `<section class="block"><div class="wrap"><h1>Back-office</h1><p><a href="/staff">Applications</a> · <a href="/staff/rights">Rights requests</a></p>
<table><thead><tr><th>Username</th><th>Amount</th><th>Tenure</th><th>Decision</th><th>Status</th><th>Received</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="mute">No applications yet.</td></tr>'}</tbody></table></div></section>`);
}

export function staffCustomer(username: string, held: { handle: string | null; hash: string | null; status: string }, consents: Array<{ title: string; status: string }>, apps: StaffApplication[]): string {
  return shell(
    `${username} · QuickLoan back-office`,
    `<section class="block"><div class="wrap"><p><a href="/staff">← Applications</a></p><h1>${esc(username)}</h1>
<div class="card"><h3>Personal details: protected by Sammati</h3><p class="mute">QuickLoan staff cannot read these. Only the Sammati Processor can open them, to compute a decision.</p>
<p>Status: <strong>${esc(held.status)}</strong><br>Handle: <code>${esc(held.handle ?? "none")}</code><br>Ciphertext hash: <code>${esc(held.hash ?? "none")}</code></p></div>
<h3 style="margin-top:24px">Purposes and consent</h3><ul>${consents.map((c) => `<li>${esc(c.title)}: <strong>${esc(c.status)}</strong></li>`).join("")}</ul>
<h3>Applications</h3><table><thead><tr><th>Amount</th><th>Tenure</th><th>Decision</th><th>Status</th></tr></thead><tbody>${apps.map((a) => `<tr><td>₹${a.amount.toLocaleString("en-IN")}</td><td>${a.tenureMonths} months</td><td>${esc(a.decision)}</td><td>${esc(a.status)}</td></tr>`).join("")}</tbody></table></div></section>`,
  );
}

export function staffRights(): string {
  return shell("Rights requests · QuickLoan", `<section class="block"><div class="wrap"><p><a href="/staff">← Applications</a></p><h1>Erasure acknowledgements</h1><div class="card"><p>No requests. Customers file rights requests in their Sammati wallet. Sammati does not yet pass them to the company (R6); when it does, they will be listed here to acknowledge.</p></div></div></section>`);
}
