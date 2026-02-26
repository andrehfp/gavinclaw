import { redirect } from 'next/navigation';
import { getSignInUrl } from '@workos-inc/authkit-nextjs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('organizationId') ?? undefined;
  const loginHint = searchParams.get('loginHint') ?? undefined;
  const authorizationUrl = await getSignInUrl({ organizationId, loginHint });
  return redirect(authorizationUrl);
}
