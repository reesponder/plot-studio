import { buildDataExport, dataClientScript, normalizeData } from './data.mjs'
import { backendClientScript, backendModel } from './backend-model.mjs'
import { canvasOffset } from './canvas-transform.mjs'
import { findBlockVariant, renderBlockVariantStyles } from './block-design-catalog.mjs'

const field = (key, label, type = 'text', options) => ({ key, label, type, ...(options ? { options } : {}) })
const text = (key, label) => field(key, label)
const area = (key, label) => field(key, label, 'textarea')
const url = (key, label) => field(key, label, 'url')
const image = (key, label) => field(key, label, 'image')
const imageList = (key, label) => field(key, label, 'image-list')
const toggle = (key, label) => field(key, label, 'checkbox')
const select = (key, label, options) => field(key, label, 'select', options)
const def = (label, category, description, fields, defaults, container = false) => ({ label, category, description, fields, defaults, container })

const fontCatalog = {
  'Sans serif': {
    'ABeeZee': '',
    'Abel': '',
    'Acme': '',
    'Alegreya Sans': '100;300;400;500;700;800;900',
    'Alegreya Sans SC': '100;300;400;500;700;800;900',
    'Almarai': '300;400;700;800',
    'Anton': '',
    'Archivo': '100..900',
    'Archivo Black': '',
    'Archivo Narrow': '400..700',
    'Arimo': '400..700',
    'Assistant': '200..800',
    'Atkinson Hyperlegible Next': '200..800',
    'Barlow': '100;200;300;400;500;600;700;800;900',
    'Barlow Condensed': '100;200;300;400;500;600;700;800;900',
    'Barlow Semi Condensed': '100;200;300;400;500;600;700;800;900',
    'Bebas Neue': '',
    'Bricolage Grotesque': '200..800',
    'Cabin': '400..700',
    'Chivo': '100..900',
    'DM Sans': '100..1000',
    'Dosis': '200..800',
    'El Messiri': '400..700',
    'Encode Sans': '100..900',
    'Exo 2': '100..900',
    'Fahkwang': '200;300;400;500;600;700',
    'Figtree': '300..900',
    'Fira Sans': '100;200;300;400;500;600;700;800;900',
    'Fira Sans Condensed': '100;200;300;400;500;600;700;800;900',
    'Fredoka': '300..700',
    'Geist': '100..900',
    'Gothic A1': '100;200;300;400;500;600;700;800;900',
    'Hanken Grotesk': '100..900',
    'Heebo': '100..900',
    'Hind': '300;400;500;600;700',
    'IBM Plex Sans': '100..700',
    'Inclusive Sans': '300..700',
    'Inria Sans': '300;400;700',
    'Instrument Sans': '400..700',
    'Inter': '100..900',
    'Italiana': '',
    'Jost': '100..900',
    'Karla': '200..800',
    'Khand': '300;400;500;600;700',
    'Kumbh Sans': '100..900',
    'Lato': '100;300;400;700;900',
    'League Spartan': '100..900',
    'Lexend': '100..900',
    'Libre Franklin': '100..900',
    'Manrope': '200..800',
    'Maven Pro': '400..900',
    'Merriweather Sans': '300..800',
    'Michroma': '',
    'Montserrat': '100..900',
    'Mukta': '200;300;400;500;600;700;800',
    'Mulish': '200..1000',
    'News Cycle': '400;700',
    'Noto Sans': '100..900',
    'Noto Sans Mono': '100..900',
    'Nunito': '200..1000',
    'Nunito Sans': '200..1000',
    'Open Sans': '300..800',
    'Orbitron': '400..900',
    'Oswald': '200..700',
    'Outfit': '100..900',
    'Overpass': '100..900',
    'Oxygen': '300;400;700',
    'Philosopher': '400;700',
    'Plus Jakarta Sans': '200..800',
    'Poppins': '100;200;300;400;500;600;700;800;900',
    'Prompt': '100;200;300;400;500;600;700;800;900',
    'Public Sans': '100..900',
    'Quicksand': '300..700',
    'Raleway': '100..900',
    'Red Hat Display': '300..900',
    'Red Hat Text': '300..700',
    'Rethink Sans': '400..800',
    'Roboto': '100..900',
    'Rosario': '300..700',
    'Rubik': '300..900',
    'Saira': '100..900',
    'Signika': '300..700',
    'Sora': '100..800',
    'Source Sans 3': '200..900',
    'Space Grotesk': '300..700',
    'Spline Sans': '300..700',
    'Syncopate': '400;700',
    'Teko': '300..700',
    'Titillium Web': '200;300;400;600;700;900',
    'Ubuntu': '300;400;500;700',
    'Urbanist': '100..900',
    'Work Sans': '100..900',
    'Yanone Kaffeesatz': '200..700',
  },
  'Serif': {
    'Alegreya': '400..900',
    'Aleo': '100..900',
    'Alice': '',
    'Andada Pro': '400..840',
    'Arvo': '400;700',
    'Asul': '400;700',
    'Baskervville': '400..700',
    'Bitter': '100..900',
    'Bodoni Moda': '400..900',
    'Bree Serif': '',
    'Cardo': '400;700',
    'Castoro': '400..700',
    'Cinzel': '400..900',
    'Cormorant Garamond': '300..700',
    'Crimson Pro': '200..900',
    'Crimson Text': '400;600;700',
    'DM Serif Text': '',
    'Domine': '400..700',
    'EB Garamond': '400..800',
    'Eczar': '400..800',
    'Fraunces': '100..900',
    'Gelasio': '400..700',
    'Gloock': '',
    'Hepta Slab': '1..900',
    'IBM Plex Serif': '100;200;300;400;500;600;700',
    'Inria Serif': '300;400;700',
    'Instrument Serif': '',
    'Libre Baskerville': '400..700',
    'Libre Bodoni': '400..700',
    'Literata': '200..900',
    'Lora': '400..700',
    'Marcellus': '',
    'Merriweather': '300..900',
    'Montagu Slab': '100..700',
    'Nanum Myeongjo': '400;700;800',
    'Neuton': '200;300;400;700;800',
    'Noto Serif': '100..900',
    'Old Standard TT': '400;700',
    'Petrona': '100..900',
    'Playfair Display': '400..900',
    'PT Serif': '400;700',
    'Radley': '',
    'Roboto Serif': '100..900',
    'Roboto Slab': '100..900',
    'Rokkitt': '100..900',
    'Spectral': '200;300;400;500;600;700;800',
    'STIX Two Text': '400..700',
    'Tinos': '400;700',
    'Trirong': '100;200;300;400;500;600;700;800;900',
    'Vollkorn': '400..900',
    'Young Serif': '',
  },
  'Display': {
    'Alfa Slab One': '',
    'Anybody': '100..900',
    'Bangers': '',
    'Calistoga': '',
    'Comfortaa': '300..700',
    'Concert One': '',
    'Forum': '',
    'Lilita One': '',
    'Lobster': '',
    'Special Elite': '',
    'Yeseva One': '',
  },
  'Handwriting': {
    'Amatic SC': '400;700',
    'Caveat': '400..700',
    'Caveat Brush': '',
    'Dancing Script': '400..700',
    'Edu NSW ACT Foundation': '400..700',
    'Great Vibes': '',
    'Pacifico': '',
    'Patrick Hand': '',
    'Permanent Marker': '',
    'Satisfy': '',
    'Shadows Into Light': '',
  },
  'Monospace': {
    'Courier Prime': '400;700',
    'Cousine': '400;700',
    'Cutive Mono': '',
    'DM Mono': '300;400;500',
    'Fira Code': '300..700',
    'Fira Mono': '400;500;700',
    'IBM Plex Mono': '100;200;300;400;500;600;700',
    'Inconsolata': '200..900',
    'JetBrains Mono': '100..800',
    'Martian Mono': '100..800',
    'Red Hat Mono': '300..700',
    'Roboto Mono': '100..700',
    'Source Code Pro': '200..900',
    'Space Mono': '400;700',
    'Spline Sans Mono': '300..700',
    'Ubuntu Mono': '400;700',
    'VT323': '',
  },
  System: { Arial:'', 'Courier New':'', Georgia:'', 'Segoe UI':'', 'Times New Roman':'', Verdana:'' },
}
const fonts = Object.entries(fontCatalog).flatMap(([category, families]) =>
  Object.entries(families).map(([name, weights]) => [name, { category, weights }])
)
const fontMetadata = new Map(fonts)
export const FONT_CATEGORIES = Object.freeze(Object.fromEntries(fonts.map(([name, entry]) => [name, entry.category])))
export const FONT_OPTIONS = [...fontMetadata.keys()].sort((a, b) => a.localeCompare(b, 'en'))
export const DEVICE_WIDTHS = { tablet: 1023, mobile: 767 }
export const RECORDS_TABLE_MAX_COLUMNS = 12
export const RECORDS_TABLE_FIELD_LENGTH = 128
export const RECORDS_TABLE_LABEL_LENGTH = 100
const recordsTableStatus = { emptyText:'No records to display.', loadingText:'Loading records…', errorText:'Records could not be loaded.' }

