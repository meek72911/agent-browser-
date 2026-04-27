use std::collections::HashMap;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};
use url::Url;

const TOOLBAR_HEIGHT: f64 = 80.0;

/// Stealth + ad-block init script — tab_id injected dynamically
const INIT_SCRIPT_TEMPLATE: &str = r##"
(function(){
    window.__VIBE_TAB_ID__ = '{{TAB_ID}}';

    // ── Stealth ──
    Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
    Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});
    Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});
    window.chrome={runtime:{}};
    delete window.__webdriver_evaluate;
    delete window.__webdriver_unwrapped;
    delete window.webdriver;
    delete window.$chrome_asyncScriptInfo;
    delete window.$cdc_asdjflasutopfhvcZLmcfl_;

    try {
        var orig=HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL=function(t){
            var ctx=this.getContext('2d');
            if(ctx){
                var img=ctx.getImageData(0,0,this.width,this.height);
                for(var i=0;i<img.data.length;i+=4){
                    img.data[i]=Math.max(0,Math.min(255,img.data[i]+(Math.random()>0.5?1:-1)));
                    img.data[i+1]=Math.max(0,Math.min(255,img.data[i+1]+(Math.random()>0.5?1:-1)));
                    img.data[i+2]=Math.max(0,Math.min(255,img.data[i+2]+(Math.random()>0.5?1:-1)));
                }
                ctx.putImageData(img,0,0);
            }
            return orig.apply(this,arguments);
        };
    }catch(e){}

    try {
        var origGP=WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter=function(p){
            if(p===37445) return 'Intel Inc.';
            if(p===37446) return 'Intel Iris OpenGL Engine';
            return origGP.apply(this,arguments);
        };
    }catch(e){}

    // ── Ad-block (cosmetic + dynamic via MutationObserver) ──
    try {
        var adRules = [
            // Google Ads
            '.adsbygoogle','ins.adsbygoogle','.adsbygoogle-noablate','.adsbygoogle-poweredby',
            '[data-ad-slot]','[data-ad-client]','[data-ad-format]',
            '[id*="google_ads"]','[id*="google_ads_iframe"]',
            '[class*="ad-container"]','[class*="ad-slot"]','[class*="ad-box"]',
            '[class*="ad-unit"]','[class*="ad-wrapper"]','[class*="ad-banner"]',
            '[class*="advertisement"]','[class*="ad-placeholder"]',
            '[class*="ad-placement"]','[class*="sponsored"]','[class*="sponsor"]',
            // Outbrain / Taboola
            '[class*="outbrain"]','[class*="taboola"]','[id*="outbrain"]','[id*="taboola"]',
            // Ad iframes
            'iframe[src*="doubleclick.net"]','iframe[src*="googlesyndication"]',
            'iframe[src*="googleadservices"]','iframe[src*="adservice"]',
            'iframe[src*="amazon-adsystem"]','iframe[src*="criteo"]',
            // Common ad classes
            '.ad','.ads','.advert','.ad-box','.ad-banner','.ad-wrapper',
            '[data-google-query-id]',
            // Popup / overlay ads
            '[class*="popup"]','[class*="modal"]','[class*="overlay"]',
            // Video ads
            '.video-ads','.ytp-ad-module','.ytp-ad-player-overlay',
            // Generic ad-related roles
            '[aria-label*="advertisement"]','[aria-label*="sponsored"]',
            // Social widgets that track
            'iframe[src*="facebook.com/plugins"]','iframe[src*="platform.twitter"]'
        ];
        var s=document.createElement('style');
        s.textContent = adRules.join(',') + '{display:none!important;height:0!important;overflow:hidden!important;position:absolute!important;clip:rect(0,0,0,0)!important;}';
        (document.head||document.documentElement).appendChild(s);
    }catch(e){}

    // ── Dynamic ad blocking via MutationObserver ──
    try{
        function hideAds(){
            adRules.forEach(function(sel){
                document.querySelectorAll(sel).forEach(function(el){
                    if(el.offsetParent!==null||el.style.display!=='none'){
                        el.style.setProperty('display','none','important');
                        el.style.setProperty('height','0','important');
                        el.style.setProperty('overflow','hidden','important');
                    }
                });
            });
        }
        hideAds();
        var adObs=new MutationObserver(function(muts){
            var hasAd=false;
            for(var i=0;i<muts.length;i++){
                if(muts[i].addedNodes.length>0){hasAd=true;break;}
            }
            if(hasAd) hideAds();
        });
        adObs.observe(document.documentElement,{childList:true,subtree:true});
    }catch(e){}

    // ── Content extraction with article scoring ──
    function extractContent(){
        try{
            // Fast path for standard pages (innerText covers most cases)
            var text=document.body.innerText||document.documentElement.innerText||'';
            var headings=[];
            document.querySelectorAll('h1,h2,h3').forEach(function(h){headings.push(h.innerText);});
            var links=[];
            document.querySelectorAll('a[href]').forEach(function(a){
                if(a.href&&a.href.startsWith('http')) links.push({text:a.innerText.trim().substring(0,100),href:a.href});
            });
            var metaDesc='';
            var metaEl=document.querySelector('meta[name="description"]');
            if(metaEl) metaDesc=metaEl.content;

            // Try to find main content using article/section scoring
            // This removes nav, sidebar, footer noise
            var mainContent='';
            var candidates=[];
            document.querySelectorAll('article,[role="main"],.post,.entry,.comment,.story').forEach(function(el){
                var score=0;
                var tag=el.tagName.toLowerCase();
                if(tag==='article') score+=20;
                if(el.querySelector('h1,h2')) score+=10;
                if(el.textContent.length>200) score+=5;
                var linkDensity=el.querySelectorAll('a').length/Math.max(1,el.textContent.length/100);
                score-=linkDensity*10;
                if(score>0) candidates.push({el:el,score:score,text:el.innerText||''});
            });
            candidates.sort(function(a,b){return b.score-a.score;});
            if(candidates.length>0&&candidates[0].text.length>300){
                mainContent=candidates[0].text;
            }

            // Prefer main content if found, otherwise fall back to innerText
            var finalText=mainContent||text;
            return {text:finalText.substring(0,50000),headings:headings.slice(0,20),links:links.slice(0,50),metaDescription:metaDesc};
        }catch(e){return {text:'',headings:[],links:[],metaDescription:''};}
    }

    // ── Report page title/URL/content to backend ──
    function report(){
        try{
            var content=extractContent();
            window.__TAURI__.event.emit('page-loaded',{
                tab_id: window.__VIBE_TAB_ID__,
                url: location.href,
                title: document.title||location.hostname,
                text: content.text,
                headings: content.headings,
                links: content.links,
                metaDescription: content.metaDescription
            });
        }catch(e){}
    }
    if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded',function(){setTimeout(report,200);});
    }else{
        setTimeout(report,200);
    }
    try{
        var obs=new MutationObserver(function(){
            try{window.__TAURI__.event.emit('page-title-updated',{
                tab_id: window.__VIBE_TAB_ID__,
                title: document.title
            });}catch(e){}
        });
        var el=document.querySelector('title');
        if(el) obs.observe(el,{childList:true,subtree:true,characterData:true});
    }catch(e){}

    // ── Download interception ──
    try{
        document.addEventListener('click',function(e){
            var a=e.target.closest('a[download]');
            if(a&&a.href){
                try{window.__TAURI__.event.emit('download-started',{
                    tab_id: window.__VIBE_TAB_ID__,
                    url: a.href,
                    filename: a.getAttribute('download')||'download',
                    guid: 'dl-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)
                });}catch(e){}
            }
        });
    }catch(e){}

    // ── Blocked ad counter ──
    try{
        function countBlocked(){
            var c=0;
            adRules.forEach(function(sel){
                try{c+=document.querySelectorAll(sel).length;}catch(e){}
            });
            if(c>0){
                try{window.__TAURI__.event.emit('ad-blocked',{count:c});}catch(e){}
            }
        }
        // Wait for page to settle, then count
        setTimeout(countBlocked,2000);
        setInterval(countBlocked,5000);
    }catch(e){}
})();
"##;

