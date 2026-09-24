// One-shot "Shadow Garden is now Motion Garden" video for visitors who knew the
// old name. React-free so the pre-paint script (app/layout.tsx) and the client
// modal (components/shell/RenameAnnouncement.tsx) share one set of constants.

/** localStorage verdict: "new" (first visit came after the rename — never
 *  show), "seen" (shown once). Absent means undecided. */
export const RENAME_KEY = "sg-rename-v1";

/** Stamped on <html> by the pre-paint script for a returning visitor who
 *  hasn't seen the announcement. Value "force" skips the seen check
 *  (`?sg-rename` replays it, same idiom as `?sg-intro`). */
export const RENAME_ATTR = "data-sg-rename";

export const RENAME_VIDEO = "/announcements/motion-garden.mp4";
export const RENAME_POSTER = "/announcements/motion-garden-poster.webp";

// Keys only a browser that used the site before the rename can hold. The `sg`
// prefix outlived the old name on purpose, so these are exactly the old keys.
// Most are written on first interaction, not first visit — a visitor who only
// ever looked, in another session, carries none and is treated as new. That
// under-count is the price of never showing the video to someone who never
// knew the old name.
const LEGACY_LOCAL = [
	"sg-ui",
	"sg-favorites",
	"sg-locale",
	"sg-audio",
	"sg-cookbook-flame",
	"sg_anon_id",
];
// Same tab, session begun before the deploy (the intro stamps this per session).
const LEGACY_SESSION = ["sg-intro-v1"];

/**
 * Must run before any app code can write a storage key — otherwise a first-time
 * visitor's own zustand writes would read as "returning" on their next visit.
 * That is why the verdict for a new visitor is recorded here, pre-paint, rather
 * than in the component. Skipped inside the template iframes.
 */
export function renameAnnouncementScript(): string {
	return `try{
if(location.pathname.indexOf('/templates/')!==0&&window.top===window.self){
var d=document.documentElement,ls=localStorage;
if(location.search.indexOf('sg-rename')>-1){d.setAttribute('${RENAME_ATTR}','force')}
else if(ls.getItem('${RENAME_KEY}')===null){
var old=${JSON.stringify(LEGACY_LOCAL)}.some(function(k){return ls.getItem(k)!==null});
if(!old){try{var ss=sessionStorage;old=${JSON.stringify(LEGACY_SESSION)}.some(function(k){return ss.getItem(k)!==null})}catch(e){}}
if(old){d.setAttribute('${RENAME_ATTR}','')}else{ls.setItem('${RENAME_KEY}','new')}
}}}catch(e){}`.replace(/\n/g, "");
}
