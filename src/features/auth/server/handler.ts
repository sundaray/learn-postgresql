import { auth } from '@/features/auth/server/auth';

// Better Auth owns every /api/auth/* request (sign-in, email OTP, Google OAuth
// callback, session). The app mounts this from a catch-all route so the route
// file itself carries no auth logic, only the framework wiring.
export async function authHandler(request: Request) {
  return auth().handler(request);
}
