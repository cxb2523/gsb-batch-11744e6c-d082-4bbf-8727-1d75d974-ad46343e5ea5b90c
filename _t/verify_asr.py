import json,os,subprocess,time,sys,urllib.request
import websocket

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN='/sandbox/workspace/chs/chrome-headless-shell-linux64/chrome-headless-shell'
PORT=9333

srv=subprocess.Popen([sys.executable,'-m','http.server','8899','--bind','127.0.0.1'],cwd=ROOT,
                     stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
chrome=subprocess.Popen([BIN,'--headless','--no-sandbox','--disable-gpu',f'--remote-debugging-port={PORT}',
                         '--remote-allow-origins=*','--user-data-dir=/tmp/cdp-asr-'+str(time.time()),
                         'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def wait_ws():
    for _ in range(80):
        try:
            d=json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/list'))
            for t in d:
                if t.get('webSocketDebuggerUrl'): return t['webSocketDebuggerUrl']
        except Exception: pass
        time.sleep(0.25)
    raise SystemExit('CDP 未启动')
ws=websocket.create_connection(wait_ws(),timeout=40)
i=[0]
def cmd(method,params=None):
    i[0]+=1; mid=i[0]
    ws.send(json.dumps({'id':mid,'method':method,'params':params or {}}))
    while True:
        m=json.loads(ws.recv())
        if m.get('id')==mid: return m

cmd('Page.enable'); cmd('Runtime.enable'); cmd('Network.enable')
cmd('Network.setBlockedURLs',{'urls':['*cdn.jsdelivr.net*','*code.iconify.design*','*gstatic.com*','*misans*']})
cmd('Page.addScriptToEvaluateOnNewDocument',{'source':"window.__errs=[];addEventListener('error',e=>__errs.push(String(e.message)));addEventListener('unhandledrejection',e=>__errs.push('REJ '+String(e.reason&&e.reason.message||e.reason)));"})
cmd('Page.navigate',{'url':'http://127.0.0.1:8899/index.html'})
for _ in range(40):
    time.sleep(0.5)
    r0=cmd('Runtime.evaluate',{'expression':"(document.readyState==='complete')&&(typeof switchPage==='function')",'returnByValue':True})
    if (r0.get('result',{}).get('result') or {}).get('value') is True: break

TEST=r"""(async()=>{
  try{
    if(typeof switchPage==='function') switchPage('settings');
    else document.querySelector('[data-page="settings"]').click();
  }catch(e){ return JSON.stringify({fatal:String(e),hasSwitch:typeof switchPage,errs:window.__errs||[],nav:[...document.querySelectorAll('[data-page]')].map(x=>x.getAttribute('data-page')).slice(0,8)}); }
  await new Promise(r=>setTimeout(r,500));
  const cards=[...document.querySelectorAll('#asrList .asr-card')];
  const langBtns=[...document.querySelectorAll('#asrLangOptions .limit-btn')];
  const jp=langBtns.find(b=>b.textContent==='日语');
  if(jp) jp.click();
  await new Promise(r=>setTimeout(r,250));
  return JSON.stringify({
    cards:cards.map(c=>({
      name:(c.querySelector('.an')||{}).textContent||'',
      mb:(c.querySelector('.asz')||{}).textContent||'',
      langs:[...c.querySelectorAll('.asr-langs span')].map(s=>s.textContent),
      tags:[...c.querySelectorAll('.asr-pros span')].map(s=>s.textContent),
      badge:!!c.querySelector('.asr-badge'),
      on:c.classList.contains('on')
    })),
    langBtns:langBtns.map(b=>b.textContent),
    active:[...document.querySelectorAll('#asrLangOptions .limit-btn.active')].map(b=>b.textContent),
    hint:(document.getElementById('asrDeviceHint')||{}).textContent||'',
    beta:document.body.innerHTML.includes('Beta'),
    look:(()=>{const el=document.getElementById('asrLook');return el?{min:el.min,max:el.max,value:el.value,label:el.parentElement.parentElement.querySelector('.t').textContent}:null;})(),
    lookV:(document.getElementById('asrLookV')||{}).textContent||'',
    preSw:(()=>{const el=document.getElementById('swAsrPre');return el?{inDom:true,cls:el.className}:(typeof document.getElementById('swAsrPre')==='undefined'?'missing':null);})(),
    errs:window.__errs||[]
  });
})()"""
r=cmd('Runtime.evaluate',{'expression':TEST,'awaitPromise':True,'returnByValue':True})
val=(r.get('result',{}).get('result') or {}).get('value')
print(val if val else json.dumps(r,ensure_ascii=False)[:1500])
ws.close(); chrome.terminate(); srv.terminate()
