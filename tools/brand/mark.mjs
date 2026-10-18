// The Shotlight mark ("rim light": a sphere half lit, the moment light falls on an object). Pure: returns
// SVG text. Design steps and alternatives: wireframes/logo.html, wireframes/logo-graphite.html. Built by build.mjs.
//   icon({small, plate, id, colors}) -> SVG (viewBox 0 0 100 100); colors overrides parts of C (variants: wireframes/logo-color.html)
// The large drawing (64 px and up) has a soft terminator, a softbox glow in the plate's upper right, a contact shadow
// under the sphere and a faint rim on its dark side. The small drawing (48 px and below) drops the blur, the rim and
// the shadow and makes the sphere and its crescent bigger, so they stay legible as a favicon.
// bg: plate top / bottom; glow: the softbox glow; edge: the plate's top edge highlight; sphere: dark side inner / outer;
// lit: the lit side bright / mid / terminator; rim: the faint edge on the dark side (a colour, [start, end] for a gradient
// that follows the sphere's, or null); floor: the contact shadow; outline: a thin line around the plate (null: none; a
// light plate needs it on a white page)
// GRAPHITE: the first finished set (dark plate). SUNSET: the brand colours (white plate; the shaded side a pink to violet
// gradient that the rim follows, the lit side white turning peach at the terminator); BASE is SUNSET.
const GRAPHITE={bg:['#3d3f46','#0b0c0f'],glow:'#fff',edge:'#fff',sphere:['#1d1e23','#08080a'],lit:['#ffffff','#ecebe6','#a9a69d'],rim:'#5d606a',floor:'#000',outline:null};
const SUNSET={bg:['#ffffff','#ecebe7'],glow:'#fff',edge:'#fff',sphere:['#ff5f7e','#8a2be2'],lit:['#ffffff','#fff6ef','#ffcdb8'],rim:['#ffb0c2','#b48cff'],floor:'#7a2a6a',outline:'#e4e1db'};
const BASE=SUNSET;
const CORNER=22.37;  // the plate's corner radius in % of its side (iOS-like)

function icon({small=false,plate=true,id='sl',colors={}}={}){
  const C=Object.assign({},BASE,colors),u=id+(small?'s':'l'),cx=50,r=small?36:(plate?30:44),cy=small||!plate?50:47;
  // the lit side reaches past the sphere on the outside (the clip draws the edge), so the blur softens only the terminator
  const k=small?.30:.42,e=r+10,lit=`M${cx} ${cy-e}H${cx+e}V${cy+e}H${cx}V${cy+r}A${r*k} ${r} 0 0 1 ${cx} ${cy-r}Z`;
  const soft=!small,floor=!small&&plate;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
<linearGradient id="${u}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.bg[0]}"/><stop offset="1" stop-color="${C.bg[1]}"/></linearGradient>
<radialGradient id="${u}gw" cx=".92" cy=".04" r=".75"><stop offset="0" stop-color="${C.glow}" stop-opacity=".2"/><stop offset="1" stop-color="${C.glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="${u}gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.edge}" stop-opacity=".22"/><stop offset=".5" stop-color="${C.edge}" stop-opacity="0"/></linearGradient>
<radialGradient id="${u}sp" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="${C.sphere[0]}"/><stop offset="1" stop-color="${C.sphere[1]}"/></radialGradient>
<linearGradient id="${u}lt" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.lit[0]}"/><stop offset=".55" stop-color="${C.lit[1]}"/><stop offset="1" stop-color="${C.lit[2]}"/></linearGradient>
<radialGradient id="${u}fl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${C.floor}" stop-opacity=".75"/><stop offset="1" stop-color="${C.floor}" stop-opacity="0"/></radialGradient>
${Array.isArray(C.rim)?`<linearGradient id="${u}rm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.rim[0]}"/><stop offset="1" stop-color="${C.rim[1]}"/></linearGradient>
`:''}<clipPath id="${u}cl"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
${soft?`<filter id="${u}bl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>`:''}
</defs>
${plate?`<rect width="100" height="100" rx="${CORNER}" fill="url(#${u}bg)"/><rect width="100" height="100" rx="${CORNER}" fill="url(#${u}gw)"/><rect x=".5" y=".5" width="99" height="99" rx="${CORNER}" fill="none" stroke="url(#${u}gl)"/>${C.outline?`<rect x=".4" y=".4" width="99.2" height="99.2" rx="${CORNER-.4}" fill="none" stroke="${C.outline}" stroke-width="${small?1.6:.8}"/>`:''}`:''}
${floor?`<ellipse cx="${cx+2}" cy="${cy+r+3.5}" rx="${r*.95}" ry="4.2" fill="url(#${u}fl)"/>`:''}
<g transform="rotate(-35 ${cx} ${cy})">
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${u}sp)"/>
${small||!C.rim?'':`<circle cx="${cx}" cy="${cy}" r="${r-.6}" fill="none" stroke="${Array.isArray(C.rim)?`url(#${u}rm)`:C.rim}" stroke-width="1.1" opacity="${Array.isArray(C.rim)?'.9':'.55'}"/>`}
<g clip-path="url(#${u}cl)"><path d="${lit}" fill="url(#${u}lt)"${soft?` filter="url(#${u}bl)"`:''}/></g>
</g>
</svg>`;
}

export {BASE,CORNER,GRAPHITE,SUNSET,icon};
