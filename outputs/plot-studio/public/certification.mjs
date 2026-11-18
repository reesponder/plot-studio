const apiRoot = '/certification/api';
const consentVersion = '2026-11-16-certification-r3';
const storeKey = 'plot.certification.enrolments.v1';
const maxSubmissionBytes = 4 * 1024 * 1024;

const exams = {
  builder: { title: 'PLOT Studio Certified Builder' },
  architect: { title: 'PLOT Studio Certified Workflow Architect' },
};

const $ = selector => document.querySelector(selector);
const validExam = value => Object.hasOwn(exams, value);

async function request(path, { token, body, file, publishCertificate } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (file) {
    headers['Content-Type'] = 'application/octet-stream';
    headers['X-Plot-Publish-Certificate'] = String(publishCertificate);
  } else if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(apiRoot + path, {
    method: file || body !== undefined ? 'POST' : 'GET',
    headers,
    body: file || body,
    cache: 'no-store',
    signal: AbortSignal.timeout(file ? 60000 : 17000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : 'We could not complete the request. Try again shortly.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function savedEnrolments() {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || '[]');
    if (Array.isArray(saved)) return saved.filter(entry => entry && validExam(entry.exam) && typeof entry.token === 'string');
  } catch {}
  return [];
}

function saveEnrolment({ exam, token, name, testAttempt }) {
  const saved = savedEnrolments();
  const previous = saved.find(entry => entry.token === token);
  const entries = saved.filter(entry => entry.token !== token);
  try {
    const entry = { exam, token, name, ...(testAttempt === true ? { testAttempt: true } : {}), ...(previous?.taskMarks ? { taskMarks: previous.taskMarks } : {}) };
    localStorage.setItem(storeKey, JSON.stringify([entry, ...entries].slice(0, 16)));
    return true;
  } catch {
    return false;
  }
}

function taskMarks(token, version, count) {
  const saved = savedEnrolments().find(entry => entry.token === token)?.taskMarks;
  if (saved?.version !== version || saved?.count !== count || !Array.isArray(saved.indices)) return new Set();
  return new Set(saved.indices.filter(index => Number.isInteger(index) && index >= 0 && index < count));
}

function persistTaskMarks(token, version, count, marks) {
  const entries = savedEnrolments();
  const entry = entries.find(item => item.token === token);
  if (!entry) return false;
  entry.taskMarks = { version, count, indices: [...marks] };
  try {
    localStorage.setItem(storeKey, JSON.stringify(entries));
    return true;
  } catch { return false; }
}

function textElement(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function verifyUrl(id) {
  return '/certification/verify?' + new URLSearchParams({ id }).toString();
}

async function downloadFile(path, token, filename, contentType, errorMessage) {
  const response = await fetch(apiRoot + path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(17000),
  });
  if (!response.ok || !response.headers.get('content-type')?.includes(contentType)) {
    throw new Error(errorMessage);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function loadStripe() {
  if (typeof window.Stripe === 'function') return Promise.resolve(window.Stripe);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/endive/stripe.js';
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error('Secure checkout could not load. Try again shortly.'));
    };
    const timer = setTimeout(fail, 12000);
    script.addEventListener('error', fail, { once: true });
    script.addEventListener('load', () => {
      clearTimeout(timer);
      if (typeof window.Stripe === 'function') resolve(window.Stripe);
      else fail();
    }, { once: true });
    document.head.append(script);
  });
}

