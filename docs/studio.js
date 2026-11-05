import { REPO,PUBLIC_HOME,MAX_FILE,idPattern,base64,seal,unlock,parseCard } from './card.js';
const $=id=>document.getElementById(id);
const node=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt)n.textContent=txt;return n;};
let selected, prepared, publisherToken='',download='',portrait='',photoRevision=0,photoPending=false,busy=false,localSession='';
function avatar(c){const box=node('div','stamp');if(c.photo){const img=node('img');img.src=c.photo;img.alt='';box.append(img);}else{box.textContent=c.name.trim().split(/\s+/).slice(0,2).map(n=>Array.from(n)[0]).join('').toUpperCase();}return box;}
function preview(c){const foot=node('div','bottomline');foot.append(node('span','','FOLIO'),node('span','','↗'));$('preview').replaceChildren(avatar(c),node('div','cardname',c.name),node('div','cardrole',[c.title,c.company].filter(Boolean).join(' · ')),foot);}
function message(text){$('notice').textContent=text;}
function field(id) {return $(id).value.trim();}
function theme() {return $('creator').elements.theme.value;}
function refreshForm() {
  prepared=null;
  $('share').hidden=true;
  $('publish').disabled=photoPending;
  message('');
  $('preview').dataset.theme=theme();
  preview({name:[field('given'),field('family')].filter(Boolean).join(' ')||'Your name',company:field('company'),title:field('title'),photo:portrait});
}
async function readPortrait() {
  const current=++photoRevision,file=$('portrait').files[0];
  portrait='';photoPending=!!file;refreshForm();
  if(!file)return;
  const url=URL.createObjectURL(file);
  try {
    if(file.size>16*1024*1024)throw Error('Choose a photo smaller than 16 MB.');
    const img=new Image();img.src=url;await img.decode();
    if(current!==photoRevision)return;
    const canvas=document.createElement('canvas'),side=Math.min(img.width,img.height);
    canvas.width=canvas.height=Math.min(side,640);
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,canvas.width,canvas.height);
    portrait=canvas.toDataURL('image/jpeg',0.87);
    photoPending=false;refreshForm();
  } catch(e) {
    if(current===photoRevision){$('portrait').value='';photoPending=false;refreshForm();message(file.size>16*1024*1024?e.message:'Choose a readable JPG, PNG, or WebP portrait.');}
  } finally {URL.revokeObjectURL(url);}
}
function makeVcard() {
  const esc=s=>s.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/[;,]/g,c=>'\\'+c);
  if(!field('given'))throw Error('Enter a first name.');
  const full=[field('given'),field('family')].filter(Boolean).join(' ');
  const lines=['BEGIN:VCARD','VERSION:3.0','N:'+esc(field('family'))+';'+esc(field('given'))+';;;','FN:'+esc(full)];
  for(const [id,prop] of [['mobile','TEL;TYPE=CELL'],['phone','TEL;TYPE=WORK'],['email','EMAIL;TYPE=INTERNET'],['company','ORG'],['title','TITLE']]){
    if(field(id))lines.push(prop+':'+esc(field(id)));
  }
  if(field('website')){
    let url;
    try{const s=field('website');url=new URL(/^[a-z][\w+.-]*:/i.test(s)?s:'https://'+s);if(!['http:','https:'].includes(url.protocol))throw Error();}
    catch{throw Error('Enter a website such as example.com.');}
    lines.push('URL:'+url.href);
  }
  if(portrait)lines.push('PHOTO;ENCODING=b;TYPE=JPEG:'+portrait.split(',')[1]);
  lines.push('X-FOLIO-THEME:'+theme(),'END:VCARD');
  const enc=new TextEncoder();
  const folded=[];
  for(const line of lines){
    if(/^[\x20-\x7e]+$/.test(line)){folded.push((line.match(/.{1,74}/g)||['']).join('\r\n '));continue;}
    let part='',size=0;
    for(const ch of line){const n=enc.encode(ch).length;if(size+n>74){folded.push(part);part=' ';size=1;}part+=ch;size+=n;}
    folded.push(part);
  }
  return enc.encode(folded.join('\r\n')+'\r\n');
}

