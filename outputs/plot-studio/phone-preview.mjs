export const phoneProfiles = Object.freeze({
  mobile: { name: 'iPhone 13 Pro', width: 390, height: 844, side: 12, brow: 12, chin: 12, status: 47, navigation: 34, toolbar: 51, time: '9:41' },
  'galaxy-s25': { name: 'Galaxy S25', width: 360, height: 780, side: 8, brow: 8, chin: 8, status: 31, navigation: 24, toolbar: 54, time: '10:08' },
  'galaxy-j3': { name: 'Galaxy J3 (2018)', width: 360, height: 640, side: 12, brow: 55, chin: 56, status: 24, navigation: 0, toolbar: 50, time: '12:45' },
});

const statusBar = `<div class="phone-status" aria-hidden="true">
  <time class="phone-time"></time><div class="phone-camera"><i></i><i></i></div>
  <span class="phone-indicators"><span class="phone-signal"><i></i><i></i><i></i><i></i></span><span class="phone-wifi"><i></i></span><span class="phone-battery"><i></i></span></span>
</div>`;
const browserBar = `<div class="phone-browser" aria-hidden="true">
  <span class="phone-browser-mode"></span><span class="phone-address"><i></i><span></span></span>
  <span class="phone-browser-tabs"><i></i></span><span class="phone-browser-menu"><i></i><i></i><i></i></span>
</div>`;
const navigationBar = '<div class="phone-navigation" aria-hidden="true"><span></span></div>';
const hardware = '<div class="phone-hardware" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';

export function phoneScale(profile, availableWidth, availableHeight) {
  return Math.min(1, availableWidth / (profile.width + profile.side * 2), availableHeight / (profile.height + profile.brow + profile.chin));
}

export function mountPhoneFrame(wrapper, pane, frame) {
  const screen = wrapper.querySelector('.device-screen');
  screen.insertAdjacentHTML('afterbegin', statusBar + browserBar);
  screen.insertAdjacentHTML('beforeend', navigationBar);
  wrapper.insertAdjacentHTML('beforeend', hardware);
  const status = screen.querySelector('.phone-status');
  const browser = screen.querySelector('.phone-browser');
  const navigation = screen.querySelector('.phone-navigation');
  const chrome = wrapper.querySelector('.phone-hardware');
  const time = screen.querySelector('.phone-time');
  const address = screen.querySelector('.phone-address span');
  const browserMode = screen.querySelector('.phone-browser-mode');
  for (const element of [status, browser, navigation, chrome]) element.hidden = true;

  return {
    reset() {
      delete wrapper.dataset.phone;
      wrapper.style.width = '';
      pane.style.height = '';
      for (const element of [status, browser, navigation, chrome]) element.hidden = true;
    },
    set(model, ratio, includeBrowser, path) {
      const profile = phoneProfiles[model];
      if (wrapper.dataset.phone !== model) {
        wrapper.dataset.phone = model;
        if (model === 'mobile') pane.after(browser);
        else pane.before(browser);
        time.textContent = profile.time;
        browserMode.textContent = model === 'mobile' ? 'aA' : '';
      }
      const contentHeight = profile.height - profile.status - profile.navigation - (includeBrowser ? profile.toolbar : 0);
      for (const [name, value] of Object.entries({ scale: ratio, side: profile.side, brow: profile.brow, chin: profile.chin,
        status: profile.status, toolbar: profile.toolbar, navigation: profile.navigation })) {
        wrapper.style.setProperty(`--phone-${name}`, String(value));
      }
      wrapper.style.width = `${(profile.width + profile.side * 2) * ratio}px`;
      pane.style.width = `${profile.width * ratio}px`;
      pane.style.height = `${contentHeight * ratio}px`;
      frame.style.width = `${profile.width}px`;
      frame.style.height = `${contentHeight}px`;
      frame.style.transform = `scale(${ratio})`;
      status.hidden = false;
      browser.hidden = !includeBrowser;
      navigation.hidden = !profile.navigation;
      chrome.hidden = false;
      address.textContent = `preview${path === '/' ? '' : path}`;
      return contentHeight;
    },
  };
}
