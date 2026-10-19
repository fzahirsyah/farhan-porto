/* Preserve a return path even when a supplied demo replaces its body markup. */
(() => {
  'use strict';
  const scriptURL=document.currentScript.src;
  const destination=new URL('../index.html#projects',scriptURL).href;
  function ensureReturn(){
    if(typeof document==='undefined'||!document||!document.body)return;
    let link=document.querySelector('a.portfolio-return');
    if(!link){link=document.createElement('a');link.className='portfolio-return';link.textContent='← Back to Portfolio';document.body.appendChild(link);}
    if(link.href!==destination)link.href=destination;
    link.setAttribute('aria-label','Back to Farhan Zahirsyah portfolio, projects section');
    if(!document.getElementById('portfolio-return-style')){
      const style=document.createElement('style');style.id='portfolio-return-style';
      style.textContent='.portfolio-return{position:fixed;z-index:2147483640;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));padding:12px 18px;background:#142b48;color:#fff!important;border:1px solid #ffffff50;border-radius:999px;box-shadow:0 10px 30px #12365230;font:600 12px/1.3 system-ui,sans-serif;text-decoration:none!important}.portfolio-return:focus-visible{outline:3px solid #55b9ff;outline-offset:4px}';
      document.head.appendChild(style);
    }
  }
  function start(){ensureReturn();new MutationObserver(ensureReturn).observe(document.documentElement,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
