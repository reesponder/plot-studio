const select = (selector, value) => ({ type: 'select', selector, value });
const fill = (selector, value) => ({ type: 'fill', selector, value: String(value) });
const click = selector => ({ type: 'click', selector });
const press = (selector, key) => ({ type: 'press', selector, key });
const submit = (selector, count = 1) => ({ type: 'submit', selector, count });
const wait = ms => ({ type: 'wait', ms });
const snapshot = (key, selectors) => ({ type: 'snapshot', key, selectors });
const guide = '#service-guide select[name="guide-service"]';
const quote = '#estimate form';
const enquiry = '#enquiry form';
const field = (form, name) => `${form} [name="${name}"]`;

const quoteSelectors = {
  service: field(quote, 'service'), days: field(quote, 'days'),
  hire: '#estimate-hire', deposit: '#estimate-deposit', total: '#estimate-total', status: '#estimate-status',
};
const enquirySelectors = {
  name: field(enquiry, 'name'), email: field(enquiry, 'email'), message: field(enquiry, 'message'),
  service: field(enquiry, 'service'), days: field(enquiry, 'days'), status: '#enquiry-status',
};

export const enquiryFixtures = Object.freeze({
  standard: { name: 'Mina Patel', email: 'mina@example.test', message: 'I need a torque wrench for a repair workshop.', service: 'standard', days: 3, hire: 72, deposit: 25, due: 97 },
  assisted: { name: 'Jonah Ito', email: 'jonah@example.test', message: 'Please arrange a staffed pickup on Thursday.', service: 'assisted', days: 5, hire: 210, deposit: 50, due: 260 },
  failure: { name: 'Sasha Lee', email: 'sasha@example.test', message: 'I have a question about borrowing a bench vise.', service: 'assisted', days: 2, hire: 84, deposit: 50, due: 134 },
  invalid: { name: 'Theo Reed', email: 'missing-at-symbol', message: 'This invalid enquiry must not be stored.', service: 'standard', days: 2 },
});

export const quoteFixtures = Object.freeze([
  ['standard-first', 'standard', 1, 24, 25],
  ['standard-second', 'standard', 2, 48, 25],
  ['standard-mid', 'standard', 5, 120, 25],
  ['standard-last', 'standard', 7, 168, 25],
  ['assisted-first', 'assisted', 1, 42, 50],
  ['assisted-mid', 'assisted', 4, 168, 50],
  ['assisted-upper', 'assisted', 6, 252, 50],
  ['assisted-last', 'assisted', 7, 294, 50],
]);
const enquiryInput = data => [
  fill(enquirySelectors.name, data.name), fill(enquirySelectors.email, data.email),
  fill(enquirySelectors.message, data.message), select(enquirySelectors.service, data.service),
  fill(enquirySelectors.days, data.days),
];
const quoteInput = (service, days) => [
  select(quoteSelectors.service, service), fill(quoteSelectors.days, days), submit(quote),
  snapshot('after', quoteSelectors),
];

export function builderV2Probes({ homeCTA, columns, keyboard, rules, serviceGuide, estimate, contact }) {
  const probes = [];
  const add = (id, page, steps, options = {}) => probes.push({ id, page, steps, ...options });
  if (homeCTA) {
    add('home-navigation', 'index', [click(homeCTA), wait(150), snapshot('after', {})]);
    if (keyboard) add('keyboard-navigation', 'index', [
      press(homeCTA, 'Tab'), snapshot('moved', { cta: homeCTA }),
      press(homeCTA, 'Enter'), wait(150), snapshot('after', {}),
    ], { width: 390 });
  }
  if (columns) {
    for (const width of [390, 1440]) add(`responsive-${width}`, 'services', [
      snapshot('after', { columns, table: '#service-comparison table', heading: 'h1' }),
    ], { width });
  }
  if (rules) add('loan-rules', 'services', [
    snapshot('before', { panel: '#rules-panel' }),
    click('#rules-toggle button'), snapshot('opened', { panel: '#rules-panel' }),
    click('#rules-toggle button'), snapshot('closed', { panel: '#rules-panel' }),
  ]);
  if (serviceGuide) add('service-guide', 'services', [
    snapshot('before', { advice: '#service-instructions' }),
    select(guide, 'standard'), snapshot('standard', { advice: '#service-instructions' }),
    select(guide, 'assisted'), snapshot('assisted', { advice: '#service-instructions' }),
    select(guide, 'standard'), snapshot('again', { advice: '#service-instructions' }),
  ]);
  if (estimate) {
    add('quote-empty', 'services', [snapshot('before', quoteSelectors), submit(quote), snapshot('after', quoteSelectors)]);
    for (const [id, service, days] of quoteFixtures) add(id, 'services', quoteInput(service, days));
    for (const [id, days] of [['blank', ''], ['zero', '0'], ['fraction', '2.5'], ['too-many', '8']]) {
      add(`invalid-${id}`, 'services', [
        select(quoteSelectors.service, 'standard'), fill(quoteSelectors.days, 3), submit(quote),
        snapshot('before', quoteSelectors), fill(quoteSelectors.days, days), submit(quote),
        snapshot('after', quoteSelectors),
      ]);
    }
    add('stale-quote', 'services', [
      select(quoteSelectors.service, 'standard'), fill(quoteSelectors.days, 3), submit(quote),
      snapshot('before', quoteSelectors), fill(quoteSelectors.days, 4),
      snapshot('changed-days', quoteSelectors), submit(quote), snapshot('updated', quoteSelectors),
      select(quoteSelectors.service, 'assisted'), snapshot('changed-service', quoteSelectors),
    ]);
  }
  if (contact) {
    // Each browser probe uses fresh site data. A snapshot taken immediately after
    // submission can observe pending state or an already-settled native request.
    add('enquiry-invalid', 'contact', [
      snapshot('before', enquirySelectors), submit(enquiry),
      ...enquiryInput(enquiryFixtures.invalid), submit(enquiry),
      wait(200), snapshot('after', enquirySelectors),
    ], { width: 390 });
    add('enquiry-invalid-duration', 'contact', [
      ...enquiryInput({ ...enquiryFixtures.standard, days: 8 }), submit(enquiry),
      wait(200), snapshot('after', enquirySelectors),
    ]);
    for (const [id, data] of Object.entries(enquiryFixtures).filter(([id]) => ['standard', 'assisted'].includes(id))) {
      add(`enquiry-${id}`, 'contact', [
        ...enquiryInput(data), snapshot('before', enquirySelectors), submit(enquiry),
        wait(250), snapshot('after', enquirySelectors),
      ]);
    }
    add('enquiry-failure', 'contact', [
      ...enquiryInput(enquiryFixtures.failure), submit(enquiry), wait(250), snapshot('after', enquirySelectors),
    ], { denyCreate: true });
    add('enquiry-duplicate', 'contact', [
      ...enquiryInput(enquiryFixtures.standard), submit(enquiry, 2),
      wait(250), snapshot('first', enquirySelectors), wait(1000),
      ...enquiryInput(enquiryFixtures.assisted), submit(enquiry), wait(250), snapshot('second', enquirySelectors),
    ]);
  }
  return probes;
}