async function setupEnrolment(exam) {
  const enrol = $('#cert-enrol-form');
  const enrolStatus = $('#cert-offer-status');
  const modal = $('#cert-payment');
  const status = $('#cert-payment-status');
  const paymentForm = $('#cert-payment-form');
  const retry = $('#cert-retry-payment');
  let session;
  let checkout;
  let mounted = false;
  let loading = false;
  let complete = false;
  let payload;

  async function showCompletion() {
    complete = true;
    checkout?.destroy();
    paymentForm.hidden = true;
    status.textContent = 'Waiting for payment confirmation…';
    for (let check = 0; check < 8; check++) {
      try {
        const enrolment = await request('/enrolment', { token: session.token });
        if (enrolment.state === 'paid' || enrolment.state === 'passed') {
          status.textContent = enrolment.emailDelivery === 'sent'
            ? 'Payment confirmed. Check your email for the one-time access link.'
            : 'Payment confirmed. Our team will email your one-time exam link. Keep your payment receipt.';
          return;
        }
        if (enrolment.state === 'refunded') {
          status.textContent = 'This enrolment was refunded.';
          return;
        }
      } catch {}
      if (!modal.open) break;
      await new Promise(resolve => setTimeout(resolve, 1700));
    }
    status.textContent = 'Payment confirmation is still pending. Our team will email your one-time exam link once payment is confirmed.';
  }

  async function showCheckout() {
    if (loading || mounted || complete) return;
    loading = true;
    retry.hidden = true;
    status.textContent = 'Opening secure checkout…';
    try {
      if (!session) {
        session = await request('/checkout', { body: JSON.stringify(payload) });
        if (typeof session.token !== 'string' || session.token.length < 16) {
          session = undefined;
          throw new Error('We could not save your enrolment. Try again shortly.');
        }
      }
      if (session.paymentUrl) {
        const target = new URL(session.paymentUrl);
        if (target.origin !== 'https://buy.stripe.com') throw new Error('This checkout link is unavailable.');
        status.textContent = 'Use the same email address on Stripe. Our team will email your one-time exam link after confirming payment.';
        const continueLink = $('#cert-continue-payment');
        continueLink.href = target.href;
        continueLink.hidden = false;
        return;
      }
      if (!checkout) {
        if (!session.publishableKey || !session.clientSecret) {
          throw new Error('This checkout is temporarily unavailable.');
        }
        const Stripe = await loadStripe();
        checkout = await Stripe(session.publishableKey).createEmbeddedCheckoutPage({
          fetchClientSecret: async () => session.clientSecret,
          onComplete: () => void showCompletion(),
        });
      }
      if (!modal.open) return;
      paymentForm.hidden = false;
      checkout.mount(paymentForm);
      mounted = true;
      status.textContent = '';
    } catch (error) {
      checkout?.destroy();
      checkout = undefined;
      paymentForm.hidden = true;
      status.textContent = error.message || 'Checkout could not open. Try again.';
      retry.hidden = false;
    } finally {
      loading = false;
    }
  }

  enrol.addEventListener('submit', event => {
    event.preventDefault();
    if (!payload || (!session && !loading)) {
      const fields = new FormData(enrol);
      payload = {
        exam,
        name: String(fields.get('name')).trim(),
        email: String(fields.get('email')).trim(),
        acceptedTerms: consentVersion,
      };
    }
    modal.showModal();
    void showCheckout();
  });
  $('.cert-close').addEventListener('click', () => modal.close());
  retry.addEventListener('click', showCheckout);
  try {
    const offers = await request('/offers');
    if (offers[exam]?.available !== true) return;
    enrolStatus.hidden = true;
    enrol.hidden = false;
  } catch {}
}

function briefSections(tasks, sections = []) {
  let offset = 0;
  const groups = [];
  for (const section of Array.isArray(sections) ? sections : []) {
    if (typeof section?.title !== 'string' || !section.title.trim() || !Number.isInteger(section.count) || section.count < 1) continue;
    const end = Math.min(offset + section.count, tasks.length);
    if (end === offset) break;
    groups.push({ title: section.title, start: offset, end });
    offset = end;
  }
  if (offset < tasks.length) groups.push({ title: offset ? 'Additional tasks' : '', start: offset, end: tasks.length });
  return groups;
}

