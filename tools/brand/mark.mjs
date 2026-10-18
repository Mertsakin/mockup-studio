// The Shotlight mark ("rim light": a sphere half lit, the moment light falls on an object; graphite plate). Pure: returns
// SVG text. Design steps and alternatives: wireframes/logo.html, wireframes/logo-graphite.html. Built by build.mjs.
//   icon({small, plate, id}) -> SVG (viewBox 0 0 100 100)
// The large drawing (64 px and up) has a soft terminator, a softbox glow in the plate's upper right, a contact shadow
// under the sphere and a faint rim on its dark side. The small drawing (48 px and below) drops the blur, the rim and
// the shadow and makes the sphere and its crescent bigger, so they stay legible as a favicon.
const C={bg:['#3d3f46','#0b0c0f'],sphere:['#1d1e23','#08080a'],lit:['#ffffff','#ecebe6','#a9a69d'],rim:'#5d606a'};
const CORNER=22.37;  // the plate's corner radius in % of its side (iOS-like)

function icon({small=false,plate=true,id='sl'}={}){
  const u=id+(small?'s':'l'),cx=50,r=small?36:(plate?30:44),cy=small||!plate?50:47;
  // the lit side reaches past the sphere on the outside (the clip draws the edge), so the blur softens only the terminator
  const k=small?.30:.42,e=r+10,lit=`M${cx} ${cy-e}H${cx+e}V${cy+e}H${cx}V${cy+r}A${r*k} ${r} 0 0 1 ${cx} ${cy-r}Z`;
  const soft=!small,floor=!small&&plate;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
<linearGradient id="${u}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.bg[0]}"/><stop offset="1" stop-color="${C.bg[1]}"/></linearGradient>
<radialGradient id="${u}gw" cx=".92" cy=".04" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="${u}gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="${u}sp" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="${C.sphere[0]}"/><stop offset="1" stop-color="${C.sphere[1]}"/></radialGradient>
<linearGradient id="${u}lt" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.lit[0]}"/><stop offset=".55" stop-color="${C.lit[1]}"/><stop offset="1" stop-color="${C.lit[2]}"/></linearGradient>
<radialGradient id="${u}fl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".75"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<clipPath id="${u}cl"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
${soft?`<filter id="${u}bl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>`:''}
</defs>
${plate?`<rect width="100" height="100" rx="${CORNER}" fill="url(#${u}bg)"/><rect width="100" height="100" rx="${CORNER}" fill="url(#${u}gw)"/><rect x=".5" y=".5" width="99" height="99" rx="${CORNER}" fill="none" stroke="url(#${u}gl)"/>`:''}
${floor?`<ellipse cx="${cx+2}" cy="${cy+r+3.5}" rx="${r*.95}" ry="4.2" fill="url(#${u}fl)"/>`:''}
<g transform="rotate(-35 ${cx} ${cy})">
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${u}sp)"/>
${small?'':`<circle cx="${cx}" cy="${cy}" r="${r-.6}" fill="none" stroke="${C.rim}" stroke-width="1.1" opacity=".55"/>`}
<g clip-path="url(#${u}cl)"><path d="${lit}" fill="url(#${u}lt)"${soft?` filter="url(#${u}bl)"`:''}/></g>
</g>
</svg>`;
}

export {CORNER,icon};
