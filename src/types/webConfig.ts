export interface Theme {
    name: string
    default?: boolean;
    id: string
    color: string
}

export interface MenuLink {
    name: string
    icon?: string
    url: string
}

/** Alternative encodes of the same approved scene, not different source scenes. */
export type ClientPreviewSource = string | { compact?: string; full?: string };
export type ClientPreviewSources = Record<string, ClientPreviewSource>;

export interface WebConfig {
    includeCorsCredentials?: boolean
    multiserver?: boolean
    themes?: Theme[]
    menuLinks?: MenuLink[]
    servers?: string[]
    plugins?: string[]
    /** Disable optional Moonbase/Seerr discovery globally. */
    clientSeerr?: boolean
    /** Optional self-hosted short clips, scoped by Jellyfin server and item IDs. */
    clientPreviews?: Record<string, ClientPreviewSources>
}
