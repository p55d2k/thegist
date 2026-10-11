// Server-side email validation. Kept separate from client-rendered modules
// so subscribing flows can validate without pulling the render pipeline
// (and its LLM imports) into the client bundle.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function isValidEmail(email: string): Promise<boolean> {
  // Basic regex check first - if this fails, don't bother calling API
  const basicRegexCheck = EMAIL_REGEX.test(email);
  if (!basicRegexCheck) {
    return false;
  }

  try {
    const response = await fetch(
      `https://www.disify.com/api/email/${encodeURIComponent(email)}`
    );

    if (!response.ok) {
      // API unavailable, but regex passed so return true (basic validation)
      return true;
    }

    const data = await response.json();

    // If the API returns full validation fields, trust them.
    // Disify usually returns { format, dns, disposable, ... } but some
    // minimal responses may only include `format`. Treat responses that
    // lack dns/disposable as "inconclusive" and fall back to the basic
    // regex result so we don't incorrectly reject valid-looking emails.

    const hasDns = Object.prototype.hasOwnProperty.call(data, "dns");
    const hasDisposable = Object.prototype.hasOwnProperty.call(
      data,
      "disposable"
    );

    if (hasDns && hasDisposable) {
      // Full payload - rely on API checks
      return (
        data.format === true && data.dns === true && data.disposable === false
      );
    }

    // Partial or unexpected payload from the API. Log for server-side
    // visibility and fall back to the basic regex result (which passed
    // earlier). This ensures we don't block addresses like
    // zknewsletter@gmail.com when Disify returns only { format: false }
    // or similarly sparse responses.
    if (process.env.NODE_ENV !== "test") {
      // Keep logs lightweight; include the email and the raw payload shape
      try {
        console.warn(
          "Disify returned partial/unknown payload for email validation",
          {
            email,
            payload: data,
          }
        );
      } catch (err) {
        // Ignore any logging errors
      }
    }

    // Fallback to the regex result (true here, since we early-returned on false above)
    return true;
  } catch (error) {
    // Network error or other failure, but regex passed so return true
    return true;
  }
}