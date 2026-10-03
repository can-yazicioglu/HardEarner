import translations from './translations.json';
import researchTranslations from './research-translations.json';
import{ageParts}from'../electron/purchase-age.cjs';
export const LANGUAGES={en:'English',tr:'Türkçe',es:'Español',ru:'Русский',fr:'Français',de:'Deutsch'};
const locales={en:'en-GB',tr:'tr-TR',es:'es-ES',ru:'ru-RU',fr:'fr-FR',de:'de-DE'};
let language='en';
export function setLanguage(value){language=LANGUAGES[value]?value:'en';if(typeof document!=='undefined')document.documentElement.lang=language;}
export function getLocale(){return locales[language];}
export function t(text){if(typeof text!=='string'||language==='en')return text;const key=text.trim();const value=researchTranslations[key]?.[language]??translations[key]?.[language];return value==null?text:text.replace(key,value);}
export function ageLabel(date){const a=ageParts(date);if(!a)return t('Purchase date not recorded');if(a.days===0)return t('Bought today');const unit=a.years>0?'year':a.months>0?'month':'day',value=a.years||a.months||a.days;return new Intl.RelativeTimeFormat(getLocale(),{numeric:'always'}).format(-value,unit);}

export function dateLabel(date){return date?new Date(date+'T12:00:00').toLocaleDateString(getLocale(),{day:'numeric',month:'short',year:'numeric'}):t('Purchase date not recorded');}
