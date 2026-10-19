(function () {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const clamp = n => Math.min(1, Math.max(0, n));
  const smooth = n => { const x=clamp(n); return x*x*(3-2*x); };
  const root=document.documentElement, chapters=$$('.chapter');
  const scriptBase=document.currentScript?new URL('.',document.currentScript.src):new URL('js/',document.baseURI);
  const systemReduce=matchMedia('(prefers-reduced-motion: reduce)');
  let motionPref=null;
  try { motionPref=localStorage.getItem('farhan-motion'); } catch (_) {}
  let motion=motionPref ? motionPref==='on' : !systemReduce.matches;
  let pinned=false, metrics=[], dirty=true, currentIndex=-1, opening=false;
  let processManual=false, docManual=false, workflowManual=false, labManual=false;
  let scrollFrame=0, workflowTimer=0, apiTimer=0, scanTimer=0;

  function refreshMetrics(){
    pinned=motion && innerWidth>960 && innerHeight>740;
    root.classList.toggle('has-motion',pinned);
    root.classList.toggle('motion-off',!motion);
    metrics=chapters.map(el=>({el,top:el.getBoundingClientRect().top+scrollY,height:el.offsetHeight}));
    if(!pinned){
      $$('.scene-art,.hero-copy,.portrait-wrap,.hero-world').forEach(el=>{el.style.transform='';el.style.opacity='';el.style.filter='';});
      $$('.chapter svg [data-part]').forEach(el=>{el.style.transform='';el.style.opacity='';});
      $$('.project-card').forEach(el=>{el.style.translate='';});
    }
    dirty=true;
    requestUpdate();
  }
  function applyMotion(){
    $('#motion-toggle').setAttribute('aria-pressed',String(motion));
    $('#motion-toggle').setAttribute('title',motion?'Turn motion off':'Turn motion on');
    $('#motion-toggle .sr-only').textContent=motion?'Turn motion off':'Turn motion on';
    $('#motion-toggle use').setAttribute('href',motion?'#icon-pause':'#icon-play');
    refreshMetrics();
    if(!motion){
      $$('.scene-art,.hero-copy,.portrait-wrap,.hero-world').forEach(el=>{el.style.transform='';el.style.opacity='';el.style.filter='';});
      $$('.chapter svg [data-part]').forEach(el=>{el.style.transform='';el.style.opacity='';});
    }
  }
  $('#motion-toggle').addEventListener('click',()=>{
    motion=!motion;
    motionPref=motion?'on':'off';
    try{localStorage.setItem('farhan-motion',motion?'on':'off');}catch(_){}
    applyMotion();
  });
  systemReduce.addEventListener('change',()=>{if(motionPref===null){motion=!systemReduce.matches;applyMotion();}});

  const menu=$('#mobile-nav'),menuToggle=$('#menu-toggle');
  function closeMenu(){menu.hidden=true;menuToggle.setAttribute('aria-expanded','false');menuToggle.setAttribute('aria-label','Open navigation');}
  menuToggle.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');});
  menu.addEventListener('click',e=>{if(e.target.closest('a'))closeMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){closeMenu();menuToggle.focus();}});
  document.addEventListener('click',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!menuToggle.contains(e.target))closeMenu();});

  function jumpTo(id,behavior='smooth',fraction=.46){
    const el=document.getElementById(id);
    if(!el)return;
    const top=el.getBoundingClientRect().top+scrollY;
    const extra=pinned&&id!=='home'&&id!=='contact'?Math.max(0,el.offsetHeight-innerHeight)*fraction:0;
    window.scrollTo({top:Math.max(0,top+extra-(pinned?0:78)),behavior:motion?behavior:'auto'});
  }
  document.addEventListener('click',e=>{
    const link=e.target.closest('a[href^="#"]');
    if(!link||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const id=link.hash.slice(1),target=document.getElementById(id);
    if(!target||!target.classList.contains('chapter'))return;
    e.preventDefault();
    history.pushState(null,'',link.hash);
    closeMenu();jumpTo(id);
  });
  addEventListener('popstate',()=>{if(location.hash)jumpTo(location.hash.slice(1),'auto');});
  addEventListener('hashchange',()=>{if(location.hash)jumpTo(location.hash.slice(1),'auto');});

  const processData=JSON.parse($('#process-data').textContent);
  let processIndex=0;
  function setProcess(index){
    const i=Math.max(0,Math.min(5,index));
    processIndex=i;
    $$('.process-step').forEach((b,j)=>{b.classList.toggle('is-active',j===i);b.setAttribute('aria-pressed',String(j===i));});
    $('.process').style.setProperty('--process-progress',String((i+1)/6));
    $('#process-index').textContent=String(i+1).padStart(2,'0')+' / '+$('.process-step[data-process="'+i+'"] strong').textContent.toUpperCase();
    $('#process-title').textContent=processData[i].title;
    $('#process-body').textContent=processData[i].body;
  }
  $$('.process-step').forEach(b=>b.addEventListener('click',()=>{processManual=true;setProcess(Number(b.dataset.process));}));

  const moduleData={
    crm:{title:'Twenty CRM, connected.',summary:'A CRM becomes more useful when it participates in the customer journey.',points:['Customized lead, opportunity, pipeline and customer-record workflows.','Connected follow-ups and AI-assisted engagement to the CRM.','Integrated customer records with chatbot and backend services.'],tech:['Twenty CRM','REST APIs','Workflow automation']},
    ai:{title:'An agent that can act.',summary:'I engineered a chatbot that combines retrieval with tools and customer-system context.',points:['Retrieval-augmented generation and LLM tool calling.','WhatsApp connectivity, lead qualification and CRM integration.','Human-agent handover when a person should take the next step.'],tech:['RAG','LLM tool calling','WhatsApp','Python']},
    meta:{title:'Connect the customer channels.',summary:'Marketing and messaging integrations carry context between acquisition, conversations and operations.',points:['Meta Marketing API, campaign management and Conversions API integrations.','WhatsApp Cloud API and OAuth onboarding flows.','Independently handled the Meta Tech Provider application process.'],tech:['Meta Marketing API','WhatsApp Cloud API','OAuth','Conversions API']},
    backend:{title:'The layers behind the product.',summary:'I architected and developed the infrastructure connecting application interfaces, data and AI workflows.',points:['Go and Python/FastAPI services with PostgreSQL and Redis.','Asynchronous AI processing and API services.','Frontend, backend, infrastructure, integrations and deployment.'],tech:['Go','FastAPI','PostgreSQL','Redis','Docker','NGINX']}
  };
  const dialog=$('#module-dialog');let dialogTrigger=null;
  function showModule(key,trigger){
    const data=moduleData[key];if(!data)return;
    dialogTrigger=trigger;
    $('#module-title').textContent=data.title;$('#module-summary').textContent=data.summary;
    $('#module-points').replaceChildren(...data.points.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    $('#module-tech').replaceChildren(...data.tech.map(text=>{const span=document.createElement('span');span.textContent=text;return span;}));
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  }
  $$('[data-module]').forEach(g=>{
    g.addEventListener('click',()=>showModule(g.dataset.module,g));
    g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showModule(g.dataset.module,g);}});
  });
  function closeDialog(){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');if(dialogTrigger)dialogTrigger.focus();}
  $('#dialog-close').addEventListener('click',closeDialog);
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
  dialog.addEventListener('close',()=>{if(dialogTrigger)dialogTrigger.focus();});

  const workflowMessages=[
    ['I can help explain the options and collect the details a specialist needs.','New inquiry','Understand the need','A new inquiry enters the system.'],
    ['Let me retrieve the relevant information before we continue.','Context retrieved','Review useful information','Relevant knowledge is retrieved.'],
    ['I can record this inquiry so the team has the context.','Tool call prepared','Update the sample record','The agent prepares a CRM tool call.'],
    ['Your sample inquiry is now organized for the team.','Needs discovery','Advisor follow-up','The sample CRM record is updated.'],
    ['A follow-up can help the team keep the conversation moving.','Follow-up queued','Review the next step','A follow-up action joins the workflow.'],
    ['A human advisor can review your needs and help with the next step.','Human review','Advisor handover','A person takes over when needed.']
  ];let workflowIndex=0;
  function setWorkflow(i){
    workflowIndex=i;$('.workflow-demo').dataset.step=String(i);
    $$('.workflow-node').forEach((b,j)=>{b.classList.toggle('is-active',j===i);b.classList.toggle('is-complete',j<i);b.setAttribute('aria-pressed',String(j===i));});
    $('#agent-message').textContent=workflowMessages[i][0];$('#crm-stage').textContent=workflowMessages[i][1];$('#crm-next').textContent=workflowMessages[i][2];$('#workflow-status').textContent=String(i+1).padStart(2,'0')+' / '+workflowMessages[i][3];
  }
  function stopWorkflow(){clearTimeout(workflowTimer);workflowTimer=0;$('#run-workflow').disabled=false;$('.workflow-demo').classList.remove('is-running');}
  function runWorkflow(){
    workflowManual=true;stopWorkflow();setWorkflow(0);$('#run-workflow').disabled=true;$('.workflow-demo').classList.add('is-running');
    const next=()=>{if(document.hidden){stopWorkflow();return;}if(workflowIndex<5){setWorkflow(workflowIndex+1);workflowTimer=setTimeout(next,motion?850:250);}else stopWorkflow();};
    workflowTimer=setTimeout(next,motion?850:250);
  }
  $('#run-workflow').addEventListener('click',runWorkflow);
  $$('.workflow-node').forEach(b=>b.addEventListener('click',()=>{workflowManual=true;stopWorkflow();setWorkflow(Number(b.dataset.workflow));}));

  const dataTabs=$$('[data-data-tab]');
  function selectDataTab(button,focus=false){
    dataTabs.forEach(b=>{const selected=b===button;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;$('#panel-'+b.dataset.dataTab).hidden=!selected;});
    if(focus)button.focus();
    dirty=true;refreshMetrics();
  }
  dataTabs.forEach((button,i)=>{
    button.addEventListener('click',()=>selectDataTab(button));
    button.addEventListener('keydown',e=>{let next=null;if(e.key==='ArrowRight')next=(i+1)%3;if(e.key==='ArrowLeft')next=(i+2)%3;if(e.key==='Home')next=0;if(e.key==='End')next=2;if(next!==null){e.preventDefault();selectDataTab(dataTabs[next],true);}});
  });
  $('#scan-document').addEventListener('click',()=>{
    clearTimeout(scanTimer);const panel=$('#panel-document');panel.classList.remove('is-scanning','scan-complete');
    void panel.offsetWidth;panel.classList.add('is-scanning');$('#scan-document').disabled=true;$('#scan-status').textContent='Inspecting synthetic layout and metadata signals…';
    scanTimer=setTimeout(()=>{panel.classList.remove('is-scanning');panel.classList.add('scan-complete');$('#scan-status').textContent='Review signal found. A person should investigate the document.';$('#scan-document').disabled=false;},motion?1750:100);
  });
  const profiles=[['Regular','Within sample policy','Complete','KPR','Sample A illustrates a mortgage pathway.'],['Variable','Alternative sample policy','Complete','RTO','Sample B illustrates an alternative RTO pathway.'],['Unclear','Needs assessment','Missing details','Review','Sample C illustrates a handover for human assessment.']];
  $$('[data-profile]').forEach(button=>button.addEventListener('click',()=>{
    const p=profiles[Number(button.dataset.profile)];$$('[data-profile]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    $('#profile-income').textContent=p[0];$('#profile-commitments').textContent=p[1];$('#profile-information').textContent=p[2];$('#profile-note').textContent=p[4];
    $$('[data-route]').forEach(r=>r.classList.toggle('is-active',r.dataset.route===p[3]));
  }));
  let analyticsTick=0;
  $('#refresh-analytics').addEventListener('click',()=>{
    analyticsTick++;let inflow=0,outflow=0;
    $$('.analytics-chart .inflow-bar').forEach((b,i)=>{const h=60+((i*37+analyticsTick*23)%100);b.setAttribute('height',h);b.setAttribute('y',175-h);inflow+=h;});
    $$('.analytics-chart .outflow-bar').forEach((b,i)=>{const h=35+((i*29+analyticsTick*17)%65);b.setAttribute('height',h);b.setAttribute('y',175-h);outflow+=h;});
    $('#analytics-inflow').textContent='Rp '+(inflow*.042).toFixed(1)+'m';$('#analytics-outflow').textContent='Rp '+(outflow*.042).toFixed(1)+'m';
  });

  const docCopy=['Business objective, user flow, data model and success conditions—made explicit before implementation.','Requirements become an interface structure: navigation, information hierarchy and practical workflows.','The interface connects back to the original requirements, business rules and implementation plan.'];let docIndex=0;
  function setDoc(i){docIndex=i;$('.doc-visual').dataset.active=String(i);$$('[data-doc-step]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.docStep)===i)));$('#doc-context').textContent=docCopy[i];}
  $$('[data-doc-step]').forEach(b=>b.addEventListener('click',()=>{docManual=true;setDoc(Number(b.dataset.docStep));}));

  let labIndex=0;
  function setLab(i,scroll=false){
    labIndex=i;$$('[data-lab]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.lab)===i)));
    if(scroll&&pinned){labManual=true;jumpTo('engineering','smooth',.12+i*.38);setTimeout(()=>{labManual=false;},1000);}
    else if(!pinned&&scroll)$$('.lab-station')[i].scrollIntoView({behavior:motion?'smooth':'auto',block:'center'});
  }
  $$('[data-lab]').forEach(b=>b.addEventListener('click',()=>setLab(Number(b.dataset.lab),true)));
  let values=[125,210,180,320,240],sheetTick=0;
  $$('[data-cell]').forEach(b=>b.addEventListener('click',()=>{
    $$('[data-cell]').forEach(c=>c.classList.toggle('is-inspected',c===b));const i=Number(b.dataset.cell);
    $('#sheet-formula').textContent='C'+(i+2)+' = '+values[i];$('#sheet-caption').textContent='Cell C'+(i+2)+' contains the synthetic input '+values[i]+'.';
  }));
  $('#recalculate').addEventListener('click',()=>{
    sheetTick++;values=values.map((v,i)=>95+((sheetTick*47+i*71)%280));
    $$('[data-cell]').forEach((b,i)=>{b.textContent=values[i];b.classList.remove('is-inspected');});
    const total=values.reduce((a,b)=>a+b,0);$('#sheet-total').textContent=total.toLocaleString('en-US');$('#sheet-formula').textContent='=SUM(C2:C6)';$('#sheet-caption').textContent='Five synthetic inputs recalculated. Total: '+total.toLocaleString('en-US')+'.';
  });
  $('#send-request').addEventListener('click',()=>{
    clearTimeout(apiTimer);$('#send-request').disabled=true;let i=0;
    const advance=()=>{
      $$('[data-api-node]').forEach((el,j)=>el.classList.toggle('is-active',j===i));
      $('#api-status').textContent=i<4?'Processing · '+['route','service','database','worker'][i]:'200 OK · sample response';
      $('#api-output').textContent=i<4?'{ "demo": true, "stage": "'+['route','service','database','worker'][i]+'" }':'{ "demo": true, "customer": "Demo visitor", "status": "ready" }';
      if(i<4){i++;apiTimer=setTimeout(advance,motion?500:80);}else{$('#send-request').disabled=false;}
    };advance();
  });
  $$('.milestone').forEach(detail=>detail.addEventListener('toggle',()=>{
    if(detail.open)$$('.milestone').forEach(other=>{if(other!==detail)other.open=false;});
    if(!pinned)refreshMetrics();
  }));

  function resetTransition(){opening=false;document.body.classList.remove('is-navigating');const overlay=$('#project-transition');overlay.getAnimations().forEach(a=>a.cancel());overlay.style.clipPath='';}
  $$('.project-card').forEach(card=>card.addEventListener('click',e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||!motion)return;
    if(opening){e.preventDefault();return;}e.preventDefault();opening=true;
    try{sessionStorage.setItem('farhan-return','#projects');}catch(_){}
    const url=card.href,overlay=$('#project-transition'),r=card.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    $('#transition-project').textContent=$('h3',card).textContent;document.body.classList.add('is-navigating');
    if(typeof overlay.animate==='function'){
      const animation=overlay.animate([{clipPath:`circle(0px at ${x}px ${y}px)`},{clipPath:`circle(${Math.hypot(innerWidth,innerHeight)}px at ${x}px ${y}px)`}],{duration:520,easing:'cubic-bezier(.65,0,.25,1)',fill:'forwards'});
      animation.finished.catch(()=>{}).then(()=>{location.href=url;});
    }else location.href=url;
  }));
  $$('.project-card').forEach(card=>{
    card.addEventListener('pointermove',event=>{
      if(!motion||event.pointerType==='touch')return;
      const bounds=card.getBoundingClientRect(),x=(event.clientX-bounds.left)/bounds.width,y=(event.clientY-bounds.top)/bounds.height;
      card.style.setProperty('--mx',(x*100).toFixed(1)+'%');card.style.setProperty('--my',(y*100).toFixed(1)+'%');
      card.style.setProperty('--rx',((.5-y)*4).toFixed(2)+'deg');card.style.setProperty('--ry',((x-.5)*5).toFixed(2)+'deg');
    });
    card.addEventListener('pointerleave',()=>{card.style.removeProperty('--rx');card.style.removeProperty('--ry');});
  });
  addEventListener('pageshow',resetTransition);
  addEventListener('pagehide',()=>{stopWorkflow();clearTimeout(apiTimer);clearTimeout(scanTimer);});

  function updateScroll(){
    scrollFrame=0;const y=scrollY,h=innerHeight;
    $('#site-header').classList.toggle('is-scrolled',y>25);
    let selected=0;
    metrics.forEach((m,i)=>{if(y+h*.4>=m.top)selected=i;});
    if(selected!==currentIndex){
      currentIndex=selected;$('#rail-counter').textContent=String(selected+1).padStart(2,'0')+' / 10';$('#rail-name').textContent=chapters[selected].dataset.name.toUpperCase();
      $$('.rail-links a').forEach((a,i)=>{if(i===selected)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
      $$('.main-nav a').forEach(a=>a.classList.toggle('is-active',a.hash==='#'+chapters[selected].id));
    }
    for(const [index,m] of metrics.entries()){
      const visible=y+h>m.top&&y<m.top+m.height;
      m.el.classList.toggle('is-visible',visible);
      if(!visible)continue;
      const p=pinned?clamp((y-m.top)/Math.max(1,m.height-h)):.5;
      m.el.style.setProperty('--progress',p.toFixed(4));
      if(!pinned)continue;
      const enter=smooth(p/.23),exit=smooth((p-.83)/.17);
      const visual=$('.scene-art',m.el);
      if(visual){visual.style.transform=`perspective(1400px) translate3d(${(1-enter)*45-exit*15}px,${(1-enter)*24-exit*20}px,0) scale(${.94+enter*.06+exit*.035})`;visual.style.opacity=String(.8+.2*enter-exit*.15);}
      if(index===0){$('.hero-copy').style.transform=`translateY(${-p*65}px)`;$('.hero-copy').style.opacity=String(1-p*.64);$('.portrait-wrap').style.transform=`translateY(${p*22}px) scale(${1+p*.09})`;$('.portrait-wrap').style.opacity=String(1-p*.62);$('.hero-world').style.transform=`scale(${1+p*.15}) rotate(${p*5}deg)`;}
      if(index===1&&!processManual){const i=Math.min(5,Math.floor(p*6));if(i!==processIndex)setProcess(i);}
      if(index===2){
        $$('#product-architecture [data-part=module]').forEach((g,i)=>{const local=smooth((p-i*.04)/.28);g.style.transform=`translateY(${(1-local)*-38}px)`;g.style.opacity=String(.35+local*.65);});
        const req=$('#product-architecture [data-part=request]');req.style.transform=`translateY(${Math.sin(p*Math.PI*3)*25}px)`;
      }
      if(index===3&&!workflowManual){const i=Math.min(5,Math.floor(p*6));if(i!==workflowIndex)setWorkflow(i);}
      if(index===5&&!docManual){const i=Math.min(2,Math.floor(p*3));if(i!==docIndex)setDoc(i);}
      if(index===6){const travel=clamp((p-.12)/.76);$('.lab-track').style.setProperty('--lab-x',(-travel*200).toFixed(3)+'%');const i=Math.round(travel*2);if(!labManual&&i!==labIndex)setLab(i);}
      if(index===7){$$('.project-card',m.el).forEach((card,i)=>{if(card.matches(':hover'))return;const local=smooth((p-i*.045)/.28);card.style.translate=`0 ${(1-local)*55-exit*10}px`;});}
    }
    dirty=false;
  }
  function requestUpdate(){if(!scrollFrame)scrollFrame=requestAnimationFrame(updateScroll);}
  addEventListener('scroll',()=>{dirty=true;requestUpdate();},{passive:true});
  let resizeTimer=0;
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(innerWidth>960)closeMenu();refreshMetrics();resizeAtmosphere();},120);});

  // Lightweight canvas fallback: continuous visual atmosphere, never critical content.
  const canvas=$('#atmosphere'),ctx=canvas.getContext('2d');let width=innerWidth,height=innerHeight,lastFrame=0;
  const particles=Array.from({length:innerWidth<640?30:65},(_,i)=>({x:((i*137+73)%1200)/1200,y:((i*i*31+83)%760)/760,r:.7+(i%3)*.5,phase:i*.71}));
  function resizeAtmosphere(){width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);if(threeResize)threeResize();}
  let threeResize=null,threeTick=null;
  function atmosphere(now){
    requestAnimationFrame(atmosphere);
    if(document.hidden||!motion||now-lastFrame<33)return;
    lastFrame=now;ctx.clearRect(0,0,width,height);const t=now*.0001;
    particles.forEach(p=>{const x=(p.x*width+Math.sin(t+p.phase)*13),y=(p.y*height+Math.cos(t*.7+p.phase)*14-scrollY*.018)%height;ctx.beginPath();ctx.arc(x,y<0?y+height:y,p.r,0,Math.PI*2);ctx.fillStyle='rgba(52,143,202,.18)';ctx.fill();});
    if(threeTick)threeTick(now*.001);
  }
  resizeAtmosphere();requestAnimationFrame(atmosphere);

  // Optional Three.js atmospheric silk. Native SVG and canvas remain the fallback.
  function initThree(){
    if(!window.THREE||!motion)return;
    try{
      const T=window.THREE,renderer=new T.WebGLRenderer({canvas:$('#silk-gl'),alpha:true,antialias:false,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));
      const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,width/height,.1,40);camera.position.z=6;
      const uniforms={uTime:{value:0},uOpacity:{value:.17}};
      const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms,
        vertexShader:'uniform float uTime;varying vec2 vUv;varying float vFold;void main(){vUv=uv;vec3 p=position;float a=uv.x*7.0+uTime*.2;vFold=sin(a+uv.y*4.0);p.z+=vFold*.16;p.y+=sin(a*.7)*.15;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',
        fragmentShader:'precision mediump float;uniform float uOpacity;varying vec2 vUv;varying float vFold;void main(){float f=sin(vUv.y*3.14159);float shine=pow(clamp(vFold*.5+.5,0.,1.),6.);vec3 c=mix(vec3(.28,.67,.96),vec3(.98,1.,1.),shine);gl_FragColor=vec4(c,uOpacity*f);}'
      });
      const meshes=[];for(let i=0;i<4;i++){const mesh=new T.Mesh(new T.PlaneGeometry(10,.28+i*.08,80,8),material);mesh.position.y=-1.6+i*.15;mesh.position.z=-i*.09;mesh.rotation.z=-.12+i*.035;meshes.push(mesh);scene.add(mesh);}
      threeResize=()=>{renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};threeResize();
      threeTick=t=>{uniforms.uTime.value=t;meshes.forEach((mesh,i)=>{mesh.rotation.z=-.12+i*.035+Math.sin(t*.08+i)*.035;});renderer.render(scene,camera);};
      root.classList.add('webgl-ready');
      $('#silk-gl').addEventListener('webglcontextlost',()=>{threeTick=null;root.classList.remove('webgl-ready');},{once:true});
    }catch(_){threeTick=null;root.classList.remove('webgl-ready');}
  }
  let threeLoaded=false;
  function loadThree(){
    if(threeLoaded||!motion)return;threeLoaded=true;
    const script=document.createElement('script');script.src=new URL('vendor/three.min.js',scriptBase).href;script.async=true;script.onload=initThree;script.onerror=()=>{threeLoaded=false;};document.head.appendChild(script);
  }
  if('requestIdleCallback' in window)requestIdleCallback(loadThree,{timeout:1800});else setTimeout(loadThree,1000);
  $('#motion-toggle').addEventListener('click',()=>{if(motion&&!threeTick)loadThree();});

  // A timed story uses the same chapter states as manual scrolling.
  // Durations include a short camera move into the following chapter.
  const tourDurations=[9,18,17,18,22,16,20,24,20,12];
  const tourOffsets=tourDurations.map((_,i)=>tourDurations.slice(0,i).reduce((a,b)=>a+b,0));
  const tourTotal=tourDurations.reduce((a,b)=>a+b,0);
  const tour={active:false,playing:false,position:0,speed:1,last:0,frame:0,chapter:0,view:-1,apiPlayed:false,analyticsPlayed:false};
  const player=$('#tour-player');
  function tourLocation(){
    let index=9;
    for(let i=0;i<10;i++){if(tour.position<tourOffsets[i]+tourDurations[i]){index=i;break;}}
    const local=Math.min(tourDurations[index],Math.max(0,tour.position-tourOffsets[index]));
    const moving=index<9?1.15:0,content=tourDurations[index]-moving;
    return {index,local,p:clamp(local/content),transition:clamp((local-content)/Math.max(.01,moving))};
  }
  function timeLabel(seconds){const s=Math.ceil(Math.max(0,seconds));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
  function updateTourControls(){
    player.classList.toggle('is-paused',!tour.playing);
    player.classList.toggle('is-complete',tour.position>=tourTotal);
    const label=tour.position>=tourTotal?'Replay the story':tour.playing?'Pause the story':'Resume the story';
    $('#tour-play').setAttribute('aria-label',label);$('#tour-play').title=label;
    $('#tour-play use').setAttribute('href',tour.playing?'#icon-pause':'#icon-play');
    $('#tour-previous').disabled=tour.chapter===0;
    $('#tour-next').disabled=tour.chapter===9;
  }
  function paintTour(){
    if(!tour.active)return;
    const {index,local,p,transition}=tourLocation();
    tour.chapter=index;
    if(tour.view!==index){
      tour.view=index;$('#tour-title').textContent=chapters[index].dataset.name;
      $('#tour-count').textContent=String(index+1).padStart(2,'0')+' / 10';
      updateTourControls();
    }
    const m=metrics[index];if(!m)return;
    const range=Math.max(0,m.height-innerHeight);
    let target=m.top+range*p;
    if(transition>0&&index<9)target=m.top+range+(metrics[index+1].top-(m.top+range))*smooth(transition);

    if(index===1)setProcess(Math.min(5,Math.floor(clamp((p-.1)/.8)*6)));
    if(index===3)setWorkflow(Math.min(5,Math.floor(clamp((p-.08)/.84)*6)));
    if(index===4){
      const tab=p<.38?'document':p<.73?'routing':'reporting';
      const selected=$('[data-data-tab="'+tab+'"]');
      if(selected.getAttribute('aria-selected')!=='true')selectDataTab(selected);
      if(tab==='document'){
        const scan=clamp((p-.1)/.22),panel=$('#panel-document');
        const beam=$('#financial-intelligence [data-part=scanner]');
        beam.style.transform=`translateY(${scan*235}px)`;beam.style.opacity=String(.2+Math.sin(scan*Math.PI)*.8);
        panel.classList.toggle('scan-complete',scan>.92);
        $('#scan-status').textContent=scan>.92?'Review signal found. A person should investigate the document.':'Inspecting synthetic layout and metadata signals…';
      }
      if(tab==='routing'){
        const sample=p<.51?0:p<.62?1:2;
        if($('[data-profile="'+sample+'"]').getAttribute('aria-pressed')!=='true')$('[data-profile="'+sample+'"]').click();
      }
      if(tab==='reporting'&&!tour.analyticsPlayed){$('#refresh-analytics').click();tour.analyticsPlayed=true;}
    }
    if(index===5){
      setDoc(Math.min(2,Math.floor(clamp((p-.08)/.84)*3)));
      const doc=$('#requirements-to-product [data-part=requirements]'),wire=$('#requirements-to-product [data-part=wireframe]'),app=$('#requirements-to-product [data-part=product]');
      doc.style.transform=`translateX(${smooth((p-.2)/.4)*30}px) scale(${1-smooth((p-.4)/.5)*.03})`;
      wire.style.transform=`translateY(${(1-smooth((p-.22)/.3))*22}px)`;
      app.style.transform=`translateX(${(1-smooth((p-.5)/.3))*35}px)`;
    }
    if(index===6){
      const station=Math.min(2,Math.floor(clamp((p-.08)/.84)*3));
      if(station!==labIndex)setLab(station);
      if(!pinned){const el=$$('.lab-station')[station];target=el.getBoundingClientRect().top+scrollY-105;}
      if(station===1&&!tour.apiPlayed){$('#send-request').click();tour.apiPlayed=true;}
    }
    if(index===7&&!pinned){
      const cardIndex=Math.min(3,Math.floor(clamp((p-.05)/.9)*4));
      const card=$$('.project-card')[cardIndex];target=card.getBoundingClientRect().top+scrollY-105;
    }
    if(index===8){
      const stop=Math.min(3,Math.floor(clamp((p-.05)/.9)*4)),detail=$$('.milestone')[stop];
      if(!detail.open)detail.open=true;
      if(!pinned)target=detail.getBoundingClientRect().top+scrollY-120;
    }
    if(!pinned&&index!==6&&index!==7&&index!==8)target-=78;
    window.scrollTo({top:Math.max(0,target),behavior:'auto'});
    const fraction=tour.position/tourTotal;
    player.style.setProperty('--tour-progress',fraction.toFixed(4));
    $('#tour-progress').setAttribute('aria-valuenow',String(Math.round(fraction*100)));
    $('#tour-time').textContent=timeLabel(tour.position)+' / '+timeLabel(tourTotal);
    if(tour.position>=tourTotal){$('#tour-count').textContent='STORY COMPLETE';updateTourControls();}
  }
  function tourTick(now){
    if(!tour.active||!tour.playing)return;
    if(document.hidden){tour.last=now;tour.frame=requestAnimationFrame(tourTick);return;}
    const dt=Math.min(.1,(now-tour.last)/1000);tour.last=now;
    tour.position=Math.min(tourTotal,tour.position+dt*tour.speed);
    paintTour();
    if(tour.position>=tourTotal){tour.playing=false;updateTourControls();return;}
    tour.frame=requestAnimationFrame(tourTick);
  }
  function pauseTour(){
    if(!tour.active||!tour.playing)return;
    tour.playing=false;cancelAnimationFrame(tour.frame);updateTourControls();
    $('#tour-count').textContent=String(tour.chapter+1).padStart(2,'0')+' / 10 · PAUSED';
  }
  function resumeTour(){
    if(tour.position>=tourTotal){startTour();return;}
    tour.playing=true;tour.last=performance.now();
    $('#tour-count').textContent=String(tour.chapter+1).padStart(2,'0')+' / 10';
    updateTourControls();cancelAnimationFrame(tour.frame);tour.frame=requestAnimationFrame(tourTick);
  }
  function startTour(){
    stopWorkflow();clearTimeout(apiTimer);clearTimeout(scanTimer);
    processManual=true;docManual=true;workflowManual=true;labManual=true;
    if(!motion){motion=true;applyMotion();loadThree();}
    refreshMetrics();
    tour.active=true;tour.playing=true;tour.position=0;tour.chapter=0;tour.view=-1;tour.apiPlayed=false;tour.analyticsPlayed=false;tour.last=performance.now();
    player.hidden=false;root.classList.add('is-touring');paintTour();updateTourControls();
    cancelAnimationFrame(tour.frame);tour.frame=requestAnimationFrame(tourTick);
  }
  function stopTour(){
    if(!tour.active)return;
    pauseTour();tour.active=false;player.hidden=true;root.classList.remove('is-touring');
    processManual=false;docManual=false;workflowManual=false;labManual=false;
    const heading=$('h1,h2',chapters[tour.chapter]);heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});
    const beam=$('#financial-intelligence [data-part=scanner]');beam.style.transform='';beam.style.opacity='';
    requestUpdate();
  }
  function skipTour(direction){
    const next=Math.max(0,Math.min(9,tour.chapter+direction));
    tour.position=tourOffsets[next];tour.last=performance.now();tour.view=-1;paintTour();updateTourControls();
  }
  $('#start-tour').addEventListener('click',startTour);
  $('#tour-play').addEventListener('click',()=>tour.playing?pauseTour():resumeTour());
  $('#tour-previous').addEventListener('click',()=>skipTour(-1));
  $('#tour-next').addEventListener('click',()=>skipTour(1));
  $('#tour-close').addEventListener('click',stopTour);
  $('#tour-speed').addEventListener('click',()=>{const speeds=[.75,1,1.25,1.5];tour.speed=speeds[(speeds.indexOf(tour.speed)+1)%speeds.length];$('#tour-speed').textContent=tour.speed+'×';$('#tour-speed').setAttribute('aria-label','Playback speed, '+tour.speed+'x');});
  document.addEventListener('pointerdown',event=>{if(tour.active&&!event.target.closest('.tour-player,.tour-start'))pauseTour();},{passive:true});
  document.addEventListener('focusin',event=>{if(tour.active&&event.target.closest('.project-card,[data-module]'))pauseTour();});
  addEventListener('wheel',pauseTour,{passive:true});
  addEventListener('touchstart',event=>{if(!event.target.closest('.tour-player,.tour-start'))pauseTour();},{passive:true});
  document.addEventListener('keydown',event=>{if(!tour.active)return;if(event.key==='Escape'&&!dialog.open){stopTour();return;}if(event.target.closest('.tour-player,.tour-start'))return;if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))pauseTour();});
  $('#motion-toggle').addEventListener('click',pauseTour);
  addEventListener('pagehide',()=>{pauseTour();});
  root.classList.add('js-ready');

  if(motion&&!location.hash){
    $$('.hero-greeting,.hero h1,.hero-description,.hero-buttons,.portrait').forEach((el,i)=>{
      if(el.animate)el.animate([{opacity:.5,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:800,delay:i*90,easing:'cubic-bezier(.22,1,.36,1)'});
    });
  }

  applyMotion();setWorkflow(0);
  if(location.hash){requestAnimationFrame(()=>requestAnimationFrame(()=>jumpTo(location.hash.slice(1),'auto')));}
  addEventListener('load',()=>{refreshMetrics();if(location.hash)jumpTo(location.hash.slice(1),'auto');},{once:true});
})();