export const BLOCK_TYPES = {
  nav: def('Navigation', 'Layout', 'Brand, navigation links, and a button.',
    [text('brand','Brand name'),area('links','Links (label | URL)'),toggle('autoLinks','Add pages automatically'),text('buttonText','Button label'),url('buttonLink','Button URL')],
    {brand:'Brand',links:'',autoLinks:true,buttonText:'',buttonLink:''}),
  hero: def('Hero', 'Layout', 'An opening headline, description, and image.',
    [text('eyebrow','Eyebrow'),area('title','Heading'),area('text','Description'),text('buttonText','Button label'),url('buttonLink','Button URL'),image('image','Image'),text('alt','Alt text'),text('caption','Image caption'),select('layout','Layout',['split','center','reverse'])],
    {eyebrow:'',title:'Your headline',text:'A short introduction to the page.',buttonText:'Learn more',buttonLink:'#',image:'',alt:'',caption:'',layout:'split'}),
  section: def('Section', 'Layout', 'A container for other blocks.',
    [text('label','Section name'),text('anchor','Anchor ID')], {label:'',anchor:''}, true),
  columns: def('Columns', 'Layout', 'A grid for other blocks.', [select('columns','Number of columns',['2','3','4'])],{columns:'2'},true),
  heading: def('Heading', 'Content', 'A heading with a selectable level.',
    [area('text','Content'),select('tag','Level',['h1','h2','h3','h4','h5','h6']),text('anchor','Anchor ID')],{text:'New heading',tag:'h2',anchor:''}),
  text: def('Text', 'Content', 'A paragraph or short description.',[area('text','Content')],{text:'Write your text.'}),
  list: def('List', 'Content', 'A bulleted or numbered list.',
    [area('items','Items (one per line)'),toggle('ordered','Number the items')],{items:'First item\nSecond item\nThird item',ordered:false}),
  code: def('Code', 'Content', 'A code example with preserved formatting.',
    [text('language','Language label'),area('code','Code')],{language:'HTML',code:'<p>Hello, world.</p>'}),
  image: def('Image', 'Content', 'An image with alt text and a caption.',
    [image('src','Image'),text('alt','Alt text'),text('caption','Caption')],{src:'',alt:'',caption:''}),
  button: def('Button', 'Content', 'A link or target for an action.',
    [text('text','Label'),url('href','URL'),select('variant','Variant',['primary','outline','text']),toggle('newTab','Open in a new tab')],{text:'Learn more',href:'#',variant:'primary',newTab:false}),
  link: def('Link', 'Content', 'A text link to a page or resource.',
    [text('text','Label'),url('href','URL'),toggle('newTab','Open in a new tab')],{text:'Learn more',href:'#',newTab:false}),
  input: def('Input', 'Content', 'A labeled text, number, date, or file field.',
    [text('label','Label'),text('name','Field name'),select('kind','Field type',['text','textarea','email','tel','url','number','date','datetime-local','password','search','file']),text('placeholder','Placeholder'),area('defaultValue','Default value'),toggle('required','Required')],
    {label:'Your name',name:'name',kind:'text',placeholder:'',defaultValue:'',required:false}),
  select: def('Select', 'Content', 'A labeled dropdown with editable options.',
    [text('label','Label'),text('name','Field name'),area('options','Options (label | value)'),text('placeholder','Placeholder'),text('defaultValue','Default value'),toggle('required','Required')],
    {label:'Choose a topic',name:'topic',options:'Product | product\nSupport | support\nOther | other',placeholder:'Select an option',defaultValue:'',required:false}),
  toggle: def('Toggle', 'Content', 'A native on-off switch for a form or interaction.',
    [text('label','Label'),text('name','Field name'),text('value','Value when on'),toggle('checked','On by default'),toggle('required','Required')],
    {label:'Send me updates',name:'updates',value:'yes',checked:false,required:false}),
  video: def('Video', 'Content', 'A video player with a poster and optional captions.',
    [url('src','Video URL'),text('title','Accessible title'),image('poster','Poster image'),url('captions','Captions URL (WebVTT)'),text('captionLanguage','Caption language code'),text('captionLabel','Caption language label'),toggle('muted','Muted'),toggle('loop','Loop')],
    {src:'',title:'Video',poster:'',captions:'',captionLanguage:'en',captionLabel:'English',muted:false,loop:false}),
  audio: def('Audio', 'Content', 'An audio player with playback controls.',
    [url('src','Audio URL'),text('title','Accessible title'),text('caption','Caption'),toggle('loop','Loop')],
    {src:'',title:'Audio',caption:'',loop:false}),
  table: def('Table', 'Sections', 'A table with headings, a caption, and scrollable rows.',
    [text('caption','Caption'),text('headers','Column headings (separate with |)'),area('rows','Rows (one per line, cells separated by |)')],
    {caption:'Plan comparison',headers:'Plan | Projects | Storage',rows:'Starter | 3 | 5 GB\nTeam | Unlimited | 100 GB'}),
  'records-table': def('Records table', 'Sections', 'Display records supplied by a Blueprint action.',
    [text('caption','Caption (optional)'),field('columns','Columns','records-columns'),text('emptyText','Empty message'),text('loadingText','Loading message'),text('errorText','Error message')],
    {caption:'',columns:[{field:'name',label:'Name'},{field:'status',label:'Status'}],...recordsTableStatus}),
  progress: def('Progress', 'Sections', 'A labeled progress indicator with an editable amount.',
    [text('label','Label'),field('value','Current value','number'),field('max','Maximum','number'),toggle('showValue','Show value')],
    {label:'Project progress',value:60,max:100,showValue:true}),
  callout: def('Callout', 'Sections', 'A distinct note, tip, or warning.',
    [text('title','Heading'),area('text','Content'),select('variant','Variant',['note','tip','warning'])],
    {title:'Before you start',text:'Add a helpful note for your reader.',variant:'note'}),
  feature: def('Feature', 'Sections', 'A short description of a service or feature.',
    [text('eyebrow','Eyebrow'),text('title','Heading'),area('text','Description'),text('linkText','Link label'),url('href','Link URL')],{eyebrow:'',title:'Feature',text:'Describe what the service or feature includes.',linkText:'',href:'#'}),
  card: def('Card', 'Sections', 'Grouped content with its own heading.',
    [text('title','Heading'),area('text','Description'),image('image','Image'),text('alt','Alt text')],{title:'Card title',text:'Card description.',image:'',alt:''},true),
  gallery: def('Gallery', 'Sections', 'A grid of images with captions.',
    [text('title','Heading'),imageList('images','Images (URL | alt text | caption)'),select('columns','Number of columns',['2','3','4'])],{title:'Gallery',images:'',columns:'3'}),
  quote: def('Quote', 'Sections', 'A quote with attribution.',[area('text','Quote text'),text('author','Caption')],{text:'Write your quote.',author:''}),
  pricing: def('Pricing', 'Sections', 'A plan, its price, included features, and a button.',
    [text('title','Plan name'),text('price','Price'),text('period','Billing period'),area('items','Features (one per line)'),text('buttonText','Button label'),url('buttonLink','Button URL')],{title:'Essential plan',price:'$19',period:'/ month',items:'Product access\nEmail support',buttonText:'Choose plan',buttonLink:'#'}),
  faq: def('FAQ', 'Sections', 'An expandable list of questions and answers.',
    [text('title','Heading'),area('items','Entries (question | answer)')],{title:'Frequently asked questions',items:'How do I get started? | Write your answer here.\nHow do I get in touch? | Write your second answer here.'}),
  form: def('Form', 'Sections', 'Contact fields that can trigger logic.',
    [text('title','Heading'),area('text','Description'),toggle('usePreset','Show preset fields'),area('fields','Preset fields (label | type | required)'),text('buttonText','Button label')],{title:'Contact',text:'',usePreset:true,fields:'Name | text | yes\nEmail | email | yes\nMessage | textarea | yes',buttonText:'Send message'},true),
  divider: def('Divider','Layout','A horizontal line between blocks.',[],{}),
  spacer: def('Spacer','Layout','An empty block with a set height.',[field('height','Height (px)','number')],{height:48}),
  footer: def('Footer','Layout','Brand and links at the bottom of the page.',
    [text('brand','Brand name'),area('text','Content'),area('links','Links (label | URL)'),toggle('autoLinks','Add pages automatically')],{brand:'Brand',text:'',links:'',autoLinks:true}),
}

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const list = value => Array.isArray(value) ? value : []

let idCounter = 0
export function createId(prefix = 'block') {
  idCounter += 1
  const random = globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)
  return String(prefix) + '-' + random + '-' + idCounter.toString(36)
}

export function slugify(value) {
  return String(value ?? '').toLowerCase().replace(/ł/g, 'l').normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
}