fn make_init_script(tab_id: &str) -> String {
    INIT_SCRIPT_TEMPLATE.replace("{{TAB_ID}}", tab_id)
}

#[derive(Clone)]
pub struct PageContent {
    pub text: String,
    pub headings: Vec<String>,
    pub links: Vec<serde_json::Value>,
    pub meta_description: String,
}

pub struct TabEntry {
    pub id: String,
    pub title: String,
    pub url: String,
    pub content: Option<PageContent>,
}

pub struct TabManager {
    next_id: u64,
    active_id: Option<String>,
    children: HashMap<String, tauri::Webview>,
    info: HashMap<String, TabEntry>,
    order: Vec<String>,
    tabs_visible: bool,
    content_w: f64,
    content_h: f64,
}

impl TabManager {
    pub fn new() -> Self {
        Self {
            next_id: 0,
            active_id: None,
            children: HashMap::new(),
            info: HashMap::new(),
            order: Vec::new(),
            tabs_visible: false,
            content_w: 1280.0,
            content_h: 720.0,
        }
    }

    pub fn normalize_url(url: &str) -> String {
        if url.is_empty() || url == "about:blank" {
            "about:blank".to_string()
        } else if url.starts_with("http://") || url.starts_with("https://") {
            url.to_string()
        } else {
            format!("https://{}", url)
        }
    }

