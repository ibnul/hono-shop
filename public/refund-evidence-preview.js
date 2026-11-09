const previewLink = document.getElementById('open-evidence-preview')
const dialog = document.getElementById('evidence-preview')
const preview = dialog?.querySelector('[data-evidence-src]')
const previewError = document.getElementById('evidence-preview-error')

if (previewLink && typeof dialog?.showModal === 'function' && preview && previewError) {
  previewLink.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (!preview.hasAttribute('src')) preview.src = preview.dataset.evidenceSrc
    dialog.showModal()
  })

  preview.addEventListener('error', () => {
    previewError.hidden = false
  })

  dialog.addEventListener('close', () => {
    if (preview instanceof HTMLVideoElement) preview.pause()
  })
}
