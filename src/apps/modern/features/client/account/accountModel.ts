import type { CultureDto, UserConfiguration } from '@jellyfin/sdk/lib/generated-client';

export const SUBTITLE_MODES = [
    ['Default', 'Par défaut', 'Selon les pistes marquées « par défaut » ou « forcées » dans le fichier ; votre langue départage plusieurs choix.'],
    ['Smart', 'Intelligent', 'Sous-titres dans la langue préférée seulement quand l’audio est dans une langue étrangère.'],
    ['OnlyForced', 'Forcés uniquement', 'Seulement les sous-titres marqués comme forcés (panneaux, dialogues étrangers).'],
    ['Always', 'Toujours', 'Sous-titres dans la langue préférée, quelle que soit la langue de l’audio.'],
    ['None', 'Aucun', 'Aucun sous-titre au démarrage ; vous pouvez toujours en choisir pendant la lecture.']
] as const;

/** Bitrate ceilings offered by the native client, in bits per second. */
export const BITRATES = [120e6, 80e6, 60e6, 40e6, 20e6, 15e6, 10e6, 8e6, 6e6, 4e6, 3e6, 1.5e6, 720e3, 420e3];

export const VIDEO_WIDTHS = [['0', 'Automatique'], ['3840', '4K'], ['1920', '1080p'], ['1280', '720p'], ['854', '480p']] as const;
export const AUDIO_CHANNELS = [['-1', 'Automatique'], ['8', '7.1'], ['6', '5.1'], ['2', 'Stéréo'], ['1', 'Mono']] as const;
export const TRANSCODE_VIDEO_CODECS = [['', 'Automatique'], ['h264', 'H.264'], ['hevc', 'HEVC'], ['av1', 'AV1'], ['vp9', 'VP9']] as const;
export const TRANSCODE_AUDIO_CODECS = [['', 'Automatique'], ['aac', 'AAC'], ['ac3', 'Dolby Digital (AC3)'], ['eac3', 'Dolby Digital Plus'], ['opus', 'Opus'], ['flac', 'FLAC']] as const;
export const STILL_WATCHING = [['disabled', 'Jamais'], ['short', 'Après 1 h ou 2 épisodes'], ['default', 'Après 1 h 30 ou 3 épisodes'], ['long', 'Après 2 h 30 ou 5 épisodes'], ['veryLong', 'Après 4 h ou 8 épisodes']] as const;
export const NEXT_UP_DAYS = [['0', 'Sans limite'], ['30', '30 jours'], ['90', '3 mois'], ['180', '6 mois'], ['365', '1 an']] as const;

export function formatBitrate(bitrate: number) {
    if (bitrate >= 1e6) return `${(bitrate / 1e6).toLocaleString('fr-FR')} Mbit/s`;
    return `${Math.round(bitrate / 1e3)} kbit/s`;
}

/** Only the fields edited by the client change; the rest of the server configuration is preserved. */
export function mergeConfiguration(current: UserConfiguration, patch: Partial<UserConfiguration>): UserConfiguration {
    const next = { ...current };
    for (const [key, value] of Object.entries(patch) as [keyof UserConfiguration, unknown][]) {
        if (value !== undefined) (next as Record<string, unknown>)[key] = value;
    }
    return next;
}

export function passwordProblem(current: string, next: string, confirmation: string, hasPassword: boolean) {
    if (hasPassword && !current) return 'Saisissez votre mot de passe actuel.';
    if (next !== confirmation) return 'Les deux nouveaux mots de passe ne correspondent pas.';
    if (!next) return 'Un mot de passe vide retirerait la protection du compte.';
    if (next === current) return 'Le nouveau mot de passe doit être différent de l’actuel.';
    return '';
}

/** Quick Connect codes are six digits; spaces and dashes typed by users are ignored. */
export function normalizeQuickConnectCode(value: string) {
    const code = value.replace(/[\s-]/g, '');
    return /^\d{6}$/.test(code) ? code : '';
}

export function avatarProblem(file: File) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return 'Choisissez une image PNG, JPEG, WebP ou GIF.';
    if (file.size > 10 * 1024 * 1024) return 'L’image dépasse 10 Mo.';
    return '';
}

function frenchName(code: string | null | undefined, fallback: string) {
    try {
        const name = code ? new Intl.DisplayNames(['fr'], { type: 'language' }).of(code) : '';
        return name && name !== code ? name.charAt(0).toUpperCase() + name.slice(1) : fallback;
    } catch {
        return fallback;
    }
}

/** Server cultures with French names; a stored code missing from the list stays selectable. */
export function languageOptions(cultures: CultureDto[], current: string | null | undefined): [string, string][] {
    const options = new Map<string, string>();
    for (const culture of cultures) {
        const code = culture.ThreeLetterISOLanguageName;
        if (code && !options.has(code)) options.set(code, frenchName(culture.TwoLetterISOLanguageName, culture.DisplayName || code));
    }
    if (current && !options.has(current)) {
        const known = cultures.find(culture => culture.ThreeLetterISOLanguageNames?.includes(current));
        options.set(current, known ? frenchName(known.TwoLetterISOLanguageName, current) : current);
    }
    return [['', 'Aucune préférence'], ...[...options].sort((a, b) => a[1].localeCompare(b[1], 'fr'))];
}
