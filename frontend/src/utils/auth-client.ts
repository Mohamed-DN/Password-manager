// Client per autenticazione JWT tradizionale
// Il backend usa OAuth2PasswordRequestForm, non better-auth

export const authClient = {
    signIn: {
        email: async ({ email, password }: { email: string; password: string }) => {
            try {
                const formData = new URLSearchParams();
                formData.append('username', email); // OAuth2 usa 'username' non 'email'
                formData.append('password', password);

                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData,
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    return {
                        data: null,
                        error: { message: errorData.detail || 'Credenziali non valide' }
                    };
                }

                const data = await response.json();
                
                // Salva il token nel localStorage
                localStorage.setItem('token', data.access_token);
                localStorage.setItem('user', data.username);
                localStorage.setItem('fullName', data.full_name);

                return {
                    data: { user: data.username, fullName: data.full_name },
                    error: null
                };
            } catch (err) {
                return {
                    data: null,
                    error: { message: 'Errore di connessione al server' }
                };
            }
        }
    }
};
