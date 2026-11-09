let cartQueue = Promise.resolve()

async function submit(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body,
  })
  if (response.redirected) throw new Error('Please sign in and try again.')
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message ?? 'Could not update this item. Please try again.')
  return result
}

document.querySelector('.product-grid')?.addEventListener('submit', (event) => {
  const form = event.target
  const button = event.submitter
  if (!(form instanceof HTMLFormElement) || !(button instanceof HTMLButtonElement)) return

  const adding = button.hasAttribute('data-add-cart')
  const wishlist = form.hasAttribute('data-wishlist')
  if (!adding && !wishlist) return

  event.preventDefault()
  if (button.disabled) return
  const card = form.closest('.product-card')
  const feedback = card.querySelector('[data-product-feedback]')
  const body = new URLSearchParams(new FormData(form, button))
  const url = adding ? button.formAction : form.getAttribute('action')
  const quantity = adding ? form.elements.namedItem('quantity') : null
  const submittedQuantity = quantity?.value
  button.disabled = true
  feedback.removeAttribute('data-error')
  feedback.textContent = ''

  const update = async () => {
    let added = false
    try {
      const result = await submit(url, body)
      if (adding) {
        const count = document.querySelector('[data-cart-count]')
        if (count) count.textContent = String(result.count)
        added = quantity.value === submittedQuantity
        if (added) {
          button.textContent = 'Added'
          quantity.addEventListener('input', () => {
            button.textContent = 'Add to cart'
            button.disabled = false
          }, { once: true })
        }
        feedback.textContent = 'Added to cart.'
      } else {
        const title = result.saved ? 'Remove from wishlist' : 'Save to wishlist'
        button.title = title
        button.setAttribute('aria-label', title)
        button.setAttribute('aria-pressed', String(result.saved))
        form.elements.namedItem('action').value = result.saved ? 'remove' : 'save'
        feedback.textContent = result.saved ? 'Saved to wishlist.' : 'Removed from wishlist.'
      }
    } catch (error) {
      feedback.setAttribute('data-error', '')
      feedback.textContent = error instanceof Error && error.message !== 'Failed to fetch'
        ? error.message
        : 'Could not update this item. Please try again.'
    } finally {
      if (!added) button.disabled = false
    }
  }

  if (adding) {
    cartQueue = cartQueue.then(update)
  } else {
    void update()
  }
})
