const buy = document.querySelector('#license-buy');
const purchase = document.querySelector('#license-purchase');
const dialog = document.querySelector('#license-checkout');
const close = document.querySelector('#license-checkout-close');
const feedback = document.querySelector('#license-checkout-feedback');
const status = document.querySelector('#license-checkout-status');
const retry = document.querySelector('#license-checkout-retry');
const form = document.querySelector('#license-checkout-form');

let checkout;
let loading = false;
let mounted = false;

function loadStripe() {
  if (typeof window.Stripe === 'function') return Promise.resolve(window.Stripe);

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/endive/stripe.js';

    function fail() {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('Stripe.js did not load'));
    }

    const timeout = window.setTimeout(fail, 12000);
    script.addEventListener('error', fail, { once: true });
    script.addEventListener('load', () => {
      window.clearTimeout(timeout);
      if (typeof window.Stripe === 'function') resolve(window.Stripe);
      else fail();
    }, { once: true });
    document.head.append(script);
  });
}

async function openForm() {
  if (loading || mounted) return;

  loading = true;
  retry.hidden = true;
  status.textContent = 'Opening secure checkout…';
  let failureMessage = 'Checkout could not open. Please try again.';

  try {
    if (!checkout) {
      const Stripe = await loadStripe();
      const response = await fetch('/license/checkout/session', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Plot-Accepted-Terms': purchase.dataset.termsVersion,
        },
        signal: AbortSignal.timeout(12000)
      });

      if (response.status === 429) failureMessage = 'Too many attempts. Wait a moment and try again.';
      if (response.status === 503) failureMessage = 'Checkout is temporarily unavailable. Please try again shortly.';
      if (response.status === 409) failureMessage = 'Reload this page to review and accept the current terms.';
      if (!response.ok) throw new Error('Could not create a Checkout Session');

      const { publishableKey, clientSecret } = await response.json();
      if (!publishableKey || !clientSecret) throw new Error('Checkout Session response was incomplete');

      const stripe = Stripe(publishableKey);
      checkout = await stripe.createEmbeddedCheckoutPage({
        fetchClientSecret: async () => clientSecret
      });
    }

    if (!dialog.open) return;
    form.hidden = false;
    checkout.mount(form);
    mounted = true;
    feedback.hidden = true;
  } catch {
    checkout?.destroy();
    checkout = undefined;
    form.hidden = true;
    status.textContent = failureMessage;
    retry.hidden = false;
  } finally {
    loading = false;
  }
}

purchase.addEventListener('submit', event => {
  event.preventDefault();
  dialog.showModal();
  void openForm();
});

close.addEventListener('click', () => dialog.close());
retry.addEventListener('click', openForm);
buy.disabled = false;