function buildBrief(exam, spec, token, assessmentVersion) {
  const fragment = document.createDocumentFragment();
  const hasChecklist = assessmentVersion >= 2;
  fragment.append(textElement('h3', hasChecklist ? spec.title : spec.brief));
  if (hasChecklist) fragment.append(textElement('p', spec.brief));
  fragment.append(textElement('p', spec.overview, 'cert-brief-overview'));
  fragment.append(textElement('p', spec.standard));
  fragment.append(textElement('p', 'Download the .plot starter file and use Import project from the Studio project menu. Make your changes with native Studio blocks and nodes. Keep the submission under 4 MB.'));

  const actions = document.createElement('div');
  actions.className = 'cert-actions';
  const starter = textElement('button', 'Download starter project', 'cert-button');
  starter.type = 'button';
  const starterStatus = textElement('p', '', 'cert-status');
  starterStatus.setAttribute('role', 'status');
  starter.addEventListener('click', async () => {
    starter.disabled = true;
    starterStatus.textContent = '';
    try {
      await downloadFile(`/starter/${exam}`, token, `plot-${exam}-starter.plot`, 'application/octet-stream', 'The starter could not be downloaded. Reopen your enrolment and try again.');
    } catch (error) {
      starterStatus.textContent = error.message;
    } finally {
      starter.disabled = false;
    }
  });
  const studio = textElement('a', 'Open Studio in a new tab', 'cert-text-action');
  studio.href = '/studio/';
  studio.target = '_blank';
  studio.rel = 'noopener';
  actions.append(starter, studio);
  const taskCount = spec.tasks.length;
  fragment.append(actions, starterStatus, textElement('h3', `Exam tasks (${taskCount})`, 'cert-exam-content-heading'));
  const groups = briefSections(spec.tasks, spec.sections);
  const marked = hasChecklist ? taskMarks(token, assessmentVersion, taskCount) : new Set();
  const markStatus = textElement('p', '', 'cert-small');
  markStatus.setAttribute('role', 'status');
  const showMarked = (persisted = true) => {
    markStatus.textContent = `${marked.size} of ${taskCount} tasks marked${persisted ? '' : ' in this view'}.`;
  };
  if (hasChecklist) {
    fragment.append(textElement('p', 'Mark tasks as you review your work. Marks are saved in this browser. The server grades only the submitted .plot file.', 'cert-brief-overview'), markStatus);
    showMarked();
  }
  const jumpList = document.createElement('nav');
  jumpList.className = 'cert-actions cert-task-jumps';
  jumpList.setAttribute('aria-label', 'Jump to an exam module');
  if (groups.length > 1) fragment.append(jumpList);

  for (const [groupIndex, group] of groups.entries()) {
    const section = document.createElement('section');
    if (group.title) {
      section.className = 'cert-task-module';
      const heading = textElement('h4', group.title);
      heading.id = `cert-module-${groupIndex + 1}`;
      heading.tabIndex = -1;
      section.setAttribute('aria-labelledby', heading.id);
      section.append(heading);
      if (groups.length > 1) {
        const jump = textElement('a', `${group.title} (${group.end - group.start})`, 'cert-text-action');
        jump.href = `#${heading.id}`;
        jump.addEventListener('click', (event) => { event.preventDefault(); heading.focus(); });
        jumpList.append(jump);
      }
    }
    const list = document.createElement('ol');
    list.className = 'cert-task-list';
    list.start = group.start + 1;
    for (let index = group.start; index < group.end; index++) {
      const [title, description] = spec.tasks[index];
      const task = document.createElement('li');
      const copy = document.createElement('span');
      copy.append(textElement('strong', title));
      if (hasChecklist) {
        const label = document.createElement('label');
        label.className = 'cert-choice cert-task-choice';
        const mark = document.createElement('input');
        mark.type = 'checkbox';
        mark.checked = marked.has(index);
        mark.setAttribute('aria-label', `Mark task ${index + 1} reviewed`);
        mark.addEventListener('change', () => {
          if (mark.checked) marked.add(index);
          else marked.delete(index);
          showMarked(persistTaskMarks(token, assessmentVersion, taskCount, marked));
        });
        copy.append(textElement('span', description, 'cert-task-description'));
        label.append(mark, copy);
        task.append(label);
      } else {
        copy.append(` ${description}`);
        task.append(copy);
      }
      list.append(task);
    }
    section.append(list);
    fragment.append(section);
  }
  return fragment;
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '--:--:--';
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(part => String(part).padStart(2, '0')).join(':');
}

