import {readFileSync} from 'node:fs';

// Minimal RFC 4180 reader for the committed overlay files (quoted fields, commas, quotes, newlines).
export function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"'&&text[i+1]==='"'){field+='"';i++;}
      else if(c==='"')quoted=false;
      else field+=c;
    }else if(c==='"')quoted=true;
    else if(c===','){row.push(field);field='';}
    else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}
    else if(c!=='\r')field+=c;
  }
  if(field!==''||row.length){row.push(field);rows.push(row);}
  const [header,...body]=rows;
  return body.map(values=>{
    if(values.length!==header.length)throw new Error(`Row has ${values.length} fields, header has ${header.length}`);
    return Object.fromEntries(header.map((key,i)=>[key,values[i]]));
  });
}

export const readCsv=relative=>parseCsv(readFileSync(new URL(relative,import.meta.url),'utf8'));
export const header=relative=>readFileSync(new URL(relative,import.meta.url),'utf8').split('\n',1)[0].split(',');
