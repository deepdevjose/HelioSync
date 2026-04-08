const AUTH_MESSAGES = {
  'es-MX': {
    'permission-denied': 'Firebase dejó entrar tu sesión, pero Firestore rechazó guardar tu perfil. Publica las reglas de producción para users y userSetups.',
    unavailable: 'No pudimos hablar con Firebase por ahora. Revisa tu conexión e inténtalo de nuevo.',
    'failed-precondition': 'Firebase todavía no está listo para esta operación. Revisa la configuración del proyecto y las reglas.',
    'auth/account-exists-with-different-credential': 'Ese correo ya existe con otro método de acceso. Entra con tu método original y luego vincula Google si lo necesitas.',
    'auth/email-already-in-use': 'Este correo ya está conectado a una cuenta de HelioSync.',
    'auth/invalid-credential': 'El correo o la contraseña no coinciden con nuestros registros.',
    'auth/invalid-email': 'Escribe un correo válido.',
    'auth/missing-password': 'Agrega una contraseña para continuar.',
    'auth/operation-not-allowed': 'Este método de acceso todavía no está habilitado en Firebase Auth.',
    'auth/popup-closed-by-user': 'El acceso con Google se cerró antes de terminar.',
    'auth/popup-blocked': 'Permite ventanas emergentes para continuar con Google.',
    'auth/too-many-requests': 'Hubo demasiados intentos. Inténtalo de nuevo en un momento.',
    'auth/unauthorized-domain': 'Este dominio todavía no está autorizado en Firebase Auth.',
    'auth/user-not-found': 'No encontramos una cuenta con ese correo.',
    'auth/weak-password': 'Elige una contraseña más fuerte de al menos 8 caracteres.',
  },
  en: {
    'permission-denied': 'Firebase signed the session in, but Firestore rejected saving the profile. Publish the production rules for users and userSetups.',
    unavailable: 'We could not reach Firebase right now. Check your connection and try again.',
    'failed-precondition': 'Firebase is not ready for this operation yet. Check project configuration and rules.',
    'auth/account-exists-with-different-credential': 'This email already exists with another sign-in method. Sign in with the original method first, then link Google if needed.',
    'auth/email-already-in-use': 'This email is already connected to a HelioSync account.',
    'auth/invalid-credential': 'The email or password does not match our records.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/missing-password': 'Add a password to continue.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Auth yet.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/popup-blocked': 'Allow popups for this site to continue with Google sign-in.',
    'auth/too-many-requests': 'Too many attempts. Try again in a moment.',
    'auth/unauthorized-domain': 'This domain is not authorized in Firebase Auth yet.',
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
