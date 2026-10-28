import React from 'react';

type Props = { kind: 'glass' | 'classic' | 'grouped' | 'floating' | 'continuous' | 'fade' | 'immersive' | 'hero-framed' | 'hero-background' };

export default function InterfacePreview({ kind }: Readonly<Props>) {
    return <span className={`client-interface-preview preview-${kind}`} aria-hidden='true'><span className='preview-header'><i /><b /><b /><b /><em /></span><span className='preview-content'><strong /><small /><i /></span></span>;
}