    pub fn create_tab(&mut self, app: &AppHandle, url: &str) -> Result<String, String> {
        let id = format!("tab-{}", self.next_id);
        let window = app.get_window("main").ok_or("main window not found")?;

        let target = Self::normalize_url(url);
        let parsed = Url::parse(&target).map_err(|e| format!("bad url: {}", e))?;

        let child = window
            .add_child(
                WebviewBuilder::new(&id, WebviewUrl::External(parsed))
                    .initialization_script(&make_init_script(&id)),
                LogicalPosition::new(0.0, TOOLBAR_HEIGHT),
                LogicalSize::new(1.0, 1.0), // minimum valid size for WebView2
            )
            .map_err(|e| e.to_string())?;

        // Hide previous active tab (min 1x1 to avoid WebView2 crash)
        if let Some(old_id) = &self.active_id {
            if let Some(old) = self.children.get(old_id) {
                let _ = old.set_size(LogicalSize::new(1.0, 1.0));
            }
        }

        // Position new tab
        let _ = child.set_position(LogicalPosition::new(0.0, TOOLBAR_HEIGHT));
        if self.tabs_visible {
            let _ = child.set_size(LogicalSize::new(self.content_w, self.content_h));
        } else {
            let _ = child.set_size(LogicalSize::new(1.0, 1.0));
        }

        self.active_id = Some(id.clone());
        self.children.insert(id.clone(), child);
        self.info.insert(
            id.clone(),
            TabEntry {
                id: id.clone(),
                title: String::new(),
                url: target,
                content: None,
            },
        );
        self.order.push(id.clone());
        self.next_id += 1;

        Ok(id)
    }

    pub fn is_visible(&self) -> bool {
        self.tabs_visible
    }

    pub fn switch_tab(&mut self, id: &str) -> Result<(), String> {
        if self.active_id.as_deref() == Some(id) {
            return Ok(());
        }
        if !self.children.contains_key(id) {
            return Err(format!("tab {} not found", id));
        }

        // Hide old tab (min 1x1 to avoid WebView2 crash)
        if let Some(old_id) = &self.active_id {
            if let Some(old) = self.children.get(old_id) {
                let _ = old.set_size(LogicalSize::new(1.0, 1.0));
            }
        }

        // Show new tab (respect visibility state)
        if let Some(webview) = self.children.get(id) {
            let _ = webview.set_position(LogicalPosition::new(0.0, TOOLBAR_HEIGHT));
            if self.tabs_visible {
                let _ = webview.set_size(LogicalSize::new(self.content_w, self.content_h));
            } else {
                let _ = webview.set_size(LogicalSize::new(1.0, 1.0));
            }
            self.active_id = Some(id.to_string());
            Ok(())
        } else {
            Err(format!("tab {} not found", id))
        }
    }

    pub fn close_tab(&mut self, id: &str, app: &AppHandle) -> Result<Option<String>, String> {
        if !self.children.contains_key(id) {
            return Err(format!("tab {} not found", id));
        }
        if self.children.len() <= 1 {
            return Err("cannot close last tab".into());
        }

        self.info.remove(id);
        self.order.retain(|x| x != id);
        let was_active = self.active_id.as_deref() == Some(id);

        if let Some(wv) = self.children.remove(id) {
            let _ = wv.close();
        }

        if was_active {
            // Pick the tab at the same index, or the last one
            let next_id = self.order.first().cloned();
            if let Some(ref next) = next_id {
                let visible_before = self.tabs_visible;
                self.switch_tab(next)?;
                self.tabs_visible = visible_before; // restore overlay state
                let entry = self.info.get(next);
                let empty_str = "".to_string();
                let _ = app.emit(
                    "tab-activated",
                    serde_json::json!({
                        "tab_id": next,
                        "url": entry.map(|e| &e.url).unwrap_or(&empty_str),
                        "title": entry.map(|e| &e.title).unwrap_or(&empty_str),
                    }),
                );
            }
            Ok(next_id)
        } else {
            Ok(self.active_id.clone())
        }
    }

    pub fn active_id(&self) -> Option<&str> {
        self.active_id.as_deref()
    }

    pub fn update_tab_url(&mut self, id: &str, url: &str) {
        if let Some(entry) = self.info.get_mut(id) {
            entry.url = url.to_string();
        }
    }

