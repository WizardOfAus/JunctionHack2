/** Minimal CSV reader for committed data files (quoted fields may contain commas). */
export function parseCsv(text:string) {
  const rows:string[][]=[];
  for(const line of text.replace(/^﻿/,'').split(/\r?\n/).filter(Boolean)) {
    const cells:string[]=[];let cell='',quoted=false;
    for(let i=0;i<line.length;i++){const c=line[i];
      if(quoted){if(c==='"'&&line[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
      else if(c==='"')quoted=true;else if(c===','){cells.push(cell);cell='';}else cell+=c;}
    rows.push([...cells,cell]);
  }
  const [header,...body]=rows;
  return body.map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])));
}
