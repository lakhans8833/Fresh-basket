import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { APP_SCHEME } from "./config";

/**
 * Open the server-hosted pay page (Razorpay checkout or the dev mock) in an in-app browser.
 * The page redirects to freshbasket://orders/<id> when done, which closes the auth session.
 * The order's real state is always re-read from GET /api/orders/:id afterwards.
 */
export async function openPayPage(payUrl: string): Promise<void> {
  const url = payUrl + (payUrl.includes("?") ? "&" : "?") + "return=app";
  if (Platform.OS === "web") {
    // Web preview: no custom scheme; open in a new tab and let the order screen poll.
    await WebBrowser.openBrowserAsync(url);
    return;
  }
  try {
    await WebBrowser.openAuthSessionAsync(url, `${APP_SCHEME}://`);
  } catch {
    await WebBrowser.openBrowserAsync(url);
  }
}
