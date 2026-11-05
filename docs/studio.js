import { REPO,PUBLIC_HOME,MAX_FILE,idPattern,base64,seal,unlock,parseCard } from './card.js';
const $=id=>document.getElementById(id);
const node=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt)n.textContent=txt;return n;};
const sample={name:'Alex Morgan',title:'Design Director',company:'Form Office',photo:'',rows:[]};
let selected, prepared, publisherToken='',download='',revision=0,busy=false,localSession='';
function avatar(c){const box=node('div','stamp');if(c.photo){const img=node('img');img.src=c.photo;img.alt='';box.append(img);}else{box.textContent=c.name.trim().split(/\s+/).slice(0,2).map(n=>Array.from(n)[0]).join('').toUpperCase();}return box;}
function preview(c){const foot=node('div','bottomline');foot.append(node('span','','FOLIO'),node('span','','↗'));$('preview').replaceChildren(avatar(c),node('div','cardname',c.name),node('div','cardrole',[c.title,c.company].filter(Boolean).join(' · ')),foot);}
function message(text){$('notice').textContent=text;}
async function select(file){
  if(busy)return;
  const own=++revision; selected=prepared=null;$('publish').disabled=true;$('share').hidden=true;message('');preview(sample);$('fileLabel').textContent='Choose a .vcf file';$('previewLabel').textContent='SAMPLE PREVIEW';
  if(!file)return;
  try{
    if(file.size>MAX_FILE||!file.size)throw Error('Choose a non-empty file under 2 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer()); const card=parseCard(bytes);
    if(own!==revision)return;
    selected={bytes,card};preview(card);$('previewLabel').textContent='YOUR CARD PREVIEW';$('fileLabel').textContent=file.name;$('publish').disabled=false;
  }catch(e){if(own===revision)message(e.message);}
}
function drawQR(url){
  const qr=qrcode(0,'M');qr.addData(url);qr.make();const c=$('qr'),n=qr.getModuleCount(),scale=14;
  c.width=c.height=(n+8)*scale;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#16251c';
  for(let r=0;r<n;r++)for(let col=0;col<n;col++)if(qr.isDark(r,col))ctx.fillRect((col+4)*scale,(r+4)*scale,scale,scale);
  $('qrSave').href=c.toDataURL('image/png');
}
async function publish(){
  if(!selected||busy)return;
  if(!localSession&&!publisherToken){$('connect').showModal();$('token').focus();return;}
  busy=true;$('vcf').disabled=true;$('publish').disabled=true;message('Publishing your card…');
  try{
    prepared??=await seal(selected.bytes);
    const {id,secret,packed}=prepared;
    let res;
    if(localSession)res=await fetch('./_publish/'+id,{method:'POST',headers:{'X-Folio-Session':localSession,'Content-Type':'application/octet-stream'},body:packed});
    else res=await fetch('https://api.github.com/repos/'+REPO+'/contents/cards/'+id+'.vcf.enc',{method:'PUT',credentials:'omit',headers:{Authorization:'Bearer '+publisherToken,'Content-Type':'application/json',Accept:'application/vnd.github+json'},body:JSON.stringify({message:'Publish encrypted contact',content:base64(packed),branch:'main'})});
    if(!res.ok){
      if([401,403].includes(res.status)){publisherToken='';throw Error('Publishing access was declined. Check write access to the contact repository.');}
      // An interrupted response may follow a successful write. Confirm exact bytes before reusing the link.
      const existing=await fetchPacked(id).catch(()=>null);
      if(!existing||existing.length!==packed.length||!existing.every((b,i)=>b===packed[i]))throw Error('The upload could not be confirmed. Try again to reuse the same card.');
    }
    const url=PUBLIC_HOME+'#c='+id+'.'+secret;
    $('shareUrl').value=url;$('openCard').href=url;drawQR(url);$('share').hidden=false;$('share').scrollIntoView({block:'nearest'});message('Card published. Choose another file to create a separate card.');
  }catch(e){message(e.message||'Upload failed. Please retry.');}
  finally{busy=false;$('vcf').disabled=false;$('publish').disabled=!$('share').hidden;}
}
async function fetchPacked(id){
  if(!idPattern.test(id))throw Error('Invalid card link.');
  const path=REPO+'/main/cards/'+id+'.vcf.enc';
  let response=await fetch('https://raw.githubusercontent.com/'+path,{credentials:'omit',cache:'no-store'});
  if(!response.ok)response=await fetch('https://api.github.com/repos/'+REPO+'/contents/cards/'+id+'.vcf.enc?ref=main',{headers:{Accept:'application/vnd.github.raw+json'},credentials:'omit',cache:'no-store'});
  if(!response.ok)throw Error('This card could not be loaded. Check the link or try again shortly.');
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>MAX_FILE+28)throw Error('Invalid card file.');return bytes;
}
function profile(card,bytes){
  const wrap=node('article','viewer'),cover=node('div','cover'),details=node('div','details');
  cover.append(avatar(card),node('h1','readername',card.name),node('div','cardrole',[card.title,card.company].filter(Boolean).join(' · ')));
  for(const row of card.rows){const line=node('div','row');const field=node(row.href?'a':'span','',row.text);if(row.href){field.href=row.href;if(row.label==='Website'){field.target='_blank';field.rel='noopener noreferrer';}}line.append(node('small','',row.label),field);details.append(line);}
  const save=node('a','save','Save to Contacts');download=URL.createObjectURL(new Blob([bytes],{type:'text/vcard'}));save.href=download;save.download=(card.name.replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,80)||'contact')+'.vcf';details.append(save);wrap.append(cover,details);return wrap;
}
let navigation=0;
async function route(){
  const current=++navigation;
  if(download){URL.revokeObjectURL(download);download='';}
  const hash=location.hash.slice(1),reader=!!hash;
  $('studio').hidden=reader;$('reader').hidden=!reader;document.title=reader?'Contact card · Folio':'Folio — Contact studio';
  if(!reader)return;
  const status=node('div','panel','Opening contact…');$('viewer').replaceChildren(status);
  try{
    const match=/^c=([a-f0-9]{32})\.([a-zA-Z0-9_-]{43})$/.exec(hash);if(!match)throw Error('This link is incomplete. Ask the sender for the full card link.');
    const packed=await fetchPacked(match[1]);let bytes;
    try{bytes=await unlock(packed,match[2]);}catch{throw Error('This link could not unlock the card. Ask the sender to share it again.');}
    const card=parseCard(bytes);if(current!==navigation)return;$('viewer').replaceChildren(profile(card,bytes));document.title=card.name+' · Folio';
  }catch(e){if(current===navigation)status.textContent=e.message;}
}
$('vcf').onchange=e=>select(e.target.files[0]);
for(const type of ['dragenter','dragover','dragleave','drop'])$('zone').addEventListener(type,e=>{e.preventDefault();$('zone').classList.toggle('over',type==='dragenter'||type==='dragover');if(type==='drop')select(e.dataTransfer.files[0]);});
$('publish').onclick=publish;
$('authorize').onclick=()=>{const token=$('token').value.trim();if(!token){$('token').focus();return;}publisherToken=token;$('connect').close();publish();};
$('connect').addEventListener('close',()=>{$('token').value='';});
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('shareUrl').value);$('copy').textContent='Copied ✓';setTimeout(()=>{$('copy').textContent='Copy link';},1600);}catch{$('shareUrl').select();message('Copy the selected share link.');}};
if(location.hostname==='127.0.0.1'){try{const r=await fetch('./_session',{cache:'no-store'});if(r.ok)localSession=(await r.json()).session||'';}catch{}}
preview(sample);addEventListener('hashchange',route);route();
