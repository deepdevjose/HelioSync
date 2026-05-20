const AUTH_MESSAGES = {
  'es-MX': {
    'permission-denied': 'La NUBE dejó entrar tu sesión, pero no pudo guardar tu perfil. Inténtalo de nuevo más tarde.',
    unavailable: 'No pudimos hablar con la nube por ahora. Revisa tu conexión e inténtalo de nuevo.',
    'failed-precondition': 'La NUBE todavía no está lista para esta operación. Inténtalo de nuevo más tarde.',
    'auth/account-exists-with-different-credential': 'Ese correo ya existe con otro método de acceso. Entra con tu método original y luego vincula Google si lo necesitas.',
    'auth/email-already-in-use': 'Este correo ya está conectado a una cuenta de HelioSync.',
    'auth/invalid-credential': 'El correo o la contraseña no coinciden con nuestros registros.',
    'auth/invalid-email': 'Escribe un correo válido.',
    'auth/missing-password': 'Agrega una contraseña para continuar.',
    'auth/operation-not-allowed': 'Este método de acceso todavía no está habilitado en la nube.',
    'auth/popup-closed-by-user': 'El acceso con Google se cerró antes de terminar.',
    'auth/popup-blocked': 'Permite ventanas emergentes para continuar con Google.',
    'auth/too-many-requests': 'Hubo demasiados intentos. Inténtalo de nuevo en un momento.',
    'auth/unauthorized-domain': 'Este dominio todavía no está autorizado en la nube.',
    'auth/user-not-found': 'No encontramos una cuenta con ese correo.',
    'auth/weak-password': 'Elige una contraseña más fuerte de al menos 8 caracteres.',
  },
};

export function getAuthErrorMessage(error, locale = 'es-MX', fallback = 'Algo salió mal. Inténtalo de nuevo.') {
  if (!error) {
    return fallback;
  }

  return AUTH_MESSAGES[locale]?.[error.code] || AUTH_MESSAGES['es-MX'][error.code] || fallback;
}