export function isDirectImageUrl(value) {
  const source = String(value ?? '').trim()
  if (!/^https?:\/\//i.test(source) || /[\s<>\u0000-\u001f]/u.test(source)) return false
  try {
    const url = new URL(source)
    return Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

export function createBlock(type, overrides = {}) {
  const key = Object.hasOwn(BLOCK_TYPES, type) ? type : 'section'
  const props = { ...BLOCK_TYPES[key].defaults, ...overrides.props }
  if (key === 'records-table') props.columns = recordsTableColumnDraft(props.columns)
  return {
    id: overrides.id ?? createId(), type: key,
    props,
    style: { ...overrides.style },
    styles: { tablet: { ...overrides.styles?.tablet }, mobile: { ...overrides.styles?.mobile } },
    children: list(overrides.children),
  }
}

export function createPage(name = 'New page', slug = slugify(name)) {
  return { id: createId('page'), name, slug: slugify(slug) || 'page', blocks: [] }
}

export const PAGE_TEMPLATES = Object.freeze({
  blank: { label:'Blank page', description:'Start with an empty canvas.' },
  product: { label:'Product landing page', description:'Introduce a product, explain its features, and share a plan.' },
  portfolio: { label:'Portfolio', description:'Present selected work, your practice, and a way to get in touch.' },
  docs: { label:'Documentation', description:'Give readers a quickstart, an example, and a reference.' },
  contact: { label:'Contact', description:'Collect inquiries and answer common questions.' },
})

function templateNav(brand, links, button = {}) {
  return createBlock('nav',{props:{brand,links,autoLinks:false,...button}})
}

function templateFooter(brand, links) {
  return createBlock('footer',{props:{brand,links,autoLinks:false}})
}

function templateBlock(type, props, children) {
  return createBlock(type, { props, children })
}

function productTemplate() {
  const brand = 'Fieldnotes'
  return [
    templateNav(brand,'Features | #features\nPricing | #pricing',{buttonText:'Get started',buttonLink:'#start'}),
    templateBlock('hero',{
      title:'Put your research in one place.', text:'Save notes, make connections, and turn your reading into something you can share.',
      buttonText:'Explore features',buttonLink:'#features',
    }),
    templateBlock('section',{label:'Features',anchor:'features'},[
      templateBlock('heading',{text:'A place for your sources'}),
      templateBlock('columns',{columns:'3'},[
        templateBlock('feature',{title:'Capture notes',text:'Keep excerpts and annotations together with the source.'}),
        templateBlock('feature',{title:'Find connections',text:'Group related ideas with tags and keep track of recurring themes.'}),
        templateBlock('feature',{title:'Share a collection',text:'Pull together a reading list for a collaborator or a class.'}),
      ]),
    ]),
    templateBlock('section',{label:'Pricing',anchor:'pricing'},[
      templateBlock('heading',{text:'Start a collection'}),
      templateBlock('pricing',{title:'Individual',price:'$12',period:'/ month',items:'Unlimited collections\nSource annotations\nShareable reading lists',buttonText:'Request access',buttonLink:'#start'}),
    ]),
    templateBlock('section',{label:'Get started',anchor:'start'},[
      templateBlock('form',{title:'Request access',text:'Tell us what you are researching.',fields:'Name | text | yes\nEmail | email | yes\nYour project | textarea | no',buttonText:'Request access'}),
    ]),
    templateFooter(brand,'Features | #features\nPricing | #pricing'),
  ]
}

function portfolioTemplate() {
  const brand = 'PRÓG.'
  return [
    templateNav(brand,'Work | #work\nStudio | #about',{buttonText:'Contact',buttonLink:'#contact'}),
    templateBlock('hero',{
      eyebrow:'ARCHITECTURE STUDIO',title:'Considered spaces.',text:'Architecture and interiors shaped by the people who use them.',
      buttonText:'See the work',buttonLink:'#work',image:'./assets/prog.webp',alt:'A modern house among trees',
    }),
    templateBlock('section',{label:'Selected work',anchor:'work'},[
      templateBlock('heading',{text:'Selected work'}),
      templateBlock('columns',{columns:'2'},[
        templateBlock('card',{title:'Woodland house',text:'A deep overhang and generous glazing connect the living space to the garden.'}),
        templateBlock('card',{title:'The corner apartment',text:'A compact renovation organized around natural light and original joinery.'}),
      ]),
    ]),
    templateBlock('section',{label:'Studio',anchor:'about'},[
      templateBlock('heading',{text:'About the studio'}),
      templateBlock('text',{text:'We work across architecture and interiors, from an initial site visit to the details that make a room feel settled.'}),
    ]),
    templateBlock('section',{label:'Contact',anchor:'contact'},[
      templateBlock('form',{title:'Discuss a project',text:'Share the location, scope, and timing of your project.'}),
    ]),
    templateFooter(brand,'Selected work | #work\nStudio | #about\nContact | #contact'),
  ]
}

function docsTemplate() {
  const brand = 'Documentation'
  const links = 'Quickstart | #quickstart\nExample | #example\nReference | #reference'
  return [
    templateNav(brand,links),
    templateBlock('hero',{title:'Documentation',text:'Run a static website locally and prepare the files for a web host.',buttonText:'Start here',buttonLink:'#quickstart'}),
    templateBlock('section',{label:'Quickstart',anchor:'quickstart'},[
      templateBlock('heading',{text:'Quickstart'}),
      templateBlock('list',{items:'Export your website and extract the ZIP.\nOpen a terminal in the extracted folder.\nServe the folder locally and open the address shown in your terminal.',ordered:true}),
    ]),
    templateBlock('section',{label:'Example',anchor:'example'},[
      templateBlock('heading',{text:'Serve the site'}),
      templateBlock('text',{text:'If you have Python installed, start a local server from the folder that contains index.html.'}),
      templateBlock('code',{language:'Terminal',code:'python -m http.server 8080'}),
      templateBlock('button',{text:'Open localhost:8080',href:'http://localhost:8080',variant:'text'}),
    ]),
    templateBlock('section',{label:'Reference',anchor:'reference'},[
      templateBlock('faq',{title:'File reference',items:'Where do pages live? | Each page is an HTML file. The home page is index.html.\nWhere is the site styling? | Shared styles are in styles.css.\nWhere are interactions defined? | The exported JavaScript lives in script.js.'}),
    ]),
    templateFooter(brand,links),
  ]
}

function contactTemplate() {
  const brand = 'Contact'
  return [
    templateNav(brand,'Send a message | #inquiry\nQuestions | #questions'),
    templateBlock('hero',{title:'Get in touch.',text:'Send a question or tell us about a project.',buttonText:'Write a message',buttonLink:'#inquiry'}),
    templateBlock('section',{label:'Send a message',anchor:'inquiry'},[
      templateBlock('form',{title:'Your inquiry',fields:'Name | text | yes\nWork email | email | yes\nCompany | text | no\nMessage | textarea | yes',buttonText:'Send message'}),
    ]),
    templateBlock('section',{label:'Questions',anchor:'questions'},[
      templateBlock('faq',{title:'Before you write',items:'What should I include? | Describe what you need, any dates you are working toward, and how to reach you.\nCan I ask about an existing project? | Include its name or a reference number so we can find it.'}),
    ]),
    templateFooter(brand,'Send a message | #inquiry'),
  ]
}

const pageBuilders = { product:productTemplate, portfolio:portfolioTemplate, docs:docsTemplate, contact:contactTemplate }

export function createPageFromTemplate(key, name, slug) {
  const template = Object.hasOwn(PAGE_TEMPLATES,key) ? PAGE_TEMPLATES[key] : PAGE_TEMPLATES.blank
  const page = createPage(name || template.label, slug)
  const build = Object.hasOwn(pageBuilders,key) ? pageBuilders[key] : null
  if (build) page.blocks = build()
  return page
}

export function createEmptyProject(name = 'New website') {
  return {
    version: 1, name,
    settings: { font:'Inter',headingFont:'Inter',accent:'#181818',background:'#ffffff',textColor:'#181818',customCss:'',customJs:'' },
    pages: [createPage('Home','index')], graph: { nodes: [], edges: [] },
    data: { tables: [] },
    backend: { version: 1, routes: [] },
  }
}

const demoBlock = (id,type,props,style,children) => createBlock(type,{id,props,style,children})

const lindenbankStyles = `
.ps-nav:where([data-block-id^="lh-nav-"]) {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--ps-background);
  border-color: #d4c9b7;
}
:where([data-block-id^="lh-nav-"]) .ps-nav-inner {
  max-width: 1440px;
  min-height: 74px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  column-gap: clamp(10px, 3vw, 32px);
}
:where([data-block-id^="lh-nav-"]) .ps-brand {
  grid-column: 2;
  grid-row: 1;
  font: 400 clamp(1.75rem, 3vw, 2.45rem)/.9 var(--ps-heading-font);
  letter-spacing: -.045em;
}
:where([data-block-id^="lh-nav-"]) .ps-nav-desktop {
  grid-column: 1;
  grid-row: 1;
  margin: 0;
  gap: clamp(12px, 3vw, 30px);
}
.ps-nav:where([data-block-id^="lh-nav-"]) nav a {
  color: #34392c;
  font-size: .8rem;
}
.ps-nav:where([data-block-id^="lh-nav-"]) .ps-button {
  grid-column: 3;
  grid-row: 1;
  justify-self: end;
  border-color: #66725b;
  padding-inline: 18px;
}
.ps-hero:where([data-block-id^="lh-hero-"]) {
  position: relative;
  isolation: isolate;
  max-width: none;
  min-height: clamp(490px, 59vw, 740px);
  align-items: end;
  overflow: hidden;
  padding: clamp(32px, 6vw, 110px) max(var(--ps-gutter), calc((100vw - 1400px) / 2 + var(--ps-gutter)));
  color: #fcf6ea;
  background: #303b2c;
}
.ps-hero:where([data-block-id^="lh-hero-"])::after {
  content: "";
  position: absolute;
  z-index: -1;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(85deg, #182117aa, transparent 78%), linear-gradient(0deg, #161c15b8, transparent 80%);
}
.ps-hero:where([data-block-id^="lh-hero-"]) figure {
  position: absolute;
  z-index: -2;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ps-hero:where([data-block-id^="lh-hero-"]) img {
  height: 100%;
  object-position: 50% 60%;
}
.ps-hero:where([data-block-id^="lh-hero-"]) .ps-hero-copy {
  margin: 0;
  text-align: left;
  justify-items: start;
  max-width: 740px;
  gap: 18px;
}
.ps-hero:where([data-block-id^="lh-hero-"]) h1 {
  font-size: var(--ps-title-size, var(--ps-h1-size, clamp(4rem, 8.8vw, 8.65rem)));
  line-height: .89;
  text-wrap: balance;
}
:where([data-block-id^="lh-hero-"]) .ps-hero-description {
  color: #fbf6e8;
  max-width: 36ch;
  font-size: clamp(.93rem, 1.6vw, 1.12rem);
}
.ps-hero:where([data-block-id^="lh-hero-"]) .ps-button {
  background: #f2ead9;
  color: #243123;
  border-color: #f2ead9;
  padding-inline: 22px;
}
.ps-hero:where([data-block-id^="lh-hero-sub-"]) {
  min-height: clamp(400px, 45vw, 620px);
}
.ps-section:where([data-block-id^="lh-prose-"]) {
  max-width: 1350px;
  padding-block: clamp(44px, 8vw, 110px);
  align-items: center;
  gap: clamp(14px, 2.5vw, 30px);
}
.ps-block:where([data-block-id^="lh-note-"]) {
  color: #676f5e;
  max-width: 58ch;
}
.ps-columns:where([data-block-id^="lh-rooms-"]) {
  gap: clamp(14px, 2.2vw, 32px);
}
.ps-card:where([data-block-id^="lh-room-card-"]) {
  border: 0;
  padding: 0 0 16px;
  border-bottom: 1px solid #d4c9b7;
  gap: 10px;
}
.ps-card:where([data-block-id^="lh-room-card-"]) img {
  aspect-ratio: 4 / 3;
  object-position: center 54%;
}
.ps-card:where([data-block-id^="lh-room-card-"]) p {
  color: #676f5e;
  font-size: .94rem;
}
.ps-columns:where([data-block-id^="lh-editorial-"]) {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, .8fr);
  gap: clamp(22px, 5.5vw, 76px);
  align-items: center;
}
.ps-image:where([data-block-id^="lh-editorial-photo-"]) img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-position: 50% 57%;
}
.ps-section:where([data-block-id^="lh-editorial-copy-"]) {
  min-width: 0;
  gap: 15px;
}
.ps-gallery:where([data-block-id^="lh-gallery-"]) {
  max-width: none;
  padding-inline: max(var(--ps-gutter), calc((100vw - 1360px) / 2 + var(--ps-gutter)));
  background: #e8e6d9;
}
.ps-gallery:where([data-block-id^="lh-gallery-"]) img {
  aspect-ratio: 4 / 3;
}
.ps-section:where([data-block-id="lh-inquiry"]) {
  max-width: 900px;
}
.ps-form:where([data-block-id="lh-inquiry-form"]) {
  background: #e8e6d9;
  padding: clamp(20px, 4vw, 52px);
}
.ps-footer:where([data-block-id^="lh-footer-"]) {
  max-width: none;
  padding: clamp(35px, 6vw, 72px) max(var(--ps-gutter), calc((100vw - 1340px) / 2 + var(--ps-gutter)));
  background: #303c2e;
  color: #fff9ec;
}
:where([data-block-id^="lh-footer-"]) .ps-brand {
  font: 400 2.4rem/.92 var(--ps-heading-font);
  letter-spacing: -.045em;
}
:where([data-block-id^="lh-footer-"]) .ps-brand + p {
  color: #dddccd;
}
@media (max-width: 767px) {
  :where([data-block-id^="lh-nav-"]) .ps-nav-inner {
    min-height: 62px;
    grid-template-columns: minmax(60px, 1fr) auto minmax(60px, 1fr);
    gap: 8px;
  }
  :where([data-block-id^="lh-nav-"]) .ps-nav-mobile {
    grid-column: 1;
    grid-row: 1;
    margin: 0;
  }
  .ps-nav:where([data-block-id^="lh-nav-"]) .ps-button {
    padding-inline: 9px;
    font-size: .72rem;
  }
  .ps-hero:where([data-block-id^="lh-hero-"]) {
    min-height: clamp(430px, calc(100svh - 62px), 530px);
    padding-block: 44px;
  }
  .ps-hero:where([data-block-id^="lh-hero-"]) img {
    object-position: 54% 42%;
  }
  .ps-hero:where([data-block-id^="lh-hero-"]) h1 {
    font-size: var(--ps-title-size, var(--ps-h1-size, clamp(3.6rem, 13.6vw, 6rem)));
  }
  .ps-columns:where([data-block-id^="lh-editorial-"]) {
    grid-template-columns: minmax(0, 1fr);
  }
  .ps-columns:where([data-block-id^="lh-rooms-"]) {
    gap: 30px;
  }
  .ps-gallery:where([data-block-id^="lh-gallery-"]) .ps-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  :where([data-block-id^="lh-gallery-"]) figcaption {
    line-height: 1.35;
  }
}
`.trim()

export function createStarterProject() {
  const project = createEmptyProject('Lindenbank House')
  Object.assign(project.settings, {
    font:'DM Sans',
    headingFont:'Instrument Serif',
    accent:'#394934',
    background:'#f6f0e4',
    textColor:'#252e22',
    customCss:lindenbankStyles,
  })
  const hotelPhoto = name => './assets/hotel/' + name + '.webp'
  const pageLink = name => 'page:page-' + name
  const menu = 'Rooms | page:page-rooms\nDining | page:page-dining\nOutdoors | page:page-locale'
  const brand = 'Lindenbank House'
  const nav = { brand, autoLinks:false, links:menu, buttonText:'Book a stay', buttonLink:pageLink('book') }
  const footer = { brand, autoLinks:false, text:'Richmond upon Thames, England', links:menu + '\nReservations | page:page-book' }
  const page = (id, slug, name, blocks) => ({
    id:'page-' + id, slug, name, blocks:[
      demoBlock('lh-nav-' + id, 'nav', nav),
      ...blocks,
      demoBlock('lh-footer-' + id, 'footer', footer),
    ],
  })
  const hero = (id, title, text, photo, alt, buttonText = '', href = '') => demoBlock('lh-hero-' + id, 'hero', {
    title, text, image:hotelPhoto(photo), alt, buttonText, buttonLink:href, layout:'center',
  })
  const heading = (id, text) => demoBlock('lh-heading-' + id, 'heading', { text, tag:'h2' })
  const note = (id, text) => demoBlock('lh-note-' + id, 'text', { text })
  const section = (id, label, children) => demoBlock('lh-prose-' + id, 'section', { label }, {}, children)
  const button = (id, text, href) => demoBlock('lh-link-' + id, 'button', { text, href, variant:'outline' })
  const gallery = (id, title, images) => demoBlock('lh-gallery-' + id, 'gallery', {
    title, columns:'3', images:images.map(([image, alt, caption]) => [hotelPhoto(image), alt, caption].join(' | ')).join('\n'),
  })
  const editorial = (id, photo, alt, title, text, action) => section(id, title, [
    demoBlock('lh-editorial-' + id, 'columns', { columns:'2' }, {}, [
      demoBlock('lh-editorial-photo-' + id, 'image', { src:hotelPhoto(photo), alt }),
      demoBlock('lh-editorial-copy-' + id, 'section', { label:title }, {}, [heading(id,title),note(id,text),...(action ? [action] : [])]),
    ]),
  ])
  const rooms = [
    ['river','River rooms','river-room','Natural curtains at a light-filled guest room window','Two guests · King bed · River-facing'],
    ['garden','Garden rooms','garden-room','A neatly made king bed beside timber walls','Two guests · King bed · Garden-facing'],
    ['loft','The loft','loft-room','A guest bedroom with warm wooden panelling','Two guests · Double bed · Top floor'],
  ]
  const roomCards = (id, href, action) => demoBlock('lh-rooms-' + id, 'columns', { columns:'3' }, {}, rooms.map(
    ([room, title, image, alt, text]) => demoBlock('lh-room-card-' + id + '-' + room, 'card', {
      title, text, image:hotelPhoto(image), alt,
    }, {}, [button(id + '-' + room, action, href)]),
  ))

  project.pages = [
    page('home','index','Home',[
      hero('home','A house by the river.','Twelve guest rooms, breakfast in the old dining room and the Thames on your doorstep.','manor','Historic red brick country house set among trees and a clipped hedge','Explore the rooms',pageLink('rooms')),
      section('home-rooms','Guest rooms',[
        heading('home-rooms','Stay at Lindenbank'),
        note('home-rooms','Choose a room looking across the river or a quieter room facing the garden. Breakfast is included with each stay.'),
        roomCards('home',pageLink('rooms'),'View rooms'),
      ]),
      editorial('home-dining','tea','A white teapot with two cups on a wooden table','Breakfast at the house','Tea and coffee go on at eight. Take a seat by the window for toasted sourdough, seasonal fruit, eggs or a bowl of porridge.',button('home-dining','Dining hours',pageLink('dining'))),
      gallery('home','Along the river',[
        ['riverbend','A still bend of the river bordered by reeds','The towpath'],
        ['orchard','Rows of trees in an orchard in autumn','The orchard'],
        ['woodland','A path winding between woodland trees','Woodland walks'],
      ]),
      section('home-visit','Your visit',[
        heading('home-visit','Planning your stay'),
        demoBlock('block-demo-caption','text',{text:'Check-in is from 3 pm. If you arrive earlier, leave your bags with us and take a walk along the river.'}),
        demoBlock('block-demo-action','button',{text:'What about check-out?',href:'#',variant:'outline'}),
        button('home-book','Plan a stay',pageLink('book')),
      ]),
    ]),
    page('rooms','rooms','Rooms',[
      hero('sub-rooms','Rooms at the house','Every room has its own layout. All have private bathrooms, natural linen and a place to sit with a book.','river-room','A tall window and natural curtains inside a guest room','Plan a stay',pageLink('book')),
      section('room-types','Room types',[heading('room-types','Find your room'),roomCards('all',pageLink('book'),'Request a stay')]),
      editorial('room-parlour','parlour','Green sofa in a plain, sunny sitting room','The downstairs parlour','The parlour is open all day. Bring your own book or borrow one from the shelves. Tea is available until late.'),
    ]),
    page('dining','dining','Dining',[
      hero('sub-dining','At the table','Breakfast is served from 8 to 10:30 am. Tea is available in the parlour from 3 to 5 pm.','bread','A freshly sliced loaf of bread on a wooden board'),
      editorial('dining-breakfast','breakfast','A bowl of porridge with berries and banana','The breakfast menu','Start with porridge, fruit or sourdough toast. Eggs are cooked to order and the kitchen can accommodate dietary requirements with notice.'),
      gallery('dining','From the kitchen',[
        ['bread','Thick slices cut from a loaf of bread','Sourdough toast'],
        ['tea','Ceramic teapot and cups on a wooden table','Loose leaf tea'],
        ['breakfast','Porridge topped with fresh fruit','Porridge and fruit'],
      ]),
    ]),
    page('locale','outdoors','Outdoors',[
      hero('sub-locale','Out by the Thames','Follow the towpath for a short walk or spend the afternoon exploring the meadows and parks around Richmond.','richmond','A broad sweep of the Thames with trees and meadows beyond'),
      editorial('outdoors-towpath','riverbend','Reeds reflected in calm river water','Walk from the house','Follow the river towards the Richmond waterfront. Bring a coat in wet weather and check the tide before taking the lowest part of the path.'),
      gallery('locale','Beyond the waterfront',[
        ['footbridge','Footbridge over a still canal','Waterfront paths'],
        ['woodland','An earthen path in open woodland','Woodland'],
        ['garden','Rain on broad leaves beside a paved path','Gardens'],
      ]),
    ]),
    page('book','book','Book a stay',[
      hero('sub-book','Book a stay','Choose your dates and tell us which room you would like.','house-portrait','Close view of an ivy-covered stone house and its windows'),
      demoBlock('lh-inquiry','section',{label:'Stay inquiry'}, {}, [
        demoBlock('lh-inquiry-form','form',{
          title:'Your dates',
          text:'This sample form previews an inquiry without sending it.',
          fields:'Arrival | date | yes\nDeparture | date | yes\nEmail | email | yes\nRoom preference | text | no',
          usePreset:true,
          buttonText:'Preview inquiry',
        }),
        demoBlock('lh-inquiry-status','text',{text:''}),
      ]),
    ]),
  ]
  project.settings.customJs = `
const inquiry = document.querySelector('[data-block-id="lh-inquiry-form"]');
const confirmation = document.querySelector('[data-block-id="lh-inquiry-status"]');
if (inquiry && confirmation) {
  confirmation.setAttribute('role', 'status');
  inquiry.addEventListener('submit', event => {
    event.preventDefault();
    const values = new FormData(inquiry);
    const arrival = values.get('arrival');
    const departure = values.get('departure');
    if (departure <= arrival) {
      confirmation.textContent = 'Choose a departure date after your arrival.';
      return;
    }
    confirmation.textContent = 'Inquiry previewed for ' + arrival + ' to ' + departure + '. No booking was made.';
  });
}
`.trim()
  return project
}

function unique(value, used, fallback) {
  let candidate = value
  while (!candidate || used.has(candidate)) candidate = fallback()
  used.add(candidate)
  return candidate
}

const customSource = source => typeof source === 'string' ? source.slice(0,250000) : ''

export function normalizeProject(input) {
  const source = object(input)
  const initial = createEmptyProject()
  const pageIds = new Set(), blockIds = new Set(), slugs = new Set()
  function normalizeBlock(raw) {
    const value = object(raw)
    return createBlock(value.type,{
      id: unique(typeof value.id === 'string' ? value.id : '',blockIds,() => createId()),
      props: object(value.props), style: object(value.style), styles: object(value.styles),
      children: list(value.children).map(normalizeBlock),
    })
  }
  const pages = list(source.pages).map((raw,index) => {
    const value = object(raw)
    const id = unique(typeof value.id === 'string' ? value.id : '',pageIds,() => createId('page'))
    const name = String(value.name ?? value.title ?? 'Page '+(index+1))
    const base = slugify(value.slug || (index === 0 ? 'index' : name)) || 'page'
    let suffix = 1
    const slug = unique(base,slugs,() => base + '-' + ++suffix)
    return { id,name,slug,blocks:list(value.blocks).map(normalizeBlock) }
  })
  const graph = object(source.graph)
  const settings = { ...initial.settings, ...object(source.settings) }
  settings.customCss = customSource(settings.customCss)
  settings.customJs = customSource(settings.customJs)
  return {
    version:1,name:String(source.name || initial.name),
    settings,
    pages:pages.length ? pages : initial.pages,
    graph:{ ...graph,nodes:list(graph.nodes),edges:list(graph.edges) },
    data:normalizeData(source.data),
    backend:backendModel(source.backend),
  }
}

export const serializeProject = project => JSON.stringify(normalizeProject(project),null,2)

export function deserializeProject(json) {
  const value = JSON.parse(json)
  if (!value || typeof value !== 'object' || !Array.isArray(value.pages)) throw new Error('This file does not contain a website project.')
  if (value.version !== undefined && value.version !== 1) throw new Error('This project version is unsupported.')
  return normalizeProject(value)
}

const entities = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character])
const lines = value => String(value ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
const rows = value => lines(value).map(line => line.split('|').map(part => part.trim()))
const choose = (value, allowed, fallback) => allowed.includes(value) ? value : fallback

const mediaDataTypes = {
  image: /^data:image\/(?:avif|gif|jpe?g|png|webp|bmp|x-icon|svg\+xml);(?:base64|utf8|charset=utf-8)[,;]/i,
  video: /^data:video\/(?:mp4|webm|ogg|quicktime);base64,/i,
  audio: /^data:audio\/(?:mpeg|mp3|mp4|ogg|webm|wav|x-wav|aac|flac);base64,/i,
}

function cleanUrl(value, kind = '') {
  const url = String(value ?? '').trim()
  if (!url || /[\u0000-\u001f\u007f\\]/.test(url)) return ''
  if (/^data:/i.test(url)) {
    return mediaDataTypes[kind]?.test(url) ? url : ''
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(url) && !(kind ? /^https?:/i : /^(?:https?|mailto|tel):/i).test(url)) return ''
  return url
}

export const pageFile = page => (slugify(page?.slug) || 'index') + '.html'

function linkAttributes(value, options = {}, newTab = false) {
  const input = String(value ?? '').trim()
  const fragmentStart = input.indexOf('#')
  const destination = fragmentStart === -1 ? input : input.slice(0, fragmentStart)
  const fragment = fragmentStart === -1 ? '' : input.slice(fragmentStart)
  const id = destination.startsWith('page:') ? destination.slice(5) : null
  const filename = destination.replace(/^\.\//, '')
  const page = options.project?.pages.find(item => id === item.id || filename === pageFile(item) || filename === item.slug)
  const href = page ? pageFile(page) + cleanUrl(fragment) : cleanUrl(input) || '#'
  const active = page && page.id === options.page?.id ? ' aria-current="page"' : ''
  const route = page ? ' data-page-link="' + esc(page.id) + '"' : ''
  const blank = newTab ? ' target="_blank" rel="noopener noreferrer"' : ''
  return 'href="' + esc(href) + '"' + active + route + blank
}

function navItems(props, options) {
  const manual = rows(props.links)
  const automatic = props.autoLinks ? (options.project?.pages ?? []).map(page => [page.name, 'page:' + page.id]) : []
  return [...manual, ...automatic].map(([label, href]) => '<a ' + linkAttributes(href, options) + '>' + esc(label) + '</a>').join('')
}

function action(label, href, options, variant = 'primary', attr = '', newTab = false) {
  if (!label) return ''
  const classes = ' class="ps-button ps-button-' + variant + '"'
  if (!href || href === '#') return '<button' + classes + ' type="button"' + attr + '>' + esc(label) + '</button>'
  return '<a' + classes + ' ' + linkAttributes(href, options, newTab) + attr + '>' + esc(label) + '</a>'
}

function element(tag, value, attr = '') {
  return value ? '<' + tag + attr + '>' + esc(value) + '</' + tag + '>' : ''
}

function photo(src, alt, eager = false) {
  const url = cleanUrl(src, 'image')
  if (!url) return ''
  return '<img src="' + esc(url) + '" alt="' + esc(alt) + '"' + (eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async">'
}

function figure(src, alt, caption, eager = false) {
  const img = photo(src, alt, eager)
  return img ? '<figure>' + img + element('figcaption', caption) + '</figure>' : ''
}

function fieldInput(label, kind, required, index) {
  const type = choose(kind, ['text','email','tel','url','number','date','textarea','checkbox'], 'text')
  const name = slugify(label) || 'field-' + (index + 1)
  const attr = ' name="' + name + '"' + (/^(yes|tak|true|1|required)$/i.test(required ?? '') ? ' required' : '')
  const control = type === 'textarea' ? '<textarea rows="4"' + attr + '></textarea>' : '<input type="' + type + '"' + attr + '>'
  return '<label class="ps-field' + (type === 'checkbox' ? ' ps-confirm' : '') + '"><span>' + esc(label) + '</span>' + control + '</label>'
}

function inputAttrs(props) {
  const name = props.name || slugify(props.label) || 'field'
  return ' name="' + esc(name) + '"' + (props.required ? ' required' : '')
}

function nativeInput(props) {
  const kind = choose(props.kind,['text','textarea','email','tel','url','number','date','datetime-local','password','search','file'],'text')
  const placeholder = props.placeholder && !['date','datetime-local','file'].includes(kind) ? ' placeholder="' + esc(props.placeholder) + '"' : ''
  if (kind === 'textarea') return '<textarea rows="4"' + inputAttrs(props) + placeholder + '>' + esc(props.defaultValue) + '</textarea>'
  const value = kind !== 'file' && kind !== 'password' && props.defaultValue != null ? ' value="' + esc(props.defaultValue) + '"' : ''
  return '<input type="' + kind + '"' + inputAttrs(props) + placeholder + value + '>'
}

function nativeSelect(props) {
  const options = rows(props.options).map(([label, value = label]) => [label, value])
  const selected = options.findIndex(([,value]) => value === props.defaultValue && value !== '')
  const placeholder = props.placeholder ? '<option value="" disabled' + (selected >= 0 ? '' : ' selected') + '>' + esc(props.placeholder) + '</option>' : ''
  const items = options.map(([label,value], index) =>
    '<option value="' + esc(value) + '"' + (index === selected ? ' selected' : '') + '>' + esc(label) + '</option>')
  return '<select' + inputAttrs(props) + '>' + placeholder + items.join('') + '</select>'
}

function renderMedia(type, props, attr, preview) {
  const src = cleanUrl(props.src,type)
  const title = props.title || (type === 'video' ? 'Video' : 'Audio')
  if (!src) {
    let visual = ''
    if (preview && props.designVariant) {
      const poster = cleanUrl(props.poster,'image')
      visual = type === 'audio'
        ? '<audio aria-label="' + esc(title) + '" controls preload="none"></audio>' + element('figcaption',props.caption)
        : poster ? '<video aria-label="' + esc(title) + '" poster="' + esc(poster) + '" controls preload="none"></video>' : ''
    }
    return '<figure' + attr + '>' + (preview ? visual || '<div class="ps-image-placeholder">' + esc(title) + '</div>' : '') + '</figure>'
  }
  const attributes = ' src="' + esc(src) + '" aria-label="' + esc(title) + '" controls preload="metadata"' + (props.loop ? ' loop' : '')
  if (type === 'audio') return '<figure' + attr + '><audio' + attributes + '></audio>' + element('figcaption',props.caption) + '</figure>'
  const poster = cleanUrl(props.poster,'image')
  const captions = cleanUrl(props.captions,'track')
  const track = captions ? '<track kind="captions" src="' + esc(captions) + '" srclang="' + esc(props.captionLanguage || 'en') + '" label="' + esc(props.captionLabel || 'Captions') + '">' : ''
  return '<figure' + attr + '><video' + attributes + ' playsinline' + (props.muted ? ' muted' : '') +
    (poster ? ' poster="' + esc(poster) + '"' : '') + '>' + track + '</video></figure>'
}

function renderTable(props, attr) {
  const headings = String(props.headers ?? '').split('|').map(value => value.trim())
  const body = rows(props.rows)
  const columns = body.reduce((width,row) => Math.max(width,row.length),headings.length)
  const cells = (items, tag) => Array.from({length:columns}, (_, index) =>
    '<' + tag + (tag === 'th' ? ' scope="col"' : '') + '>' + esc(items[index]) + '</' + tag + '>').join('')
  const label = props.caption || 'Table'
  return '<div' + attr + ' role="region" aria-label="' + esc(label) + '" tabindex="0"><table>' +
    element('caption',props.caption) + (headings.some(Boolean) ? '<thead><tr>' + cells(headings,'th') + '</tr></thead>' : '') +
    '<tbody>' + body.map(row => '<tr>' + cells(row,'td') + '</tr>').join('') + '</tbody></table></div>'
}

export function recordsTableColumnDraft(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0,RECORDS_TABLE_MAX_COLUMNS).map(column => ({
    field: typeof column?.field === 'string' ? column.field.slice(0,RECORDS_TABLE_FIELD_LENGTH + 1) : '',
    label: typeof column?.label === 'string' ? column.label.slice(0,RECORDS_TABLE_LABEL_LENGTH) : '',
  }))
}

export function validRecordsTableField(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= RECORDS_TABLE_FIELD_LENGTH &&
    !/[\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(value) && !['__proto__','constructor','prototype'].includes(value)
}

function renderRecordsTable(props, attr) {
  const message = key => (typeof props[key] === 'string' && props[key].trim().slice(0,200)) || recordsTableStatus[key]
  const caption = typeof props.caption === 'string' ? props.caption.trim().slice(0,160) : ''
  const empty = message('emptyText')
  const fields = new Set()
  const headings = recordsTableColumnDraft(props.columns).map(column => {
    const field = column.field.trim(), label = column.label.trim()
    if (!label || !validRecordsTableField(field) || fields.has(field)) return ''
    fields.add(field)
    return '<th scope="col" data-records-field="' + esc(field) + '">' + esc(label) + '</th>'
  }).join('')
  return '<div' + attr + ' data-records-state="empty" data-records-empty="' + esc(empty) + '" data-records-loading="' + esc(message('loadingText')) +
    '" data-records-error="' + esc(message('errorText')) + '"><div class="ps-table ps-records-scroll" role="region" aria-label="' + esc(caption || 'Records') +
    '" tabindex="0"><table data-records-table>' + element('caption',caption) + (headings ? '<thead><tr>' + headings + '</tr></thead>' : '') +
    '<tbody data-records-body></tbody></table></div><p class="ps-records-status" data-records-status role="status" aria-live="polite">' + esc(empty) + '</p></div>'
}

export function renderBlock(block, options = {}) {
  const type = Object.hasOwn(BLOCK_TYPES, block.type) ? block.type : 'section'
  const props = { ...BLOCK_TYPES[type].defaults, ...block.props }
  const variant = findBlockVariant(type, props.designVariant)
  const design = variant ? ' data-block-design="' + variant.layout + '" data-block-tone="' + variant.tone + '"' : ''
  const attr = ' data-block-id="' + esc(block.id) + '" data-block-type="' + type + '"' + design
  const cls = name => ' class="ps-block ps-' + type + (name ? ' ' + name : '') + '"' + attr
  const children = (context = options) => list(block.children).map(child => renderBlock(child, context)).join('')
  const home = options.project?.pages[0]
  const homeLink = home ? 'page:' + home.id : 'index.html'
  const anchor = slugify(props.anchor)
  const anchorAttr = anchor ? ' id="' + anchor + '"' : ''
  const logicText = ' data-logic-text'
  const columns = () => choose(String(props.columns), ['2','3','4'], '2')
  switch (type) {
    case 'nav': {
      const items = navItems(props, options)
      return '<header' + cls() + '><div class="ps-nav-inner"><a class="ps-brand" ' + linkAttributes(homeLink, options) + '>' + esc(props.brand) + '</a>' +
        (items ? '<nav class="ps-nav-desktop" aria-label="Main navigation">' + items + '</nav><details class="ps-nav-mobile"><summary>Menu</summary><nav aria-label="Main navigation">' + items + '</nav></details>' : '') +
        action(props.buttonText, props.buttonLink, options, 'outline') + '</div></header>'
    }
    case 'hero': {
      const visual = figure(props.image, props.alt, props.caption, true)
      const layout = choose(props.layout, ['split','center','reverse'], 'split')
      return '<section' + cls('ps-hero-' + layout + (visual ? ' ps-hero-with-image' : '')) + '><div class="ps-hero-copy">' +
        element('p',props.eyebrow,' class="ps-eyebrow"') + element('h1',props.title,logicText) +
        element('p',props.text,' class="ps-hero-description"') + action(props.buttonText,props.buttonLink,options) + '</div>' + visual + '</section>'
    }
    case 'section':
      return '<section' + cls() + anchorAttr + (props.label ? ' aria-label="' + esc(props.label) + '"' : '') + '>' + children() + '</section>'
    case 'columns':
      return '<div' + cls('ps-columns-' + columns()) + '>' + children() + '</div>'
    case 'heading': {
      const tag = choose(props.tag, ['h1','h2','h3','h4','h5','h6'], 'h2')
      return '<' + tag + cls() + anchorAttr + logicText + '>' + esc(props.text) + '</' + tag + '>'
    }
    case 'text':
      return '<p' + cls() + logicText + '>' + esc(props.text) + '</p>'
    case 'list': {
      const tag = props.ordered ? 'ol' : 'ul'
      return '<' + tag + cls() + '>' + lines(props.items).map(item => '<li>' + esc(item) + '</li>').join('') + '</' + tag + '>'
    }
    case 'code':
      return '<figure' + cls() + '>' + element('figcaption',props.language) + '<pre><code data-logic-text>' + esc(props.code) + '</code></pre></figure>'
    case 'image': {
      const placeholder = options.preview ? '<div class="ps-image-placeholder">Image</div>' : ''
      return '<figure' + cls() + '>' + (photo(props.src,props.alt) || placeholder) + element('figcaption',props.caption) + '</figure>'
    }
    case 'button': {
      const variant = choose(props.variant, ['outline','text','primary'], 'primary')
      return action(props.text || 'Button',props.href,options,variant,attr + logicText,props.newTab)
    }
    case 'link':
      return '<a' + cls() + ' ' + linkAttributes(props.href,options,props.newTab) + logicText + '>' + esc(props.text || 'Link') + '</a>'
    case 'input':
    case 'select':
      return '<label' + cls('ps-field') + '>' + element('span',props.label || 'Field',logicText) +
        (type === 'input' ? nativeInput(props) : nativeSelect(props)) + '</label>'
    case 'toggle':
      return '<label' + cls('ps-switch') + '><input type="checkbox" role="switch"' + inputAttrs(props) +
        ' value="' + esc(props.value || 'on') + '"' + (props.checked ? ' checked' : '') + '>' + element('span',props.label || 'Toggle',logicText) + '</label>'
    case 'video':
    case 'audio':
      return renderMedia(type,props,cls(),options.preview)
    case 'table':
      return renderTable(props,cls())
    case 'records-table':
      return renderRecordsTable(props,cls())
    case 'progress': {
      const amount = Number(props.value)
      const limit = Number(props.max)
      const max = Number.isFinite(limit) && limit > 0 ? limit : 100
      const value = Number.isFinite(amount) ? Math.max(0,Math.min(amount,max)) : 0
      return '<label' + cls() + '><span class="ps-progress-label">' + element('span',props.label || 'Progress',logicText) +
        (props.showValue ? '<span>' + value + ' / ' + max + '</span>' : '') + '</span><progress value="' + value + '" max="' + max + '"></progress></label>'
    }
    case 'callout': {
      const variant = choose(props.variant,['note','tip','warning'],'note')
      return '<aside' + cls('ps-callout-' + variant) + ' role="note">' +
        element('h3',props.title,logicText) + element('p',props.text) + '</aside>'
    }
    case 'feature':
      return '<article' + cls() + '>' + element('p',props.eyebrow,' class="ps-eyebrow"') + element('h3',props.title,logicText) +
        element('p',props.text) + action(props.linkText,props.href,options,'text') + '</article>'
    case 'card':
      return '<article' + cls() + '>' + photo(props.image,props.alt) + element('h3',props.title,logicText) + element('p',props.text) + children() + '</article>'
    case 'gallery':
      return '<section' + cls() + '>' + element('h2',props.title,logicText) + '<div class="ps-columns ps-columns-' + columns() + '">' +
        rows(props.images).map(([src,alt,caption]) => figure(src,alt,caption)).join('') + '</div></section>'
    case 'quote':
      return '<figure' + cls() + '>' + element('blockquote',props.text,logicText) + element('figcaption',props.author) + '</figure>'
    case 'pricing':
      return '<article' + cls() + '>' + element('h3',props.title,logicText) + '<p class="ps-price"><strong>' + esc(props.price) + '</strong> ' +
        esc(props.period) + '</p><ul>' + lines(props.items).map(item => '<li>' + esc(item) + '</li>').join('') + '</ul>' + action(props.buttonText,props.buttonLink,options) + '</article>'
    case 'faq':
      return '<section' + cls() + '>' + element('h2',props.title,logicText) + rows(props.items).map(([question,answer]) =>
        '<details><summary>' + esc(question) + '</summary><p>' + esc(answer) + '</p></details>').join('') + '</section>'
    case 'form': {
      const tag = options.inForm ? 'section' : 'form'
      const attrs = cls() + (options.inForm ? '' : ' method="post"') + (props.title ? ' aria-label="' + esc(props.title) + '"' : '')
      const fields = props.usePreset ? rows(props.fields).map(([label,kind,required],index) => fieldInput(label,kind,required,index)).join('') : ''
      const submit = options.inForm ? '' : '<button class="ps-button ps-button-primary" type="submit">' + esc(props.buttonText || 'Send') + '</button>'
      return '<' + tag + attrs + '>' + element('h2',props.title,logicText) + element('p',props.text) +
        fields + children({ ...options, inForm:true }) + submit + '</' + tag + '>'
    }
    case 'divider':
      return '<hr' + cls() + '>'
    case 'spacer': {
      const size = Number(props.height)
      const height = Number.isFinite(size) ? Math.max(0, Math.min(1200, size)) : 48
      return '<div' + cls() + ' style="--ps-spacer-height:' + height + 'px" aria-hidden="true"></div>'
    }
    case 'footer':
      return '<footer' + cls() + '><div><a class="ps-brand" ' + linkAttributes(homeLink,options) + '>' + esc(props.brand) + '</a>' +
        element('p',props.text,logicText) + '</div><nav aria-label="Footer">' + navItems(props,options) + '</nav></footer>'
  }
}

export function renderPage(page, project, options = {}) {
  const context = { ...options, page, project }
  const blocks = list(page?.blocks)
  const top = blocks[0]?.type === 'nav' ? renderBlock(blocks[0],context) : ''
  const bottom = blocks.at(-1)?.type === 'footer' ? renderBlock(blocks.at(-1),context) : ''
  const content = blocks.slice(top ? 1 : 0, bottom ? -1 : undefined)
  return top + '<main id="content">' + content.map(block => renderBlock(block,context)).join('') + '</main>' + bottom
}

const baseCss = `
*{box-sizing:border-box}
:root{color-scheme:light;--ps-line:#e4e6df;--ps-soft:#f3f4ef;--ps-gutter:clamp(18px,4.5vw,74px);--ps-width:1500px}
html{min-height:100%}
body{margin:0;color:var(--ps-ink);background:var(--ps-background);font:400 var(--ps-body-size,16px)/1.55 var(--ps-font)}
main{min-height:30vh}
a{color:inherit;text-underline-offset:3px}
a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--ps-accent);outline-offset:4px}
p,h1,h2,h3,h4,h5,h6,figure,blockquote{margin:0}
h1,h2,h3,h4,h5,h6{font-family:var(--ps-heading-font);font-weight:400;line-height:1.04;overflow-wrap:anywhere}
h1{font-size:var(--ps-h1-size,clamp(3.8rem,7.5vw,7.2rem));letter-spacing:-.035em}
h2{font-size:var(--ps-h2-size,clamp(2.6rem,4vw,4.8rem));letter-spacing:-.025em}
h3{font-size:var(--ps-h3-size,clamp(1.65rem,2.45vw,2.65rem));letter-spacing:-.015em}
h4{font-size:1.42rem}h5{font-size:1.15rem}h6{font-size:1rem}
h1,h2,h3,p{white-space:pre-line}
img{display:block;max-width:100%;height:auto}
figcaption{font-size:.72rem;color:#545951;margin-top:9px}
input,textarea,button{font:inherit}
.ps-nav{border-bottom:1px solid var(--ps-line)}
.ps-nav-inner{max-width:var(--ps-width);margin:0 auto;padding:10px var(--ps-gutter);min-height:64px;display:flex;align-items:center;gap:28px;position:relative}
.ps-brand{font-family:var(--ps-font);font-weight:700;letter-spacing:-.065em;font-size:1.48rem;line-height:1;color:inherit;text-decoration:none;white-space:nowrap}
.ps-nav-desktop,.ps-footer nav{display:flex;gap:clamp(16px,3vw,36px);align-items:center;flex-wrap:wrap}
.ps-nav-desktop{margin-left:auto}
.ps-nav nav a,.ps-footer nav a{font-size:.8rem;text-decoration:none;font-weight:500}
.ps-nav nav a:hover,.ps-nav nav a[aria-current],.ps-footer nav a:hover{text-decoration:underline}
.ps-nav-mobile{display:none}
.ps-nav-mobile summary{cursor:pointer;font-size:.85rem;font-weight:600;padding:12px 4px;min-height:44px;list-style:none}
.ps-nav-mobile summary::-webkit-details-marker{display:none}
.ps-nav-mobile summary::after{content:"+";margin-left:5px}
.ps-nav-mobile[open] summary::after{content:"−"}
.ps-nav-mobile nav{position:absolute;z-index:2;top:100%;left:0;right:0;display:grid;padding:10px var(--ps-gutter);background:var(--ps-background);border-bottom:1px solid var(--ps-line)}
.ps-nav-mobile nav a{display:block;padding:12px 0}
.ps-button{display:inline-flex;align-items:center;justify-content:center;align-self:flex-start;min-height:44px;max-width:100%;padding:10px 16px;border:1px solid transparent;text-align:center;text-decoration:none;font-size:.82rem;font-weight:600;line-height:1.25;cursor:pointer}
.ps-nav .ps-button{align-self:center;min-height:39px;padding:8px 15px}
.ps-button-primary{background:var(--ps-accent);color:var(--ps-on-accent);border-color:var(--ps-accent)}
.ps-button-outline{background:transparent;color:inherit;border-color:currentColor}
.ps-button-text{padding-inline:0;text-decoration:underline;color:inherit;background:transparent}
.ps-button:hover{opacity:.78}
.ps-hero{display:grid;gap:clamp(28px,5vw,80px);padding:clamp(34px,6vw,92px) var(--ps-gutter);margin:0 auto;max-width:var(--ps-width);align-items:center}
.ps-hero-with-image.ps-hero-split,.ps-hero-with-image.ps-hero-reverse{grid-template-columns:minmax(0,.86fr) minmax(0,1.14fr)}
.ps-hero-reverse figure{grid-column:1;grid-row:1}.ps-hero-reverse .ps-hero-copy{grid-column:2;grid-row:1}
.ps-hero-center .ps-hero-copy{margin:0 auto;text-align:center}.ps-hero-center .ps-hero-copy .ps-button{align-self:center}
.ps-hero-copy{display:grid;gap:clamp(13px,1.6vw,22px);justify-items:start;min-width:0}
.ps-hero-center .ps-hero-copy{justify-items:center}
.ps-hero h1{font-size:var(--ps-title-size,var(--ps-h1-size,clamp(3.2rem,8vw,8rem)));line-height:.93}
.ps-eyebrow{font-family:var(--ps-font);font-size:.68rem;font-weight:600;letter-spacing:.12em}
.ps-hero-description{max-width:37ch;color:var(--ps-secondary);font-size:1rem}
.ps-hero figure{position:relative;min-width:0;align-self:start}
.ps-hero img{width:100%;height:clamp(290px,43vw,700px);object-fit:cover}
.ps-hero-center img{height:clamp(250px,38vw,520px)}
.ps-section,.ps-gallery{display:grid;gap:24px;padding:clamp(32px,5vw,76px) var(--ps-gutter);max-width:var(--ps-width);margin:0 auto}
.ps-section .ps-section{width:100%;padding:0}
.ps-section > .ps-button{justify-self:start}
.ps-columns{display:grid;gap:clamp(15px,2vw,34px);align-items:start;min-width:0}
.ps-columns-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.ps-columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.ps-columns-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.ps-feature,.ps-card,.ps-pricing{display:grid;gap:12px;justify-items:start;align-content:start;min-width:0}
.ps-feature{border-top:1px solid var(--ps-line);padding-top:16px}
.ps-card,.ps-pricing{padding:22px;border:1px solid var(--ps-line)}
.ps-card img,.ps-gallery img,.ps-image img{width:100%;max-height:580px;object-fit:cover}
.ps-image{display:var(--ps-image-frame,block);grid-template-rows:minmax(0,1fr) auto}
.ps-image > img{height:var(--ps-image-fill,auto);max-height:var(--ps-image-fill,580px);min-height:0}
.ps-image-placeholder{min-height:160px;display:grid;place-items:center;background:var(--ps-soft);color:#5f6359}
.ps-image > .ps-image-placeholder{height:var(--ps-image-fill,auto);min-height:var(--ps-image-placeholder-min,160px)}
.ps-price strong{font-size:2.15rem}
.ps-pricing ul{padding-left:18px;margin:4px 0}
.ps-quote{display:grid;gap:8px;padding:16px 0 16px 20px;border-left:2px solid var(--ps-accent)}
.ps-quote blockquote{font-family:var(--ps-heading-font);font-size:2rem;line-height:1.25}
.ps-faq{display:grid;gap:12px}
.ps-faq details{border-bottom:1px solid var(--ps-line);padding:10px 0}
.ps-faq summary{cursor:pointer;min-height:34px;font-weight:600}
.ps-faq details p{padding-bottom:10px}
.ps-form{display:grid;gap:14px;width:min(100%,620px);justify-items:start}
.ps-field{width:100%;display:grid;gap:5px}
.ps-field.ps-confirm{display:flex;align-items:center;flex-direction:row-reverse;justify-content:flex-end}
.ps-field span{font-size:.88rem;font-weight:600}
.ps-field input:not([type=checkbox]),.ps-field textarea,.ps-field select{width:100%;min-width:0;padding:10px;border:1px solid #a7aca2;border-radius:0;background:var(--ps-background);color:var(--ps-ink);font:inherit}
.ps-link{display:inline-block;font-weight:600}
.ps-switch{display:flex;align-items:center;gap:10px;min-height:44px;width:fit-content}
.ps-switch input{width:20px;height:20px;margin:0;accent-color:var(--ps-accent)}
.ps-video video{display:block;width:100%;height:auto;max-height:700px;background:#151515}
.ps-audio audio{display:block;width:min(100%,620px)}
.ps-table{max-width:100%;overflow:auto}
.ps-table table{width:100%;border-collapse:collapse;text-align:start}
.ps-table caption{padding-bottom:10px;text-align:left;font-weight:600}
.ps-table :is(th,td){padding:10px 12px;border-bottom:1px solid var(--ps-line);text-align:start}
.ps-table th{background:var(--ps-soft);color:#181818}
.ps-records-table{min-width:0;max-width:100%}
.ps-records-scroll :is(th,td){min-width:8ch;max-width:40ch;overflow-wrap:anywhere}
.ps-records-status{margin-top:10px;color:var(--ps-secondary);overflow-wrap:anywhere}
.ps-records-status:empty{margin-top:0}
.ps-progress{display:grid;gap:8px;max-width:620px}
.ps-progress-label{display:flex;gap:10px;justify-content:space-between;font-weight:600}
.ps-progress progress{width:100%;height:12px;accent-color:var(--ps-accent)}
.ps-callout{display:grid;gap:8px;max-width:100%;padding:18px 20px;border-inline-start:3px solid var(--ps-accent);background:var(--ps-soft);color:#181818}
.ps-callout-tip{background:#eaf3eb;border-color:#257044}
.ps-callout-warning{background:#faf1df;border-color:#92580a}
.ps-list{padding-inline-start:24px;margin-block:0}
.ps-list li + li{margin-top:5px}
.ps-code{display:grid;gap:7px;min-width:0;max-width:100%}
.ps-code figcaption{margin-top:0;font-weight:600}
.ps-code pre{margin:0;padding:15px;background:var(--ps-soft);overflow:auto;color:#181818}
.ps-divider{border:0;border-top:1px solid var(--ps-line);width:100%;margin:12px 0}
.ps-spacer{min-height:var(--ps-spacer-height,48px)}
.ps-footer{max-width:var(--ps-width);margin:0 auto;padding:28px var(--ps-gutter);display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-top:1px solid var(--ps-line)}
.ps-footer .ps-brand + p{margin-top:8px;color:var(--ps-secondary);font-size:.78rem}
main > :where(.ps-heading,.ps-text,.ps-list,.ps-code,.ps-form,.ps-feature,.ps-card,.ps-faq,.ps-image,.ps-quote,.ps-pricing,.ps-columns,.ps-button,.ps-link,.ps-field,.ps-switch,.ps-video,.ps-audio,.ps-table,.ps-records-table,.ps-progress,.ps-callout){margin:24px var(--ps-gutter)}
main > .ps-field{width:auto}
@media (max-width:1023px){
  .ps-hero{gap:29px}
  .ps-hero-description{font-size:.95rem}
  .ps-columns-4{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:767px){
  .ps-nav-inner{min-height:59px;gap:13px;padding-block:7px}
  .ps-nav-desktop{display:none}
  .ps-nav-mobile{display:block;margin-left:auto}
  .ps-nav .ps-button{min-height:44px}
  .ps-hero-with-image.ps-hero-split,.ps-hero-with-image.ps-hero-reverse{grid-template-columns:minmax(0,1fr)}
  .ps-hero-reverse figure,.ps-hero-reverse .ps-hero-copy{grid-area:auto}
  .ps-hero h1{font-size:var(--ps-title-size,var(--ps-h1-size,clamp(3.45rem,12vw,5.25rem)))}
  .ps-hero img{height:clamp(245px,75vw,420px)}
  .ps-columns{grid-template-columns:minmax(0,1fr)}
  .ps-footer{flex-wrap:wrap}
}
`.trim()

const cssProps = new Set(('display direction flex flexWrap flexDirection flexGrow flexShrink flexBasis justifyContent alignItems alignSelf alignContent ' +
  'placeItems justifyItems justifySelf gridTemplateColumns gridTemplateRows gridAutoFlow gridColumn gridRow gap rowGap columnGap order ' +
  'width minWidth maxWidth height minHeight maxHeight aspectRatio margin marginTop marginRight marginBottom marginLeft marginInline marginBlock ' +
  'padding paddingTop paddingRight paddingBottom paddingLeft paddingInline paddingBlock position inset top right bottom left zIndex overflow overflowX overflowY ' +
  'background backgroundColor color opacity border borderTop borderRight borderBottom borderLeft borderWidth borderStyle borderColor borderRadius boxShadow ' +
  'outline outlineColor outlineOffset fontSize fontFamily fontWeight fontStyle lineHeight letterSpacing textAlign textTransform textDecoration whiteSpace overflowWrap ' +
  'objectFit objectPosition visibility transform verticalAlign').split(' '))
const scalarProps = new Set(['order','aspectRatio','zIndex','opacity','lineHeight','fontWeight','flex','flexGrow','flexShrink','gridColumn','gridRow'])
const customCssProps = { titleSize:'--ps-title-size' }
const cssKey = key => key.replace(/[A-Z]/g, char => '-' + char.toLowerCase())
const cssEscape = value => String(value).replace(/[^ _\p{L}\p{N}-]/gu, char => '\\' + char.codePointAt(0).toString(16) + ' ')
const cssQuoted = value => '"' + cssEscape(value) + '"'

function cssValue(key, value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value) + (scalarProps.has(key) || value === 0 ? '' : 'px')
  if (typeof value !== 'string') return ''
  const candidate = value.trim()
  if (!candidate || /[{};<>\\\u0000-\u001f]/.test(candidate) || /(?:url|expression)\s*\(/i.test(candidate)) return ''
  if (/^-?\d+(?:\.\d+)?$/.test(candidate) && !scalarProps.has(key) && candidate !== '0') return candidate + 'px'
  return candidate
}

function fontFamily(name, fallback = 'Inter') {
  const font = fontMetadata.has(name) ? name : fallback
  const category = fontMetadata.get(font)?.category
  const serif = category === 'Serif' || ['Georgia','Times New Roman'].includes(font)
  const mono = category === 'Monospace' || font === 'Courier New'
  const stack = serif ? ',Georgia,serif' : mono ? ',monospace' : category === 'Handwriting' ? ',cursive' : ',system-ui,sans-serif'
  return cssQuoted(font) + stack
}

function oppositeText(color) {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(String(color ?? ''))?.[1]
  if (!hex) return '#ffffff'
  const joined = hex.length === 3 ? [...hex].map(value => value + value).join('') : hex
  const channels = joined.match(/.{2}/g).map(value => {
    const n = Number.parseInt(value, 16) / 255
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? '#151515' : '#ffffff'
}

function projectTokens(settings) {
  const accent = cssValue('color',settings.accent) || '#181818'
  const declarations = {
    '--ps-accent':accent,
    '--ps-on-accent':oppositeText(accent),
    '--ps-ink':cssValue('color',settings.textColor) || '#181818',
    '--ps-background':cssValue('backgroundColor',settings.background) || '#ffffff',
    '--ps-secondary':'color-mix(in srgb,var(--ps-ink) 78%,var(--ps-background))',
    '--ps-font':fontFamily(settings.font),
    '--ps-heading-font':fontFamily(settings.headingFont || settings.font),
    '--ps-h1-size':cssValue('fontSize',settings.h1Size),
    '--ps-h2-size':cssValue('fontSize',settings.h2Size),
    '--ps-h3-size':cssValue('fontSize',settings.h3Size),
    '--ps-body-size':cssValue('fontSize',settings.bodySize),
  }
  return ':root{' + Object.entries(declarations).filter(([,value]) => value).map(([key,value]) => key+':'+value).join(';') + '}'
}

function renderBlockCss(blocks, device) {
  let rules = ''
  for (const block of list(blocks)) {
    const style = object(device === 'desktop' ? block.style : block.styles?.[device])
    const root = '[data-block-id=' + cssQuoted(block.id) + '][data-block-id]'
    const declaration = ([key,value]) => {
      const property = cssProps.has(key) ? cssKey(key) : (Object.hasOwn(customCssProps,key) ? customCssProps[key] : '')
      if (!property) return []
      const sanitized = key === 'fontFamily' && fontMetadata.has(value) ? fontFamily(value) : cssValue(key,value)
      return sanitized ? [property + ':' + sanitized] : []
    }
    const complete = Object.entries(style)
    const declarations = complete.flatMap(declaration)
    if (block.type === 'image' && Object.hasOwn(style, 'height')) {
      const height = cssValue('height',style.height)
      if (height) {
        const fixed = /^(?:\d|(?:calc|clamp|min|max)\()/i.test(height)
        declarations.push('--ps-image-frame:' + (fixed ? 'grid' : 'initial'),
          '--ps-image-fill:' + (fixed ? '100%' : 'initial'),
          '--ps-image-placeholder-min:' + (fixed ? '0px' : 'initial'))
      }
    }
    if (Object.hasOwn(style, 'canvasX') || Object.hasOwn(style, 'canvasY')) {
      const inherited = device === 'mobile' ? { ...block.style, ...block.styles?.tablet } : block.style
      const x = canvasOffset(style.canvasX ?? inherited?.canvasX)
      const y = canvasOffset(style.canvasY ?? inherited?.canvasY)
      declarations.push('translate:' + (x || y ? x + 'px ' + y + 'px' : 'none'))
    }
    if (declarations.length) rules += root + '{' + declarations.join(';') + '}\n'
    if (['hero','card','image','gallery'].includes(block.type)) {
      const visual = complete.filter(([key]) => ['objectPosition','objectFit'].includes(key)).flatMap(declaration)
      if (visual.length) rules += root + ' img{' + visual.join(';') + '}\n'
    }
    rules += renderBlockCss(block.children,device)
  }
  return rules
}

export function renderStyles(project) {
  const blocks = project.pages.flatMap(page => page.blocks)
  const desktop = renderBlockCss(blocks,'desktop')
  const tablet = renderBlockCss(blocks,'tablet')
  const mobile = renderBlockCss(blocks,'mobile')
  return baseCss + '\n' + projectTokens(project.settings) + '\n' + renderBlockVariantStyles(blocks) + desktop +
    (tablet ? '@media(max-width:' + DEVICE_WIDTHS.tablet + 'px){\n' + tablet + '}\n' : '') +
    (mobile ? '@media(max-width:' + DEVICE_WIDTHS.mobile + 'px){\n' + mobile + '}\n' : '') +
    '\n' + customSource(project.settings.customCss)
}

export function googleFontStylesheet(families, { preview = false } = {}) {
  const parameters = []
  for (const family of [...new Set(families)].sort()) {
    const entry = fontMetadata.get(family)
    if (!entry || entry.category === 'System') continue
    let weights = entry.weights
    if (preview && weights) {
      const available = weights.split(/;|\.\./).map(Number)
      const hasNormal = weights.includes('..')
        ? available[0] <= 400 && available[1] >= 400
        : available.includes(400)
      weights = hasNormal ? '' : String(available.reduce((best, value) => Math.abs(value - 400) < Math.abs(best - 400) ? value : best))
    }
    parameters.push('family=' + family.replaceAll(' ', '+') + (weights ? ':wght@' + weights : ''))
  }
  return parameters.length ? 'https://fonts.googleapis.com/css2?' + parameters.join('&') + '&display=swap' : ''
}

function fontLinks(settings, blocks) {
  const used = new Set([settings.font,settings.headingFont])
  function visit(block) {
    for (const style of [block.style,block.styles?.tablet,block.styles?.mobile]) used.add(style?.fontFamily)
    list(block.children).forEach(visit)
  }
  blocks.forEach(visit)
  const urls = []
  const fonts = [...used]
  for (let index = 0; index < fonts.length; index += 32) {
    const url = googleFontStylesheet(fonts.slice(index,index + 32))
    if (url) urls.push(url)
  }
  if (!urls.length) return ''
  return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    urls.map(url => '<link rel="stylesheet" href="' + esc(url) + '">').join('')
}

const sharedScript = [
  'document.addEventListener("click", function(event) {',
  '  const link = event.target.closest && event.target.closest("a[href=\\"#\\"]");',
  '  if (link) event.preventDefault();',
  '});',
  'document.addEventListener("submit", function(event) {',
  '  if (event.target.matches("form[data-block-id]")) event.preventDefault();',
  '}, true);',
].join('\n')

function inlineScript(source) {
  const bytes = new TextEncoder().encode(source)
  let raw = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  }
  return '<script src="data:text/javascript;base64,' + btoa(raw) + '"></script>'
}

const siteScript = (project, compiledJS) => sharedScript + '\n' + compiledJS + '\n' + customSource(project.settings.customJs) + '\n'

export function renderDocument(page, project, compiledJS = '', options = {}) {
  const { preview = false, standalone = true, headHtml = '', bodyHtml = '', bodyClass = '', includeCustomJS = true } = options
  const title = page.name + (project.name && page.name !== project.name ? ' — ' + project.name : '')
  const css = standalone ? '<style>' + renderStyles(project).replace(/<\/style/gi, match => '\\3c ' + match.slice(1)) + '</style>' :
    '<link rel="stylesheet" href="styles.css">'
  const rendered = includeCustomJS ? siteScript(project, compiledJS) : sharedScript + '\n' + compiledJS
  const dataScript = !standalone && project.data?.tables.length ? '<script src="plot-data.js" defer></script>' : ''
  const backendScript = !standalone && project.backend?.routes.length ? '<script src="plot-backend.js" defer></script>' : ''
  const js = standalone ? inlineScript(rendered) : dataScript + backendScript + '<script src="script.js" defer></script>'
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(title) + '</title>' + fontLinks(project.settings, page.blocks) + css + headHtml + '</head>' +
    '<body data-page-id="' + esc(page.id) + '"' + (preview ? ' data-preview' : '') + (bodyClass ? ' class="' + esc(bodyClass) + '"' : '') + '>' +
    renderPage(page, project, options) + bodyHtml + js + '</body></html>\n'
}

export function buildSite(project, compiledJS = '') {
  const normalized = normalizeProject(project)
  const files = Object.fromEntries(normalized.pages.map(page => [pageFile(page), renderDocument(page, normalized, '', { standalone:false })]))
  if (!files['index.html']) files['index.html'] = files[pageFile(normalized.pages[0])]
  files['styles.css'] = renderStyles(normalized)
  files['script.js'] = siteScript(normalized, compiledJS)
  if (normalized.data.tables.length) files['plot-data.js'] = dataClientScript()
  if (normalized.backend.routes.length) files['plot-backend.js'] = backendClientScript()
  return files
}

function assetPaths(project) {
  const files = new Set()
  const sourceFields = { hero:['image'], card:['image'], image:['src'], video:['src','poster','captions'], audio:['src'] }
  function add(path) {
    const match = /^(?:\.\/)?(assets\/(?:[\w-]+\/)*[\w-][\w.-]*)$/.exec(String(path ?? '').trim())
    if (match) files.add(match[1])
  }
  function visit(block) {
    if (block.type === 'gallery') rows(block.props?.images).forEach(([src]) => add(src))
    if (Object.hasOwn(sourceFields,block.type)) {
      for (const key of sourceFields[block.type]) add(block.props?.[key])
    }
    list(block.children).forEach(visit)
  }
  project.pages.forEach(page => list(page.blocks).forEach(visit))
  return [...files]
}

export async function buildSitePackage(project, compiledJS = '', options = {}) {
  const { baseUrl = import.meta.url, fetcher = globalThis.fetch, includeRows = false } = options
  const normalized = normalizeProject(project)
  const files = buildSite(normalized, compiledJS)
  const assets = await Promise.all(assetPaths(normalized).map(async path => {
    const response = await fetcher(new URL(path, baseUrl))
    if (!response.ok) throw new Error('Could not include ' + path + ' in the export.')
    return [path, new Uint8Array(await response.arrayBuffer())]
  }))
  const publicFiles = { ...files, ...Object.fromEntries(assets) }
  if (!normalized.data.tables.length && !normalized.backend.routes.length) return publicFiles
  async function source(name) {
    const response = await fetcher(new URL(name, baseUrl))
    if (!response.ok) throw new Error('Could not include ' + name + ' in the export.')
    return [name, await response.text()]
  }
  const [, runtime] = await source('runtime.py')
  const packaged = {
    ...Object.fromEntries(Object.entries(publicFiles).map(([name,bytes]) => ['public/' + name, bytes])),
    ...buildDataExport(normalized.data,runtime,{ includeRows }),
  }
  if (!normalized.backend.routes.length) return packaged
  const sourceFiles = ['backend_engine.py', 'backend_services.py', 'backend_native.rs', 'workflow_packages.py', 'python_runner.py', 'python_sandbox.py', 'python_scratch.py']
  const usesPhonePackage = normalized.backend.packages?.some(item => item.id === 'phone-contacts')
  const usesPython = normalized.backend.routes.some(route => route.steps.some(step => step.type === 'run-python'))
  if (usesPhonePackage) sourceFiles.push('workflow-package-requirements.txt')
  if (usesPython) sourceFiles.push('python-packages-linux310.txt')
  const backend = await Promise.all(sourceFiles.map(source))
  const dependencyNote = usesPhonePackage
    ? 'The Phone contacts package requires the pinned dependency in `workflow-package-requirements.txt`. Install it in your app environment with `python -m pip install --only-binary=:all: --require-hashes -r workflow-package-requirements.txt` before running the server.\n\n'
    : ''
  const pythonNote = usesPython
    ? 'Python script nodes require Linux, `/usr/bin/python3`, bubblewrap, libseccomp, util-linux (`unshare`) and unprivileged user namespaces. Each run gets 16 MiB of temporary workspace and no network. Scripts are in the server-only `backend.json`.\n\nFor NumPy, pandas or openpyxl on Linux x86-64 with Python 3.10, run `python3 -m pip install --only-binary=:all: --require-hashes --target .plot-python-packages -r python-packages-linux310.txt` and set `PLOT_PYTHON_LIBRARIES` to the absolute path to `.plot-python-packages`. For another compatible Python build, install packages as a set of prebuilt local dependencies appropriate to that interpreter and set the same environment variable.\n\n'
    : ''
  const { testCases, ...runtimeBackend } = normalized.backend
  const aliases = new Set()
  const addAlias = value => {
    const alias = typeof value === 'string' ? value : value?.$secret
    if (typeof alias === 'string' && /^PLOT_(?:API_KEY|SECRET_[A-Z0-9_]{1,70})$/.test(alias)) aliases.add(alias)
  }
  for (const route of runtimeBackend.routes) {
    if (route.access === 'key') addAlias(route.keySecret || 'PLOT_API_KEY')
    for (const step of route.steps) {
      addAlias(step.args?.secret)
      for (const value of Object.values(step.args || {})) {
        if (value && typeof value === 'object' && Object.hasOwn(value, '$secret')) addAlias(value)
      }
    }
  }
  const envExample = aliases.size ? { '.env.example': [...aliases].sort().map(alias => `${alias}=\n`).join('') } : {}
  return { ...packaged, ...Object.fromEntries(backend), ...envExample, 'backend.json': JSON.stringify(runtimeBackend, null, 2) + '\n',
    'BACKEND.md': '# Run the backend\n\n' + dependencyNote + pythonNote + 'Start with `python runtime.py --port 8080`. Your routes and enabled package versions are in `backend.json`.\n\nRoutes using API keys and server credential nodes read `PLOT_API_KEY` or their named `PLOT_SECRET_…` environment variable. When `.env.example` is included, use it as a list of names to set in the runtime environment. Supply the values through your hosting configuration.\n\nOptional Rust nodes use `rustc backend_native.rs -O -o plot-native` (use `plot-native.exe` on Windows).\n\nConfigure connections with `PLOT_CONNECTORS_FILE` and named commands with `PLOT_SERVER_TASKS_FILE`. See the Studio handbook for their formats.\n' }
}


const CRC_TABLE = Uint32Array.from({ length:256 }, (_, byte) => {
  let crc = byte
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  return crc
})

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

export function createZip(files) {
  const encoder = new TextEncoder()
  const entries = Object.entries(files).map(([name, content]) => {
    const path = encoder.encode(name)
    const bytes = content instanceof Uint8Array ? content : encoder.encode(content)
    if (path.length > 0xffff || bytes.length > 0xffffffff) throw new Error('A file is too large to archive.')
    return { path, bytes, checksum:crc32(bytes) }
  })
  const dataSize = entries.reduce((size, entry) => size + 30 + entry.path.length + entry.bytes.length, 0)
  const indexSize = entries.reduce((size, entry) => size + 46 + entry.path.length, 0)
  if (entries.length > 0xffff || dataSize + indexSize + 22 > 0xffffffff) throw new Error('The project is too large to archive.')
  const output = new Uint8Array(dataSize + indexSize + 22)
  const view = new DataView(output.buffer)
  const u16 = (offset, value) => view.setUint16(offset, value, true)
  const u32 = (offset, value) => view.setUint32(offset, value, true)
  let localOffset = 0
  let indexOffset = dataSize

  for (const { path, bytes, checksum } of entries) {
    u32(localOffset, 0x04034b50)
    u16(localOffset + 4, 20)
    u16(localOffset + 6, 0x0800)
    u16(localOffset + 12, 0x0021)
    u32(localOffset + 14, checksum)
    u32(localOffset + 18, bytes.length)
    u32(localOffset + 22, bytes.length)
    u16(localOffset + 26, path.length)
    output.set(path, localOffset + 30)
    output.set(bytes, localOffset + 30 + path.length)

    u32(indexOffset, 0x02014b50)
    u16(indexOffset + 4, 20)
    u16(indexOffset + 6, 20)
    u16(indexOffset + 8, 0x0800)
    u16(indexOffset + 14, 0x0021)
    u32(indexOffset + 16, checksum)
    u32(indexOffset + 20, bytes.length)
    u32(indexOffset + 24, bytes.length)
    u16(indexOffset + 28, path.length)
    u32(indexOffset + 42, localOffset)
    output.set(path, indexOffset + 46)
    localOffset += 30 + path.length + bytes.length
    indexOffset += 46 + path.length
  }

  u32(indexOffset, 0x06054b50)
  u16(indexOffset + 8, entries.length)
  u16(indexOffset + 10, entries.length)
  u32(indexOffset + 12, indexSize)
  u32(indexOffset + 16, dataSize)
  return output
}



