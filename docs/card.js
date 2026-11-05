export const REPO = 'JoshsLabsInc/Contact-Cards';
export const PUBLIC_HOME = 'https://joshslabsinc.github.io/Contact-Cards/';
export const MAX_FILE = 2 * 1024 * 1024;
export const idPattern = /^[a-f0-9]{32}$/;
export function base64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 16384) text += String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(text);
}
export function binary(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
function keyString(bytes) { return base64(bytes).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
export async function seal(bytes) {
  const key = await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, bytes);
  const packed = new Uint8Array(12+body.byteLength);
  packed.set(iv); packed.set(new Uint8Array(body),12);
  return {id:crypto.randomUUID().replaceAll('-',''),secret:keyString(new Uint8Array(await crypto.subtle.exportKey('raw',key))),packed};
}
export async function unlock(packed,secret) {
  const key = await crypto.subtle.importKey('raw',binary(secret.replaceAll('-','+').replaceAll('_','/')),'AES-GCM',false,['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:packed.slice(0,12)},key,packed.slice(12)));
}
function unescapeText(text) { return text.replace(/\\([nN,;\\])/g,(_,c)=> c.toLowerCase()==='n'?'\n':c); }
function parts(text) {return (text.match(/(?:\\.|[^;\\])+/g)||[]).map(unescapeText);}
function decodeQuoted(value,encoding) {
  const bytes=[];
  for (const unit of value.match(/=[0-9a-f]{2}|./gi)||[]) {
    if(unit.length===3) bytes.push(parseInt(unit.slice(1),16)); else bytes.push(...new TextEncoder().encode(unit));
  }
  try { return new TextDecoder(encoding||'utf-8').decode(Uint8Array.from(bytes)); }
  catch {return new TextDecoder().decode(Uint8Array.from(bytes));}
}
export function parseCard(bytes) {
  const charset=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
  const text=new TextDecoder(charset).decode(bytes).replace(/\r\n?/g,'\n').trim();
  const lines=[];
  for(const line of text.split('\n')) {
    let last=lines.length-1;
    if(last>=0 && /^([^:]+;)*[^:]*ENCODING=QUOTED-PRINTABLE[^:]*:/i.test(lines[last]) && lines[last].endsWith('=')) lines[last]=lines[last].slice(0,-1)+line.replace(/^[ \t]/,'');
    else if(last>=0 && /^[ \t]/.test(line)) lines[last]+=line.slice(1);
    else if(last>=0 && /^(?:[\w-]+\.)?PHOTO[;:]/i.test(lines[last]) && /^[A-Za-z0-9+/]+=*$/.test(line)) lines[last]+=line;
    else lines.push(line);
  }
  if(lines[0]?.toUpperCase()!=='BEGIN:VCARD'||lines.at(-1)?.toUpperCase()!=='END:VCARD'||lines.filter(l=>l.toUpperCase()==='BEGIN:VCARD').length!==1) throw Error('Choose a .vcf containing one contact.');
  let formatted='',fallback='',photo='',title='',company='';
  const rows=[];
  for(const line of lines){
    const at=line.indexOf(':'); if(at<0)continue;
    const head=line.slice(0,at), prop=head.split(';')[0].split('.').at(-1).toUpperCase();
    let value=line.slice(at+1);
    if(/ENCODING=QUOTED-PRINTABLE/i.test(head))value=decodeQuoted(value,head.match(/CHARSET="?([^;"]+)/i)?.[1]);
    const val=unescapeText(value).trim(); if(!val)continue;
    if(prop==='FN')formatted=val;
    if(prop==='N'){const chunks=value.split(/(?<!\\);/).map(unescapeText);fallback=[chunks[3],chunks[1],chunks[2],chunks[0],chunks[4]].filter(Boolean).join(' ');}
    if(prop==='ORG')company=parts(value).join(' · ');
    if(prop==='TITLE'||(prop==='ROLE'&&!title))title=val;
    if(prop==='PHOTO'){
      const data=value.replace(/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i,'').replace(/\s/g,'');
      const format=data.startsWith('/9j/')?'jpeg':data.startsWith('iVBORw0KGgo')?'png':data.startsWith('R0lGOD')?'gif':data.startsWith('UklGR')?'webp':null;
      if(format && /^[a-z\d+/]+=*$/i.test(data))photo='data:image/'+format+';base64,'+data;
    }
    if(prop==='TEL')rows.push({label:/\b(?:CELL|MOBILE)\b/i.test(head)?'Mobile':'Phone',text:val.replace(/^tel:/i,''),href:'tel:'+val.replace(/^tel:/i,'')});
    if(prop==='EMAIL')rows.push({label:'Email',text:val.replace(/^mailto:/i,''),href:'mailto:'+val.replace(/^mailto:/i,'')});
    if(prop==='URL'){let href;try{const u=new URL(/^[\w+.-]+:/.test(val)?val:'https://'+val);if(['http:','https:'].includes(u.protocol))href=u.href;}catch{}rows.push({label:'Website',text:val,href});}
    if(prop==='ADR')rows.push({label:'Address',text:parts(value).join(', ')});
  }
  const name=formatted||fallback||company;
  if(!name)throw Error('This file needs a contact name or organization.');
  if(company) rows.push({label:'Company',text:company});
  if(title) rows.push({label:'Job title',text:title});
  return {name,photo,title,company,rows};
}
