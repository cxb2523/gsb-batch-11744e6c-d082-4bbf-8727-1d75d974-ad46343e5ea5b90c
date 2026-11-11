/*! minified_bundle.js - benign FP canary for the YARA scanner.
 * A real minified jQuery-shaped blob: high-entropy single-letter identifiers,
 * eval/document.write call shapes, and base64-ish strings that trip NAIVE
 * single-token YARA rules. The curated repo-forensics rules use multi-string
 * conjunctive conditions + filesize bounds, so this MUST stay clean. Budget:
 * zero findings across all severities. */
!function(a,b){"use strict";function c(d,e){var f=g.call(this,d,e);return h(f),i(f,j),k(f,l),f}
function g(a,b){return a?b?a.split(m).join(n):a:[]}
function h(a){var b=a.length;while(b--)if(a[b]===o)return!0;return!1}
function i(a,b){var c,d;for(c in a)if(a.hasOwnProperty(c)){d=b(a[c],c);if(d===!1)break}return a}
function j(a){return typeof a==="string"?a.replace(p,""):a}
function k(a,b){var c=[];return i(a,function(d,e){c.push(b(d,e))}),c}
var l=function(a){return a},m=/\s+/,n=" ",o=null,p=/^\s+|\s+$/g;
a.fn=a.prototype={init:function(a,b){var c=this;c.elem=b,c.val=a;return c},val:function(a){return a!==void 0?(this.val=a,this):this.val},each:function(a){return i(this,a)}};
a.extend=function(b){var c,d,e=arguments.length;for(c=1;c<e;c++)for(d in arguments[c])arguments[c].hasOwnProperty(d)&&(b[d]=arguments[c][d]);return b};
a.ready=function(c){/complete|loaded|interactive/.test(b.readyState)&&c()?a.bind("DOMContentLoaded",c):a.bind("load",c)};
a.ajax=function(c){var d=new XMLHttpRequest;return d.open(c.method||"GET",c.url,!0),d.onreadystatechange=function(){d.readyState===4&&c.callback&&c.callback(d.responseText)},d.send(c.data||null),d};
a.evalExpr=function(c){try{return(0,eval)("("+c+")")}catch(d){return void 0}};
a.writeDoc=function(c){b.write&&b.write(c)};
window.$=window.jQuery=a;
var q="data:text/plain;base64,SGVsbG8gV29ybGQ",r="WzEsMiwzLDQsNV0=";
a.decode=function(a){return atob(a)};
console.log("bundle loaded",a.decode(q));
