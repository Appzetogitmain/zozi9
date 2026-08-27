/**
 * Flutter InAppWebView JavaScript Bridge Helper
 * Handles native camera and image picker integration for Flutter webview containers.
 */

/**
 * Convert base64 data to a standard JavaScript File object
 * @param {string} base64String 
 * @param {string} fileName 
 * @param {string} mimeType 
 * @returns {File}
 */
export function base64ToFile(base64String, fileName = 'camera_capture.jpg', mimeType = 'image/jpeg') {
  try {
    const cleanBase64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    return new File([blob], fileName, { type: mimeType });
  } catch (error) {
    console.error('Failed to convert base64 to File:', error);
    return null;
  }
}

/**
 * Check if the web app is running inside Flutter InAppWebView with JavaScript handler support
 * @returns {boolean}
 */
export function isFlutterInAppWebView() {
  return Boolean(
    typeof window !== 'undefined' &&
    window.flutter_inappwebview &&
    typeof window.flutter_inappwebview.callHandler === 'function'
  );
}

/**
 * Open native Flutter camera if running in Flutter webview,
 * or trigger file input fallback in regular browser.
 * 
 * @param {object} options
 * @param {Function} options.onFileSelected - Callback receiving the selected File object
 * @param {string|HTMLInputElement|React.RefObject} [options.fallbackInput] - Input element or ID to click if not in Flutter
 */
export async function pickImageWithFlutterOrWeb({ onFileSelected, fallbackInput }) {
  if (isFlutterInAppWebView()) {
    try {
      const res = await window.flutter_inappwebview.callHandler('openCamera');
      if (res && res.success && res.base64) {
        const file = base64ToFile(
          res.base64,
          res.fileName || `camera_${Date.now()}.jpg`,
          res.mimeType || 'image/jpeg'
        );
        if (file && typeof onFileSelected === 'function') {
          onFileSelected(file);
          return file;
        }
      }
    } catch (err) {
      console.warn('Flutter openCamera bridge error, falling back to web file input:', err);
    }
  }

  // Fallback for regular web browsers
  if (typeof fallbackInput === 'string') {
    const el = document.getElementById(fallbackInput);
    if (el) el.click();
  } else if (fallbackInput && typeof fallbackInput.click === 'function') {
    fallbackInput.click();
  } else if (fallbackInput && fallbackInput.current && typeof fallbackInput.current.click === 'function') {
    fallbackInput.current.click();
  }
  return null;
}

export default {
  base64ToFile,
  isFlutterInAppWebView,
  pickImageWithFlutterOrWeb,
};