function drawQR(url){
  const qr=qrcode(0,'M');qr.addData(url);qr.make();const c=$('qr'),n=qr.getModuleCount(),scale=14;
  c.width=c.height=(n+8)*scale;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#16251c';
  for(let r=0;r<n;r++)for(let col=0;col<n;col++)if(qr.isDark(r,col))ctx.fillRect((col+4)*scale,(r+4)*scale,scale,scale);
  $('qrSave').href=c.toDataURL('image/png');
}
async function publish(){
  if(busy||photoPending||!$('creator').reportValidity())return;
  try {selected={bytes:makeVcard()};}catch(e){message(e.message);return;}
  if(!localSession&&!publisherToken){$('connect').showModal();$('token').focus();return;}
  busy=true;$('editor').disabled=true;$('publish').disabled=true;message('Publishing your card…');
  try{
    prepared??=await seal(selected.bytes);
    const {id,secret,packed}=prepared;
    let res;
    if(localSession)res=await fetch('./_publish/'+id,{method:'POST',headers:{'X-Folio-Session':localSession,'Content-Type':'application/octet-stream'},body:packed});
    else res=await fetch('https://api.github.com/repos/'+REPO+'/contents/vcf/'+id+'.vcf.enc',{method:'PUT',credentials:'omit',headers:{Authorization:'Bearer '+publisherToken,'Content-Type':'application/json',Accept:'application/vnd.github+json'},body:JSON.stringify({message:'Publish encrypted contact',content:base64(packed),branch:'main'})});
    if(!res.ok){
      if([401,403].includes(res.status)){publisherToken='';throw Error('Publishing access was declined. Check write access to the contact repository.');}
      // An interrupted response may follow a successful write. Confirm exact bytes before reusing the link.
      const existing=await fetchPacked(id).catch(()=>null);
      if(!existing||existing.length!==packed.length||!existing.every((b,i)=>b===packed[i]))throw Error('The upload could not be confirmed. Try again to reuse the same card.');
    }
    const url=PUBLIC_HOME+'#v='+id+'.'+secret;
    $('shareUrl').value=url;$('openCard').href=url;drawQR(url);$('share').hidden=false;$('share').scrollIntoView({block:'nearest'});message('Card created. Save the link or QR for this person.');
  }catch(e){message(e.message||'Upload failed. Please retry.');}
  finally{busy=false;$('editor').disabled=false;$('publish').disabled=!$('share').hidden;}
}
async function fetchPacked(id,folder='vcf'){
  if(!idPattern.test(id))throw Error('Invalid card link.');
  const path=REPO+'/main/'+folder+'/'+id+'.vcf.enc';
  let response=await fetch('https://raw.githubusercontent.com/'+path,{credentials:'omit',cache:'no-store'});
  if(!response.ok)response=await fetch('https://api.github.com/repos/'+REPO+'/contents/'+folder+'/'+id+'.vcf.enc?ref=main',{headers:{Accept:'application/vnd.github.raw+json'},credentials:'omit',cache:'no-store'});
  if(!response.ok)throw Error('This card could not be loaded. Check the link or try again shortly.');
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>MAX_FILE+28)throw Error('Invalid card file.');return bytes;
}
function contactRows(card){
  const details=document.createDocumentFragment();
  for(const row of card.rows){const line=node('div','row');const field=node(row.href?'a':'span','',row.text);if(row.href){field.href=row.href;if(row.label==='Website'){field.target='_blank';field.rel='noopener noreferrer';}}line.append(node('small','',row.label),field);details.append(line);}
  return details;
}
function profile(card,bytes){
  const wrap=node('article','viewer'),cover=node('div','cover'),details=node('div','details');
  cover.append(avatar(card),node('h1','readername',card.name),node('div','cardrole',[card.title,card.company].filter(Boolean).join(' · ')));
  details.append(contactRows(card));
  const save=node('a','save','Save to Contacts');download=URL.createObjectURL(new Blob([bytes],{type:'text/vcard'}));save.href=download;save.download=(card.name.replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,80)||'contact')+'.vcf';details.append(save);wrap.append(cover,details);return wrap;
}
let navigation=0;
async function route(){
  const current=++navigation;
  if(download){URL.revokeObjectURL(download);download='';}
  const hash=location.hash.slice(1),reader=!!hash;
  $('studio').hidden=reader;$('reader').hidden=!reader;document.title=reader?'Contact card · Folio':'Folio — Contact studio';
  delete document.documentElement.dataset.theme;
  if(!reader){document.querySelector('.navtag').textContent='Contact studio';return;}
  document.querySelector('.navtag').textContent='Contact card';
  const status=node('div','panel','Opening contact…');$('viewer').replaceChildren(status);
  try{
    const match=/^([cv])=([a-f0-9]{32})\.([a-zA-Z0-9_-]{43})$/.exec(hash);if(!match)throw Error('This link is incomplete. Ask the sender for the full card link.');
    const packed=await fetchPacked(match[2],match[1]==='c'?'cards':'vcf');let bytes;
    try{bytes=await unlock(packed,match[3]);}catch{throw Error('This link could not unlock the card. Ask the sender to share it again.');}
    const card=parseCard(bytes);if(current!==navigation)return;document.documentElement.dataset.theme=card.theme;$('viewer').replaceChildren(profile(card,bytes));document.title=card.name+' · Folio';
  }catch(e){if(current===navigation)status.textContent=e.message;}
}
$('creator').onsubmit=e=>{e.preventDefault();publish();};
$('creator').addEventListener('input',refreshForm);
$('portrait').onchange=readPortrait;
$('another').onclick=()=>{$('creator').reset();portrait='';photoRevision++;photoPending=false;refreshForm();$('given').focus();};
$('authorize').onclick=()=>{const token=$('token').value.trim();if(!token){$('token').focus();return;}publisherToken=token;$('connect').close();publish();};
$('connect').addEventListener('close',()=>{$('token').value='';});
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('shareUrl').value);$('copy').textContent='Copied ✓';setTimeout(()=>{$('copy').textContent='Copy link';},1600);}catch{$('shareUrl').select();message('Copy the selected share link.');}};
if(location.hostname==='127.0.0.1'){try{const r=await fetch('./_session',{cache:'no-store'});if(r.ok)localSession=(await r.json()).session||'';}catch{}}
refreshForm();addEventListener('hashchange',route);route();


