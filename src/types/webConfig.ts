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

export interface WebConfig {
    includeCorsCredentials?: boolean
    multiserver?: boolean
    themes?: Theme[]
    menuLinks?: MenuLink[]
    servers?: string[]
    plugins?: string[]
    /** Optional self-hosted short clips, scoped by Jellyfin server and item IDs. */
    /** Disable optional Moonbase/Seerr discovery globally. */
    clientSeerr?: boolean
    clientPreviews?: Record<string, Record<string, string>>
}
