export const DISMISSED_KEY = 'praetorium-apps-dismissed'

/**
 * Runs in the document head before the first paint: a band already dismissed is never drawn while the page hydrates,
 * and a phone's platform is known before the band picks which store to show.
 */
export const APPS_SCRIPT = `try{var d=document.documentElement;if(localStorage.getItem(${JSON.stringify(DISMISSED_KEY)})==='true')d.dataset.appsDismissed='true';var u=navigator.userAgent;d.dataset.platform=/iPhone|iPad|iPod/.test(u)?'ios':/Android/.test(u)?'android':''}catch(e){}`
