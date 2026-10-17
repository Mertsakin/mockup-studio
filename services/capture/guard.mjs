// SSRF guard: a public "open any address" browser must not reach private networks, the loopback, link-local
// addresses (the cloud metadata server: 169.254.169.254) or other non-public ranges. allowed(url) is checked for every
// request the page makes (core.mjs, ctx.route): the first address, redirects, frames and sub-resources.
// DNS rebinding (a name that resolves to a public address here and a private one for the browser a moment later) is
// not fully closed by a check in the application; the service account must have no permissions (docs/lansman.md).
import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCK=new net.BlockList();
for(const [a,p] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],
  ['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])
  BLOCK.addSubnet(a,p,'ipv4');
for(const [a,p] of [['::',128],['::1',128],['64:ff9b::',96],['100::',64],['2001:db8::',32],['fc00::',7],['fe80::',10],['ff00::',8]])
  BLOCK.addSubnet(a,p,'ipv6');

function blocked(ip){
  // an IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as IPv4
  const m=/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);if(m)ip=m[1];
  const v=net.isIP(ip);if(!v)return true;
  return BLOCK.check(ip,v===4?'ipv4':'ipv6');
}
// name -> addresses, kept briefly (a page asks for the same hosts many times)
const cache=new Map(),TTL=60000;
async function resolve(host){
  const c=cache.get(host);if(c&&c.t>Date.now()-TTL)return c.a;
  const a=(await dns.lookup(host,{all:true,verbatim:true})).map(x=>x.address);
  cache.set(host,{a,t:Date.now()});if(cache.size>5000)cache.clear();
  return a;
}
async function allowed(href){
  let u;try{u=new URL(href);}catch(e){return false;}
  if(u.protocol==='data:'||u.protocol==='blob:')return true;  // made inside the page
  if(!/^(https?|wss?):$/.test(u.protocol))return false;
  const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(net.isIP(host))return !blocked(host);
  if(host==='localhost'||/\.(localhost|local|internal|lan|home|corp)$/.test(host)||!host.includes('.'))return false;
  try{const a=await resolve(host);return a.length>0&&a.every(ip=>!blocked(ip));}catch(e){return false;}
}

export {allowed,blocked};
