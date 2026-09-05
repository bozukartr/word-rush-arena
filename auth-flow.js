// Keep OAuth recovery separate so every failure (including redirect) is caught.
export function authErrorMessage(error) {
  const messages = {
    "auth/popup-blocked": "Giriş penceresi engellendi. Tarayıcıda açılır pencerelere izin verip tekrar dene.",
    "auth/unauthorized-domain": "Bu adres Google girişi için yetkilendirilmemiş. Firebase Authentication alan adı ayarı gerekli.",
    "auth/operation-not-allowed": "Google giriş sağlayıcısı Firebase Authentication ayarlarında etkinleştirilmeli.",
    "auth/network-request-failed": "Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.",
    "auth/web-storage-unsupported": "Giriş için tarayıcı depolama izni gerekli. Safari veya Chrome üzerinden tekrar dene.",
    "auth/operation-not-supported-in-this-environment": "Google girişi için oyunu Safari veya Chrome üzerinden aç.",
    "auth/account-exists-with-different-credential": "Bu e-posta başka bir giriş yöntemiyle kayıtlı. Önce o yöntemle giriş yap.",
    "auth/too-many-requests": "Çok fazla giriş denemesi yapıldı. Biraz sonra tekrar dene."
  };
  return messages[error?.code] ?? "Giriş tamamlanamadı. Lütfen tekrar dene.";
}

export async function recoverGoogleLogin(error, options) {
  if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error.code)) return;
  if (error.code === "auth/credential-already-in-use") {
    const credential = options.credentialFromError(error);
    if (!credential) throw error;
    if (await options.confirmSwitch()) await options.signInExisting(credential);
    return;
  }
  // Cross-origin redirect can silently lose its result on Safari and Chrome.
  // Only use it when the Firebase auth helper shares the game's origin.
  if (error.code === "auth/popup-blocked" && options.canRedirect) {
    await options.redirect();
    return;
  }
  throw error;
}
