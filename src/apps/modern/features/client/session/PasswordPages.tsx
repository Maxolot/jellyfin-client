/* eslint-disable react/jsx-no-bind -- Forms are local to these pages. */
import { ForgotPasswordAction } from '@jellyfin/sdk/lib/generated-client/models/forgot-password-action';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import ServerConnections from 'lib/jellyfin-apiclient/ServerConnections';
import { getAuthenticationApi } from 'utils/sdk/authentication-api';
import { isValidUrl } from 'utils/url';

import SessionPage from './SessionPage';

/** What to tell someone who asked for a reset, from the server's answer. */
export function forgotPasswordOutcome(action: ForgotPasswordAction | undefined, pinFile: string | null | undefined) {
    if (action === ForgotPasswordAction.PinCode) {
        if (pinFile && isValidUrl(pinFile)) return { message: 'Suivez le lien ouvert dans un nouvel onglet pour récupérer le code.', pinUrl: pinFile, askPin: true };
        return { message: `Un code a été créé sur le serveur, dans ce fichier : ${pinFile || ''}. Demandez-le à la personne qui l’administre.`, askPin: true };
    }
    if (action === ForgotPasswordAction.InNetworkRequired) return { message: 'Cette demande ne peut se faire que depuis le réseau local du serveur.', askPin: false };
    return { message: 'Contactez la personne qui administre le serveur pour réinitialiser votre mot de passe.', askPin: false };
}

export function ForgotPasswordPage() {
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [outcome, setOutcome] = useState<ReturnType<typeof forgotPasswordOutcome>>();
    const [problem, setProblem] = useState('');
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const api = ServerConnections.getApi();
        if (!api) return;
        setBusy(true);
        setProblem('');
        try {
            const { data } = await getAuthenticationApi(api).forgotPassword({ forgotPasswordDto: { EnteredUsername: name } });
            const next = forgotPasswordOutcome(data.Action, data.PinFile);
            if (next.pinUrl) window.open(next.pinUrl, '_blank', 'noopener,noreferrer');
            setOutcome(next);
        } catch {
            setProblem('Le serveur est injoignable. Réessayez dans un instant.');
        } finally {
            setBusy(false);
        }
    }
    return <SessionPage title='Mot de passe oublié'>
        <form className='client-profile-form' onSubmit={submit}>
            <h1>Mot de passe oublié</h1>
            {outcome ? <p role='status'>{outcome.message}</p> : <label>Nom d’utilisateur<input autoComplete='username' value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>}
            {problem && <p role='alert' className='client-profile-error'>{problem}</p>}
            {!outcome && <button type='submit' className='client-profile-primary' disabled={busy || !name.trim()}>Continuer</button>}
            {outcome?.askPin && <Link className='client-profile-primary client-session-button' to='/forgotpasswordpin'>J’ai le code</Link>}
            <Link className='client-session-link' to='/login'>Retour à la connexion</Link>
        </form>
    </SessionPage>;
}

export function ForgotPasswordPinPage() {
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [reset, setReset] = useState<string[]>();
    const [problem, setProblem] = useState('');
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const client = ServerConnections.currentApiClient();
        if (!client) return;
        setBusy(true);
        setProblem('');
        try {
            const result = await client.ajax({ type: 'POST', url: client.getUrl('Users/ForgotPassword/Pin'), dataType: 'json', data: JSON.stringify({ Pin: pin }), contentType: 'application/json' });
            if (result.Success) setReset(result.UsersReset || []);
            else setProblem('Ce code n’est pas valable.');
        } catch (error) {
            // The server answers a wrong code with "not found".
            setProblem((error as { status?: number }).status === 404 ? 'Ce code n’est pas valable.' : 'Le serveur est injoignable. Réessayez dans un instant.');
        } finally {
            setBusy(false);
        }
    }
    return <SessionPage title='Réinitialiser le mot de passe'>
        <form className='client-profile-form' onSubmit={submit}>
            <h1>Réinitialiser le mot de passe</h1>
            {reset ? <p role='status'>Mot de passe réinitialisé pour : {reset.join(', ')}. Connectez-vous sans mot de passe, puis choisissez-en un dans les paramètres.</p> : <>
                <label>Code<input inputMode='numeric' autoComplete='one-time-code' value={pin} disabled={busy} onChange={event => setPin(event.target.value)} /></label>
                {problem && <p role='alert' className='client-profile-error'>{problem}</p>}
                <button type='submit' className='client-profile-primary' disabled={busy || !pin.trim()}>Réinitialiser</button>
            </>}
            <Link className='client-session-link' to='/login'>Retour à la connexion</Link>
        </form>
    </SessionPage>;
}
/* eslint-enable react/jsx-no-bind */
