// Elige la ayuda, los créditos y la biografía del idioma en uso.
import {getLang} from '../i18n.js';
import es from './es.js';
import en from './en.js';
import fr from './fr.js';
import pt from './pt.js';

export const HELP_BY_LANG = {es, en, fr, pt};
export const HELP = HELP_BY_LANG[getLang()] || en;
