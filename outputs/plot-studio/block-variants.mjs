import { BLOCK_TYPES, createBlock } from './project.mjs';
import { BLOCK_TONES, BLOCK_VARIANTS, findBlockVariant } from './block-design-catalog.mjs';

export { BLOCK_TONES, BLOCK_VARIANTS, findBlockVariant };

const columnCounts = Object.freeze({
  'equal-pair': '2',
  'equal-thirds': '3',
  'quarter-grid': '4',
  'lead-left': '2',
  'lead-right': '2',
  'bento-grid': '3',
  'two-across': '2',
  'three-across': '3',
  'tight-mosaic': '4',
  'feature-image': '3',
  'horizontal-gallery': '2',
  'photo-essay': '2',
});

function layoutProps(type, { layout, height }) {
  if (type === 'spacer' && height) return { height };
  if ((type === 'columns' || type === 'gallery') && columnCounts[layout]) return { columns: columnCounts[layout] };
  return {};
}

export function createVariantBlock(type, id) {
  const variant = findBlockVariant(type, id);
  if (!variant) return null;
  const props = { ...layoutProps(type, variant), designVariant: variant.id };
  if (type === 'nav') Object.assign(props, { buttonText: 'Contact', buttonLink: '#contact' });
  return createBlock(type, { props });
}

export function applyBlockVariant(block, id) {
  if (!block?.props) return false;
  if (id === null) {
    delete block.props.designVariant;
    return true;
  }
  const variant = findBlockVariant(block.type, id);
  if (!variant) return false;
  Object.assign(block.props, layoutProps(block.type, variant), { designVariant: variant.id });
  return true;
}

const samplePhoto = '/99host-assets/entry-basalt.webp';
const sampleProps = {
  nav: { brand: 'Fieldwork', buttonText: 'Contact', buttonLink: '#', autoLinks: false, links: 'Work | #work\nServices | #services\nJournal | #journal\nAbout | #about' },
  hero: {
    title: 'Places to spend time.',
    text: 'Fieldwork is an architecture studio working on houses, public spaces, and rooms for everyday use.',
    buttonText: 'See the work', image: samplePhoto, alt: 'A dark gallery space', caption: 'Study for a public space',
  },
  heading: { text: 'Objects and interiors' },
  text: { text: 'The reading room opens onto an enclosed courtyard. A long timber bench follows the brick wall, giving visitors a place to sit beside the garden.' },
  list: { items: 'Site study\nMaterials library\nDrawings and models\nInstallation' },
  code: { language: 'JavaScript', code: 'const works = await loadCollection("fieldwork");\nconst featured = works.filter(work => work.featured);' },
  image: { src: samplePhoto, alt: 'A dark gallery space', caption: 'Study for a public space' },
  button: { text: 'View the collection' },
  link: { text: 'Read the material notes' },
  input: { label: 'Email address', placeholder: 'you@example.com', kind: 'email' },
  toggle: { label: 'Receive studio updates', checked: true },
  video: { title: 'Studio walkthrough', poster: samplePhoto },
  audio: { title: 'Studio recording', caption: 'Field recordings from the courtyard' },
  table: { caption: 'Materials for the courtyard', headers: 'Material | Finish | Use', rows: 'Clay brick | Sanded | Garden wall\nOak | Oiled | Bench\nLimestone | Honed | Floor' },
  'records-table': { caption: 'Studio bookings', columns: [{ field: 'name', label: 'Name' }, { field: 'workshop', label: 'Workshop' }, { field: 'status', label: 'Status' }], emptyText: 'Records appear here when the connected workflow returns data.' },
  callout: { title: 'Studio visits', text: 'The shared workshop is open on Thursdays. Reserve a time before bringing large objects.' },
  feature: { title: 'Material research', text: 'Test samples in daylight and keep the results alongside your drawings.', linkText: 'See the library' },
  card: { title: 'Courtyard house', text: 'A small renovation centered on the garden.', image: samplePhoto, alt: 'A dark gallery space' },
  gallery: {
    title: 'Studio studies',
    images: [
      [samplePhoto, 'A dark gallery interior', 'Gallery interior'],
      ['/99host-assets/entry-ribs.webp', 'An architectural study', 'Structure'],
      ['/99host-assets/entry-glass.webp', 'A study in light and glass', 'Glass and light'],
    ].map(item => item.join(' | ')).join('\n'),
  },
  quote: { text: 'The most useful rooms are the ones people can make their own.', author: 'Maya Ellis, Fieldwork' },
  pricing: { title: 'Studio membership', price: '$40', items: 'Monthly open studio\nMaterials library\nWorkshop reservations' },
  faq: { title: 'Visiting the studio', items: 'When can I visit? | The workshop opens to visitors on Thursdays.\nDo I need to book? | Reserve an hour if you need a workbench.\nCan I bring a guest? | Guests are welcome during open studio hours.' },
  form: { title: 'Get in touch', text: 'Tell us a little about your project.' },
  footer: { brand: 'Fieldwork', text: 'Independent architecture studio', autoLinks: false, links: 'Work | #work\nJournal | #journal\nContact | #contact' },
};

const sampleChildren = {
  section: () => [
    createBlock('heading', { props: { text: 'The courtyard' } }),
    createBlock('text', { props: { text: sampleProps.text.text } }),
    createBlock('button', { props: { text: 'Read the project notes' } }),
  ],
  columns: () => [
    ['Site', 'The existing brick walls define the courtyard.'],
    ['Materials', 'Oak and clay are used throughout.'],
    ['Light', 'A deep overhang softens afternoon light.'],
    ['Access', 'Paths connect the garden to the studio.'],
  ].map(([title, text]) => createBlock('card', { props: { title, text } })),
};

export function createVariantPreview(type, id, source) {
  let block;
  if (source?.type === type) block = structuredClone(source);
  else {
    block = createBlock(type, { props: sampleProps[type], children: sampleChildren[type]?.() });
  }
  if (!applyBlockVariant(block, id)) return null;
  if (type === 'hero' && !block.props.image) Object.assign(block.props, {
    image: sampleProps.hero.image, alt: sampleProps.hero.alt,
  });
  if (type === 'nav' && !block.props.autoLinks && !block.props.links) block.props.links = sampleProps.nav.links;
  if (type === 'nav' && !block.props.buttonText) block.props.buttonText = sampleProps.nav.buttonText;
  if (type === 'gallery' && !block.props.images) block.props.images = sampleProps.gallery.images;
  if (type === 'image' && !block.props.src) block.props.src = sampleProps.image.src;
  if (type === 'video' && !block.props.poster) block.props.poster = sampleProps.video.poster;
  if (BLOCK_TYPES[type]?.container && !block.children.length && sampleChildren[type]) block.children = sampleChildren[type]();
  return block;
}
