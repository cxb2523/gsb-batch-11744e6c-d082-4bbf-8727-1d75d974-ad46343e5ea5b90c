/* 自动跳过广告 —— Chrome 内构造帧/音频样本的分支验证脚本。
   由 _t/verify_adskip.py 通过 CDP 在真实 index.html 页面上下文中求值。
   所有帧与音频频谱均在本地构造，走真实流水线（采样→Worker→判定→跳转）。 */
(async function(){
  var R=[];
  function rec(name,ok,detail){R.push({name:name,ok:!!ok,detail:detail||""});}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
  function approx(a,b,tol){return Math.abs(a-b)<=(tol||0.001);}

  /* ---------- 构造视频帧（480×270，与检测器同尺寸） ---------- */
  var W=480,H=270;
  function buildFrame(btnP,colP){
    var cv=document.createElement("canvas");cv.width=W;cv.height=H;
    var cx=cv.getContext("2d");var img=cx.createImageData(W,H);var d=img.data;
    for(var i=0;i<d.length;i+=4){d[i]=255;d[i+1]=255;d[i+2]=255;d[i+3]=255;}
    var roi=AD_BETA.roi;
    var x0=Math.round(roi.x*W),y0=Math.round(roi.y*H),x1=Math.round((roi.x+roi.w)*W),y1=Math.round((roi.y+roi.h)*H);
    var total=(x1-x0)*(y1-y0);
    var nB=Math.round((btnP.blue||0)*total),nY=Math.round((btnP.yellow||0)*total),nG=Math.round((btnP.green||0)*total);
    var idx=0,y,x,p;
    for(y=y0;y<y1;y++)for(x=x0;x<x1;x++){
      p=(y*W+x)*4;idx++;
      if(idx<=nB){d[p]=0;d[p+1]=0;d[p+2]=255;}
      else if(idx<=nB+nY){d[p]=255;d[p+1]=255;d[p+2]=0;}
      else if(idx<=nB+nY+nG){d[p]=0;d[p+1]=255;d[p+2]=0;}
    }
    var totS=0,goldHave=0;
    for(y=0;y<H;y+=2)for(x=0;x<W;x+=2){totS++;p=(y*W+x)*4;if(d[p]===255&&d[p+1]===255&&d[p+2]===0)goldHave++;}
    var redNeed=Math.round((colP.red||0)*totS),goldNeed=Math.round((colP.gold||0)*totS)-goldHave;
    for(y=0;y<H;y+=2)for(x=0;x<W;x+=2){
      if(x>=x0&&x<x1&&y>=y0&&y<y1)continue;
      p=(y*W+x)*4;
      if(redNeed>0){d[p]=255;d[p+1]=0;d[p+2]=0;redNeed--;}
      else if(goldNeed>0){d[p]=255;d[p+1]=215;d[p+2]=0;goldNeed--;}
    }
    cx.putImageData(img,0,0);
    return cv;
  }
  var REF_BTN={blue:.210,yellow:.156,green:.191},REF_COL={red:.563,gold:.244};
  function shifted(ref,d){var o={};for(var k in ref)o[k]=Math.max(0,ref[k]-d);return o;}
  var frameAd=buildFrame(REF_BTN,REF_COL);                                       /* btn≈1.00 col≈1.00 */
  var frameFusion=buildFrame(shifted(REF_BTN,.06*Math.sqrt(-Math.log(.88))),REF_COL); /* btn≈0.88 col≈1.00 */
  var frameBorder=buildFrame(shifted(REF_BTN,.06*Math.sqrt(-Math.log(.93))),shifted(REF_COL,.15*Math.sqrt(-Math.log(.8)))); /* btn≈0.93 col≈0.80 */
  var frameWhite=buildFrame({},{});                                              /* 正片：无任何特征 */
  function scoreOf(cv){var im=cv.getContext("2d").getImageData(0,0,W,H);return adVisionLocal(im.data,W,H);}
  var sc=scoreOf(frameAd);
  rec("构造帧:广告帧 btn≈1 col≈1",sc.btn>.97&&sc.col>.97,"btn="+sc.btn.toFixed(3)+" col="+sc.col.toFixed(3));
  sc=scoreOf(frameFusion);
  rec("构造帧:累积帧 btn≈0.88(<0.90 门控) col≈1",sc.btn>.84&&sc.btn<.90&&sc.col>.97,"btn="+sc.btn.toFixed(3)+" col="+sc.col.toFixed(3));
  sc=scoreOf(frameBorder);
  rec("构造帧:边界帧 btn≈0.93 col≈0.80",sc.btn>.90&&sc.btn<.95&&sc.col>.75&&sc.col<.85,"btn="+sc.btn.toFixed(3)+" col="+sc.col.toFixed(3));
  sc=scoreOf(frameWhite);
  rec("构造帧:正片帧 btn≈0 col≈0",sc.btn<.05&&sc.col<.05,"btn="+sc.btn.toFixed(3)+" col="+sc.col.toFixed(3));

  /* ---------- 构造音频频谱（40 带对数能谱，与参考指纹余弦相似度可控） ---------- */
  function spectrumFor(cos,sr){
    var ref=AD_BETA.audioRef,m=0,i;
    for(i=0;i<40;i++)m+=ref[i];m/=40;
    var rc=ref.map(function(v){return v-m;});
    var nrm=0;for(i=0;i<40;i++)nrm+=rc[i]*rc[i];nrm=Math.sqrt(nrm);
    var ru=rc.map(function(v){return v/nrm;});
    var w=[],seed=12345;
    for(i=0;i<40;i++){seed=(seed*1103515245+12345)&0x7fffffff;w.push(seed/0x7fffffff*2-1);}
    var wm=0;for(i=0;i<40;i++)wm+=w[i];wm/=40;w=w.map(function(v){return v-wm;});
    var dot=0;for(i=0;i<40;i++)dot+=w[i]*ru[i];w=w.map(function(v,i2){return v-dot*ru[i2];});
    var wn=0;for(i=0;i<40;i++)wn+=w[i]*w[i];wn=Math.sqrt(wn);w=w.map(function(v){return v/wn;});
    var t=ru.map(function(v,i2){return cos*v+Math.sqrt(1-cos*cos)*w[i2];});
    var spec=new Float32Array(1024);
    for(i=0;i<1024;i++)spec[i]=-120;
    for(var j=0;j<40;j++){
      var a=Math.max(1,Math.min(1023,Math.round(AD_BANDS[j]/sr*2048)));
      var b=Math.max(a+1,Math.min(1024,Math.round(AD_BANDS[j+1]/sr*2048)));
      var db=20*Math.log10((Math.exp(t[j]+3)-1)/100);
      for(var k=a;k<b;k++)spec[k]=db;
    }
    return spec;
  }

  /* ---------- 桩：虚拟播放时钟 + 帧注入 ---------- */
  window.__seeks=[];var vct=0;
  Object.defineProperty(videoEl,"currentTime",{get:function(){return vct;},set:function(v){vct=v;window.__seeks.push(v);},configurable:true});
  Object.defineProperty(videoEl,"paused",{get:function(){return false;},configurable:true});
  Object.defineProperty(videoEl,"readyState",{get:function(){return 4;},configurable:true});
  Object.defineProperty(videoEl,"duration",{get:function(){return 3600;},configurable:true});
  var origDraw=CanvasRenderingContext2D.prototype.drawImage;
  window.__frame=null;
  CanvasRenderingContext2D.prototype.drawImage=function(){
    if(window.__frame&&this.canvas&&this.canvas.width===480&&this.canvas.height===270&&this.canvas!==window.__frame)
      return origDraw.call(this,window.__frame,0,0,480,270);
    return origDraw.apply(this,arguments);
  };

  /* ---------- 网络监控：广告跳过功能的代码路径不得发起任何请求 ---------- */
  window.__netlog=[];
  var origFetch=window.fetch;
  window.fetch=function(){window.__netlog.push({url:String(arguments[0]),stack:(new Error()).stack||""});return origFetch.apply(this,arguments);};
  var origXhrOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(){window.__netlog.push({url:String(arguments[1]),stack:(new Error()).stack||""});return origXhrOpen.apply(this,arguments);};
  if(navigator.sendBeacon){var origBeacon=navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon=function(u){window.__netlog.push({url:String(u),stack:(new Error()).stack||""});return origBeacon.apply(this,arguments);};}

  /* ---------- 开启功能并接管音频样本 ---------- */
  playerSettings.adSkip=true;
  adSkipStop();adSkipStart();
  var sr=(adS.actx&&adS.actx.sampleRate)||48000;
  window.__spec=spectrumFor(1,sr);
  if(!adS.actx){
    adS.actx={sampleRate:sr};
    adS.analyser={fftSize:2048,frequencyBinCount:1024,getFloatFrequencyData:function(a){a.set(window.__spec);}};
    adS.audioTimer=setInterval(adAudioTick,100);
  }else{
    adS.analyser.getFloatFrequencyData=function(a){a.set(window.__spec);};
  }
  adS.audioOk=true;adS.silent=0;
  await sleep(1300);
  rec("构造音频样本:余弦≈1 时指纹得分>0.95",adS.audio>0.95,"audio="+adS.audio.toFixed(3));
  rec("音频指纹窗口就绪",adS.audioReady===true,"");
  window.__spec=spectrumFor(0.5,sr);
  await sleep(1300);
  rec("构造音频样本:余弦≈0.5 时指纹得分 0.4~0.6",adS.audio>0.4&&adS.audio<0.6,"audio="+adS.audio.toFixed(3));
  window.__spec=spectrumFor(1,sr);
  await sleep(1300);

  /* ================= A. 全流水线：预热 → 直接判定 → 提示 → 取消 → 切集重置 ================= */
  window.__frame=frameAd;vct=0;window.__seeks=[];
  adS.warm=performance.now()+AD_BETA.warmupMs;
  await sleep(2500);
  rec("A1 预热期(3秒)内视觉音频同时超阈值也不跳转",window.__seeks.length===0,"seeks="+window.__seeks.length);
  var t0=performance.now();
  while(window.__seeks.length===0&&performance.now()-t0<2500)await sleep(100);
  rec("A2 预热结束后直接判定(按钮≥0.90且音频≥0.85)触发",window.__seeks.length===1,"seeks="+window.__seeks.length);
  rec("A2 跳转幅度固定 +15 秒",approx(vct,15,0.001),"vct="+vct);
  var undoEl=document.getElementById("adUndo");
  var txt=(document.getElementById("adUndoText")||{}).textContent||"";
  rec("A2 底部提示含起止时间",undoEl.classList.contains("show")&&txt.indexOf("00:00.0")>=0&&txt.indexOf("00:15.0")>=0,txt);
  window.__frame=frameWhite;
  await sleep(8600);
  rec("A3 提示保留 8 秒后消失",!undoEl.classList.contains("show"),"");
  adS.cool=0;window.__frame=frameAd;
  t0=performance.now();
  var n0=window.__seeks.length;
  while(window.__seeks.length===n0&&performance.now()-t0<2500)await sleep(100);
  rec("A4 再次命中后跳过(15→30)",window.__seeks.length===n0+1&&approx(vct,30,0.001),"vct="+vct);
  document.getElementById("adUndoBtn").click();
  rec("A4 取消后精确 seek 回跳转起点(30→15)",approx(vct,15,0.001),"vct="+vct);
  rec("A4 取消后本集标记为禁用",adS.disabledEp===playerEp,"disabledEp="+adS.disabledEp+" playerEp="+playerEp);
  adS.cool=0;window.__frame=frameAd;
  await sleep(2000);
  rec("A4 取消后本集不再自动跳过",window.__seeks.length===n0+2,"seeks="+window.__seeks.length);
  adSkipReset();
  rec("A5 切集重置:解除禁用并清零计数",adS.disabledEp===-1&&adS.jumps===0&&adS.hits===0&&adS.degHits===0,"");
  rec("A5 切集后重新进入 3 秒预热",adS.warm>performance.now()+2500,"");

  /* ================= B. 状态机单元级（采样器暂停，直接喂判定分数） ================= */
  clearInterval(adS.timer);adS.timer=null;
  window.__frame=frameWhite;
  adS.cool=0;adS.jumps=0;adS.disabledEp=-1;adS.audioOk=true;adS.audioReady=true;adS.audio=1;adS.hits=0;adS.degHits=0;
  vct=100;var s0=window.__seeks.length;
  adOnVision(0.88,1);
  rec("B1 累积判定:首次达标不跳",window.__seeks.length===s0&&adS.hits===1,"hits="+adS.hits);
  await sleep(400);adOnVision(0.88,1);
  rec("B1 累积判定:间隔<1秒的第二次不推进计数",window.__seeks.length===s0&&adS.hits===1,"hits="+adS.hits);
  await sleep(500);adOnVision(0.88,1);
  rec("B1 累积判定:间隔约1秒的连续第二次触发跳转",window.__seeks.length===s0+1&&approx(vct,115,0.001),"vct="+vct);
  adS.cool=0;adS.hits=0;s0=window.__seeks.length;
  adOnVision(0.88,1);adOnVision(0.1,0.1);adOnVision(0.88,1);
  rec("B2 累积判定:中间未达标则重新计数(不连续不跳)",window.__seeks.length===s0&&adS.hits===1,"hits="+adS.hits);
  adS.cool=0;adS.hits=0;adS.audio=1;s0=window.__seeks.length;
  adOnVision(0.95,0.5);
  rec("B3 直接判定:立即触发且不计入累积计数",window.__seeks.length===s0+1&&adS.hits===0,"");
  adS.cool=0;adS.hits=0;adS.audio=0.5;s0=window.__seeks.length;
  adOnVision(0.95,1);
  rec("B4 两路互不覆盖:音频<0.85 时按钮 0.95 也不跳",window.__seeks.length===s0&&adS.hits===0,"");
  adS.cool=0;adS.jumps=0;adS.audio=1;var base=vct;s0=window.__seeks.length;
  for(var i=0;i<4;i++){adOnVision(0.95,0.5);if(i<3)adS.cool=0;}
  rec("B5 同一集连续跳过 4 次、每次 +15 秒",window.__seeks.length===s0+4&&approx(vct,base+60,0.001),"vct="+vct);
  var coolLeft=adS.cool-performance.now();
  rec("B5 第 4 次后进入 10 分钟冷却",coolLeft>590000&&coolLeft<=600000,"cool="+Math.round(coolLeft)+"ms");
  window.__frame=frameAd;adS.warm=0;
  adS.timer=setInterval(adSample,AD_BETA.sampleMs);
  await sleep(1500);
  rec("B6 10 分钟冷却期间不再跳转",window.__seeks.length===s0+4,"seeks="+window.__seeks.length);
  clearInterval(adS.timer);adS.timer=null;adS.cool=0;adS.jumps=0;

  /* ================= C. 音频降级（全流水线） ================= */
  window.__spec=new Float32Array(1024).fill(-120);
  window.__frame=frameWhite;adS.audioOk=true;adS.silent=0;
  adS.timer=setInterval(adSample,AD_BETA.sampleMs);
  await sleep(3600);
  rec("C1 连续 3 秒频谱低于 -90dB 后降级为纯视觉",adS.audioOk===false,"audioOk="+adS.audioOk);
  adS.cool=0;adS.warm=0;adS.jumps=0;adS.degHits=0;s0=window.__seeks.length;
  window.__frame=frameAd;
  t0=performance.now();
  while(window.__seeks.length===s0&&performance.now()-t0<3000)await sleep(100);
  rec("C2 降级后 按钮≥0.95且配色≥0.85(连续确认) 触发",window.__seeks.length===s0+1,"vct="+vct);
  adS.cool=0;s0=window.__seeks.length;
  window.__frame=frameBorder;
  await sleep(2200);
  rec("C3 降级不放松:btn≈0.93/col≈0.80 边界帧不误跳",window.__seeks.length===s0,"");
  window.__frame=frameWhite;
  await sleep(1200);
  rec("C4 降级后正片帧不触发",window.__seeks.length===s0,"");

  /* ================= D. 关闭开关 ================= */
  adSkipStop();
  s0=window.__seeks.length;
  window.__frame=frameAd;
  await sleep(1500);
  rec("D1 关闭开关后完全不触发",window.__seeks.length===s0&&adS.on===false&&adS.timer===null&&adS.audioTimer===null,"");

  /* ================= E. 功能自身不产生网络请求 ================= */
  var adNet=window.__netlog.filter(function(e){return /adSample|adOnVision|adAudioTick|adSkip|adVision|adShowUndo|adWorker|adAudioStart/i.test(e.stack);});
  rec("E1 广告跳过功能未发起任何网络请求",adNet.length===0,
      "后台其他请求 "+window.__netlog.length+" 条(首页推荐/探测,与本功能无关);来自本功能 "+adNet.length+" 条");

  var fails=R.filter(function(r){return !r.ok;}).length;
  return {pass:fails===0,total:R.length,fails:fails,tests:R};
})()
