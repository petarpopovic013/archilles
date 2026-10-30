// Reproducible synthetic assets only; never processes user drawings.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const __dirname=fileURLToPath(new URL('.',import.meta.url));
import {createCanvas} from '@napi-rs/canvas';
const plans=[{name:'office-a',corridor:1.05,door:0.8},{name:'office-b',corridor:1.55,door:1.0}];
for(const plan of plans){
 const canvas=createCanvas(800,600),c=canvas.getContext('2d');
 c.fillStyle='white';c.fillRect(0,0,800,600);c.strokeStyle='black';c.lineWidth=4;
 c.strokeRect(40,40,720,520);c.strokeRect(40,240,720,100);c.strokeRect(340,40,120,200);
 c.clearRect(375,238,50,6);c.fillStyle='black';c.font='20px sans-serif';
 c.fillText(`${plan.name}: synthetic office`,60,80);c.fillText(`Corridor clear width ${plan.corridor} m`,80,290);
 c.fillText(`Door ${plan.door} m`,350,215);c.fillText('Entrance: width unclear',80,520);
 fs.writeFileSync(`${__dirname}/${plan.name}.png`,canvas.toBuffer('image/png'));
 fs.writeFileSync(`${__dirname}/${plan.name}.jpg`,canvas.toBuffer('image/jpeg'));
 fs.writeFileSync(`${__dirname}/${plan.name}.json`,JSON.stringify({name:plan.name,width:800,height:600,provenance:'Synthetic reference dimensions authored with this fixture; not a regulatory example.',elements:[{type:'CORRIDOR',label:'Corridor',geometry:{kind:'BBOX',x:40,y:240,width:720,height:100},width:plan.corridor},{type:'DOOR',label:'Door',geometry:{kind:'BBOX',x:375,y:230,width:50,height:20},width:plan.door},{type:'ENTRANCE',label:'Entrance',geometry:{kind:'BBOX',x:40,y:480,width:60,height:60}},{type:'ROOM',label:'Office',geometry:{kind:'BBOX',x:40,y:40,width:300,height:200}}]},null,2));
}
// Minimal two-page vector PDF with different reference dimensions.
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>'];
for(let i=0;i<2;i++) {const text=`0 0 0 RG 4 w 40 40 720 520 re S 40 240 720 100 re S BT /F1 20 Tf 60 500 Td (${plans[i].name}: corridor ${plans[i].corridor} m, door ${plans[i].door} m) Tj ET`;
 objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /Font << /F1 7 0 R >> >> /Contents ${4+i*2} 0 R >>`,`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);}
objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;fs.writeFileSync(`${__dirname}/offices.pdf`,pdf);
