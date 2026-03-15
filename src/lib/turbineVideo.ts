const DEFAULT_TURBINE_VIDEO_SRC = "/media/turbine-top-alpha.webm";
const APPLE_TURBINE_VIDEO_SRC = "/media/turbine-top-alpha-apple.webm";
const NON_SAFARI_BROWSERS_PATTERN = /(Chrome|CriOS|Edg|EdgiOS|OPR|OPiOS|FxiOS|Firefox|SamsungBrowser|DuckDuckGo)/i;

function isAppleMobileBrowser(userAgent: string, maxTouchPoints: number): boolean {
  if (/(iPhone|iPad|iPod)/i.test(userAgent)) {
    return true;
  }

  // iPadOS can report itself as macOS while still being touch-capable.
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

function isMacSafari(userAgent: string, vendor: string): boolean {
  const isMac = /Macintosh/i.test(userAgent);
  const isSafariEngine = /Safari/i.test(userAgent) && /Apple/i.test(vendor);
  const isNonSafariBrowser = NON_SAFARI_BROWSERS_PATTERN.test(userAgent);

  return isMac && isSafariEngine && !isNonSafariBrowser;
}

export function getPreferredTurbineVideoSrc(): string {
  if (typeof navigator === "undefined") {
    return DEFAULT_TURBINE_VIDEO_SRC;
  }

  const userAgent = navigator.userAgent ?? "";
  const vendor = navigator.vendor ?? "";
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;

  if (isAppleMobileBrowser(userAgent, maxTouchPoints) || isMacSafari(userAgent, vendor)) {
    return APPLE_TURBINE_VIDEO_SRC;
  }

  return DEFAULT_TURBINE_VIDEO_SRC;
}

export function setTurbineVideoSource(video: HTMLVideoElement): void {
  const preferredSrc = getPreferredTurbineVideoSrc();
  video.src = preferredSrc;

  if (preferredSrc === DEFAULT_TURBINE_VIDEO_SRC) {
    return;
  }

  video.addEventListener(
    "error",
    () => {
      video.src = DEFAULT_TURBINE_VIDEO_SRC;
      void video.play().catch(() => {
        // Autoplay can be blocked by browser policies in rare cases.
      });
    },
    { once: true }
  );
}
