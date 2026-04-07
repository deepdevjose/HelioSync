const AUTH_MESSAGES = {
  'es-MX': {
    'auth/email-already-in-use': 'Este correo ya está conectado a una cuenta de HelioSync.',
    'auth/invalid-credential': 'El correo o la contraseña no coinciden con nuestros registros.',
    'auth/invalid-email': 'Escribe un correo válido.',
    'auth/missing-password': 'Agrega una contraseña para continuar.',
    'auth/popup-closed-by-user': 'El acceso con Google se cerró antes de terminar.',
    'auth/popup-blocked': 'Permite ventanas emergentes para continuar con Google.',
    'auth/too-many-requests': 'Hubo demasiados intentos. Inténtalo de nuevo en un momento.',
    'auth/user-not-found': 'No encontramos una cuenta con ese correo.',
    'auth/weak-password': 'Elige una contraseña más fuerte de al menos 8 caracteres.',
  },
  en: {
    'auth/email-already-in-use': 'This email is already connected to a HelioSync account.',
    'auth/invalid-credential': 'The email or password does not match our records.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/missing-password': 'Add a password to continue.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/popup-blocked': 'Allow popups for this site to continue with Google sign-in.',
    'auth/too-many-requests': 'Too many attempts. Try again in a moment.',
    'auth/user-not-found': 'We could not find an account with that email.',
    'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
  },
};

export function getAuthErrorMessage(error, locale = 'en', fallback = 'Something went wrong. Please try again.') {
  if (!error) {
    return fallback;
  }

  return AUTH_MESSAGES[locale]?.[error.code] || AUTH_MESSAGES.en[error.code] || fallback;
}
