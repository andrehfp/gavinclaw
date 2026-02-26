import { ConvexHttpClient, type HttpMutationOptions } from 'convex/browser';
import type { ArgsAndOptions, FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server';
import { api } from '@/convex/_generated/api';

// Server requests can hit read queries before Convex auth projection exists.
// Ensure the projection once per request/client before protected calls.
class ProvisionedConvexHttpClient extends ConvexHttpClient {
  private readonly shouldEnsureSession: boolean;
  private ensureSessionPromise: Promise<void> | null = null;

  constructor(address: string, accessToken?: string) {
    super(address);
    this.shouldEnsureSession = Boolean(accessToken);
    if (accessToken) {
      this.setAuth(accessToken);
    }
  }

  private async ensureSession(): Promise<void> {
    if (!this.shouldEnsureSession) {
      return;
    }

    if (!this.ensureSessionPromise) {
      this.ensureSessionPromise = super
        .mutation(api.auth.ensureSession, {})
        .then(() => undefined)
        .catch((error) => {
          this.ensureSessionPromise = null;
          throw error;
        });
    }

    await this.ensureSessionPromise;
  }

  override async query<Query extends FunctionReference<'query'>>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ): Promise<FunctionReturnType<Query>> {
    await this.ensureSession();
    return super.query(query, ...args);
  }

  override async mutation<Mutation extends FunctionReference<'mutation'>>(
    mutation: Mutation,
    ...args: ArgsAndOptions<Mutation, HttpMutationOptions>
  ): Promise<FunctionReturnType<Mutation>> {
    if (mutation !== api.auth.ensureSession) {
      await this.ensureSession();
    }
    return super.mutation(mutation, ...args);
  }

  override async action<Action extends FunctionReference<'action'>>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ): Promise<FunctionReturnType<Action>> {
    await this.ensureSession();
    return super.action(action, ...args);
  }
}

export function getServerConvexClient(accessToken?: string): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is required');
  }

  return new ProvisionedConvexHttpClient(convexUrl, accessToken);
}
