import assert from 'node:assert/strict'
import { open, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { buildSitePackage, createStarterProject } from '../outputs/plot-studio/project.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const project = createStarterProject()
const files = await buildSitePackage(project, '', {
  fetcher: async url => new Response(await readFile(fileURLToPath(url))),
})
assert.equal(Object.keys(files).filter(name => name.startsWith('assets/hotel/')).length, 15)
const mime = {html:'text/html',css:'text/css',js:'text/javascript',webp:'image/webp'}
const server = createServer((req,res) => {
  const name = req.url === '/' ? 'index.html' : req.url.slice(1)
  if (!Object.hasOwn(files,name)) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, {'Content-Type':mime[name.split('.').pop()]}).end(files[name])
})
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
const url = 'http://127.0.0.1:' + server.address().port
const browser = await chromium.launch({executablePath: process.env.PLOT_BROWSER_PATH || chromium.executablePath()})
try {
  const desktop = await browser.newPage({viewport:{width:1366,height:920}})
  await desktop.goto(url)
  await desktop.locator('[data-block-id=lh-hero-home] img').evaluate(img => img.decode())
  assert.equal(await desktop.getByRole('heading',{level:1}).textContent(),'A house by the river.')
  await desktop.screenshot({path:'work/lindenbank-desktop.png'})
  await desktop.getByRole('link',{name:'Explore the rooms'}).click()
  await desktop.waitForURL('**/rooms.html')
  assert.equal(await desktop.locator('[data-block-id^=lh-room-card-]').count(),3)
  await desktop.getByRole('link',{name:'Book a stay',exact:true}).first().click()
  await desktop.waitForURL('**/book.html')
  await desktop.locator('[name=arrival]').fill('2027-01-09')
  await desktop.locator('[name=departure]').fill('2027-01-08')
  await desktop.locator('[name=email]').fill('guest@example.com')
  await desktop.getByRole('button',{name:'Preview inquiry'}).click()
  assert.match(await desktop.getByRole('status').textContent(),/after your arrival/)
  await desktop.locator('[name=departure]').fill('2027-01-11')
  await desktop.getByRole('button',{name:'Preview inquiry'}).click()
  assert.match(await desktop.getByRole('status').textContent(), /2027-01-09 to 2027-01-11/)
  const phone = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  await phone.goto(url)
  await phone.locator('[data-block-id=lh-hero-home] img').evaluate(img => img.decode())
  await phone.screenshot({path:'work/lindenbank-mobile.png'})
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth),390)
  await phone.locator('.ps-nav-mobile summary').tap()
  await phone.locator('.ps-nav-mobile').getByRole('link',{name:'Dining',exact:true}).tap()
  await phone.waitForURL('**/dining.html')
  await phone.locator('[data-block-id=lh-hero-sub-dining] img').evaluate(img => img.decode())
  console.log('Lindenbank House: 5 routes, 15 embedded photos, desktop and mobile navigation, date validation and demo completion verified.')
} finally {
  await browser.close()
  server.close()
}
