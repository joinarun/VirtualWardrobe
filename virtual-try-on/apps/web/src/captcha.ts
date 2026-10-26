type CaptchaApi = {
  enterprise: {
    ready: (callback: () => void) => void;
    execute: (siteKey: string, options: { action: string }) => Promise<string>;
  };
};
declare global {
  interface Window {
    grecaptcha?: CaptchaApi;
  }
}
let script: Promise<void> | null = null;
let configuredKey: string | null = null;
export async function executeCaptcha(siteKey: string, action: string) {
  if (!siteKey)
    throw new Error(
      "Signup security is not configured. Please try again later.",
    );
  if (!script || configuredKey !== siteKey) {
    configuredKey = siteKey;
    script = new Promise<void>((resolve, reject) => {
      const element = document.createElement("script");
      element.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}`;
      element.async = true;
      element.onload = () => resolve();
      element.onerror = () => {
        script = null;
        reject(new Error("The security check could not load. Please retry."));
      };
      document.head.appendChild(element);
    });
  }
  await script;
  return new Promise<string>((resolve, reject) => {
    const captcha = window.grecaptcha;
    if (!captcha?.enterprise) {
      reject(new Error("The security check is unavailable. Please retry."));
      return;
    }
    const timeout = window.setTimeout(
      () => reject(new Error("The security check timed out. Please retry.")),
      15000,
    );
    captcha.enterprise.ready(() => {
      captcha.enterprise
        .execute(siteKey, { action })
        .then((token) => {
          window.clearTimeout(timeout);
          resolve(token);
        })
        .catch(() => {
          window.clearTimeout(timeout);
          reject(new Error("The security check failed. Please retry."));
        });
    });
  });
}