function setupAttempt() {
  const recover = $('#cert-recovery-form');
  const recoveryInput = recover.elements.token;
  const recoveryButton = recover.querySelector('button');
  const status = $('#cert-attempt-status');
  const savedBox = $('#cert-saved-enrolments');
  const current = $('#cert-current');
  const currentTitle = $('#current-title');
  const testAttemptNotice = $('#cert-test-attempt');
  const taskCountLabel = $('#cert-task-count');
  const content = $('#cert-exam-content');
  const submit = $('#cert-submission-form');
  const submitButton = submit.querySelector('button');
  const submitCertificate = $('#cert-submit-certificate');
  const publishConsent = submit.elements.publishCertificate;
  const submitStatus = $('#cert-submit-status');
  const refresh = $('#cert-refresh-enrolment');
  const download = $('#cert-download');
  const issue = $('#cert-issue-form');
  const resultFilter = $('#cert-result-filter');
  const resultChecks = $('#cert-result-checks');
  const resultTally = $('#cert-result-tally');
  const timerPanel = $('#cert-timer');
  const timerState = $('#cert-timer-state');
  const timerCopy = $('#cert-timer-copy');
  const timerMessage = $('#cert-timer-message');
  const activeTime = $('#cert-active-time');
  const breakCount = $('#cert-breaks-remaining');
  const breakValue = $('#cert-break-time-value');
  const breakTime = $('#cert-break-time');
  const syncClock = $('#cert-timer-refresh');
  const clockButtons = {
    start: $('#cert-timer-start'),
    pause: $('#cert-timer-pause'),
    resume: $('#cert-timer-resume'),
  };
  const accessPanel = $('#cert-access-panel');
  const accessButton = $('#cert-access-redeem');
  const accessStatus = $('#cert-access-status');
  const recovery = $('#cert-access-recovery');
  const preferred = new URLSearchParams(location.search).get('exam');
  const accessToken = new URLSearchParams(location.hash.slice(1)).get('access');
  let activeToken;
  let activeEnrolment;
  let observedAt = 0;
  let lastClockCheck = 0;
  let briefToken;
  let lookup = 0;
  let revision = 0;
  let clockSync = false;
  let clockChange = false;
  let submitting = false;
  let onlyNeedsWork = false;

  function renderSaved() {
    savedBox.replaceChildren();
    for (const entry of savedEnrolments()) {
      const test = entry.testAttempt === true ? ' test attempt' : '';
      const button = textElement('button', `Open ${exams[entry.exam].title.replace('PLOT Studio Certified ', '')}${test}${entry.name ? ` for ${entry.name}` : ''}`, 'cert-button cert-button-outline');
      button.type = 'button';
      button.addEventListener('click', () => void openEnrolment(entry.token));
      savedBox.append(button);
    }
    savedBox.hidden = !savedBox.childElementCount;
  }

  function renderResult(state) {
    const result = state.latestResult;
    const box = $('#cert-result');
    const testAttempt = state.testAttempt === true;
    const certificate = testAttempt ? null : state.certificate;
    $('#cert-issued').hidden = !certificate;
    issue.hidden = testAttempt || state.state !== 'passed' || Boolean(certificate);
    box.hidden = !result && state.state !== 'passed';
    $('#cert-result-summary').textContent = '';
    resultTally.textContent = '';
    resultFilter.hidden = true;
    resultChecks.replaceChildren();
    if (result) {
      const checks = result.checks || [];
      const passed = checks.filter(check => check.passed).length;
      const label = result.passed ? 'Passed' : 'Pass standard not met';
      $('#cert-result-summary').textContent = `${label}. ${result.score} out of ${result.maxScore} points.`;
      if (state.assessmentVersion >= 2 && checks.length) resultTally.textContent = `${passed} of ${checks.length} checks passed.`;
      resultFilter.hidden = passed === 0 || passed === checks.length;
      for (const check of checks) {
        const item = document.createElement('li');
        if (check.passed) item.dataset.passed = 'true';
        item.append(
          textElement('span', check.description + (check.mandatory ? ' Required.' : '')),
          textElement('strong', check.passed ? 'Passed' : 'Needs work', check.passed ? 'cert-check-pass' : 'cert-check-fail'),
        );
        resultChecks.append(item);
      }
      updateResultFilter();
    }
    if (certificate) {
      $('#cert-issued-id').textContent = `Certificate ID ${certificate.id}`;
      $('#cert-verification-link').href = verifyUrl(certificate.id);
    } else {
      $('#cert-issued-id').textContent = '';
      $('#cert-verification-link').removeAttribute('href');
    }
  }

  function updateResultFilter() {
    const filtering = onlyNeedsWork && !resultFilter.hidden;
    resultFilter.setAttribute('aria-pressed', String(filtering));
    for (const item of resultChecks.querySelectorAll('[data-passed]')) item.hidden = filtering;
  }

  resultFilter.addEventListener('click', () => {
    onlyNeedsWork = !onlyNeedsWork;
    updateResultFilter();
  });

  function remainingSubmissions(state) {
    const used = Array.isArray(state.attempts) ? state.attempts.length : Number(state.attempts) || 0;
    return Math.max(0, (Number(state.maxAttempts) || 3) - used);
  }

  function currentClock() {
    const timer = activeEnrolment?.timer;
    if (!timer) return { phase: 'syncing' };
    const estimate = timer.serverNowMs + performance.now() - observedAt;
    let work = timer.workRemainingMs;
    let rest;
    if (timer.state === 'running') {
      work = Date.parse(timer.activeDeadlineAt) - estimate;
      if (!Number.isFinite(work) || work <= 0) return { phase: 'syncing', work: 0 };
    }
    if (timer.state === 'paused') {
      rest = Date.parse(timer.breakEndsAt) - estimate;
      if (!Number.isFinite(rest) || rest <= 0) return { phase: 'syncing', work, rest: 0 };
    }
    return { phase: timer.state, work, rest };
  }

  function updateSessionControls() {
    const state = activeEnrolment;
    if (!state) return;
    const hasAccess = state.accessGranted === true;
    const timer = state.timer;
    const timed = hasAccess && Boolean(timer);
    const clock = currentClock();
    const canWork = !timed || clock.phase === 'running';
    const busy = clockChange || submitting || timer?.submissionInProgress === true;
    timerPanel.hidden = !timed;
    if (timed) {
      const breaks = Math.max(0, timer.maxBreaks - timer.breaksUsed);
      const workHours = timer.workDurationMs / 3600000;
      const breakMinutes = timer.breakDurationMs / 60000;
      const breakPolicy = timer.maxBreaks === 1
        ? `You can take one break of up to ${breakMinutes} minutes.`
        : `You can take up to ${timer.maxBreaks} breaks, each lasting up to ${breakMinutes} minutes.`;
      const labels = {
        not_started: 'Ready to start',
        running: 'Active',
        paused: 'On a break',
        expired: 'Time ended',
        complete: 'Completed',
        syncing: 'Synchronising',
      };
      const descriptions = {
        not_started: `Start to open the exam tasks and begin ${workHours} hours of active work. ${breakPolicy} An unused part of a break does not carry over.`,
        running: 'The clock runs on the server, including while this tab is closed. Uploads must reach the exam workspace before active time ends.',
        paused: 'Submissions are paused. Resume when you are ready, or the clock will restart when the break ends.',
        expired: state.testAttempt === true ? 'Active time has run out. Any graded result is available below.' : 'Active time has run out and submissions are closed. Any graded result or certificate already earned is available below.',
        complete: state.testAttempt === true ? 'This test attempt is complete. Open your graded result below.' : 'This exam is complete. Open your graded result and any certificate below.',
        syncing: 'Checking the server clock before enabling any actions.',
      };
      const label = labels[clock.phase] || labels.syncing;
      const copy = descriptions[clock.phase] || descriptions.syncing;
      if (timerState.textContent !== label) timerState.textContent = label;
      if (timerCopy.textContent !== copy) timerCopy.textContent = copy;
      activeTime.textContent = formatDuration(clock.work);
      breakCount.textContent = `${breaks} of ${timer.maxBreaks}`;
      breakValue.hidden = clock.phase !== 'paused' && clock.rest === undefined;
      breakTime.textContent = breakValue.hidden ? '' : formatDuration(clock.rest);
      clockButtons.start.hidden = clock.phase !== 'not_started' || state.state !== 'paid';
      clockButtons.pause.hidden = clock.phase !== 'running' || breaks === 0 || state.state !== 'paid';
      clockButtons.resume.hidden = clock.phase !== 'paused' || state.state !== 'paid';
      for (const button of Object.values(clockButtons)) button.disabled = busy || clock.phase === 'syncing';
      syncClock.disabled = busy || clockSync;
    }
    const showBrief = hasAccess && state.state === 'paid' && canWork && Boolean(state.brief);
    content.hidden = !showBrief;
    if (!showBrief && briefToken) {
      content.replaceChildren();
      briefToken = undefined;
    } else if (showBrief && briefToken !== activeToken) {
      content.replaceChildren(buildBrief(state.exam, state.brief, activeToken, state.assessmentVersion));
      briefToken = activeToken;
    }
    submit.hidden = !showBrief || remainingSubmissions(state) === 0;
    submitButton.disabled = busy || submit.hidden;
  }

  function renderEnrolment(state) {
    activeEnrolment = state;
    observedAt = performance.now();
    lastClockCheck = observedAt;
    revision++;
    const hasAccess = state.accessGranted === true;
    const testAttempt = state.testAttempt === true;
    testAttemptNotice.hidden = !hasAccess || !testAttempt;
    taskCountLabel.hidden = !hasAccess || !Number.isInteger(state.taskCount);
    taskCountLabel.textContent = taskCountLabel.hidden ? '' : `${state.taskCount} exam tasks`;
    submitCertificate.hidden = testAttempt;
    publishConsent.disabled = testAttempt;
    if (testAttempt) publishConsent.checked = false;
    const pending = state.state === 'awaiting_payment' || (state.state === 'paid' && !hasAccess);
    const paid = state.state === 'paid';
    currentTitle.textContent = exams[state.exam].title;
    $('#cert-candidate').textContent = hasAccess ? state.name || '' : '';
    $('#cert-state').textContent = ({
      awaiting_payment: 'Payment pending',
      paid: hasAccess ? `${remainingSubmissions(state)} of ${Number(state.maxAttempts) || 3} submissions available` : 'Access link required',
      passed: hasAccess ? 'Passed' : 'Enrolment',
      refunded: 'Refunded',
    })[state.state] || 'Enrolment';
    $('#cert-pending').hidden = !pending;
    const linkSent = paid && state.emailDelivery === 'sent';
    $('#cert-pending-title').textContent = linkSent ? 'Open your one-time access link' : paid ? 'Waiting for your exam link' : 'Waiting for payment confirmation';
    $('#cert-pending-copy').textContent = linkSent
      ? 'Check the inbox associated with your payment and open the access link from that email.'
      : 'Our team will email your one-time exam link once payment is confirmed.';
    $('#cert-refunded').hidden = state.state !== 'refunded';
    recovery.hidden = !hasAccess;
    if (!hasAccess) recovery.open = false;
    $('#cert-recovery-code').textContent = recovery.open && hasAccess ? activeToken : '';
    if (hasAccess) renderResult(state);
    else {
      $('#cert-result').hidden = true;
      $('#cert-result-summary').textContent = '';
      resultTally.textContent = '';
      resultChecks.replaceChildren();
      resultFilter.hidden = true;
      $('#cert-issued').hidden = true;
      $('#cert-issued-id').textContent = '';
      $('#cert-verification-link').removeAttribute('href');
      issue.hidden = true;
    }
    current.hidden = false;
    updateSessionControls();
  }

  function showEnrolment(token, state, moveFocus) {
    if (!validExam(state.exam)) throw new Error('This enrolment is not available.');
    if (activeToken !== token) {
      onlyNeedsWork = false;
      submit.reset();
      issue.reset();
      recovery.open = false;
      $('#cert-copy-status').textContent = '';
      timerMessage.textContent = '';
    }
    activeToken = token;
    const saved = state.accessGranted === true ? saveEnrolment({ exam: state.exam, token, name: state.name, testAttempt: state.testAttempt }) : false;
    renderSaved();
    renderEnrolment(state);
    recoveryInput.value = '';
    status.textContent = '';
    submitStatus.textContent = '';
    if (moveFocus) currentTitle.focus();
    return saved;
  }

  async function openEnrolment(token, { moveFocus = true } = {}) {
    if (!token || token.length > 240) return;
    const sequence = ++lookup;
    status.textContent = 'Opening your enrolment…';
    recoveryButton.disabled = true;
    try {
      const state = await request('/enrolment', { token });
      if (sequence !== lookup) return;
      showEnrolment(token, state, moveFocus);
    } catch (error) {
      if (sequence !== lookup) return;
      status.textContent = [401, 404].includes(error.status) ? 'We could not find an enrolment for that code. Check it and try again.' : error.message;
    } finally {
      if (sequence === lookup) recoveryButton.disabled = false;
    }
  }

  recover.addEventListener('submit', event => {
    event.preventDefault();
    void openEnrolment(recoveryInput.value.trim());
  });
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    try { await openEnrolment(activeToken, { moveFocus: false }); }
    finally { refresh.disabled = false; }
  });

  if (accessToken && accessToken.length <= 2048) {
    accessPanel.hidden = false;
    accessButton.addEventListener('click', async () => {
      accessButton.disabled = true;
      accessStatus.textContent = 'Opening your private workspace…';
      try {
        const { token, enrolment } = await request('/access/redeem', { body: JSON.stringify({ accessToken }) });
        if (typeof token !== 'string' || !token || enrolment?.accessGranted !== true) {
          throw new Error('The access link could not open your workspace.');
        }
        const saved = showEnrolment(token, enrolment, true);
        const clean = new URL(location.href);
        clean.hash = '';
        history.replaceState(history.state, '', clean);
        accessPanel.hidden = true;
        if (!saved) submitStatus.textContent = 'This browser could not save your enrolment. Save the recovery code before closing this page.';
      } catch (error) {
        accessStatus.textContent = error.message;
        accessButton.disabled = false;
      }
    });
  }

  async function refreshClock(showError = false) {
    if (!activeToken || clockSync || timerPanel.hidden || clockChange || submitting) return;
    const token = activeToken;
    const currentRevision = revision;
    clockSync = true;
    lastClockCheck = performance.now();
    updateSessionControls();
    try {
      const state = await request('/enrolment', { token });
      if (activeToken === token && revision === currentRevision) {
        timerMessage.textContent = '';
        renderEnrolment(state);
      }
    } catch (error) {
      if (showError && activeToken === token) timerMessage.textContent = error.message;
    } finally {
      clockSync = false;
      updateSessionControls();
    }
  }

  for (const [action, button] of Object.entries(clockButtons)) {
    button.addEventListener('click', async () => {
      if (!activeToken || button.hidden || button.disabled || clockChange) return;
      const token = activeToken;
      revision++;
      clockChange = true;
      timerMessage.textContent = '';
      updateSessionControls();
      let changed = false;
      try {
        const state = await request(`/timer/${action}`, { token, body: '{}' });
        if (activeToken === token) {
          changed = true;
          renderEnrolment(state);
        }
      } catch (error) {
        if (activeToken === token) timerMessage.textContent = error.message;
      } finally {
        clockChange = false;
        updateSessionControls();
        if (changed) $('#cert-timer-title').focus();
        else if (activeToken === token) void refreshClock();
      }
    });
  }
  syncClock.addEventListener('click', () => void refreshClock(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !timerPanel.hidden) void refreshClock();
  });
  setInterval(() => {
    if (timerPanel.hidden || document.visibilityState !== 'visible') return;
    updateSessionControls();
    const { phase } = currentClock();
    const interval = phase === 'syncing' ? 4500 : 30000;
    const pendingResult = activeEnrolment?.timer?.submissionInProgress === true;
    if ((pendingResult || ['running', 'paused', 'syncing'].includes(phase)) && performance.now() - lastClockCheck >= interval) {
      void refreshClock();
    }
  }, 1000);

  submit.addEventListener('submit', async event => {
    event.preventDefault();
    if (!activeToken || submitButton.disabled || submit.hidden || clockChange || submitting) return;
    const token = activeToken;
    const file = submit.elements.project.files[0];
    const publishCertificate = activeEnrolment?.testAttempt !== true && publishConsent.checked;
    if (!file || !/\.plot$/i.test(file.name) || !file.size || file.size > maxSubmissionBytes) {
      submitStatus.textContent = 'Choose an editable .plot project under 4 MB.';
      return;
    }
    revision++;
    submitting = true;
    updateSessionControls();
    submitStatus.textContent = 'Grading your project…';
    try {
      const state = await request('/submission', { token, file, publishCertificate });
      if (token !== activeToken) return;
      renderEnrolment(state);
      submit.reset();
      submitStatus.textContent = 'Your project has been graded.';
      $('#cert-result-title').focus();
    } catch (error) {
      if (token === activeToken) submitStatus.textContent = error.message;
    } finally {
      submitting = false;
      updateSessionControls();
      if (token === activeToken && activeEnrolment?.timer) void refreshClock();
    }
  });

  issue.addEventListener('submit', async event => {
    event.preventDefault();
    if (!activeToken || activeEnrolment?.testAttempt === true) return;
    const token = activeToken;
    const button = issue.querySelector('button');
    button.disabled = true;
    submitStatus.textContent = 'Issuing your certificate…';
    try {
      const state = await request('/certificate', { token, body: JSON.stringify({ publishCertificate: true }) });
      if (token !== activeToken) return;
      renderEnrolment(state);
      submitStatus.textContent = 'Your certificate is ready.';
      download.focus();
    } catch (error) {
      if (token === activeToken) submitStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  recovery.addEventListener('toggle', () => {
    $('#cert-recovery-code').textContent = recovery.open && activeEnrolment?.accessGranted ? activeToken : '';
  });
  $('#cert-copy-code').addEventListener('click', async () => {
    const copyStatus = $('#cert-copy-status');
    try {
      await navigator.clipboard.writeText(activeToken);
      copyStatus.textContent = 'Recovery code copied.';
    } catch {
      copyStatus.textContent = 'Select the code above and copy it manually.';
    }
  });

  download.addEventListener('click', async () => {
    if (!activeToken || activeEnrolment?.testAttempt === true) return;
    const token = activeToken;
    download.disabled = true;
    try {
      await downloadFile('/certificate.pdf', token, 'PLOT-Studio-certificate.pdf', 'application/pdf', 'The certificate PDF is not available yet. Try again shortly.');
    } catch (error) {
      if (token === activeToken) submitStatus.textContent = error.message;
    } finally {
      download.disabled = false;
    }
  });

  renderSaved();
  const saved = savedEnrolments();
  const preferredEntries = preferred ? saved.filter(entry => entry.exam === preferred) : saved;
  if (!accessToken && preferredEntries.length === 1) void openEnrolment(preferredEntries[0].token, { moveFocus: false });
}

function setupVerification() {
  const form = $('#cert-verify-form');
  const input = form.elements.id;
  const button = form.querySelector('button');
  const status = $('#cert-verify-status');
  const result = $('#cert-verified');
  const resultTitle = $('#cert-verify-result');
  const sampleNote = $('#cert-verify-sample-note');

  async function verify(id, { moveFocus = true } = {}) {
    if (!id || id.length > 96 || button.disabled) return;
    result.hidden = true;
    button.disabled = true;
    status.textContent = 'Checking the certificate…';
    try {
      const certificate = await request('/certificates/' + encodeURIComponent(id.toUpperCase()));
      const sample = certificate.sample === true;
      resultTitle.textContent = sample ? 'Verified sample' : 'Verified';
      sampleNote?.toggleAttribute('hidden', !sample);
      $('#cert-verify-name').textContent = certificate.name;
      $('#cert-verify-credential').textContent = certificate.title;
      $('#cert-verify-id').textContent = certificate.id;
      const issued = new Date(certificate.issuedAt);
      $('#cert-verify-date').textContent = Number.isNaN(issued.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(issued);
      input.value = certificate.id;
      history.replaceState(history.state, '', verifyUrl(certificate.id));
      result.hidden = false;
      status.textContent = '';
      if (moveFocus) resultTitle.focus();
    } catch (error) {
      status.textContent = error.status === 404
        ? 'We could not verify that certificate. Check the ID shown on the diploma.'
        : error.message;
    } finally {
      button.disabled = false;
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    void verify(input.value.trim());
  });
  const initialId = new URLSearchParams(location.search).get('id');
  if (initialId && initialId.length <= 96) {
    input.value = initialId;
    void verify(initialId.trim(), { moveFocus: false });
  }
}

async function setupOverviewStatus(status) {
  try {
    const offers = await request('/offers');
    const builder = offers.builder?.available;
    const architect = offers.architect?.available;
    if (typeof builder !== 'boolean' || typeof architect !== 'boolean') return;
    if (builder && architect) status.textContent = 'Enrolment is open for both exams.';
    else if (builder) status.textContent = 'Enrolment is open for Builder.';
    else if (architect) status.textContent = 'Enrolment is open for Workflow Architect.';
    else status.textContent = 'Enrolment is currently closed. Practice tasks are available.';
  } catch {}
}

const offerExam = $('[data-certification-exam]')?.dataset.certificationExam;
if (validExam(offerExam)) void setupEnrolment(offerExam);
if ($('[data-cert-attempt]')) setupAttempt();
if ($('[data-cert-verify]')) setupVerification();
const overviewStatus = $('[data-cert-overview-status]');
if (overviewStatus) void setupOverviewStatus(overviewStatus);
