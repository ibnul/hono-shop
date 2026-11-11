const layout = document.querySelector('[data-customer-layout]')
const panel = layout.querySelector('[data-customer-panel]')
const tabs = layout.querySelectorAll('[data-customer-tab]')
let navigation

async function loadPanel(url, fromHistory = false) {
  navigation?.abort()
  const request = new AbortController()
  navigation = request
  panel.setAttribute('aria-busy', 'true')

  function navigateNormally(destination) {
    if (fromHistory) window.location.replace(destination)
    else window.location.assign(destination)
  }

  try {
    const response = await fetch(url, { mode: 'same-origin', signal: request.signal })
    if (request.signal.aborted) return
    if (response.redirected) {
      navigateNormally(response.url)
      return
    }
    if (!response.ok) throw new Error('Account page unavailable')

    const html = await response.text()
    if (request.signal.aborted) return
    const page = new DOMParser().parseFromString(html, 'text/html')
    const nextPanel = page.querySelector('[data-customer-panel]')
    if (!nextPanel) throw new Error('Account panel missing')

    if (!fromHistory && url.href !== window.location.href) history.pushState(null, '', url)
    panel.replaceChildren(...nextPanel.childNodes)
    panel.dataset.customerPanel = nextPanel.dataset.customerPanel
    document.title = page.title

    for (const tab of tabs) {
      if (tab.dataset.customerTab === panel.dataset.customerPanel) tab.setAttribute('aria-current', 'page')
      else tab.removeAttribute('aria-current')
    }

    const heading = panel.querySelector('h1')
    if (heading) {
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
    if (!fromHistory) window.scrollTo(0, 0)
  } catch {
    if (!request.signal.aborted) navigateNormally(url.href)
  } finally {
    if (navigation === request) panel.removeAttribute('aria-busy')
  }
}

layout.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  if (!(event.target instanceof Element)) return

  const link = event.target.closest('a[data-customer-link]')
  if (!link || link.target || link.hasAttribute('download')) return
  const url = new URL(link.href)
  if (url.origin !== window.location.origin) return

  event.preventDefault()
  void loadPanel(url)
})

layout.addEventListener('submit', (event) => {
  const form = event.target
  if (event.defaultPrevented || !(form instanceof HTMLFormElement) || !form.hasAttribute('data-customer-search')) return

  event.preventDefault()
  const url = new URL(form.action)
  url.search = new URLSearchParams(new FormData(form)).toString()
  void loadPanel(url)
})

window.addEventListener('popstate', () => void loadPanel(new URL(window.location.href), true))
