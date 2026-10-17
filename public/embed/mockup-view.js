/* <mockup-view src="embed.html?src=scene.mockup.json&mode=mouse" poster="poster.webp"> — the host page's loader for
   the embed player. The poster (a still of the scene) shows at once and until the player has drawn its first frame,
   so the page never waits on WebGL for its picture.
   It makes the iframe (one per embed: the player's core keeps singletons) and tells it where the page's pointer is
   and how far the embed has scrolled through the viewport, so 'mouse' follows the whole page and 'scroll' plays
   the animation with the page. No dependencies; the iframe loads only when the embed comes near the viewport. */
(()=>{
  if(customElements.get('mockup-view'))return;
  const views=new Set();
  class MockupView extends HTMLElement{
    connectedCallback(){
      if(this.frame)return;
      this.style.display=this.style.display||'block';this.style.position='relative';
      if(!this.style.aspectRatio&&!this.style.height)this.style.aspectRatio=this.getAttribute('ratio')||'4/5';
      const poster=this.getAttribute('poster');
      if(poster){const im=this.posterEl=document.createElement('img');im.src=new URL(poster,location.href).href;im.alt=this.getAttribute('alt')||'';
        im.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none';this.appendChild(im);}
      const f=this.frame=document.createElement('iframe');
      f.title=this.getAttribute('alt')||'Cihaz mockup’ı';f.loading='lazy';f.allow='';
      f.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent'+(poster?';opacity:0;transition:opacity .4s':'');
      f.setAttribute('allowtransparency','true');
      const src=new URL(this.getAttribute('src'),location.href);
      const mode=this.getAttribute('mode');if(mode)src.searchParams.set('mode',mode);
      f.src=src.href;this.appendChild(f);views.add(this);
    }
    disconnectedCallback(){views.delete(this);}
    send(m){if(this.frame&&this.frame.contentWindow)this.frame.contentWindow.postMessage(m,'*');}
    // the player's first frame is up: the 3D view fades in over the poster, which then goes
    ready(){const f=this.frame,im=this.posterEl;if(!f||f.style.opacity==='1')return;f.style.opacity='1';if(im)setTimeout(()=>im.remove(),450);}
  }
  customElements.define('mockup-view',MockupView);
  // the page's pointer, relative to each embed's centre (-1..1 across the viewport)
  addEventListener('pointermove',e=>{views.forEach(v=>{const r=v.getBoundingClientRect();
    v.send({mockup:'pointer',x:Math.max(-1,Math.min(1,(e.clientX-(r.left+r.width/2))/(innerWidth/2))),y:Math.max(-1,Math.min(1,(e.clientY-(r.top+r.height/2))/(innerHeight/2)))});});},{passive:true});
  // scroll progress: 0 when the embed's top meets the viewport's bottom, 1 when its bottom leaves the top
  const scroll=()=>views.forEach(v=>{const r=v.getBoundingClientRect(),p=(innerHeight-r.top)/(innerHeight+r.height);v.send({mockup:'scroll',p:Math.max(0,Math.min(1,p))});});
  addEventListener('scroll',scroll,{passive:true});addEventListener('resize',scroll);
  addEventListener('message',e=>{if(!e.data||e.data.mockup!=='ready')return;views.forEach(v=>{if(v.frame&&v.frame.contentWindow===e.source)v.ready();});scroll();});
})();
