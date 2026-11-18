export const checkoutTermsVersion = '2026-11-16-r3';

export function createStripeCheckout() {
  const secretKey = process.env.PLOT_STRIPE_SECRET_KEY || '';
  const publishableKey = process.env.PLOT_STRIPE_PUBLISHABLE_KEY || '';
  const priceId = process.env.PLOT_STRIPE_PRICE_ID || '';
  const mode = /^(?:rk|sk)_(live|test)_[A-Za-z0-9]+$/.exec(secretKey)?.[1];
  if (!mode || !new RegExp(`^pk_${mode}_[A-Za-z0-9]+$`).test(publishableKey) || !/^price_[A-Za-z0-9]+$/.test(priceId)) {
    return null;
  }

  const params = new URLSearchParams({
    mode: 'payment',
    ui_mode: 'embedded_page',
    redirect_on_completion: 'never',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'automatic_tax[enabled]': 'true',
    'metadata[product]': 'plot-studio-licence',
  });

  return async function createSession() {
    const body = new URLSearchParams(params);
    const acceptance = {
      purchase_capacity: 'business',
      terms_version: checkoutTermsVersion,
      terms_accepted_at: new Date().toISOString(),
    };
    for (const [key, value] of Object.entries(acceptance)) {
      body.set(`metadata[${key}]`, value);
      body.set(`payment_intent_data[metadata][${key}]`, value);
    }

    const result = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2026-10-28.endive',
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) {
      console.warn('Stripe Checkout session creation failed', result.status, result.headers.get('request-id'));
      await result.body?.cancel();
      return null;
    }
    const session = await result.json();
    if (typeof session.client_secret !== 'string' || session.livemode !== (mode === 'live')) return null;
    return { clientSecret: session.client_secret, publishableKey };
  };
}