    pub fn update_tab_title(&mut self, id: &str, title: &str) {
        if let Some(entry) = self.info.get_mut(id) {
            entry.title = title.to_string();
        }
    }

    pub fn update_tab_content(&mut self, id: &str, text: &str, headings: Vec<String>, links: Vec<serde_json::Value>, meta_desc: &str) {
        if let Some(entry) = self.info.get_mut(id) {
            entry.content = Some(PageContent {
                text: text.to_string(),
                headings,
                links,
                meta_description: meta_desc.to_string(),
            });
        }
    }

    pub fn get_tab_content(&self, id: &str) -> Option<&PageContent> {
        self.info.get(id).and_then(|e| e.content.as_ref())
    }

    pub fn update_active_url(&mut self, url: &str) {
        let id = self.active_id.clone();
        if let Some(ref id) = id {
            self.update_tab_url(id, url);
        }
    }

    pub fn list_tabs(&self) -> Vec<String> {
        self.order.clone()
    }

    pub fn tab_info(&self, id: &str) -> Option<&TabEntry> {
        self.info.get(id)
    }

    pub fn navigate(&self, id: &str, url: &str) -> Result<(), String> {
        let wv = self.children.get(id).ok_or("tab not found")?;
        let target = Self::normalize_url(url);
        let parsed = Url::parse(&target).map_err(|e| format!("bad url: {}", e))?;
        wv.navigate(parsed).map_err(|e| e.to_string())
    }

    pub fn navigate_active(&self, url: &str) -> Result<(), String> {
        let id = self.active_id.as_deref().ok_or("no active tab")?;
        self.navigate(id, url)
    }

    pub fn back(&self, id: &str) -> Result<(), String> {
        let wv = self.children.get(id).ok_or("tab not found")?;
        wv.eval("history.back()").map_err(|e| e.to_string())
    }

    pub fn forward(&self, id: &str) -> Result<(), String> {
        let wv = self.children.get(id).ok_or("tab not found")?;
        wv.eval("history.forward()").map_err(|e| e.to_string())
    }

    pub fn reload(&self, id: &str) -> Result<(), String> {
        let wv = self.children.get(id).ok_or("tab not found")?;
        wv.eval("location.reload()").map_err(|e| e.to_string())
    }

    pub fn eval(&self, id: &str, js: &str) -> Result<(), String> {
        let wv = self.children.get(id).ok_or("tab not found")?;
        wv.eval(js).map_err(|e| e.to_string())
    }

    pub fn eval_on_active(&self, js: &str) -> Result<(), String> {
        let id = self.active_id.as_deref().ok_or("no active tab")?;
        self.eval(id, js)
    }

    pub fn navigate_all(&self, app: &AppHandle) {
        let _ = app.emit("navigation-started", ());
    }

    pub fn resize_all(&mut self, width: f64, height: f64) {
        self.content_w = width;
        self.content_h = (height - TOOLBAR_HEIGHT).max(100.0);
        if let Some(ref id) = self.active_id {
            if self.tabs_visible {
                if let Some(wv) = self.children.get(id) {
                    let _ = wv.set_position(LogicalPosition::new(0.0, TOOLBAR_HEIGHT));
                    let _ = wv.set_size(LogicalSize::new(self.content_w, self.content_h));
                }
            }
        }
    }

    pub fn hide_active(&mut self) {
        self.tabs_visible = false;
        if let Some(ref id) = self.active_id {
            if let Some(wv) = self.children.get(id) {
                let _ = wv.set_size(LogicalSize::new(1.0, 1.0));
            }
        }
    }

    pub fn show_active(&mut self) {
        self.tabs_visible = true;
        if let Some(ref id) = self.active_id {
            if let Some(wv) = self.children.get(id) {
                let _ = wv.set_position(LogicalPosition::new(0.0, TOOLBAR_HEIGHT));
                let _ = wv.set_size(LogicalSize::new(self.content_w, self.content_h));
            }
        }
    }

    pub fn session_data(&self) -> Vec<serde_json::Value> {
        self.order
            .iter()
            .map(|id| {
                let entry = self.info.get(id);
                let empty_str = "".to_string();
                let new_tab_str = "New Tab".to_string();
                serde_json::json!({
                    "id": id,
                    "url": entry.map(|e| &e.url).unwrap_or(&empty_str),
                    "title": entry.map(|e| &e.title).unwrap_or(&new_tab_str),
                    "active": self.active_id.as_deref() == Some(id),
                })
            })
            .collect()
    }
}
