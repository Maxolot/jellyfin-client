declare module '*.png' {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value: any;
    export = value;
}

declare module '*.svg' {
    // Images are emitted by the bundler, which gives back their address.
    const value: string;
    export default value;
}

declare module '*.scss' {
    // style imports are handled by the bundler
    const value: string;
    export default value;
}
