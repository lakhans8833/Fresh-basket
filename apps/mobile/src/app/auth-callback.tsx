import { Redirect } from "expo-router";

/**
 * Google sign-in returns to freshbasket://auth-callback. The sign-in itself finishes in lib/auth.tsx
 * (the browser session hands the URL back); if the system opens this route as well, just go home.
 */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
