/** Camadas vetoriais originais sobre a grade Mana Seed; não altera os PNGs licenciados. */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = new URL('../public/', import.meta.url);
const read = name => readFileSync(new URL(name, root));
const pngUrl = name => `data:image/png;base64,${read(`sprites/layers/${name}.png`).toString('base64')}`;

// Leitura apenas: os pontos do rosto vêm dos pixels do corpo de referência.
function rgba(bytes) {
  let offset = 8, width, height, depth, type; const chunks = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset), tag = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (tag === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; }
    if (tag === 'IDAT') chunks.push(data);
    offset += length + 12;
  }
  if (depth !== 8 || type !== 6) throw new Error('A referência precisa de PNG RGBA de 8 bits.');
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4, pixels = Buffer.alloc(width * height * 4);
  const paeth = (a,b,c) => { const p=a+b-c, x=Math.abs(p-a), y=Math.abs(p-b), z=Math.abs(p-c); return x<=y && x<=z ? a : y<=z ? b : c; };
  for (let y=0; y<height; y++) {
    const filter=raw[y*(stride+1)];
    for (let x=0; x<stride; x++) {
      const i=y*stride+x, a=x>=4 ? pixels[i-4] : 0, b=y ? pixels[i-stride] : 0, c=y && x>=4 ? pixels[i-stride-4] : 0;
      pixels[i]=(raw[y*(stride+1)+x+1]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;
    }
  }
  return { width, pixels };
}
const skin = rgba(read('sprites/layers/skin-v00.png'));
const geometry = (row,col) => {
  const points=[];
  for (let y=0; y<48; y++) for (let x=18; x<47; x++) if (skin.pixels[((row*64+y)*skin.width+col*64+x)*4+3]>128) points.push([x,y]);
  const top=Math.min(...points.map(p=>p[1]));
  const head=points.filter(p=>p[1]<top+10);
  return { x:Math.min(...head.map(p=>p[0])), y:top };
};
const colors={d:'#1b1721',s:'#83726e',b:'#cbbca3',h:'#efdfbf',e:'#1b1220',r:'#b83147',v:'#632237'};
function pixels(rows) {
  return rows.flatMap((line,y)=>[...line].flatMap((ch,x)=>colors[ch] ? [`<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[ch]}"/>`] : [])).join('');
}
// Meia máscara quebrada: olho na sombra, fissura e sangue desenhados na grade do rosto.
const front=pixels(['.ddddddd.','ddssbbbsd','dsrsbhhbd','ddredeebd','dsrsbbbdd','dsbbdbbsd','.ssrbssd.','.dsbrsd..','..dssd...','...dd....']);
const side=pixels(['.dddd..','ddssbd.','dsrhhbd','ddreeed','dsrbbhd','dsrbbsd','.sbrbd.','.dsvsd.','..dvd..','...d...']);
const image=(name,extra='')=>`<image href="${pngUrl(name)}" width="512" height="512" ${extra}/>`;
const cloak=read('palido-parts.svg').toString().match(/<symbol id="cloak"[\s\S]*?<\/symbol>/)[0];
const header='<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" shape-rendering="crispEdges">';
let cloaks='', masks='', blood='';
for (let row=4;row<=7;row++) for (let col=0;col<6;col++) {
  const head=geometry(row,col), x=col*64, y=row*64;
  cloaks+=`<use href="#cloak" x="${x+head.x-3}" y="${y+26}" width="18" height="17"/>`;
  if (row!==5) masks+=`<g transform="translate(${x+head.x+(row===4 ? 1:4)} ${y+head.y+2})">${row===4 ? front:side}</g>`;
  blood+=`<g transform="translate(${x+head.x} ${y+head.y})"><path fill="#572131" d="M1 12h3v3H1Zm7 3h3v4H8v3H6v-2h1ZM4 25h2v2H4Z"/><path fill="#9c3446" d="M1 12h2v1H1Zm7 3h2v2H8Zm-1 4h1v2H7Z"/><path fill="#bd5260" d="M2 13h1v1H2Zm6 3h1v1H8Z"/></g>`;
}
const composite=`${header}<defs>${cloak}<mask id="silhouette" style="mask-type:alpha">${image('skin-v00')}${image('outfit-fstr_v02')}</mask><filter id="pale"><feColorMatrix type="saturate" values="0.12"/><feComponentTransfer><feFuncR type="linear" slope=".9"/><feFuncG type="linear" slope=".88"/><feFuncB type="linear" slope=".92"/></feComponentTransfer></filter><filter id="coat"><feColorMatrix type="saturate" values=".35"/><feComponentTransfer><feFuncR type="linear" slope=".45"/><feFuncG type="linear" slope=".32"/><feFuncB type="linear" slope=".4"/></feComponentTransfer></filter></defs>${cloaks}${image('skin-v00','filter="url(#pale)"')}${image('outfit-fstr_v02','filter="url(#coat)"')}${image('hat-pfht_v04','filter="url(#coat)"')}<g mask="url(#silhouette)">${blood}</g>${masks}</svg>`;
writeFileSync(new URL('sprites/layers/palido-body.svg',root),composite);

for (let level=1;level<=3;level++) {
  let marks='';
  for (let row=0;row<8;row++) for (let col=0;col<8;col++) {
    const head=geometry(row,col), x=col*64+head.x, y=row*64+head.y;
    const slash=(dx,dy,w,h,color)=>`<rect x="${x+dx}" y="${y+dy}" width="${w}" height="${h}" fill="${color}"/>`;
    if (level===1) marks+=slash(7,7,2,1,'#9d3647')+slash(3,14,3,1,'#3d2831')+slash(4,15,2,2,'#af4651');
    if (level===2) marks+=slash(5,13,4,3,'#83293f')+slash(6,16,2,2,'#a23a4b')+slash(2,20,2,3,'#592333')+slash(8,8,1,3,'#c5565b');
    if (level===3) marks+=slash(1,12,3,4,'#6d263a')+slash(3,15,3,3,'#9b3447')+slash(8,18,3,2,'#ab4553')+slash(6,6,3,1,'#a83b4e');
  }
  const sheet=`${header}<defs><mask id="body" style="mask-type:alpha">${image('skin-v00')}${image('outfit-fstr_v02')}</mask></defs><g mask="url(#body)">${marks}</g></svg>`;
  writeFileSync(new URL(`sprites/layers/wounds-${level}.svg`,root),sheet);
}
// A pá compartilha a mesma célula e o mesmo quadro das mãos na animação lateral.
const spade='<path fill="#211c27" d="M1 0h5v4H4v9h3v4l-3 3-3-3v-4h2V4H1Z"/><path fill="#a17b51" d="M2 1h3v2H2Zm1 3h1v10H3Z"/><path fill="#797d82" d="M2 14h4v3l-2 2-2-2Z"/><path fill="#c8c3ac" d="M2 14h2v3H3Z"/>';
const spadeFrames=[{col:0,x:37,y:32,angle:-14},{col:1,x:42,y:25,angle:-20}]
  .map(({col,x,y,angle})=>`<g transform="translate(${col*64+x-3} ${2*64+y-5}) rotate(${angle} 3 5)">${spade}</g>`).join('');
writeFileSync(new URL('sprites/layers/search-spade.svg',root),`${header}${spadeFrames}</svg>`);
console.log(`Sprites da cena atualizados em ${fileURLToPath(root)}sprites/layers.`);
