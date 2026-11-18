import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { createServer as smtpServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { certificationTermsVersion, createExamService } from '../outputs/plot-studio/exams.mjs';
import { starterProject } from '../outputs/plot-studio/exam-grader.mjs';

const email = 'builder@example.test';
const deliveries = [];
const sender = smtpServer(socket => {
  socket.setEncoding('utf8');
  socket.write('220 test local SMTP\r\n');
  let buffer = '';
  let content;
  socket.on('data', fragment => {
    buffer += fragment;
    let end;
    while ((end = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (content) {
        if (line === '.') {
          deliveries.push(content.join('\r\n'));
          content = undefined;
          socket.write('250 accepted locally\r\n');
        } else {
          content.push(line);
        }
      } else if (/^EHLO|^HELO|^MAIL FROM:|^RCPT TO:|^RSET/i.test(line)) {
        socket.write('250 OK\r\n');
      } else if (/^DATA/i.test(line)) {
        content = [];
        socket.write('354 Send local test data\r\n');
      } else if (/^QUIT/i.test(line)) {
        socket.end('221 close\r\n');
      } else {
        socket.write('500 Command unsupported\r\n');
      }
    }
  });
});
await new Promise(ready => sender.listen(0, '127.0.0.1', ready));

const signing = Buffer.alloc(32, 5).toString('base64url');
const stripeSign = 'whsec_smoke' + 'X'.repeat(28);
Object.assign(process.env, {
  PLOT_STRIPE_SECRET_KEY: 'sk_test_fixture',
  PLOT_STRIPE_PUBLISHABLE_KEY: 'pk_test_fixture',
  PLOT_EXAM_STRIPE_WEBHOOK_SECRET: stripeSign,
  PLOT_EXAM_BUILDER_PRICE_ID: 'price_BuilderFixture',
  PLOT_EXAM_MAIL_HOST: '127.0.0.1',
  PLOT_EXAM_MAIL_FROM: 'plot@example.test',
  PLOT_EXAM_MAIL_MODE: 'local',
  PLOT_EXAM_MAIL_PORT: String(sender.address().port),
  PLOT_EXAM_MAIL_USERNAME: '',
  PLOT_EXAM_MAIL_PASSWORD: '',
  PLOT_EXAM_ACCESS_SECRET: signing,
});
const directory = await mkdtemp(resolve('work','exam-timing-smoke-'));
const actualFetch = globalThis.fetch;
const stripeSession = {
  id: 'cs_test_fixture', mode: 'payment', status: 'complete', payment_status: 'paid',
  amount_subtotal: 8000, amount_total: 8240, currency: 'usd',
  metadata: { program: 'plot-studio-certification', exam: 'builder' },
  customer_details: { email }, payment_intent: 'pi_fixture',
};
globalThis.fetch = async (url, options) => {
  const target = new URL(url);
  if (target.hostname !== 'api.stripe.com') return actualFetch(url, options);
  if (target.pathname === '/v1/prices/price_BuilderFixture') {
    return Response.json({ active: true, livemode: false, currency: 'usd', unit_amount: 8000, type: 'one_time' });
  }
  if (target.pathname === '/v1/checkout/sessions') {
    stripeSession.metadata.enrolment = options.body.get('metadata[enrolment]');
    stripeSession.client_reference_id = stripeSession.metadata.enrolment;
    return Response.json({ id: stripeSession.id, livemode: false, client_secret: 'client_only_fixture' });
  }
  if (target.pathname === '/v1/checkout/sessions/cs_test_fixture/line_items') {
    return Response.json({ has_more: false, data: [{ price: { id: 'price_BuilderFixture' }, quantity: 1 }] });
  }
  throw Error('Unexpected Stripe endpoint in local fixture.');
};
let service, origin;
const server = httpServer((req,res) => service(req,res,new URL(req.url,origin)));
await new Promise(ready=>server.listen(0,'127.0.0.1',ready));
origin = 'http://127.0.0.1:' + server.address().port;
service = createExamService({directory,origin});

async function request(path, {body,token,status=200,raw=false}={}) {
  const response = await actualFetch(origin + '/certification/api' + path,{
    method:body===undefined?'GET':'POST',
    headers:{Origin:origin, 'Content-Type':'application/json', ...(token?{Authorization:'Bearer '+token}:{})},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  assert.equal(response.status,status,await response.clone().text());
  return raw ? response : response.json();
}

async function event(type,payload, signatureKey=stripeSign, status=200) {
  const body = JSON.stringify({livemode:false,type,data:{object:payload}});
  const at = Math.floor(Date.now()/1000);
  const signature = createHmac('sha256',signatureKey).update(String(at)+'.'+body).digest('hex');
  const response = await actualFetch(origin+'/certification/stripe/webhook',{
    method:'POST',headers:{'Stripe-Signature':'t='+at+',v1='+signature},body,
  });
  assert.equal(response.status,status,await response.clone().text());
}

try {
  const offers = await request('/offers');
  assert.equal(offers.builder.emailDeliveryReady,true);
  assert.equal(offers.builder.available,true);
  assert.equal(offers.architect.emailDeliveryReady,true);
  assert.equal(offers.architect.available,false);
  const checkout = await request('/checkout',{status:201,body:{
    exam:'builder', name:'Ada Fictional', email, acceptedTerms:certificationTermsVersion,
  }});
  let result = await request('/enrolment',{token:checkout.token});
  assert.equal(result.accessGranted,false);
  assert.equal(result.state,'awaiting_payment');
  assert.equal(deliveries.length,0);
  await event('checkout.session.completed',stripeSession,'wrong-signing-key',400);
  await event('checkout.session.completed',{...stripeSession,payment_status:'unpaid'});
  assert.equal(deliveries.length,0);
  await event('checkout.session.completed',stripeSession);
  await event('checkout.session.completed',stripeSession);
  const stop = Date.now() + 8000;
  while (deliveries.length===0 && Date.now()<stop) await sleep(60);
  assert.equal(deliveries.length,1);
  assert.match(deliveries[0],/^To: builder@example\.test\r?$/m);
  result = await request('/enrolment',{token:checkout.token});
  assert.equal(result.state,'paid');
  assert.equal(result.accessGranted,false);
  assert.equal(result.timer,null);
  assert(!('brief' in result));
  await request('/starter/builder',{token:checkout.token,status:403});
  await request('/timer/start',{token:checkout.token,body:{},status:403});
  const decoded = deliveries[0].replace(/=\r?\n/g,'').replace(/=([A-F0-9]{2})/g,(_,part)=>String.fromCharCode(parseInt(part,16)));
  const accessToken = /#access=(PXE_[a-zA-Z0-9_.-]+)/.exec(decoded)[1];
  assert(!decoded.includes('?access='));
  assert.match(decoded, /6 hours of working time/);
  assert.match(decoded, /one break of up to 60 minutes/);
  await request('/access/redeem',{body:{accessToken:accessToken.slice(0,-1)+'!'},status:404});
  const redeemed = await request('/access/redeem',{body:{accessToken}});
  await request('/access/redeem',{body:{accessToken},status:409});
  const token = redeemed.token;
  result = redeemed.enrolment;
  assert.equal(result.accessGranted,true);
  assert.equal(result.emailDelivery,'sent');
  assert.equal(result.timer.state,'not_started');
  assert.equal(result.timer.workRemainingMs,21600000);
  assert(!('brief' in result));
  await request('/starter/builder',{token,status:409});
  await request('/submission',{token,body:{project:starterProject('builder'),publishCertificate:false},status:409});
  result = await request('/timer/start',{token,body:{}});
  const started = result.timer.startedAt;
  let deadline = result.timer.activeDeadlineAt;
  assert.equal(result.timer.state,'running');
  assert(result.brief);
  const starter = await request('/starter/builder',{token,raw:true});
  assert.equal(starter.headers.get('Content-Disposition'),'attachment; filename="plot-builder-starter.plot"');
  assert.match(starter.headers.get('Content-Type'),/^application\/json\b/);
  assert.deepEqual(await starter.json(),starterProject('builder'));
  result = await request('/timer/start',{token,body:{}});
  assert.equal(result.timer.startedAt,started);
  assert.equal(result.timer.activeDeadlineAt,deadline);
  for (let count=1;count<=1;count++) {
    result = await request('/timer/pause',{token,body:{}});
    assert.equal(result.timer.state,'paused');
    assert.equal(result.timer.breaksUsed,count);
    assert.equal(result.timer.breakDurationMs,3600000);
    assert(!('brief' in result));
    await request('/starter/builder',{token,status:409});
    await request('/submission',{token,body:{project:starterProject('builder'),publishCertificate:false},status:409});
    const samePause = await request('/timer/pause',{token,body:{}});
    assert.equal(samePause.timer.breaksUsed,count);
    assert.equal(samePause.timer.breakEndsAt,result.timer.breakEndsAt);
    result = await request('/timer/resume',{token,body:{}});
    assert.equal(result.timer.state,'running');
    assert(result.brief);
    assert(result.timer.activeDeadlineAt>=deadline);
    assert(Date.parse(result.timer.activeDeadlineAt)-Date.parse(deadline)<3600000);
    deadline=result.timer.activeDeadlineAt;
  }
  await request('/timer/pause',{token,body:{},status:409});
  const candidate = starterProject('builder');
  result = await request('/submission',{token,body:{project:candidate,publishCertificate:false}});
  assert.equal(result.attempts,1);
  result = await request('/submission',{token,body:{project:candidate,publishCertificate:false}});
  assert.equal(result.attempts,1);
  await event('charge.refunded',{refunded:true,payment_intent:'pi_fixture'});
  result = await request('/enrolment',{token});
  assert.equal(result.state,'refunded');
  assert.equal(result.timer,null);
  await request('/starter/builder',{token,status:403});
  await request('/access/redeem',{body:{accessToken},status:404});
  assert.equal(deliveries.length,1);
  console.log('Local SMTP, verified Stripe webhook, one-time access and Builder timer HTTP smoke passed. No external mail or payments.');
} finally {
  server.closeAllConnections();
  await new Promise(done=>server.close(done));
  await new Promise(done=>sender.close(done));
  globalThis.fetch = actualFetch;
}
