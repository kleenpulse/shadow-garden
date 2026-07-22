"use client";

import { useAuthUser } from "@/hooks/use-auth-user";

// Sign-in-aware subtitle for the /favorites header. Renders the signed-out copy by
// default (stable through SSR + first client paint → no hydration flash), then swaps
// to the account-synced copy once a user is known. When Supabase is unconfigured, or
// while the session is still resolving, it stays on the neutral signed-out line.
export default function FavoritesSubtitle() {
  const { user, ready, configured, signIn } = useAuthUser();
  const resolved = configured && ready;
  const signedIn = resolved && Boolean(user);

  if (signedIn) {
    return (
      <p className="mt-3 max-w-xl font-sans text-sm text-ink-dim">
        The components you&rsquo;ve pinned, now synced to your account.
      </p>
    );
  }

  return (
    <p className="mt-3 max-w-xl font-sans text-sm text-ink-dim">
      The components you&rsquo;ve pinned, saved in this browser.
      {resolved && (
        <>
          {" "}
          <button
            type="button"
            onClick={() => void signIn()}
            className="text-accent underline-offset-2 transition-colors hover:underline focus-visible:underline focus-visible:outline-none"
          >
            Sign in to sync them across devices.
          </button>
        </>
      )}
    </p>
  );
}
